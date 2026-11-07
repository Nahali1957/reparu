from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.clock import maintenant
from app.core.security import create_token, verify_password
from app.models.enums import Canal
from app.models.tables import Outbox, User
from app.models.tables import Session as SessionModel

MAX_ECHECS = 5
DUREE_VERROU = timedelta(minutes=15)
ECHEC_GENERIQUE = "Identifiants incorrects."


def login(db: Session, email: str, password: str, remember: bool, ip: str | None, user_agent: str | None):
    now = maintenant()
    user = db.scalar(select(User).where(func.lower(User.email) == email.lower()))

    if user is None:
        audit(db, "login_echec", email=email, details={"motif": "compte inconnu"}, ip=ip)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, ECHEC_GENERIQUE)
    if not user.actif:
        audit(db, "login_echec", user_id=user.id, email=email, details={"motif": "compte désactivé"}, ip=ip)
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Compte désactivé : contactez l'administrateur.")
    if user.verrouille_jusqu and user.verrouille_jusqu > now:
        audit(db, "login_echec", user_id=user.id, email=email, details={"motif": "compte verrouillé"}, ip=ip)
        raise HTTPException(status.HTTP_423_LOCKED, "Compte verrouillé après 5 échecs : réessayez dans 15 minutes.")

    if not verify_password(password, user.password_hash):
        user.echecs_connexion += 1
        details = {"motif": "mot de passe incorrect", "echecs": user.echecs_connexion}
        if user.echecs_connexion >= MAX_ECHECS:
            user.verrouille_jusqu = now + DUREE_VERROU
            user.echecs_connexion = 0
            details["verrouillage"] = True
        audit(db, "login_echec", user_id=user.id, email=email, details=details, ip=ip)
        restant = MAX_ECHECS - details["echecs"]
        if details.get("verrouillage"):
            raise HTTPException(status.HTTP_423_LOCKED, "Compte verrouillé après 5 échecs : réessayez dans 15 minutes.")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"{ECHEC_GENERIQUE} {restant} tentative(s) restante(s).")

    token, jti, exp = create_token(user.id, user.role.value, remember)
    user.echecs_connexion = 0
    user.verrouille_jusqu = None
    user.derniere_connexion = now
    db.add(SessionModel(user_id=user.id, jti=jti, expire_le=exp, se_souvenir=remember, ip=ip, user_agent=(user_agent or "")[:255]))
    audit(db, "login_ok", user_id=user.id, email=user.email, details={"se_souvenir": remember}, ip=ip)
    return token, exp, user


def logout(db: Session, jti: str) -> None:
    session = db.scalar(select(SessionModel).where(SessionModel.jti == jti))
    if session:
        session.revoquee = True
        db.commit()


def mot_de_passe_oublie(db: Session, email: str, ip: str | None) -> None:
    """Réponse identique que le compte existe ou non (pas d'énumération)."""
    user = db.scalar(select(User).where(func.lower(User.email) == email.lower(), User.actif.is_(True)))
    if user:
        db.add(Outbox(canal=Canal.email, destinataire=user.email, sujet="Réinitialisation de votre mot de passe",
                      corps="Une demande de réinitialisation a été reçue. Contactez l'administrateur de l'atelier "
                            "pour obtenir un mot de passe provisoire."))
    audit(db, "mot_de_passe_oublie", user_id=user.id if user else None, email=email, ip=ip)

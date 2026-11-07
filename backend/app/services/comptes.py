from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.rbac import LIBELLES_ROLES, MATRICE
from app.core.security import hash_password
from app.models.tables import AuditLog, User
from app.schemas.comptes import CompteIn, JournalEntreeOut

ACTIONS_SENSIBLES = (
    "login_ok", "login_echec", "acces_refuse", "stock_correction", "compte_creation", "compte_toggle",
    "export", "alerte_securite", "login_bloque",
)


def lister(db: Session) -> list[User]:
    return list(db.scalars(select(User).order_by(User.nom)))


def creer(db: Session, data: CompteIn, auteur: User, ip: str | None) -> User:
    if db.scalar(select(User).where(func.lower(User.email) == data.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Un compte existe déjà avec cette adresse.")
    user = User(nom=data.nom, email=data.email, role=data.role, specialite=data.specialite,
                password_hash=hash_password(data.password), actif=True)
    db.add(user)
    db.flush()
    audit(db, "compte_creation", user_id=auteur.id, email=user.email, ressource="users", ressource_id=user.id,
          details={"role": data.role.value}, ip=ip)
    return user


def changer_statut(db: Session, user_id: int, actif: bool, auteur: User, ip: str | None) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Compte introuvable.")
    if user.id == auteur.id and not actif:
        raise HTTPException(status.HTTP_409_CONFLICT, "Vous ne pouvez pas désactiver votre propre compte.")
    user.actif = actif
    audit(db, "compte_toggle", user_id=auteur.id, email=user.email, ressource="users", ressource_id=user.id,
          details={"actif": actif}, ip=ip)
    return user


def _libelle(log: AuditLog, roles: dict[int, str]) -> tuple[str, str]:
    qui = log.email_tente or "inconnu"
    role = f" ({roles[log.user_id]})" if log.user_id in roles else ""
    d = log.details or {}
    match log.action:
        case "login_ok":
            return f"Connexion réussie — {qui}{role}", "info"
        case "login_echec":
            suffixe = " — compte verrouillé" if d.get("verrouillage") else ""
            return f"Échec de connexion ({d.get('motif', '?')}) — {qui}{suffixe}", "alerte"
        case "acces_refuse":
            ecran = MATRICE[log.ressource][0] if log.ressource in MATRICE else log.ressource
            return f"Tentative d'accès refusée — {ecran} — {qui}{role}", "alerte"
        case "stock_correction":
            return f"Correction de stock{' après anomalie capteur' if d.get('anomalie_id') else ''} — {qui}", "info"
        case "compte_toggle":
            return f"Compte {'réactivé' if d.get('actif') else 'désactivé'} — {qui}", "info"
        case "login_bloque":
            return f"Connexions bloquées par limitation de débit — IP {log.ip}", "alerte"
        case "compte_creation":
            return f"Compte créé — {qui}", "info"
        case "export":
            return f"Export {d.get('format', '')} — {qui}", "info"
        case "alerte_securite":
            return f"Alerte IA sécurité : {d.get('message', log.ressource)}", "critique"
    return log.action, "info"


def journal(db: Session, limit: int = 50) -> list[JournalEntreeOut]:
    logs = db.scalars(select(AuditLog).where(AuditLog.action.in_(ACTIONS_SENSIBLES))
                      .order_by(AuditLog.horodatage.desc(), AuditLog.id.desc()).limit(limit))
    roles = {u.id: LIBELLES_ROLES[u.role] for u in db.scalars(select(User))}
    out = []
    for log in logs:
        libelle, gravite = _libelle(log, roles)
        out.append(JournalEntreeOut(id=log.id, action=log.action, libelle=libelle, email=log.email_tente, ip=log.ip,
                                    horodatage=log.horodatage, gravite=gravite))
    return out

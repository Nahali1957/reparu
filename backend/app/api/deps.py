from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.clock import maintenant
from app.core.db import get_db
from app.core.rbac import LIBELLES_ROLES, MATRICE, autorise
from app.core.security import decode_token
from app.models.tables import Session as SessionModel
from app.models.tables import User

bearer = HTTPBearer(auto_error=False)


def client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def get_current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    payload = decode_token(creds.credentials) if creds else None
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session absente ou expirée : reconnectez-vous.")
    session = db.scalar(select(SessionModel).where(SessionModel.jti == payload["jti"]))
    if session is None or session.revoquee or session.expire_le < maintenant():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session révoquée ou expirée : reconnectez-vous.")
    user = db.get(User, int(payload["sub"]))
    if user is None or not user.actif:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Compte désactivé.")
    request.state.user_id = user.id
    request.state.jti = payload["jti"]
    return user


def require_role(permission: str):
    """Dépendance FastAPI : refuse avec un 403 explicite et journalise le refus."""
    libelle, _ = MATRICE[permission]

    def checker(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
        if not autorise(user.role, permission):
            audit(db, "acces_refuse", user_id=user.id, email=user.email, ressource=permission,
                  details={"chemin": request.url.path, "methode": request.method}, ip=client_ip(request))
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Accès refusé : le rôle {LIBELLES_ROLES[user.role]} ne donne pas accès à « {libelle} ».",
            )
        return user

    return checker


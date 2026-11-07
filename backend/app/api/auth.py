from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.api.deps import client_ip, get_current_user
from app.core.db import get_db
from app.core.rbac import permissions_du_role
from app.models.tables import User
from app.schemas.auth import LoginIn, LoginOut, MeOut, MessageOut, MotDePasseOublieIn, UserOut
from app.services import auth as service

router = APIRouter(prefix="/auth", tags=["authentification"])


def me_out(user: User) -> MeOut:
    return MeOut(**UserOut.model_validate(user).model_dump(), permissions=permissions_du_role(user.role))


@router.post("/login", response_model=LoginOut)
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)) -> LoginOut:
    token, exp, user = service.login(db, body.email, body.password, body.se_souvenir, client_ip(request),
                                     request.headers.get("user-agent"))
    return LoginOut(access_token=token, expire_le=exp, user=me_out(user))


@router.post("/logout", response_model=MessageOut)
def logout(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MessageOut:
    service.logout(db, request.state.jti)
    return MessageOut(detail="Déconnecté.")


@router.get("/me", response_model=MeOut)
def me(user: User = Depends(get_current_user)) -> MeOut:
    return me_out(user)


@router.post("/mot-de-passe-oublie", response_model=MessageOut, status_code=status.HTTP_202_ACCEPTED)
def mot_de_passe_oublie(body: MotDePasseOublieIn, request: Request, db: Session = Depends(get_db)) -> MessageOut:
    service.mot_de_passe_oublie(db, body.email, client_ip(request))
    return MessageOut(detail="Si ce compte existe, un e-mail de réinitialisation a été envoyé.")

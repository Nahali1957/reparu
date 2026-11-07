from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import Role


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)
    se_souvenir: bool = False


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nom: str
    email: str
    role: Role
    specialite: str | None
    actif: bool
    derniere_connexion: datetime | None


class MeOut(UserOut):
    permissions: list[str]


class LoginOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expire_le: datetime
    user: MeOut


class MotDePasseOublieIn(BaseModel):
    email: EmailStr


class MessageOut(BaseModel):
    detail: str

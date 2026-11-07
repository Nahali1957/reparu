from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.enums import Role


class CompteIn(BaseModel):
    nom: str = Field(min_length=2, max_length=120)
    email: EmailStr
    role: Role
    specialite: str | None = Field(default=None, max_length=120)
    password: str = Field(min_length=10, max_length=200)

    @field_validator("email")
    @classmethod
    def domaine_atelier(cls, v: str) -> str:
        if not v.lower().endswith("@reparu.fr"):
            raise ValueError("L'adresse doit appartenir au domaine @reparu.fr.")
        return v.lower()


class CompteStatutIn(BaseModel):
    actif: bool


class JournalEntreeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    action: str
    libelle: str
    email: str | None
    ip: str | None
    horodatage: datetime
    gravite: str

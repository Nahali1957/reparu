from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.services.regles import TELEPHONE_RE


class ClientIn(BaseModel):
    nom: str = Field(min_length=2, max_length=120)
    telephone: str
    email: EmailStr | None = None
    ville: str | None = Field(default=None, max_length=80)

    @field_validator("telephone")
    @classmethod
    def telephone_fr(cls, v: str) -> str:
        v = v.strip()
        if not TELEPHONE_RE.match(v):
            raise ValueError("Numéro de téléphone français attendu (ex. 06 12 34 56 78).")
        return v

    @field_validator("ville", "email", mode="before")
    @classmethod
    def vide_en_none(cls, v):
        return v or None


class ClientLigneOut(BaseModel):
    id: int
    nom: str
    telephone: str
    ville: str | None
    appareils: int
    reparations: int
    total_facture: Decimal


class ModeleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    marque: str
    modele: str


class AppareilIn(BaseModel):
    client_id: int
    marque: str = Field(min_length=2, max_length=60)
    modele: str = Field(min_length=1, max_length=80)
    imei: str
    couleur: str | None = Field(default=None, max_length=40)

    @field_validator("imei")
    @classmethod
    def quinze_chiffres(cls, v: str) -> str:
        v = v.replace(" ", "")
        if len(v) != 15 or not v.isdigit():
            raise ValueError("L'IMEI comporte 15 chiffres (*#06# sur l'appareil).")
        return v


class AppareilOut(BaseModel):
    id: int
    client_id: int
    client_nom: str
    marque: str
    modele: str
    imei: str
    couleur: str | None
    depose_le: datetime
    reparations: int = 0


class ReparationResumeOut(BaseModel):
    numero: str
    appareil: str
    statut: str
    recu_le: datetime
    diagnostic: str | None
    prix_ttc: Decimal | None


class ClientFicheOut(BaseModel):
    id: int
    nom: str
    telephone: str
    email: str | None
    ville: str | None
    client_depuis: datetime
    reparations: int
    total_facture: Decimal
    appareils: list[AppareilOut]
    historique: list[ReparationResumeOut]
    conservation_jusquau: datetime | None

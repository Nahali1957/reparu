from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel

from app.models.enums import Canal, ModeReglement


class LigneOut(BaseModel):
    designation: str
    detail: str | None
    qte: Decimal
    pu_ht: Decimal
    total_ht: Decimal
    type: str


class EtapeReglementOut(BaseModel):
    libelle: str
    detail: str
    fait: bool


class DocumentOut(BaseModel):
    type: str  # DEVIS | FACTURE | FACTURE ACQUITTÉE
    numero: str
    emis_le: datetime
    dossier: str
    client_nom: str
    client_telephone: str
    client_email: str | None
    client_ville: str | None
    appareil: str
    imei: str
    technicien: str | None
    lignes: list[LigneOut]
    total_ht: Decimal
    tva: Decimal
    total_ttc: Decimal
    marge_nette: Decimal
    statut_reglement: str
    etapes: list[EtapeReglementOut]
    mode_reglement: ModeReglement | None
    peut_encaisser: bool
    raison_encaissement: str | None


class FacturationOut(BaseModel):
    dossier: str
    document: DocumentOut | None
    raison_absence: str | None


class EnvoiIn(BaseModel):
    canal: Canal = Canal.sms


class EncaissementIn(BaseModel):
    mode: ModeReglement


class DocumentRecentOut(BaseModel):
    numero: str
    type: str
    dossier: str
    client_nom: str
    emis_le: datetime
    total_ttc: Decimal
    statut: str

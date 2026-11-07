from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.enums import Priorite, Statut, TypePhoto


class ReparationIn(BaseModel):
    appareil_id: int
    symptomes_texte: str = Field(min_length=15, max_length=2000)
    priorite: Priorite = Priorite.normale
    tech_id: int | None = None


class ReparationPatch(BaseModel):
    symptomes_texte: str | None = Field(default=None, min_length=15, max_length=2000)
    diagnostic_final: str | None = Field(default=None, max_length=2000)
    panne_code: str | None = None
    priorite: Priorite | None = None
    duree_estimee_min: int | None = Field(default=None, ge=5, le=1440)
    cout_pieces_retenu: Decimal | None = Field(default=None, ge=0, le=10000)
    prix_retenu_ht: Decimal | None = Field(default=None, ge=0, le=20000)


class StatutIn(BaseModel):
    statut: Statut


class ChecklistIn(BaseModel):
    faite: bool


class AffectationIn(BaseModel):
    tech_id: int | None
    planifie_le: date | None = None


class PieceEngageeIn(BaseModel):
    piece_id: int
    qte: int = Field(default=1, ge=1, le=20)


class Personne(BaseModel):
    id: int
    nom: str
    initiales: str


class CarteOut(BaseModel):
    numero: str
    statut: Statut
    priorite: Priorite
    client_nom: str
    appareil: str
    technicien: Personne | None
    recu_le: datetime
    planifie_le: date | None
    symptomes: str
    duree_estimee_min: int | None
    sla_depasse: bool
    attente_piece: bool
    retour: bool


class ClientMini(BaseModel):
    id: int
    nom: str
    telephone: str
    email: str | None


class AppareilMini(BaseModel):
    id: int
    marque: str
    modele: str
    imei: str
    couleur: str | None


class MontantsOut(BaseModel):
    cout_pieces: Decimal
    main_oeuvre: Decimal
    heures: Decimal
    taux_horaire: Decimal
    prix_ht: Decimal
    tva: Decimal
    prix_ttc: Decimal
    marge_brute: Decimal
    marge_nette: Decimal


class PhotoOut(BaseModel):
    id: int
    type: TypePhoto
    prise_le: datetime
    url: str
    par: str | None


class EtapeOut(BaseModel):
    ordre: int
    libelle: str
    duree_min: int
    faite: bool
    faite_le: datetime | None


class PieceEngageeOut(BaseModel):
    id: int
    piece_id: int
    designation: str
    reference: str
    qte: int
    prix_achat_unitaire: Decimal


class HistoriqueOut(BaseModel):
    de_statut: Statut | None
    vers_statut: Statut
    par: str | None
    le: datetime


class SuggestionOut(BaseModel):
    modele_version: str
    confiance: float
    pannes: list[dict]
    cout: Decimal | None
    prix: Decimal | None
    marge: Decimal | None
    duree_min: int | None
    cree_le: datetime


class TransitionOut(BaseModel):
    statut: Statut
    possible: bool
    raison: str | None


class DossierOut(BaseModel):
    numero: str
    statut: Statut
    priorite: Priorite
    client: ClientMini
    appareil: AppareilMini
    technicien: Personne | None
    recu_le: datetime
    planifie_le: date | None
    cloture_le: datetime | None
    retour_de: str | None
    symptomes_texte: str
    symptomes: list[str]
    diagnostic_final: str | None
    panne_code: str | None
    duree_estimee_min: int | None
    cout_pieces_retenu: Decimal | None
    prix_retenu_ht: Decimal | None
    valide_client_le: datetime | None
    montants: MontantsOut | None
    suggestion: SuggestionOut | None
    photos: list[PhotoOut]
    temps_passe_min: int
    chrono_depuis: datetime | None
    checklist: list[EtapeOut]
    pieces: list[PieceEngageeOut]
    devis_numero: str | None
    devis_statut: str | None
    facture_numero: str | None
    historique: list[HistoriqueOut]
    sla_depasse: bool
    transitions: list[TransitionOut]

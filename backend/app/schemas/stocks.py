from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import Disponibilite, SourceMouvement, StatutBonCommande, TypeMouvement


class MouvementOut(BaseModel):
    id: int
    piece_id: int
    piece: str
    type: TypeMouvement
    qte: int
    source: SourceMouvement
    motif: str
    par: str
    le: datetime
    reparation: str | None


class PieceOut(BaseModel):
    id: int
    designation: str
    reference: str
    categorie: str
    compatibilite: list[str]
    stock: int
    seuil: int
    statut: str
    niveau: float
    prix_achat: Decimal
    dernier_mouvement: MouvementOut | None
    commande_en_cours: bool


class InventaireOut(BaseModel):
    compteurs: dict[str, int]
    pieces: list[PieceOut]


class AjustementIn(BaseModel):
    qte: int = Field(ge=-500, le=500)
    motif: str = Field(min_length=3, max_length=255)
    anomalie_id: int | None = None


class LigneBCOut(BaseModel):
    piece_id: int
    designation: str
    qte: int
    prix_ht: Decimal


class BonCommandeOut(BaseModel):
    id: int
    numero: str
    fournisseur: str
    statut: StatutBonCommande
    le: datetime
    lignes: list[LigneBCOut]
    total_ht: Decimal


class FournisseurIn(BaseModel):
    nom: str = Field(min_length=2, max_length=120)
    contact: EmailStr | None = None
    ville: str | None = Field(default=None, max_length=80)
    delai_jours: int = Field(ge=0, le=60)
    fiabilite: float = Field(ge=0, le=1)


class FournisseurOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nom: str
    contact: str | None
    ville: str | None
    delai_jours: int
    fiabilite: float
    fiabilite_libelle: str
    references: int


class OffreIn(BaseModel):
    fournisseur_id: int
    piece_id: int
    prix_ht: Decimal = Field(gt=0, le=5000)
    delai_jours: int = Field(ge=0, le=60)
    disponibilite: Disponibilite = Disponibilite.dispo
    minimum_commande: int = Field(default=1, ge=1, le=500)


class OffreOut(BaseModel):
    fournisseur_id: int
    fournisseur: str
    ville: str | None
    prix_ht: Decimal
    delai_jours: int
    disponibilite: Disponibilite
    minimum_commande: int
    references: int
    fiabilite: float
    fiabilite_libelle: str
    score: float | None
    recommande: bool
    plus_rapide: bool
    moins_cher: bool


class ComparaisonOut(BaseModel):
    piece_id: int
    piece: str
    offres: list[OffreOut]
    recommandation: str
    economie_pct: float | None


class CommandeIn(BaseModel):
    piece_id: int
    qte: int = Field(ge=1, le=500)

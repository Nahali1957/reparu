from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator


class DiagnosticIn(BaseModel):
    """Soit un dossier existant (la suggestion y est alors historisée), soit un modèle + des symptômes (aperçu)."""
    reparation: str | None = None
    modele_id: int | None = None
    symptomes_texte: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def une_source(self):
        if not self.reparation and not (self.modele_id and self.symptomes_texte):
            raise ValueError("Indiquez un dossier, ou un modèle d'appareil et des symptômes.")
        return self


class PieceSuggereeOut(BaseModel):
    piece_id: int
    designation: str
    stock: int
    statut: str


class HypotheseOut(BaseModel):
    code: str
    label: str
    score: float
    pieces: list[PieceSuggereeOut]
    manque: str | None


class EstimationOut(BaseModel):
    panne_code: str
    duree_min: int
    erreur_p80_min: float | None
    cout_pieces: Decimal
    cout_estime: bool
    main_oeuvre: Decimal
    prix_conseille_ht: Decimal
    prix_conseille_ttc: Decimal
    marge_brute: Decimal
    modele_version: str


class DiagnosticOut(BaseModel):
    modele_version: str
    confiance: float
    niveau: str  # haute | moyenne | indéterminée
    symptomes_reconnus: list[str]
    pannes: list[HypotheseOut]
    estimation: EstimationOut | None
    historique_interventions: int
    duree_ms: int


class EstimationIn(BaseModel):
    modele_id: int
    panne_code: str
    piece_id: int | None = None


class PrevisionOut(BaseModel):
    piece_id: int
    designation: str
    stock: int
    stock_observe: int | None
    seuil: int
    conso_30j: int
    prevision_30j: float
    couverture_j: float | None
    stock_securite: int
    quantite_a_commander: int
    action: str
    modele_version: str


class RecommandationAchatOut(BaseModel):
    prevision: PrevisionOut
    fournisseur_id: int | None
    fournisseur: str | None
    prix_ht: Decimal | None
    delai_jours: int | None
    score: float | None
    cout_total_ht: Decimal | None
    justification: str


class ModeleFiabiliteOut(BaseModel):
    nom: str
    libelle: str
    version: str
    algorithme_retenu: str
    metrique: str
    valeur: float
    baseline: float
    gain_vs_baseline: float
    plus_grand_est_meilleur: bool
    candidats: dict[str, dict]
    nb_lignes: int
    entraine_le: datetime
    versions: list[str]


class SuiviProductionOut(BaseModel):
    suggestions_evaluees: int
    top1_pct: float | None
    top3_pct: float | None


class FiabiliteOut(BaseModel):
    modeles: list[ModeleFiabiliteOut]
    suivi_diagnostic: SuiviProductionOut
    donnees_synthetiques: bool = True

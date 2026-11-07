from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.reparations import CarteOut


class ChargeTechOut(BaseModel):
    id: int
    nom: str
    initiales: str
    specialite: str | None
    ouverts: int
    charge_min: int
    statut: str  # Disponible | Chargé | Surchargé


class JourOut(BaseModel):
    jour: date
    libelle: str
    charge_pct: int
    alerte: bool


class PlanningOut(BaseModel):
    techniciens: list[ChargeTechOut]
    non_affectes: list[CarteOut]
    equilibre: str
    semaine: list[JourOut]
    capacite_jour_h: float
    seuil_alerte_pct: int


class KpiOut(BaseModel):
    valeur: float | None
    precedent: float | None
    delta_pct: float | None


class PointMoisOut(BaseModel):
    mois: str
    libelle: str
    reparations: int
    ca: Decimal
    marge: Decimal
    courant: bool


class RepartitionOut(BaseModel):
    label: str
    dossiers: int
    pct: float
    marge: Decimal


class AlertePieceOut(BaseModel):
    piece_id: int
    designation: str
    stock: int
    seuil: int
    statut: str
    niveau: float


class ClotureOut(BaseModel):
    numero: str
    client_nom: str
    appareil: str
    cloture_le: datetime
    prix_ttc: Decimal | None


class PeriodeOut(BaseModel):
    code: str
    du: date
    au: date
    libelle: str


class DashboardOut(BaseModel):
    periode: PeriodeOut
    reparations: KpiOut
    marge: KpiOut
    ruptures: int
    delai_moyen_j: KpiOut
    sla_depasses: list[CarteOut]
    serie: list[PointMoisOut]
    alertes: list[AlertePieceOut]
    alertes_total: int
    repartition: list[RepartitionOut]
    derniers_clotures: list[ClotureOut]
    charge: list[ChargeTechOut]


class RapportOut(BaseModel):
    periode: PeriodeOut
    ca: KpiOut
    marge_brute: KpiOut
    reparations: KpiOut
    delai_moyen_j: KpiOut
    taux_retour_pct: KpiOut
    panier_moyen: KpiOut
    marge_par_mois: list[PointMoisOut]
    rentabilite: list[RepartitionOut]


class ProgrammationIn(BaseModel):
    format: str = "pdf"


class ProgrammationOut(BaseModel):
    destinataire: str
    programme_pour: datetime
    piece_jointe: str

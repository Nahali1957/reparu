from datetime import datetime

from pydantic import BaseModel, Field


class LectureIn(BaseModel):
    """Charge utile publiée par un capteur sur reparu/capteurs/<id>/lecture."""
    device: str = Field(max_length=40)
    niveau: int = Field(ge=0, le=100000)
    ts: datetime | None = None
    batterie: int | None = Field(default=None, ge=0, le=100)


class PointOut(BaseModel):
    le: datetime
    niveau: int


class CapteurOut(BaseModel):
    id: int
    code: str
    emplacement: str
    piece_id: int
    piece: str
    stock_comptable: int
    dernier_niveau: int | None
    ecart: int | None
    derniere_lecture_le: datetime | None
    statut: str  # OK | Écart | Muet | Inactif
    historique: list[PointOut]


class AnomalieOut(BaseModel):
    id: int
    origine: str
    type: str
    capteur: str | None
    piece_id: int | None
    message: str
    score: float | None
    detectee_le: datetime
    statut: str
    stock_comptable: int | None
    niveau_lu: int | None


class IotOut(BaseModel):
    capteurs_actifs: int
    capteurs_total: int
    anomalies_ouvertes: int
    derniere_remontee: datetime | None
    periode_s: int
    capteurs: list[CapteurOut]
    anomalies: list[AnomalieOut]


class CorrectionIn(BaseModel):
    recompte: int = Field(ge=0, le=100000)
    motif: str = Field(default="Recomptage après anomalie capteur", min_length=3, max_length=255)

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.db import get_db
from app.ml.train import entrainer_tout
from app.models.tables import User
from app.schemas import ia as s
from app.services import ia as service

router = APIRouter(prefix="/ia", tags=["intelligence artificielle"])


@router.post("/diagnostic", response_model=s.DiagnosticOut)
def diagnostic(body: s.DiagnosticIn, _: User = Depends(require_role("ia")), db: Session = Depends(get_db)):
    return service.diagnostiquer(db, body)


@router.post("/estimation", response_model=s.EstimationOut)
def estimation(body: s.EstimationIn, _: User = Depends(require_role("ia")), db: Session = Depends(get_db)):
    return service.estimer(db, body)


@router.get("/prevision", response_model=list[s.PrevisionOut])
def prevision(piece_id: int | None = Query(None), _: User = Depends(require_role("stocks.lire")), db: Session = Depends(get_db)):
    return service.previsions(db, piece_id)


@router.get("/recommandation-achat", response_model=s.RecommandationAchatOut)
def recommandation_achat(piece_id: int, _: User = Depends(require_role("fournisseurs")), db: Session = Depends(get_db)):
    return service.recommandation_achat(db, piece_id)


@router.get("/fiabilite", response_model=s.FiabiliteOut)
def fiabilite(_: User = Depends(require_role("ia.fiabilite")), db: Session = Depends(get_db)):
    return service.fiabilite(db)


@router.post("/entrainer", response_model=s.FiabiliteOut)
def entrainer(_: User = Depends(require_role("ia.fiabilite")), db: Session = Depends(get_db)):
    """Réentraîne les trois modèles sur les données actuelles et active les nouvelles versions."""
    entrainer_tout(db)
    return service.fiabilite(db)

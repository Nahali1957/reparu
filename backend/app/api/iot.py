from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import client_ip, require_role
from app.core.db import get_db
from app.models.tables import User
from app.schemas import iot as s
from app.services import iot as service

router = APIRouter(prefix="/iot", tags=["capteurs IoT"])
superviseur = require_role("iot")


@router.get("", response_model=s.IotOut)
def vue(_: User = Depends(superviseur), db: Session = Depends(get_db)):
    return service.vue(db)


@router.get("/capteurs/{capteur_id}/lectures", response_model=list[s.PointOut])
def lectures(capteur_id: int, limit: int = Query(120, ge=1, le=2000), _: User = Depends(superviseur), db: Session = Depends(get_db)):
    return service.lectures(db, capteur_id, limit)


@router.post("/rapprocher", response_model=s.IotOut)
def rapprocher(_: User = Depends(superviseur), db: Session = Depends(get_db)):
    service.rapprocher(db)
    return service.vue(db)


@router.post("/anomalies/{anomalie_id}/corriger", response_model=s.AnomalieOut)
def corriger(anomalie_id: int, body: s.CorrectionIn, request: Request, user: User = Depends(require_role("stocks.ecrire")),
             db: Session = Depends(get_db)):
    return service.corriger(db, anomalie_id, body, user, client_ip(request))


@router.post("/anomalies/{anomalie_id}/ignorer", response_model=s.AnomalieOut)
def ignorer(anomalie_id: int, request: Request, user: User = Depends(superviseur), db: Session = Depends(get_db)):
    return service.ignorer(db, anomalie_id, user, client_ip(request))

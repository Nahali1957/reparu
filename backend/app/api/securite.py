from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.api.deps import client_ip, require_role
from app.core.db import get_db
from app.models.tables import User
from app.services import securite as service
from app.services.securite import AlerteSecuriteOut

router = APIRouter(prefix="/securite", tags=["sécurité"])
admin = require_role("audit")


@router.get("/alertes", response_model=list[AlerteSecuriteOut])
def alertes(limit: int = Query(20, ge=1, le=200), _: User = Depends(admin), db: Session = Depends(get_db)):
    return service.alertes(db, limit)


@router.post("/analyser", response_model=list[AlerteSecuriteOut])
def analyser(_: User = Depends(admin), db: Session = Depends(get_db)):
    """Lance immédiatement l'analyse (sinon automatique toutes les minutes)."""
    service.detecter_securite(db)
    service.detecter_capteurs(db)
    return service.alertes(db)


@router.post("/alertes/{anomalie_id}/{decision}", response_model=AlerteSecuriteOut)
def classer(anomalie_id: int, decision: str, request: Request, user: User = Depends(admin), db: Session = Depends(get_db)):
    if decision not in ("traitee", "faux-positif"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Décision inconnue.")
    return service.classer(db, anomalie_id, decision == "faux-positif", user, client_ip(request))

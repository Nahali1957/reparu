from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.api.deps import client_ip, require_role
from app.core.db import get_db
from app.models.tables import User
from app.schemas.auth import UserOut
from app.schemas.comptes import CompteIn, CompteStatutIn, JournalEntreeOut
from app.services import comptes as service

router = APIRouter(tags=["gestion des comptes"])


@router.get("/comptes", response_model=list[UserOut])
def lister(_: User = Depends(require_role("comptes")), db: Session = Depends(get_db)):
    return service.lister(db)


@router.post("/comptes", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def creer(body: CompteIn, request: Request, user: User = Depends(require_role("comptes")), db: Session = Depends(get_db)):
    created = service.creer(db, body, user, client_ip(request))
    db.refresh(created)
    return created


@router.patch("/comptes/{user_id}/statut", response_model=UserOut)
def changer_statut(user_id: int, body: CompteStatutIn, request: Request,
                   user: User = Depends(require_role("comptes")), db: Session = Depends(get_db)):
    return service.changer_statut(db, user_id, body.actif, user, client_ip(request))


@router.get("/audit/journal", response_model=list[JournalEntreeOut])
def journal(limit: int = Query(50, ge=1, le=500), _: User = Depends(require_role("audit")), db: Session = Depends(get_db)):
    return service.journal(db, limit)

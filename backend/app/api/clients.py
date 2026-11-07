from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.api.deps import client_ip, require_role
from app.core.db import get_db
from app.models.tables import User
from app.schemas.clients import AppareilIn, AppareilOut, ClientFicheOut, ClientIn, ClientLigneOut, ModeleOut
from app.schemas.common import Page
from app.services import clients as service
from app.services import rgpd

router = APIRouter(tags=["clients et appareils"])
lecteur = require_role("clients")


@router.get("/clients", response_model=Page[ClientLigneOut])
def lister(q: str | None = Query(None, max_length=80), page: int = Query(1, ge=1), taille: int = Query(20, ge=1, le=100),
           _: User = Depends(lecteur), db: Session = Depends(get_db)):
    items, total = service.lister(db, q, page, taille)
    return Page(items=items, total=total, page=page, taille=taille)


@router.post("/clients", response_model=ClientFicheOut, status_code=status.HTTP_201_CREATED)
def creer(body: ClientIn, _: User = Depends(lecteur), db: Session = Depends(get_db)):
    return service.fiche(db, service.creer(db, body).id)


@router.get("/clients/{client_id}", response_model=ClientFicheOut)
def fiche(client_id: int, _: User = Depends(lecteur), db: Session = Depends(get_db)):
    return service.fiche(db, client_id)


@router.put("/clients/{client_id}", response_model=ClientFicheOut)
def modifier(client_id: int, body: ClientIn, _: User = Depends(lecteur), db: Session = Depends(get_db)):
    service.modifier(db, client_id, body)
    return service.fiche(db, client_id)


@router.get("/modeles", response_model=list[ModeleOut])
def modeles(_: User = Depends(lecteur), db: Session = Depends(get_db)):
    return service.modeles(db)


@router.get("/modeles/frequents", response_model=list[str])
def modeles_frequents(_: User = Depends(lecteur), db: Session = Depends(get_db)):
    return service.modeles_frequents(db)


@router.post("/appareils", response_model=AppareilOut, status_code=status.HTTP_201_CREATED)
def creer_appareil(body: AppareilIn, _: User = Depends(lecteur), db: Session = Depends(get_db)):
    return service.appareil_out(db, service.creer_appareil(db, body))


@router.get("/appareils/{appareil_id}", response_model=AppareilOut)
def get_appareil(appareil_id: int, _: User = Depends(lecteur), db: Session = Depends(get_db)):
    return service.appareil_out(db, service.get_appareil(db, appareil_id))


@router.put("/appareils/{appareil_id}", response_model=AppareilOut)
def modifier_appareil(appareil_id: int, body: AppareilIn, _: User = Depends(lecteur), db: Session = Depends(get_db)):
    return service.appareil_out(db, service.modifier_appareil(db, appareil_id, body))


# ---------------------------------------------------------------- RGPD (droits des personnes)


@router.get("/clients/{client_id}/export-rgpd", response_model=dict)
def export_rgpd(client_id: int, request: Request, user: User = Depends(require_role("rapports")), db: Session = Depends(get_db)):
    """Droit d'accès et de portabilité (JSON). Réservé à l'administrateur et au responsable."""
    return rgpd.exporter(db, client_id, user, client_ip(request))


@router.post("/clients/{client_id}/anonymiser", response_model=ClientFicheOut)
def anonymiser(client_id: int, request: Request, user: User = Depends(require_role("comptes")), db: Session = Depends(get_db)):
    """Droit à l'effacement : anonymisation immédiate (administrateur)."""
    rgpd.effacer(db, client_id, user, client_ip(request))
    return service.fiche(db, client_id)

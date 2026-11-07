from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.api.deps import client_ip, require_role
from app.core.db import get_db
from app.models.tables import User
from app.schemas import stocks as s
from app.services import stocks as service

router = APIRouter(tags=["stocks et fournisseurs"])
lecture = require_role("stocks.lire")
ecriture = require_role("stocks.ecrire")
achats = require_role("fournisseurs")


@router.get("/pieces", response_model=s.InventaireOut)
def inventaire(statut: str | None = Query(None, pattern="^(En stock|Seuil bas|Rupture)$"), q: str | None = Query(None, max_length=80),
               _: User = Depends(lecture), db: Session = Depends(get_db)):
    return service.inventaire(db, statut, q)


@router.get("/mouvements", response_model=list[s.MouvementOut])
def mouvements(limit: int = Query(10, ge=1, le=200), piece_id: int | None = None, _: User = Depends(lecture),
               db: Session = Depends(get_db)):
    return service.mouvements(db, limit, piece_id)


@router.post("/pieces/{piece_id}/ajustement", response_model=s.MouvementOut, status_code=status.HTTP_201_CREATED)
def ajuster(piece_id: int, body: s.AjustementIn, request: Request, user: User = Depends(ecriture), db: Session = Depends(get_db)):
    service.ajuster(db, piece_id, body, user, client_ip(request))
    return service.mouvements(db, 1, piece_id)[0]


@router.get("/bons-commande", response_model=list[s.BonCommandeOut])
def bons(_: User = Depends(ecriture), db: Session = Depends(get_db)):
    return service.bons(db)


@router.post("/bons-commande/generer", response_model=list[s.BonCommandeOut], status_code=status.HTTP_201_CREATED)
def generer(user: User = Depends(ecriture), db: Session = Depends(get_db)):
    return service.generer_bons(db, user)


@router.post("/bons-commande/{bc_id}/envoyer", response_model=s.BonCommandeOut)
def envoyer(bc_id: int, _: User = Depends(ecriture), db: Session = Depends(get_db)):
    return service.envoyer_bon(db, bc_id)


@router.post("/bons-commande/{bc_id}/receptionner", response_model=s.BonCommandeOut)
def receptionner(bc_id: int, user: User = Depends(ecriture), db: Session = Depends(get_db)):
    return service.receptionner(db, bc_id, user)


@router.get("/fournisseurs", response_model=list[s.FournisseurOut])
def fournisseurs(_: User = Depends(achats), db: Session = Depends(get_db)):
    return service.fournisseurs(db)


@router.post("/fournisseurs", response_model=s.FournisseurOut, status_code=status.HTTP_201_CREATED)
def creer_fournisseur(body: s.FournisseurIn, _: User = Depends(achats), db: Session = Depends(get_db)):
    f = service.creer_fournisseur(db, body)
    return next(x for x in service.fournisseurs(db) if x.id == f.id)


@router.post("/offres", response_model=s.ComparaisonOut)
def offre(body: s.OffreIn, _: User = Depends(achats), db: Session = Depends(get_db)):
    service.enregistrer_offre(db, body)
    return service.comparer(db, body.piece_id)


@router.get("/pieces/{piece_id}/offres", response_model=s.ComparaisonOut)
def comparer(piece_id: int, _: User = Depends(achats), db: Session = Depends(get_db)):
    return service.comparer(db, piece_id)


@router.post("/fournisseurs/{fournisseur_id}/commander", response_model=s.BonCommandeOut, status_code=status.HTTP_201_CREATED)
def commander(fournisseur_id: int, body: s.CommandeIn, user: User = Depends(achats), db: Session = Depends(get_db)):
    return service.commander(db, fournisseur_id, body, user)

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import client_ip, require_role
from app.core.db import get_db
from app.models.enums import TypePhoto
from app.models.tables import User
from app.schemas import facturation as f
from app.schemas import reparations as s
from app.schemas.common import Message
from app.services import facturation as fact
from app.services import pdf
from app.services import reparations as service

router = APIRouter(tags=["réparations"])
atelier = require_role("reparations")
facturation = require_role("facturation")
PDF = {"content": {"application/pdf": {}}}


def _pdf(contenu: bytes, nom: str) -> Response:
    return Response(contenu, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{nom}"'})


@router.get("/reparations", response_model=list[s.CarteOut])
def kanban(filtre: str | None = Query(None, pattern="^(mes|haute)$"), user: User = Depends(atelier), db: Session = Depends(get_db)):
    return service.kanban(db, user, filtre)


@router.post("/reparations", response_model=s.DossierOut, status_code=status.HTTP_201_CREATED)
def creer(body: s.ReparationIn, request: Request, user: User = Depends(atelier), db: Session = Depends(get_db)):
    if body.tech_id is not None and body.tech_id != user.id:
        require_role("planning")(request, user, db)  # affecter quelqu'un d'autre relève du planning
    return service.dossier(db, service.creer(db, body, user))


@router.get("/reparations/{numero}", response_model=s.DossierOut)
def dossier(numero: str, _: User = Depends(atelier), db: Session = Depends(get_db)):
    return service.dossier(db, service.get(db, numero))


@router.patch("/reparations/{numero}", response_model=s.DossierOut)
def modifier(numero: str, body: s.ReparationPatch, _: User = Depends(atelier), db: Session = Depends(get_db)):
    return service.dossier(db, service.modifier(db, service.get(db, numero), body))


@router.post("/reparations/{numero}/statut", response_model=s.DossierOut)
def statut(numero: str, body: s.StatutIn, user: User = Depends(atelier), db: Session = Depends(get_db)):
    return service.dossier(db, service.changer_statut(db, service.get(db, numero), body.statut, user))


@router.patch("/reparations/{numero}/checklist/{ordre}", response_model=s.DossierOut)
def checklist(numero: str, ordre: int, body: s.ChecklistIn, user: User = Depends(atelier), db: Session = Depends(get_db)):
    return service.dossier(db, service.cocher(db, service.get(db, numero), ordre, body.faite, user))


@router.post("/reparations/{numero}/photos", response_model=s.DossierOut, status_code=status.HTTP_201_CREATED)
async def photo(numero: str, type: TypePhoto = Form(...), fichier=File(...), user: User = Depends(atelier),
                db: Session = Depends(get_db)):
    rep = service.get(db, numero)
    await service.ajouter_photo(db, rep, type, fichier, user)
    return service.dossier(db, rep)


@router.get("/photos/{photo_id}", response_class=FileResponse, responses={200: {"content": {"image/*": {}}}})
def fichier_photo(photo_id: int, _: User = Depends(atelier), db: Session = Depends(get_db)):
    chemin, media = service.fichier_photo(db, photo_id)
    return FileResponse(chemin, media_type=media)


@router.post("/reparations/{numero}/chrono/{action}", response_model=s.DossierOut)
def chrono(numero: str, action: str, user: User = Depends(atelier), db: Session = Depends(get_db)):
    if action not in ("demarrer", "arreter"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Action inconnue.")
    return service.dossier(db, service.chrono(db, service.get(db, numero), action, user))


@router.post("/reparations/{numero}/pieces", response_model=s.DossierOut, status_code=status.HTTP_201_CREATED)
def engager(numero: str, body: s.PieceEngageeIn, user: User = Depends(atelier), db: Session = Depends(get_db)):
    return service.dossier(db, service.engager_piece(db, service.get(db, numero), body, user))


@router.delete("/reparations/{numero}/pieces/{ligne_id}", response_model=s.DossierOut)
def retirer(numero: str, ligne_id: int, user: User = Depends(atelier), db: Session = Depends(get_db)):
    return service.dossier(db, service.retirer_piece(db, service.get(db, numero), ligne_id, user))


@router.post("/reparations/{numero}/affecter", response_model=s.DossierOut)
def affecter(numero: str, body: s.AffectationIn, request: Request, user: User = Depends(require_role("planning")),
             db: Session = Depends(get_db)):
    rep = service.affecter(db, service.get(db, numero), body.tech_id, body.planifie_le, user, client_ip(request))
    return service.dossier(db, rep)


@router.post("/reparations/{numero}/notifier", response_model=Message)
def notifier(numero: str, _: User = Depends(atelier), db: Session = Depends(get_db)):
    texte = service.notifier(db, service.get(db, numero))
    return Message(detail=f"SMS simulé envoyé : « {texte} »")


@router.get("/reparations/{numero}/etiquette.pdf", response_class=Response, responses={200: PDF})
def etiquette(numero: str, _: User = Depends(atelier), db: Session = Depends(get_db)):
    r = service.get(db, numero)
    return _pdf(pdf.etiquette(r.numero, r.client.nom, f"{r.appareil.modele.marque} {r.appareil.modele.modele}", r.appareil.imei,
                              r.recu_le), f"etiquette-{r.numero}.pdf")


# ---------------------------------------------------------------- devis et facturation (5.14)


@router.get("/facturation/recents", response_model=list[f.DocumentRecentOut])
def recents(_: User = Depends(facturation), db: Session = Depends(get_db)):
    return fact.recents(db)


@router.get("/reparations/{numero}/facturation", response_model=f.FacturationOut)
def facturation_dossier(numero: str, _: User = Depends(facturation), db: Session = Depends(get_db)):
    return fact.document(db, service.get(db, numero))


@router.post("/reparations/{numero}/devis", response_model=f.FacturationOut)
def editer_devis(numero: str, _: User = Depends(facturation), db: Session = Depends(get_db)):
    rep = service.get(db, numero)
    fact.editer_devis(db, rep)
    return fact.document(db, rep)


@router.post("/reparations/{numero}/devis/envoyer", response_model=f.FacturationOut)
def envoyer_devis(numero: str, body: f.EnvoiIn, _: User = Depends(facturation), db: Session = Depends(get_db)):
    rep = service.get(db, numero)
    fact.envoyer_devis(db, rep, body.canal)
    return fact.document(db, rep)


@router.post("/reparations/{numero}/devis/{reponse}", response_model=f.FacturationOut)
def repondre_devis(numero: str, reponse: str, user: User = Depends(facturation), db: Session = Depends(get_db)):
    if reponse not in ("accepter", "refuser"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Réponse inconnue.")
    rep = service.get(db, numero)
    fact.repondre(db, rep, reponse == "accepter", user)
    return fact.document(db, rep)


@router.post("/reparations/{numero}/encaisser", response_model=f.FacturationOut)
def encaisser(numero: str, body: f.EncaissementIn, user: User = Depends(facturation), db: Session = Depends(get_db)):
    rep = service.get(db, numero)
    fact.encaisser(db, rep, body.mode, user)
    return fact.document(db, rep)


@router.get("/reparations/{numero}/document.pdf", response_class=Response, responses={200: PDF})
def document_pdf(numero: str, _: User = Depends(facturation), db: Session = Depends(get_db)):
    out = fact.document(db, service.get(db, numero))
    if out.document is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, out.raison_absence)
    return _pdf(pdf.document(out.document), f"{out.document.numero}.pdf")


@router.post("/reparations/{numero}/document/envoyer", response_model=Message)
def envoyer_document(numero: str, _: User = Depends(facturation), db: Session = Depends(get_db)):
    rep = service.get(db, numero)
    out = fact.document(db, rep)
    if out.document is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, out.raison_absence)
    fact.envoyer_document(db, rep, out.document)
    return Message(detail=f"E-mail simulé envoyé à {rep.client.email} avec {out.document.numero}.pdf")


@router.get("/reparations/{numero}/bon-restitution.pdf", response_class=Response, responses={200: PDF})
def bon_restitution(numero: str, _: User = Depends(facturation), db: Session = Depends(get_db)):
    rep = service.get(db, numero)
    out = fact.document(db, rep)
    if out.document is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, out.raison_absence)
    return _pdf(pdf.bon_restitution(out.document, rep.diagnostic_final, rep.cloture_le), f"restitution-{rep.numero}.pdf")

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from app.api.deps import client_ip, require_role
from app.core.audit import audit
from app.core.clock import maintenant
from app.core.db import get_db
from app.models.enums import Canal
from app.models.tables import User
from app.schemas import pilotage as s
from app.services import pdf, pilotage, planning
from app.services.outbox import envoyer
from app.services.recherche import NotificationsOut, ResultatOut, notifications, rechercher

router = APIRouter(tags=["pilotage"])
CODE = Query("mois", pattern="^(7j|mois|trimestre|12m)$")


@router.get("/dashboard", response_model=s.DashboardOut)
def dashboard(periode: str = CODE, _: User = Depends(require_role("dashboard")), db: Session = Depends(get_db)):
    return pilotage.dashboard(db, periode)


@router.get("/planning", response_model=s.PlanningOut)
def vue_planning(_: User = Depends(require_role("planning")), db: Session = Depends(get_db)):
    return planning.planning(db)


@router.get("/techniciens", response_model=list[s.ChargeTechOut])
def techniciens(_: User = Depends(require_role("reparations")), db: Session = Depends(get_db)):
    return planning.charges(db)


@router.get("/rapports", response_model=s.RapportOut)
def rapports(periode: str = CODE, du: date | None = None, au: date | None = None,
             _: User = Depends(require_role("rapports")), db: Session = Depends(get_db)):
    return pilotage.rapport(db, periode, du, au)


def _export(db: Session, user: User, request: Request, fmt: str, p: s.PeriodeOut) -> None:
    audit(db, "export", user_id=user.id, email=user.email, ressource="rapports", details={"format": fmt, "du": str(p.du), "au": str(p.au)},
          ip=client_ip(request))


@router.get("/rapports/export.csv", response_class=Response, responses={200: {"content": {"text/csv": {}}}})
def export_csv(request: Request, periode: str = CODE, du: date | None = None, au: date | None = None,
               user: User = Depends(require_role("rapports")), db: Session = Depends(get_db)):
    p = pilotage.periode(periode, du, au)
    _export(db, user, request, "csv", p.out())
    return Response("﻿" + pilotage.export_csv(db, periode, du, au), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="reparu-rapport-{p.du}-{p.au}.csv"'})


@router.get("/rapports/export.pdf", response_class=Response, responses={200: {"content": {"application/pdf": {}}}})
def export_pdf(request: Request, periode: str = CODE, du: date | None = None, au: date | None = None,
               user: User = Depends(require_role("rapports")), db: Session = Depends(get_db)):
    r = pilotage.rapport(db, periode, du, au)
    _export(db, user, request, "pdf", r.periode)
    return Response(pdf.rapport(r), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="reparu-rapport-{r.periode.du}-{r.periode.au}.pdf"'})


@router.post("/rapports/programmer", response_model=s.ProgrammationOut)
def programmer(body: s.ProgrammationIn, periode: str = CODE, user: User = Depends(require_role("rapports")),
               db: Session = Depends(get_db)):
    """« Programmer l'envoi » : e-mail simulé chaque lundi à 8 h (premier envoi ci-dessous)."""
    now = maintenant()
    lundi = (now + timedelta(days=(7 - now.weekday()) % 7 or 7)).replace(hour=8, minute=0, second=0)
    p = pilotage.periode(periode)
    fichier = f"reparu-rapport-{p.du}-{p.au}.{body.format}"
    envoyer(db, Canal.email, user.email, f"Rapport d'activité Repar U ({p.libelle()}) en pièce jointe.",
            sujet="Rapport d'activité hebdomadaire", piece_jointe=fichier, programme_pour=lundi)
    db.commit()
    return s.ProgrammationOut(destinataire=user.email, programme_pour=lundi, piece_jointe=fichier)


@router.get("/recherche", response_model=list[ResultatOut])
def recherche(q: str = Query(min_length=2, max_length=80), _: User = Depends(require_role("reparations")),
              db: Session = Depends(get_db)):
    return rechercher(db, q)


@router.get("/notifications", response_model=NotificationsOut)
def cloche(user: User = Depends(require_role("reparations")), db: Session = Depends(get_db)):
    return notifications(db, user)

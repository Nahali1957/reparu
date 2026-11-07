"""Recherche globale de l'en-tête et cloche d'alertes."""

from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.rbac import autorise
from app.models.enums import StatutAnomalie
from app.models.tables import Anomalie, Appareil, Client, Piece, Reparation, User
from app.services.reparations import sla_depasse


class ResultatOut(BaseModel):
    type: str  # dossier | client | appareil
    libelle: str
    detail: str
    lien: str


class AlerteOut(BaseModel):
    type: str  # stock | anomalie | sla
    gravite: str  # info | alerte | critique
    libelle: str
    lien: str


class NotificationsOut(BaseModel):
    total: int
    alertes: list[AlerteOut]


def rechercher(db: Session, q: str, limite: int = 8) -> list[ResultatOut]:
    q = q.strip()
    motif = f"%{q}%"
    out = [ResultatOut(type="dossier", libelle=r.numero, detail=f"{r.client.nom} · {r.appareil.modele.modele}",
                       lien=f"/reparations/{r.numero}")
           for r in db.scalars(select(Reparation).where(Reparation.numero.ilike(motif)).order_by(Reparation.id.desc()).limit(limite))]
    out += [ResultatOut(type="client", libelle=c.nom, detail=f"{c.telephone} · {c.ville or '—'}", lien=f"/clients/{c.id}")
            for c in db.scalars(select(Client).where(or_(Client.nom.ilike(motif), Client.telephone.ilike(motif)))
                                .order_by(Client.nom).limit(limite))]
    if q.isdigit() and len(q) >= 4:
        out += [ResultatOut(type="appareil", libelle=f"IMEI {a.imei}", detail=f"{a.modele.modele} · {a.client.nom}",
                            lien=f"/clients/{a.client_id}")
                for a in db.scalars(select(Appareil).where(Appareil.imei.like(f"%{q}%")).limit(limite))]
    return out[: limite * 2]


def notifications(db: Session, user: User) -> NotificationsOut:
    alertes = []
    ruptures = db.scalar(select(func.count()).select_from(Piece).where(Piece.stock <= 0)) or 0
    bas = db.scalar(select(func.count()).select_from(Piece).where(Piece.stock > 0, Piece.stock <= Piece.seuil)) or 0
    if ruptures:
        alertes.append(AlerteOut(type="stock", gravite="critique", libelle=f"{ruptures} pièce(s) en rupture", lien="/stocks"))
    if bas:
        alertes.append(AlerteOut(type="stock", gravite="alerte", libelle=f"{bas} pièce(s) sous le seuil", lien="/stocks"))
    ouverts = db.scalars(select(Reparation).where(Reparation.statut.in_(["recu", "en_diagnostic", "en_reparation"]))).all()
    for r in ouverts:
        if sla_depasse(db, r):
            alertes.append(AlerteOut(type="sla", gravite="alerte", libelle=f"{r.numero} dépasse l'engagement de 48 h",
                                     lien=f"/reparations/{r.numero}"))
    if autorise(user.role, "iot"):
        for a in db.scalars(select(Anomalie).where(Anomalie.statut == StatutAnomalie.ouverte).order_by(Anomalie.detectee_le.desc())):
            if a.origine.value == "securite" and not autorise(user.role, "audit"):
                continue
            lien = "/administration/comptes" if a.origine.value == "securite" else "/stocks/capteurs"
            texte = (a.details or {}).get("message") or a.type.replace("_", " ")
            alertes.append(AlerteOut(type="anomalie", gravite="critique" if a.origine.value == "securite" else "alerte",
                                     libelle=texte, lien=lien))
    return NotificationsOut(total=len(alertes), alertes=alertes)

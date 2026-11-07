"""Clients et appareils (F-01, écrans 5.5, 5.6, 5.7)."""

from datetime import timedelta
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.clock import maintenant
from app.models.tables import Appareil, Client, Facture, ModeleAppareil, Reparation
from app.schemas.clients import (
    AppareilIn, AppareilOut, ClientFicheOut, ClientIn, ClientLigneOut, ReparationResumeOut,
)
from app.services.regles import luhn_valide, parametre, refus_metier

def _get_client(db: Session, client_id: int) -> Client:
    client = db.get(Client, client_id)
    if client is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client introuvable.")
    return client


def _total_facture(db: Session, client_ids: list[int]) -> dict[int, Decimal]:
    rows = db.execute(select(Reparation.client_id, func.sum(Facture.total_ttc)).join(Facture, Facture.reparation_id == Reparation.id)
                      .where(Reparation.client_id.in_(client_ids)).group_by(Reparation.client_id))
    return {cid: total or Decimal(0) for cid, total in rows}


def lister(db: Session, q: str | None, page: int, taille: int) -> tuple[list[ClientLigneOut], int]:
    filtre = []
    if q:
        motif = f"%{q.strip()}%"
        filtre.append(or_(Client.nom.ilike(motif), Client.telephone.ilike(motif), Client.ville.ilike(motif)))
    total = db.scalar(select(func.count()).select_from(Client).where(*filtre))
    clients = db.scalars(select(Client).where(*filtre).order_by(Client.nom, Client.id)
                         .offset((page - 1) * taille).limit(taille)).all()
    ids = [c.id for c in clients]
    nb_app = dict(db.execute(select(Appareil.client_id, func.count()).where(Appareil.client_id.in_(ids)).group_by(Appareil.client_id)).all())
    nb_rep = dict(db.execute(select(Reparation.client_id, func.count()).where(Reparation.client_id.in_(ids)).group_by(Reparation.client_id)).all())
    totaux = _total_facture(db, ids)
    items = [ClientLigneOut(id=c.id, nom=c.nom, telephone=c.telephone, ville=c.ville, appareils=nb_app.get(c.id, 0),
                            reparations=nb_rep.get(c.id, 0), total_facture=totaux.get(c.id, Decimal(0))) for c in clients]
    return items, total


def creer(db: Session, data: ClientIn) -> Client:
    client = Client(**data.model_dump())
    db.add(client)
    db.commit()
    return client


def modifier(db: Session, client_id: int, data: ClientIn) -> Client:
    client = _get_client(db, client_id)
    for k, v in data.model_dump().items():
        setattr(client, k, v)
    db.commit()
    return client


def appareil_out(db: Session, a: Appareil) -> AppareilOut:
    nb = db.scalar(select(func.count()).select_from(Reparation).where(Reparation.appareil_id == a.id))
    return AppareilOut(id=a.id, client_id=a.client_id, client_nom=a.client.nom, marque=a.modele.marque,
                       modele=a.modele.modele, imei=a.imei, couleur=a.couleur, depose_le=a.depose_le, reparations=nb)


def fiche(db: Session, client_id: int) -> ClientFicheOut:
    c = _get_client(db, client_id)
    reps = db.scalars(select(Reparation).where(Reparation.client_id == c.id).order_by(Reparation.recu_le.desc())).all()
    factures = {f.reparation_id: f for f in db.scalars(select(Facture).where(Facture.reparation_id.in_([r.id for r in reps])))}
    historique = [ReparationResumeOut(
        numero=r.numero, appareil=f"{r.appareil.modele.marque} {r.appareil.modele.modele}", statut=r.statut.value,
        recu_le=r.recu_le, diagnostic=r.diagnostic_final,
        prix_ttc=factures[r.id].total_ttc if r.id in factures else None) for r in reps]
    derniere = c.derniere_intervention_le or max((r.recu_le for r in reps), default=None)
    ans = int(parametre(db, "conservation_ans"))
    return ClientFicheOut(
        id=c.id, nom=c.nom, telephone=c.telephone, email=c.email, ville=c.ville, client_depuis=c.created_at,
        reparations=len(reps), total_facture=sum((f.total_ttc for f in factures.values()), Decimal(0)),
        appareils=[appareil_out(db, a) for a in sorted(c.appareils, key=lambda a: a.depose_le, reverse=True)],
        historique=historique,
        conservation_jusquau=derniere + timedelta(days=365 * ans) if derniere else None,
    )


def modeles(db: Session) -> list[ModeleAppareil]:
    return list(db.scalars(select(ModeleAppareil).order_by(ModeleAppareil.marque, ModeleAppareil.modele)))


def modeles_frequents(db: Session, n: int = 6) -> list[str]:
    rows = db.execute(select(ModeleAppareil.modele, func.count(Reparation.id).label("n"))
                      .join(Appareil, Appareil.modele_id == ModeleAppareil.id)
                      .join(Reparation, Reparation.appareil_id == Appareil.id)
                      .group_by(ModeleAppareil.modele).order_by(func.count(Reparation.id).desc()).limit(n))
    return [m for m, _ in rows]


def _modele(db: Session, marque: str, modele: str) -> ModeleAppareil:
    m = db.scalar(select(ModeleAppareil).where(func.lower(ModeleAppareil.marque) == marque.strip().lower(),
                                               func.lower(ModeleAppareil.modele) == modele.strip().lower()))
    if m is None:
        m = ModeleAppareil(marque=marque.strip(), modele=modele.strip())
        db.add(m)
        db.flush()
    return m


def _verifier_imei(db: Session, imei: str, sauf_id: int | None = None) -> None:
    if not luhn_valide(imei):
        raise refus_metier("IMEI invalide : la clé de contrôle (algorithme de Luhn) ne correspond pas.")
    existant = db.scalar(select(Appareil).where(Appareil.imei == imei))
    if existant and existant.id != sauf_id:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"Cet IMEI est déjà rattaché à un appareil de {existant.client.nom}.")


def creer_appareil(db: Session, data: AppareilIn) -> Appareil:
    _get_client(db, data.client_id)
    _verifier_imei(db, data.imei)
    a = Appareil(client_id=data.client_id, modele_id=_modele(db, data.marque, data.modele).id, imei=data.imei,
                 couleur=data.couleur or None, depose_le=maintenant())
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


def get_appareil(db: Session, appareil_id: int) -> Appareil:
    a = db.get(Appareil, appareil_id)
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Appareil introuvable.")
    return a


def modifier_appareil(db: Session, appareil_id: int, data: AppareilIn) -> Appareil:
    a = get_appareil(db, appareil_id)
    _get_client(db, data.client_id)
    _verifier_imei(db, data.imei, sauf_id=a.id)
    a.client_id, a.imei, a.couleur = data.client_id, data.imei, data.couleur or None
    a.modele_id = _modele(db, data.marque, data.modele).id
    db.commit()
    db.refresh(a)
    return a

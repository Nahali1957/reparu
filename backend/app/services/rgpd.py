"""RGPD : durées de conservation, droit d'accès (export) et droit à l'effacement (anonymisation).

- Clients : 3 ans après la dernière intervention (mention de la fiche client 5.5), puis anonymisation.
  Les factures conservent le nom figé à l'émission : obligation légale de conservation des pièces
  comptables (10 ans, art. L123-22 du Code de commerce), base légale distincte.
- Journal d'audit : 1 an (recommandation CNIL pour les journaux de sécurité).
- Messages simulés (outbox) : 1 an.

    python -m app.services.rgpd          # purge manuelle (sinon quotidienne en tâche de fond)
"""

from datetime import datetime, timedelta

from fastapi import HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.clock import maintenant
from app.models.enums import Statut
from app.models.tables import Appareil, AuditLog, Client, Facture, Outbox, Reparation, User
from app.services.regles import parametre

CONSERVATION_JOURNAUX = timedelta(days=365)


class PurgeOut(BaseModel):
    clients_anonymises: int
    journaux_supprimes: int
    messages_supprimes: int


def _anonymiser(db: Session, client: Client) -> None:
    client.nom = f"Client anonymisé #{client.id}"
    client.telephone = "anonymisé"
    client.email = None
    client.ville = None
    for a in client.appareils:
        a.imei = f"X{a.id:014d}"[-15:]  # identifiant technique unique, plus rattachable à l'appareil réel
        a.couleur = None


def _a_un_dossier_ouvert(db: Session, client_id: int) -> bool:
    return db.scalar(select(Reparation.id).where(Reparation.client_id == client_id, Reparation.statut != Statut.livre).limit(1)) is not None


def purger(db: Session, now: datetime | None = None) -> PurgeOut:
    now = now or maintenant()
    limite_clients = now - timedelta(days=365 * int(parametre(db, "conservation_ans")))
    n_clients = 0
    for c in db.scalars(select(Client).where(Client.derniere_intervention_le < limite_clients, ~Client.nom.like("Client anonymisé #%"))):
        if not _a_un_dossier_ouvert(db, c.id):
            _anonymiser(db, c)
            n_clients += 1
    limite = now - CONSERVATION_JOURNAUX
    n_journaux = db.execute(delete(AuditLog).where(AuditLog.horodatage < limite)).rowcount or 0
    n_messages = db.execute(delete(Outbox).where(Outbox.cree_le < limite)).rowcount or 0
    out = PurgeOut(clients_anonymises=n_clients, journaux_supprimes=n_journaux, messages_supprimes=n_messages)
    audit(db, "rgpd_purge", details=out.model_dump())
    return out


def exporter(db: Session, client_id: int, auteur: User, ip: str | None) -> dict:
    """Droit d'accès et de portabilité : toutes les données personnelles du client, en JSON."""
    c = db.get(Client, client_id)
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client introuvable.")
    reps = db.scalars(select(Reparation).where(Reparation.client_id == c.id).order_by(Reparation.recu_le)).all()
    factures = {f.reparation_id: f for f in db.scalars(select(Facture).where(Facture.reparation_id.in_([r.id for r in reps])))}
    audit(db, "rgpd_export", user_id=auteur.id, email=auteur.email, ressource="clients", ressource_id=c.id, ip=ip)
    return {
        "responsable_traitement": "Repar U — 14 rue des Ateliers, 34000 Montpellier",
        "finalite": "Gestion des réparations, facturation et garantie",
        "exporte_le": maintenant().isoformat(),
        "client": {"id": c.id, "nom": c.nom, "telephone": c.telephone, "email": c.email, "ville": c.ville,
                   "client_depuis": c.created_at.isoformat(), "derniere_intervention": c.derniere_intervention_le.isoformat()
                   if c.derniere_intervention_le else None},
        "appareils": [{"marque": a.modele.marque, "modele": a.modele.modele, "imei": a.imei, "couleur": a.couleur} for a in c.appareils],
        "reparations": [{"numero": r.numero, "recu_le": r.recu_le.isoformat(), "statut": r.statut.value, "symptomes": r.symptomes_texte,
                         "diagnostic": r.diagnostic_final, "facture": factures[r.id].numero if r.id in factures else None,
                         "montant_ttc": str(factures[r.id].total_ttc) if r.id in factures else None} for r in reps],
    }


def effacer(db: Session, client_id: int, auteur: User, ip: str | None) -> None:
    """Droit à l'effacement : anonymisation immédiate (les factures émises restent, obligation légale)."""
    c = db.get(Client, client_id)
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client introuvable.")
    if _a_un_dossier_ouvert(db, c.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Un dossier de réparation est encore ouvert pour ce client : clôturez-le d'abord.")
    _anonymiser(db, c)
    audit(db, "rgpd_effacement", user_id=auteur.id, email=auteur.email, ressource="clients", ressource_id=c.id, ip=ip)


if __name__ == "__main__":
    from app.core.db import SessionLocal

    with SessionLocal() as session:
        print(purger(session))

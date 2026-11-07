from datetime import datetime

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Base
from app.models.tables import Appareil, Client, ModeleAppareil

TABLES_PLAN = {
    "users", "clients", "appareils", "reparations", "symptomes", "pannes", "historique_statuts",
    "checklist_etapes", "photos", "temps_passe", "pieces", "compatibilites", "mouvements_stock",
    "fournisseurs", "offres_fournisseur", "devis", "factures", "lignes_facture", "reglements",
    "capteurs", "lectures_capteurs", "outbox", "audit_log",
}


def test_toutes_les_tables_du_plan_existent():
    assert TABLES_PLAN <= set(Base.metadata.tables)


def test_imei_unique(db):
    client = Client(nom="Test", telephone="0600000000")
    modele = ModeleAppareil(marque="Apple", modele="iPhone 13")
    db.add_all([client, modele])
    db.flush()
    db.add(Appareil(client_id=client.id, modele_id=modele.id, imei="490154203237518", depose_le=datetime.now()))
    db.flush()
    db.add(Appareil(client_id=client.id, modele_id=modele.id, imei="490154203237518", depose_le=datetime.now()))
    with pytest.raises(IntegrityError):
        db.flush()


def test_appareil_exige_un_client(db):
    modele = ModeleAppareil(marque="Apple", modele="iPhone 12")
    db.add(modele)
    db.flush()
    db.add(Appareil(client_id=9999, modele_id=modele.id, imei="356938035643809", depose_le=datetime.now()))
    with pytest.raises(IntegrityError):
        db.flush()

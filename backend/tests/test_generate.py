from datetime import date

import pandas as pd
import pytest
from sqlalchemy import func, select

from app.models.tables import Piece, Reparation, User
from app.seed import charger
from ml.data.generate import generate

FIN = date(2026, 11, 7)


@pytest.fixture(scope="module")
def frames():
    return generate(fin=FIN)


def luhn_ok(imei: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(imei)):
        d = int(ch)
        if i % 2 == 1:
            d = d * 2 - 9 if d * 2 > 9 else d * 2
        total += d
    return total % 10 == 0


def test_reproductible(frames):
    again = generate(fin=FIN)
    for name in ("reparations", "mouvements_stock", "factures", "audit_log"):
        pd.testing.assert_frame_equal(frames[name], again[name])


def test_volume_et_modeles(frames):
    assert 1200 <= len(frames["reparations"]) <= 1400
    modeles = set(frames["modeles_appareil"]["modele"])
    assert {"iPhone 13", "iPhone 12", "Galaxy S22", "Galaxy S21", "Redmi Note 11", "Pixel 7"} <= modeles


def test_imei_luhn_et_uniques(frames):
    imeis = frames["appareils"]["imei"]
    assert imeis.is_unique
    assert imeis.str.len().eq(15).all()
    assert all(luhn_ok(i) for i in imeis)


def test_regles_metier(frames):
    rep = frames["reparations"]
    check = frames["checklist_etapes"]
    sortie = check[check["ordre"] == 5].set_index("reparation_id")["faite"]
    termines = rep[rep["statut"].isin(["pret", "livre"])]["id"]
    assert sortie.loc[termines].all(), "test de sortie obligatoire avant Prêt"
    photos = frames["photos"]
    accueil = photos[photos["type"].isin(["etat_general", "zone_endommagee"])].groupby("reparation_id").size()
    assert (accueil.reindex(rep["id"], fill_value=0) >= 2).all(), "2 photos minimum à l'accueil"
    assert (frames["pieces"]["stock"] >= 0).all()
    assert rep["numero"].is_unique and frames["factures"]["numero"].is_unique


def test_devis_coherents(frames):
    devis = frames["devis"]
    lignes = frames["lignes_devis"]
    lignes = lignes.assign(total=lignes["qte"] * lignes["pu_ht"]).groupby("devis_id")["total"].sum()
    assert (abs(lignes.loc[devis["id"]].values - devis["total_ht"].values) < 0.02).all()
    assert (abs(devis["tva"] - devis["total_ht"] * 0.2) < 0.011).all()


def test_seed_sqlite(db):
    compte = charger(db, FIN, mot_de_passe="demo-test-123", data_dir="/tmp/reparu-test")
    assert compte["reparations"] == db.scalar(select(func.count()).select_from(Reparation))
    assert db.scalar(select(User).where(User.email == "c.vasseur@reparu.fr")).role.value == "admin"
    assert db.scalar(select(User).where(User.email == "l.marchand@reparu.fr")).role.value == "technicien"
    assert db.scalar(select(func.count()).select_from(Piece)) > 40

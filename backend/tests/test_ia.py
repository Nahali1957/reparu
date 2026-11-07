"""Pipeline IA (M5) : comparaison d'algorithmes, sélection, versionnage, endpoints < 3 s."""

import json
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings
from app.main import app as fastapi_app
from app.ml.train import entrainer_tout, rapport_markdown
from app.models.tables import DiagnosticIA, ModeleIA, Piece
from app.services.ia import niveau_confiance
from tests.conftest import _base_seed, login


@pytest.fixture(scope="module")
def ia(tmp_path_factory):
    """Base remplie + modèles entraînés une seule fois pour tout le module."""
    mp = pytest.MonkeyPatch()
    data_dir = tmp_path_factory.mktemp("data")
    mp.setattr(get_settings(), "data_dir", str(data_dir))
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    _base_seed().backup(eng.raw_connection().driver_connection)
    factory = sessionmaker(bind=eng, autoflush=False, expire_on_commit=False)
    with factory() as db:
        t0 = time.perf_counter()
        sortie = entrainer_tout(db)
        duree = time.perf_counter() - t0
    fastapi_app.state.session_factory = factory
    fastapi_app.state.auth_limiter.reset()
    with TestClient(fastapi_app) as client:
        yield {"client": client, "sortie": sortie, "factory": factory, "data_dir": data_dir, "duree": duree,
               "admin": login(client, "admin"), "tech": login(client, "technicien")}
    mp.undo()
    eng.dispose()


def test_comparaison_et_selection(ia):
    noms = {r.nom for r, _ in ia["sortie"]}
    assert noms == {"diagnostic", "estimation", "prevision"}
    for r, m in ia["sortie"]:
        assert len(r.candidats) >= 3 and r.baseline in r.candidats  # ≥ 2 algorithmes + baseline naïve
        algos = {k: v[r.metrique] for k, v in r.candidats.items() if k != r.baseline}
        meilleur = (max if r.plus_grand_est_meilleur else min)(algos.values())
        assert r.candidats[r.retenu][r.metrique] == meilleur or r.retenu == r.baseline
        assert m.version == "v1.0" and m.actif
        fichier = Path(ia["data_dir"]) / "models" / f"{r.nom}-v1.0.json"
        assert json.loads(fichier.read_text())["retenu"] == r.retenu
        assert Path(m.chemin_joblib).is_file()
    diag = next(r for r, _ in ia["sortie"] if r.nom == "diagnostic")
    assert diag.candidats[diag.retenu]["top3_accuracy"] > diag.candidats[diag.baseline]["top3_accuracy"]
    assert ia["duree"] < 60
    assert "données synthétiques" in rapport_markdown(ia["sortie"])


def test_diagnostic_dossier_historise(ia):
    c = ia["client"]
    with ia["factory"]() as db:
        numero = db.scalar(select(DiagnosticIA.reparation_id))  # aucun diagnostic historisé au départ
        assert numero is None
    dossier = c.get("/api/reparations", headers=ia["tech"]).json()[0]["numero"]
    t0 = time.perf_counter()
    r = c.post("/api/ia/diagnostic", headers=ia["tech"], json={"reparation": dossier})
    assert r.status_code == 200 and time.perf_counter() - t0 < 3
    d = r.json()
    assert len(d["pannes"]) == 3 and d["pannes"][0]["score"] >= d["pannes"][1]["score"] >= d["pannes"][2]["score"]
    assert 0 < d["confiance"] <= 1 and d["niveau"] == niveau_confiance(d["confiance"])
    assert d["modele_version"] == "v1.0" and d["historique_interventions"] > 1000
    est = d["estimation"]
    assert float(est["prix_conseille_ht"]) >= float(est["main_oeuvre"]) and est["duree_min"] % 5 == 0
    suggestion = c.get(f"/api/reparations/{dossier}", headers=ia["tech"]).json()["suggestion"]
    assert suggestion["modele_version"] == "v1.0" and suggestion["confiance"] == d["confiance"]


def test_diagnostic_apercu_symptomes(ia):
    c = ia["client"]
    with ia["factory"]() as db:
        from app.models.tables import ModeleAppareil
        iphone = db.scalar(select(ModeleAppareil).where(ModeleAppareil.modele == "iPhone 13"))
    r = c.post("/api/ia/diagnostic", headers=ia["tech"], json={"modele_id": iphone.id,
                                                               "symptomes_texte": "Écran fissuré après une chute, tactile HS"}).json()
    assert r["pannes"][0]["code"] == "ecran" and r["niveau"] in ("haute", "moyenne")
    assert any("iPhone 13" in p["designation"] for p in r["pannes"][0]["pieces"])
    assert c.post("/api/ia/diagnostic", headers=ia["tech"], json={}).status_code == 422


def test_estimation(ia):
    c = ia["client"]
    r = c.post("/api/ia/estimation", headers=ia["tech"], json={"modele_id": 1, "panne_code": "batterie"})
    assert r.status_code == 200
    e = r.json()
    from decimal import Decimal
    assert Decimal(e["marge_brute"]) == Decimal(e["prix_conseille_ht"]) - Decimal(e["cout_pieces"])
    assert c.post("/api/ia/estimation", headers=ia["tech"], json={"modele_id": 1, "panne_code": "inconnue"}).status_code == 404
    sans_piece = c.post("/api/ia/estimation", headers=ia["tech"], json={"modele_id": 1, "panne_code": "thermique"}).json()
    assert Decimal(sans_piece["cout_pieces"]) == 0


def test_prevision_et_recommandation(ia):
    c = ia["client"]
    t0 = time.perf_counter()
    prev = c.get("/api/ia/prevision", headers=ia["tech"]).json()
    assert time.perf_counter() - t0 < 3
    with ia["factory"]() as db:
        assert len(prev) == db.query(Piece).count()
    for p in prev:
        attendu = max(0, -(-(p["prevision_30j"] + p["stock_securite"] - min(p["stock"], p["stock_observe"] if p["stock_observe"] is not None else p["stock"])) // 1))
        assert p["quantite_a_commander"] == attendu
        assert ("Commander" in p["action"]) == (p["quantite_a_commander"] > 0)
    assert c.get("/api/ia/recommandation-achat?piece_id=1", headers=ia["tech"]).status_code == 403
    reco = c.get("/api/ia/recommandation-achat?piece_id=1", headers=ia["admin"]).json()
    assert reco["prevision"]["piece_id"] == 1 and reco["justification"]


def test_fiabilite_et_reentrainement(ia):
    c = ia["client"]
    assert c.get("/api/ia/fiabilite", headers=ia["tech"]).status_code == 403
    f = c.get("/api/ia/fiabilite", headers=ia["admin"]).json()
    assert {m["nom"] for m in f["modeles"]} == {"diagnostic", "estimation", "prevision"}
    assert f["donnees_synthetiques"] is True
    assert f["suivi_diagnostic"]["suggestions_evaluees"] >= 1  # le diagnostic historisé plus haut
    f2 = c.post("/api/ia/entrainer", headers=ia["admin"]).json()
    assert all(m["version"] == "v1.1" and m["versions"] == ["v1.0", "v1.1"] for m in f2["modeles"])
    with ia["factory"]() as db:
        assert db.query(ModeleIA).filter(ModeleIA.actif.is_(True)).count() == 3


def test_niveaux_de_confiance():
    assert niveau_confiance(0.91) == "haute" and niveau_confiance(0.8) == "haute"
    assert niveau_confiance(0.79) == "moyenne" and niveau_confiance(0.5) == "moyenne"
    assert niveau_confiance(0.49) == "indéterminée"

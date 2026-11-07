"""IA appliquée à la sécurité (M7) : un brute force simulé est signalé ; lectures capteurs atypiques."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.clock import maintenant
from app.core.config import get_settings
from app.main import app as fastapi_app
from app.ml import anomalies as A
from app.ml.train import enregistrer, entrainer_capteurs, entrainer_securite
from app.models.tables import Anomalie, AuditLog, Capteur, LectureCapteur
from app.services import securite
from tests.conftest import COMPTES, MDP, _base_seed, login


@pytest.fixture(scope="module")
def env(tmp_path_factory):
    mp = pytest.MonkeyPatch()
    mp.setattr(get_settings(), "data_dir", str(tmp_path_factory.mktemp("data")))
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    _base_seed().backup(eng.raw_connection().driver_connection)
    factory = sessionmaker(bind=eng, autoflush=False, expire_on_commit=False)
    with factory() as db:
        resultats = [entrainer_securite(db), entrainer_capteurs(db)]
        for r in resultats:
            enregistrer(db, r, {})
    fastapi_app.state.session_factory = factory
    fastapi_app.state.auth_limiter.reset()
    with TestClient(fastapi_app) as c:
        yield {"client": c, "factory": factory, "resultats": resultats}
    mp.undo()
    eng.dispose()


def test_comparaison_detecteurs(env):
    for r in env["resultats"]:
        assert set(r.candidats) == {r.baseline, "isolation_forest", "local_outlier_factor"}
        assert r.candidats[r.retenu]["f1"] >= r.candidats[r.baseline]["f1"]
        assert r.extra["anomalies_synthetiques_test"] > 0


def test_peu_de_fausses_alertes_sur_activite_normale(env):
    """Sur les 48 dernières heures d'activité normale, les alertes restent rares (≤ 2 % des fenêtres)."""
    c = env["client"]
    login(c, "admin")
    with env["factory"]() as db:
        fenetres = A.fenetres_securite(A.charger_audit(db, depuis=maintenant() - securite.FENETRE_ANALYSE))
        alertes = securite.detecter_securite(db)
    assert len(alertes) <= max(1, 0.02 * len(fenetres)), [(a.type, a.details["message"]) for a in alertes]
    with env["factory"]() as db:  # remise à zéro pour isoler le scénario d'attaque
        db.query(Anomalie).delete()
        db.commit()


def test_brute_force_simule_signale(env):
    """Critère d'acceptation M7."""
    c = env["client"]
    fastapi_app.state.auth_limiter.reset()
    codes = [c.post("/api/auth/login", json={"email": COMPTES["technicien"][1], "password": f"essai-{k}"}).status_code
             for k in range(25)]
    assert 423 in codes and 429 in codes
    with env["factory"]() as db:
        assert db.scalar(select(AuditLog).where(AuditLog.action == "login_bloque")) is not None
        alertes = securite.detecter_securite(db)
    types = {(a.type, a.details["message"].split(" — ")[-1]) for a in alertes}
    assert ("brute_force", "l.marchand@reparu.fr") in types
    assert all(0 <= a.score <= 1 for a in alertes)
    with env["factory"]() as db:
        assert securite.detecter_securite(db) == []  # pas de double alerte pour la même fenêtre

    fastapi_app.state.auth_limiter.reset()
    admin = {"Authorization": f"Bearer {c.post('/api/auth/login', json={'email': COMPTES['admin'][1], 'password': MDP}).json()['access_token']}"}
    journal = c.get("/api/audit/journal?limit=100", headers=admin).json()
    assert any(j["libelle"].startswith("Alerte IA sécurité") and j["gravite"] == "critique" for j in journal)
    cloche = c.get("/api/notifications", headers=admin).json()
    assert any(al["type"] == "anomalie" and al["gravite"] == "critique" for al in cloche["alertes"])
    liste = c.get("/api/securite/alertes", headers=admin).json()
    bf = next(a for a in liste if a["type"] == "brute_force")
    assert c.post(f"/api/securite/alertes/{bf['id']}/faux-positif", headers=admin).json()["statut"] == "faux_positif"
    assert c.post(f"/api/securite/alertes/{bf['id']}/ignorer", headers=admin).status_code == 404


def test_alertes_reservees_a_l_admin(env):
    c = env["client"]
    fastapi_app.state.auth_limiter.reset()
    with env["factory"]() as db:  # le brute force précédent a verrouillé le compte technicien
        from app.models.tables import User
        db.query(User).update({User.verrouille_jusqu: None, User.echecs_connexion: 0})
        db.commit()
    for role in ("technicien", "responsable"):
        h = login(c, role)
        fastapi_app.state.auth_limiter.reset()
        assert c.get("/api/securite/alertes", headers=h).status_code == 403
        alertes = c.get("/api/notifications", headers=h).json()["alertes"]
        assert all(al["lien"] != "/administration/comptes" for al in alertes)  # alertes de sécurité : admin seul


def test_lecture_capteur_atypique(env):
    with env["factory"]() as db:
        cap = db.scalar(select(Capteur).where(Capteur.code == "iot-cap-001"))
        mediane = sorted(lec.niveau for lec in db.scalars(select(LectureCapteur).where(LectureCapteur.capteur_id == cap.id)))
        niveau = max(25, mediane[len(mediane) // 2] * 8)
        db.add(LectureCapteur(capteur_id=cap.id, niveau=niveau, recu_le=maintenant()))
        db.commit()
        nouvelles = securite.detecter_capteurs(db)
        assert any(a.capteur_id == cap.id and a.type == "lecture_atypique" for a in nouvelles)
        assert securite.detecter_capteurs(db) == []  # anomalie déjà ouverte sur ce capteur
        assert db.scalar(select(Anomalie).where(Anomalie.type == "lecture_atypique")).score is not None


def test_qualification():
    import pandas as pd
    base = dict(identite="x@reparu.fr", heure=pd.Timestamp("2026-03-03 14:00"), echecs=0, succes=0, refus=0, exports=0,
                ecritures=0, nb_ip=1, hors_horaires=0)
    assert A.qualifier_securite(pd.Series({**base, "echecs": 9}))[0] == "brute_force"
    assert A.qualifier_securite(pd.Series({**base, "echecs": 2, "nb_ip": 4}))[0] == "bourrage_identifiants"
    assert A.qualifier_securite(pd.Series({**base, "refus": 5}))[0] == "refus_repetes"
    assert A.qualifier_securite(pd.Series({**base, "exports": 8}))[0] == "export_massif"
    assert A.qualifier_securite(pd.Series({**base, "hors_horaires": 1, "heure": pd.Timestamp("2026-03-03 03:00")}))[0] == "horaire_inhabituel"
    assert A.qualifier_securite(pd.Series(base))[0] == "comportement_inhabituel"

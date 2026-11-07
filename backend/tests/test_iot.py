"""IoT (M6) : les lectures ne modifient jamais le stock ; anomalies ; correction tracée et nominative."""

from datetime import timedelta

import pytest
from sqlalchemy import select

from app.core.clock import maintenant
from app.models.tables import Anomalie, Capteur, LectureCapteur, MouvementStock, Piece
from app.schemas.iot import LectureIn
from app.services import iot


def capteur(sdb, code="iot-cap-001") -> Capteur:
    return sdb.scalar(select(Capteur).where(Capteur.code == code))


def anomalies(sdb, cap: Capteur, type_: str):
    sdb.expire_all()
    return sdb.scalars(select(Anomalie).where(Anomalie.capteur_id == cap.id, Anomalie.type == type_)).all()


def test_lecture_ne_modifie_jamais_le_stock(sdb):
    cap = capteur(sdb)
    stock = cap.piece.stock
    nb_mvts = sdb.query(MouvementStock).count()
    iot.enregistrer_lecture(sdb, cap.code, LectureIn(device=cap.code, niveau=stock + 5))
    sdb.expire_all()
    assert sdb.get(Piece, cap.piece_id).stock == stock
    assert sdb.query(MouvementStock).count() == nb_mvts
    assert sdb.scalar(select(LectureCapteur).order_by(LectureCapteur.id.desc())).niveau == stock + 5


def test_identite_et_capteur_inconnu_rejetes(sdb):
    with pytest.raises(ValueError, match="identité"):
        iot.enregistrer_lecture(sdb, "iot-cap-001", LectureIn(device="iot-cap-002", niveau=3))
    with pytest.raises(ValueError, match="inconnu"):
        iot.enregistrer_lecture(sdb, "iot-cap-999", LectureIn(device="iot-cap-999", niveau=3))


def test_ecart_confirme_sur_deux_lectures(sdb):
    cap = capteur(sdb, "iot-cap-003")
    cap.piece.stock = 8
    sdb.commit()
    iot.enregistrer_lecture(sdb, cap.code, LectureIn(device=cap.code, niveau=8))
    iot.enregistrer_lecture(sdb, cap.code, LectureIn(device=cap.code, niveau=3))
    assert anomalies(sdb, cap, "ecart_stock") == []  # une seule lecture divergente : bruit possible
    iot.enregistrer_lecture(sdb, cap.code, LectureIn(device=cap.code, niveau=3))
    ouvertes = anomalies(sdb, cap, "ecart_stock")
    assert len(ouvertes) == 1 and "3 unité(s) lue(s) pour 8" in ouvertes[0].details["message"]
    iot.enregistrer_lecture(sdb, cap.code, LectureIn(device=cap.code, niveau=2))
    assert len(anomalies(sdb, cap, "ecart_stock")) == 1  # pas de doublon


def test_valeur_aberrante(sdb):
    cap = capteur(sdb, "iot-cap-004")
    iot.enregistrer_lecture(sdb, cap.code, LectureIn(device=cap.code, niveau=999))
    assert len(anomalies(sdb, cap, "valeur_aberrante")) == 1
    assert anomalies(sdb, cap, "ecart_stock") == []


def test_capteur_muet_puis_reprise(sdb):
    cap = capteur(sdb, "iot-cap-005")
    iot.rapprocher(sdb, maintenant() + timedelta(days=3))
    muet = anomalies(sdb, cap, "capteur_muet")
    assert len(muet) == 1 and muet[0].statut.value == "ouverte"
    iot.enregistrer_lecture(sdb, cap.code, LectureIn(device=cap.code, niveau=cap.piece.stock))
    assert anomalies(sdb, cap, "capteur_muet")[0].statut.value == "corrigee"


def test_ecart_seed_et_capteur_muet_visibles(api):
    """Acceptation M6 : l'écart injecté par le générateur et le capteur muet apparaissent sur 5.10."""
    api.post("/api/iot/rapprocher", headers=api.h("admin"))
    vue = api.get("/api/iot", headers=api.h("admin")).json()
    types = {(a["capteur"], a["type"]) for a in vue["anomalies"]}
    assert ("iot-cap-002", "ecart_stock") in types and ("iot-cap-006", "capteur_muet") in types
    assert vue["capteurs_total"] == 6 and vue["anomalies_ouvertes"] == len(vue["anomalies"])
    assert vue["derniere_remontee"] is not None
    assert api.get("/api/iot", headers=api.h("technicien")).status_code == 403


def test_correction_tracee_et_nominative(api, sdb):
    api.post("/api/iot/rapprocher", headers=api.h("admin"))
    vue = api.get("/api/iot", headers=api.h("admin")).json()
    a = next(x for x in vue["anomalies"] if x["type"] == "ecart_stock")
    assert api.post(f"/api/iot/anomalies/{a['id']}/corriger", headers=api.h("technicien"), json={"recompte": 1}).status_code == 403
    r = api.post(f"/api/iot/anomalies/{a['id']}/corriger", headers=api.h("responsable"), json={"recompte": a["niveau_lu"]})
    assert r.status_code == 200 and r.json()["statut"] == "corrigee"
    sdb.expire_all()
    mvt = sdb.scalar(select(MouvementStock).where(MouvementStock.anomalie_id == a["id"]))
    assert mvt.source.value == "capteur" and mvt.par.nom == "Rémi Lambert" and mvt.qte == a["niveau_lu"] - a["stock_comptable"]
    assert sdb.get(Piece, a["piece_id"]).stock == a["niveau_lu"]
    assert api.post(f"/api/iot/anomalies/{a['id']}/corriger", headers=api.h("admin"), json={"recompte": 1}).status_code == 409


def test_recompte_conforme_et_ignorer(api, sdb):
    api.post("/api/iot/rapprocher", headers=api.h("admin"))
    anos = api.get("/api/iot", headers=api.h("admin")).json()["anomalies"]
    ecart = next(x for x in anos if x["type"] == "ecart_stock")
    r = api.post(f"/api/iot/anomalies/{ecart['id']}/corriger", headers=api.h("admin"), json={"recompte": ecart["stock_comptable"]})
    assert r.json()["statut"] == "faux_positif"
    muet = next(x for x in anos if x["type"] == "capteur_muet")
    assert api.post(f"/api/iot/anomalies/{muet['id']}/ignorer", headers=api.h("admin")).json()["statut"] == "faux_positif"
    cap = sdb.scalar(select(Capteur))
    assert len(api.get(f"/api/iot/capteurs/{cap.id}/lectures?limit=10", headers=api.h("admin")).json()) == 10


def test_consignes(sdb):
    c = iot.consignes(sdb)
    assert len(c) == 6 and all(isinstance(v, int) for v in c.values())

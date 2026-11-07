"""Détection d'anomalies (M7) : journal d'audit (sécurité) et lectures capteurs.

Méthode : modèles non supervisés appris sur l'historique jugé normal. Pour pouvoir les
COMPARER objectivement, on évalue sur un jeu de test = fenêtres normales récentes +
anomalies SYNTHÉTIQUES étiquetées (brute force, connexion nocturne, refus répétés,
exports massifs, bourrage d'identifiants ; pics, chutes et silences de capteurs).
IsolationForest et LocalOutlierFactor sont confrontés à une baseline naïve à seuil
unique ; le meilleur F1 est retenu automatiquement (voir `train.py`).
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator
from sklearn.ensemble import IsolationForest
from sklearn.metrics import f1_score, precision_score, recall_score
from sklearn.neighbors import LocalOutlierFactor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.tables import AuditLog, LectureCapteur, User

GRAINE = 42
CONTAMINATION = 0.005  # ≈ 1 fausse alerte pour 200 fenêtres horaires normales
ACTIONS_ECHEC = ("login_echec", "login_bloque")
# événements produits par la surveillance elle-même : exclus de l'analyse (sinon une alerte en déclencherait d'autres)
ACTIONS_SYSTEME = ("alerte_securite", "alerte_traitee", "anomalie_faux_positif")
COLONNES_SECURITE = ["echecs", "succes", "refus", "exports", "ecritures", "nb_ip", "hors_horaires", "heure_sin", "heure_cos"]
COLONNES_CAPTEURS = ["niveau_rel", "delta_rel", "ecart_mediane_rel", "silence_rel"]


# ---------------------------------------------------------------- détecteurs


class SeuilUnique(BaseEstimator):
    """Baseline naïve : une seule règle sur une seule variable (ex. ≥ 5 échecs dans l'heure)."""

    def __init__(self, colonne: str = "echecs", seuil: float = 5):
        self.colonne, self.seuil = colonne, seuil

    def fit(self, X, y=None):
        return self

    def predict(self, X: pd.DataFrame):
        return np.where(X[self.colonne].to_numpy(dtype=float) >= self.seuil, -1, 1)

    def score_samples(self, X: pd.DataFrame):
        return -X[self.colonne].to_numpy(dtype=float)


def candidats(baseline: SeuilUnique) -> dict[str, BaseEstimator]:
    return {
        f"baseline_seuil_{baseline.colonne}": baseline,
        "isolation_forest": IsolationForest(n_estimators=300, contamination=CONTAMINATION, random_state=GRAINE),
        "local_outlier_factor": make_pipeline(StandardScaler(), LocalOutlierFactor(n_neighbors=20, novelty=True,
                                                                                     contamination=CONTAMINATION)),
    }


def score_relatif(est, X: pd.DataFrame, reference: np.ndarray) -> np.ndarray:
    """Score d'anomalie lisible entre 0 et 1 : part des fenêtres d'apprentissage jugées plus normales."""
    return np.searchsorted(reference, -est.score_samples(X), side="right") / max(len(reference), 1)


def evaluer(est, X_train: pd.DataFrame, X_test: pd.DataFrame, y_test: np.ndarray) -> dict:
    est.fit(X_train)
    pred = (est.predict(X_test) == -1).astype(int)
    return {"f1": round(f1_score(y_test, pred, zero_division=0), 4),
            "precision": round(precision_score(y_test, pred, zero_division=0), 4),
            "rappel": round(recall_score(y_test, pred, zero_division=0), 4),
            "taux_fausses_alertes": round(float(pred[y_test == 0].mean()) if (y_test == 0).any() else 0.0, 4)}


# ---------------------------------------------------------------- sécurité : fenêtres horaires du journal d'audit


def charger_audit(db: Session, depuis=None) -> pd.DataFrame:
    q = (select(AuditLog.user_id, AuditLog.email_tente, User.email.label("email_compte"), AuditLog.action, AuditLog.ip,
                AuditLog.horodatage).outerjoin(User, User.id == AuditLog.user_id).where(AuditLog.action.not_in(ACTIONS_SYSTEME)))
    if depuis is not None:
        q = q.where(AuditLog.horodatage >= depuis)
    return pd.read_sql(q, db.connection())


def fenetres_securite(audit: pd.DataFrame) -> pd.DataFrame:
    """Une ligne par identité (e-mail tenté, sinon IP) et par heure."""
    if audit.empty:
        return pd.DataFrame(columns=["identite", "heure", *COLONNES_SECURITE])
    a = audit.copy()
    # identité = compte authentifié, sinon e-mail tenté, sinon adresse IP
    a["identite"] = a["email_compte"].fillna(a["email_tente"]).fillna("ip:" + a["ip"].fillna("?"))
    a["heure"] = pd.to_datetime(a["horodatage"]).dt.floor("h")
    a["echecs"] = a["action"].isin(ACTIONS_ECHEC).astype(int)
    a["succes"] = (a["action"] == "login_ok").astype(int)
    a["refus"] = (a["action"] == "acces_refuse").astype(int)
    a["exports"] = (a["action"] == "export").astype(int)
    a["ecritures"] = (a["action"] == "ecriture").astype(int)
    g = a.groupby(["identite", "heure"]).agg(echecs=("echecs", "sum"), succes=("succes", "sum"), refus=("refus", "sum"),
                                             exports=("exports", "sum"), ecritures=("ecritures", "sum"),
                                             nb_ip=("ip", "nunique")).reset_index()
    return _temporel(g)


def _temporel(g: pd.DataFrame) -> pd.DataFrame:
    h = g["heure"].dt.hour + g["heure"].dt.minute / 60
    g["hors_horaires"] = ((g["heure"].dt.hour < 7) | (g["heure"].dt.hour >= 21) | (g["heure"].dt.weekday == 6)).astype(int)
    g["heure_sin"], g["heure_cos"] = np.sin(2 * np.pi * h / 24), np.cos(2 * np.pi * h / 24)
    return g


def attaques_synthetiques(n: int, rng: np.random.Generator, base: pd.Timestamp) -> pd.DataFrame:
    """Fenêtres d'attaque étiquetées, pour l'évaluation uniquement (jamais insérées en base)."""
    types = ["brute_force", "connexion_nocturne", "refus_repetes", "export_massif", "bourrage_identifiants"]
    rows = []
    for k in range(n):
        t = types[k % len(types)]
        heure = int(rng.integers(1, 5)) if t == "connexion_nocturne" else int(rng.integers(8, 20))
        r = dict(identite=f"attaque-{k}", heure=base + pd.Timedelta(days=int(rng.integers(0, 30)), hours=heure),
                 echecs=0, succes=0, refus=0, exports=0, ecritures=0, nb_ip=1)
        if t == "brute_force":
            r.update(echecs=int(rng.integers(6, 40)), succes=int(rng.integers(0, 2)))
        elif t == "connexion_nocturne":
            r.update(succes=1, echecs=int(rng.integers(0, 2)), exports=int(rng.integers(0, 2)))
        elif t == "refus_repetes":
            r.update(succes=int(rng.integers(0, 2)), refus=int(rng.integers(4, 15)))
        elif t == "export_massif":
            r.update(succes=1, exports=int(rng.integers(5, 25)))
        else:
            r.update(echecs=int(rng.integers(3, 6)), nb_ip=int(rng.integers(3, 7)))
        rows.append(r)
    return _temporel(pd.DataFrame(rows))


def jeu_securite(db: Session) -> tuple[pd.DataFrame, pd.DataFrame, np.ndarray]:
    f = fenetres_securite(charger_audit(db)).sort_values("heure").reset_index(drop=True)
    coupe = int(len(f) * 0.8)
    train, test_normal = f.iloc[:coupe], f.iloc[coupe:]
    rng = np.random.default_rng(GRAINE)
    attaques = attaques_synthetiques(max(25, len(test_normal) // 10), rng, test_normal["heure"].min())
    test = pd.concat([test_normal, attaques], ignore_index=True)
    y = np.r_[np.zeros(len(test_normal), dtype=int), np.ones(len(attaques), dtype=int)]
    return train[COLONNES_SECURITE], test[COLONNES_SECURITE], y


def qualifier_securite(ligne: pd.Series) -> tuple[str, str]:
    """Type et message lisibles d'une fenêtre jugée anormale."""
    qui = ligne["identite"].removeprefix("ip:")
    if ligne["echecs"] >= 5:
        return "brute_force", f"{int(ligne['echecs'])} échecs de connexion en une heure — {qui}"
    if ligne["nb_ip"] >= 3 and ligne["echecs"]:
        return "bourrage_identifiants", f"échecs depuis {int(ligne['nb_ip'])} adresses IP — {qui}"
    if ligne["refus"] >= 3:
        return "refus_repetes", f"{int(ligne['refus'])} accès refusés en une heure — {qui}"
    if ligne["exports"] >= 4:
        return "export_massif", f"{int(ligne['exports'])} exports en une heure — {qui}"
    if ligne["hors_horaires"]:
        return "horaire_inhabituel", f"activité à {ligne['heure']:%H:%M} le {ligne['heure']:%d/%m} — {qui}"
    return "comportement_inhabituel", f"activité inhabituelle — {qui}"


# ---------------------------------------------------------------- capteurs


def charger_lectures(db: Session) -> pd.DataFrame:
    return pd.read_sql(select(LectureCapteur.id, LectureCapteur.capteur_id, LectureCapteur.niveau, LectureCapteur.recu_le),
                       db.connection())


def features_capteurs(lec: pd.DataFrame) -> pd.DataFrame:
    """Variables relatives au comportement habituel de chaque capteur (échelle et rythme propres)."""
    out = []
    for _cid, g in lec.sort_values("recu_le").groupby("capteur_id"):
        g = g.copy()
        t = pd.to_datetime(g["recu_le"])
        ref = max(float(g["niveau"].median()), 1.0)
        prev = g["niveau"].shift(1)
        mediane = g["niveau"].shift(1).rolling(8, min_periods=2).median()
        gap = t.diff().dt.total_seconds()
        g["niveau_rel"] = g["niveau"] / ref
        g["delta_rel"] = (g["niveau"] - prev).abs() / (prev.fillna(g["niveau"]) + 1)
        g["ecart_mediane_rel"] = (g["niveau"] - mediane).abs() / (mediane.fillna(g["niveau"]) + 1)
        g["silence_rel"] = gap / max(float(gap.median()) if gap.notna().any() else 1.0, 1.0)
        out.append(g)
    if not out:
        return pd.DataFrame(columns=["id", "capteur_id", "niveau", "recu_le", *COLONNES_CAPTEURS])
    return pd.concat(out).fillna({"delta_rel": 0, "ecart_mediane_rel": 0, "silence_rel": 1}).reset_index(drop=True)


def jeu_capteurs(db: Session) -> tuple[pd.DataFrame, pd.DataFrame, np.ndarray]:
    f = features_capteurs(charger_lectures(db)).sort_values("recu_le").reset_index(drop=True)
    coupe = int(len(f) * 0.8)
    train, test_normal = f.iloc[:coupe], f.iloc[coupe:]
    rng = np.random.default_rng(GRAINE)
    n = max(20, len(test_normal) // 10)
    anomalies = pd.DataFrame({
        "niveau_rel": np.r_[rng.uniform(8, 60, n // 3), rng.uniform(0, 0.05, n // 3), rng.uniform(0.8, 1.2, n - 2 * (n // 3))],
        "delta_rel": np.r_[rng.uniform(5, 50, n // 3), rng.uniform(0.8, 1, n // 3), rng.uniform(0, 0.2, n - 2 * (n // 3))],
        "ecart_mediane_rel": np.r_[rng.uniform(5, 50, n // 3), rng.uniform(0.8, 1, n // 3), rng.uniform(0, 0.2, n - 2 * (n // 3))],
        "silence_rel": np.r_[np.ones(n // 3), np.ones(n // 3), rng.uniform(4, 12, n - 2 * (n // 3))],
    })
    test = pd.concat([test_normal[COLONNES_CAPTEURS], anomalies], ignore_index=True)
    y = np.r_[np.zeros(len(test_normal), dtype=int), np.ones(len(anomalies), dtype=int)]
    return train[COLONNES_CAPTEURS], test, y

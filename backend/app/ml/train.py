"""Entraînement, comparaison et sélection automatique des trois modèles d'IA.

Pour chaque modèle : au moins deux algorithmes et une baseline naïve sont évalués sur
un découpage TEMPOREL (on apprend sur le passé, on teste sur la période la plus
récente), le meilleur est retenu automatiquement, sérialisé avec Joblib, versionné
(`v1.x`) et ses métriques sont enregistrées en JSON (exposées par F-11).

    python -m app.ml.train                 # entraîne et enregistre une nouvelle version
    python -m app.ml.train --si-absent     # seulement si aucun modèle actif (démarrage)
    python -m app.ml.train --rapport DIR   # écrit aussi DIR/evaluation.md et DIR/metrics/*.json
"""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import dataclass, field
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor, RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import accuracy_score, f1_score, mean_absolute_error, r2_score, top_k_accuracy_score
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.clock import maintenant
from app.core.config import get_settings
from app.ml import features as F
from app.ml.baselines import Colonne, MedianeParPanne, PanneFrequenteParModele
from app.models.tables import ModeleIA

PART_TEST = 0.2
SEMAINES_TEST = 12
GRAINE = 42
LECTURES = {
    "diagnostic": "Le score élevé reflète la netteté des corrélations symptômes → panne du générateur ; sur données réelles "
                  "(saisie libre plus bruitée), il faut s'attendre à moins. La baseline par modèle d'appareil plafonne car le "
                  "modèle d'appareil seul ne dit presque rien de la panne. L'utilisateur voit 3 hypothèses : la métrique de "
                  "sélection est donc le top 3.",
    "estimation": "Le gain sur la médiane par panne est faible : la durée dépend surtout du type de panne, déjà capté par la "
                  "baseline ; le reste (technicien, aléas) n'est pas prévisible à l'accueil. L'erreur au 80e centile est "
                  "affichée comme marge d'incertitude.",
    "prevision": "La demande par pièce et par semaine est faible et intermittente (souvent 0 ou 1) : les erreurs relatives "
                 "hebdomadaires (WAPE) sont donc mécaniquement élevées pour tous les algorithmes. La décision d'achat se prend "
                 "sur 30 jours avec un stock de sécurité (1,65 σ √délai), ce qui absorbe cette variabilité.",
}


# ---------------------------------------------------------------- résultats


@dataclass
class Resultat:
    nom: str
    tache: str
    metrique: str  # métrique de sélection
    plus_grand_est_meilleur: bool
    candidats: dict[str, dict] = field(default_factory=dict)
    baseline: str = ""
    retenu: str = ""
    estimateur: object = None
    extra: dict = field(default_factory=dict)
    n_train: int = 0
    n_test: int = 0

    def choisir(self, estimateurs: dict[str, object]) -> None:
        signe = 1 if self.plus_grand_est_meilleur else -1
        algos = {k: v for k, v in self.candidats.items() if k != self.baseline}
        self.retenu = max(algos, key=lambda k: signe * algos[k][self.metrique])
        # si aucun algorithme ne bat la baseline, on retient la baseline (honnêteté du choix)
        if signe * self.candidats[self.baseline][self.metrique] > signe * algos[self.retenu][self.metrique]:
            self.retenu = self.baseline
        self.estimateur = estimateurs[self.retenu]

    def metriques(self) -> dict:
        base = self.candidats[self.baseline][self.metrique]
        meilleur = self.candidats[self.retenu][self.metrique]
        gain = (meilleur - base) if self.plus_grand_est_meilleur else (base - meilleur)
        return {"tache": self.tache, "metrique_selection": self.metrique, "plus_grand_est_meilleur": self.plus_grand_est_meilleur,
                "baseline": self.baseline, "retenu": self.retenu, "gain_vs_baseline": round(float(gain), 4),
                "candidats": self.candidats, "n_train": self.n_train, "n_test": self.n_test, **self.extra}


def _split_temporel(df: pd.DataFrame) -> tuple[pd.Index, pd.Index]:
    coupe = int(len(df) * (1 - PART_TEST))
    return df.index[:coupe], df.index[coupe:]


# ---------------------------------------------------------------- modèle 1 : diagnostic


def entrainer_diagnostic(df: pd.DataFrame, ref: dict) -> Resultat:
    X, y = F.matrice_diagnostic(df, ref), df["panne"].to_numpy()
    tr, te = _split_temporel(df)
    estimateurs = {
        "baseline_panne_frequente_par_modele": PanneFrequenteParModele(),
        "logistic_regression": LogisticRegression(max_iter=2000, C=1.0),
        "random_forest": RandomForestClassifier(n_estimators=300, min_samples_leaf=2, random_state=GRAINE, n_jobs=-1),
        "gradient_boosting": GradientBoostingClassifier(n_estimators=150, max_depth=3, learning_rate=0.1, random_state=GRAINE),
    }
    r = Resultat("diagnostic", "classification des pannes (top 3)", "top3_accuracy", True,
                 baseline="baseline_panne_frequente_par_modele", n_train=len(tr), n_test=len(te))
    for nom, est in estimateurs.items():
        t0 = time.perf_counter()
        est.fit(X.loc[tr], y[tr])
        proba = est.predict_proba(X.loc[te])
        pred = est.classes_[proba.argmax(axis=1)]
        r.candidats[nom] = {
            "accuracy": round(accuracy_score(y[te], pred), 4),
            "top3_accuracy": round(top_k_accuracy_score(y[te], proba, k=3, labels=est.classes_), 4),
            "f1_macro": round(f1_score(y[te], pred, average="macro", zero_division=0), 4),
            "duree_entrainement_s": round(time.perf_counter() - t0, 2),
        }
    r.choisir(estimateurs)
    # réentraînement du modèle retenu sur tout l'historique avant mise en production
    r.estimateur.fit(X, y)
    r.extra["colonnes"] = list(X.columns)
    r.extra["classes"] = [str(c) for c in r.estimateur.classes_]
    return r


# ---------------------------------------------------------------- modèle 2 : estimation du temps


def entrainer_estimation(df: pd.DataFrame, ref: dict) -> Resultat:
    df = df[df["duree_reelle"].notna() & (df["duree_reelle"] > 0)].reset_index(drop=True)
    X, y = F.matrice_estimation(df, ref), df["duree_reelle"].to_numpy(dtype=float)
    tr, te = _split_temporel(df)
    estimateurs = {
        "baseline_mediane_par_panne": MedianeParPanne(),
        "ridge": Ridge(alpha=1.0),
        "random_forest": RandomForestRegressor(n_estimators=300, min_samples_leaf=3, random_state=GRAINE, n_jobs=-1),
        "gradient_boosting": GradientBoostingRegressor(n_estimators=200, max_depth=3, learning_rate=0.05, random_state=GRAINE),
    }
    r = Resultat("estimation", "régression du temps de réparation (minutes)", "mae_min", False,
                 baseline="baseline_mediane_par_panne", n_train=len(tr), n_test=len(te))
    for nom, est in estimateurs.items():
        est.fit(X.loc[tr], y[tr])
        pred = est.predict(X.loc[te])
        r.candidats[nom] = {"mae_min": round(mean_absolute_error(y[te], pred), 2), "r2": round(r2_score(y[te], pred), 4)}
    r.choisir(estimateurs)
    r.estimateur.fit(X, y)
    pred = r.estimateur.predict(X.loc[te])
    r.extra["colonnes"] = list(X.columns)
    # Erreur absolue au 80e centile : sert d'intervalle indicatif affiché avec l'estimation.
    r.extra["erreur_p80_min"] = round(float(np.percentile(np.abs(y[te] - pred), 80)), 1)
    return r


# ---------------------------------------------------------------- modèle 3 : prévision de consommation


def entrainer_prevision(serie: pd.DataFrame) -> Resultat:
    df = F.features_prevision(serie)
    semaines = sorted(df["semaine"].unique())
    coupe = semaines[-SEMAINES_TEST]
    tr, te = df.index[df["semaine"] < coupe], df.index[df["semaine"] >= coupe]
    X, y = df[F.COLONNES_PREVISION], df["conso"].to_numpy(dtype=float)
    estimateurs = {
        "baseline_naive_semaine_precedente": Colonne("lag1"),
        "moyenne_mobile_30j": Colonne("ma4"),
        "ridge_lags": Ridge(alpha=1.0),
        "gradient_boosting_lags": GradientBoostingRegressor(n_estimators=200, max_depth=3, learning_rate=0.05, random_state=GRAINE),
    }
    r = Resultat("prevision", "consommation hebdomadaire par pièce", "mae", False,
                 baseline="baseline_naive_semaine_precedente", n_train=len(tr), n_test=len(te))
    for nom, est in estimateurs.items():
        est.fit(X.loc[tr], y[tr])
        pred = np.clip(est.predict(X.loc[te]), 0, None)
        total = y[te].sum() or 1
        r.candidats[nom] = {"mae": round(mean_absolute_error(y[te], pred), 4),
                            "wape_pct": round(float(np.abs(y[te] - pred).sum() / total * 100), 1),
                            "biais_pct": round(float((pred.sum() - y[te].sum()) / total * 100), 1)}
    r.choisir(estimateurs)
    r.estimateur.fit(X, y)
    r.extra["colonnes"] = F.COLONNES_PREVISION
    r.extra["semaines_test"] = SEMAINES_TEST
    r.extra["ecart_type_hebdo"] = {int(k): round(float(v), 3) for k, v in serie.groupby("piece_id")["conso"].std().fillna(0).items()}
    return r


# ---------------------------------------------------------------- enregistrement et rapport


def dossier_modeles() -> Path:
    d = Path(get_settings().data_dir) / "models"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _prochaine_version(db: Session, nom: str) -> str:
    n = db.scalar(select(func.count()).select_from(ModeleIA).where(ModeleIA.nom == nom)) or 0
    return f"v1.{n}"


def enregistrer(db: Session, r: Resultat, ref: dict) -> ModeleIA:
    version = _prochaine_version(db, r.nom)
    base = dossier_modeles() / f"{r.nom}-{version}"
    metriques = r.metriques()
    joblib.dump({"estimateur": r.estimateur, "version": version, "ref": ref, "metriques": metriques}, f"{base}.joblib")
    Path(f"{base}.json").write_text(json.dumps({"nom": r.nom, "version": version, **metriques}, ensure_ascii=False, indent=2))
    db.execute(update(ModeleIA).where(ModeleIA.nom == r.nom).values(actif=False))
    m = ModeleIA(nom=r.nom, version=version, algorithme_retenu=r.retenu, metriques=metriques, chemin_joblib=f"{base}.joblib",
                 nb_lignes_entrainement=r.n_train + r.n_test, actif=True, entraine_le=maintenant())
    db.add(m)
    db.commit()
    return m


def entrainer_tout(db: Session) -> list[tuple[Resultat, ModeleIA]]:
    ref = F.referentiels(db)
    df = F.dossiers(db)
    resultats = [entrainer_diagnostic(df, ref), entrainer_estimation(df, ref), entrainer_prevision(F.consommation_hebdo(db))]
    out = [(r, enregistrer(db, r, ref)) for r in resultats]
    from app.ml import registry
    registry.vider_cache()
    return out


def rapport_markdown(sortie: list[tuple[Resultat, ModeleIA]]) -> str:
    lignes = ["# Évaluation des modèles d'IA", "",
              "> Évaluation réalisée sur des **données synthétiques** (`ml/data/generate.py`), pas sur l'historique réel de "
              "l'atelier. Les scores mesurent la capacité des modèles à retrouver les régularités injectées par le générateur ; "
              "ils devront être recalculés sur données réelles.", "",
              "Protocole : découpage **temporel** (apprentissage sur le passé, test sur la période la plus récente : 20 % des "
              f"dossiers, ou les {SEMAINES_TEST} dernières semaines pour la prévision). Chaque modèle est comparé à une baseline "
              "naïve ; le meilleur algorithme selon la métrique de sélection est retenu automatiquement puis réentraîné sur tout "
              "l'historique.", ""]
    for r, m in sortie:
        met = m.metriques
        lignes += [f"## {r.nom.capitalize()} — {r.tache} · modèle {m.version}", "",
                   f"Métrique de sélection : `{r.metrique}` ({'plus haut' if r.plus_grand_est_meilleur else 'plus bas'} = meilleur). "
                   f"Apprentissage : {r.n_train} lignes, test : {r.n_test} lignes.", ""]
        cles = list(next(iter(r.candidats.values())).keys())
        lignes += ["| Algorithme | " + " | ".join(cles) + " |", "|---|" + "---|" * len(cles)]
        for nom, vals in r.candidats.items():
            marque = " **(retenu)**" if nom == r.retenu else " *(baseline)*" if nom == r.baseline else ""
            lignes.append(f"| {nom}{marque} | " + " | ".join(str(vals[k]) for k in cles) + " |")
        lignes += ["", f"Gain du modèle retenu sur la baseline ({r.metrique}) : **{met['gain_vs_baseline']}**.", "",
                   f"**Lecture.** {LECTURES[r.nom]}", ""]
    lignes += ["## Temps de réponse", "", "Inférence mesurée sur l'API (base MySQL de démonstration) : voir "
               "`docs/JOURNAL.md` (M5). Exigence du cahier des charges : moins de 3 s par appel.", ""]
    return "\n".join(lignes) + "\n"


def main() -> None:
    from app.core.db import SessionLocal

    parser = argparse.ArgumentParser()
    parser.add_argument("--si-absent", action="store_true")
    parser.add_argument("--rapport", type=Path, default=None)
    args = parser.parse_args()
    with SessionLocal() as db:
        if args.si_absent and db.scalar(select(func.count()).select_from(ModeleIA).where(ModeleIA.actif.is_(True))):
            print("Modèles déjà entraînés : rien à faire.")
            return
        t0 = time.perf_counter()
        sortie = entrainer_tout(db)
        for r, m in sortie:
            print(f"{r.nom} {m.version} : {r.retenu} ({r.metrique}={r.candidats[r.retenu][r.metrique]}, "
                  f"baseline={r.candidats[r.baseline][r.metrique]})")
        print(f"Entraînement terminé en {time.perf_counter() - t0:.1f} s")
        if args.rapport:
            (args.rapport / "metrics").mkdir(parents=True, exist_ok=True)
            (args.rapport / "evaluation.md").write_text(rapport_markdown(sortie), encoding="utf-8")
            for r, m in sortie:
                (args.rapport / "metrics" / f"{r.nom}.json").write_text(
                    json.dumps({"nom": r.nom, "version": m.version, **m.metriques}, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

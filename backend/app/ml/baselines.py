"""Baselines naïves, dans un module importable : les modèles Joblib doivent pouvoir les recharger
quel que soit le point d'entrée (uvicorn, script d'entraînement, tests)."""

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, ClassifierMixin


class PanneFrequenteParModele(BaseEstimator, ClassifierMixin):
    """Baseline : distribution des pannes observée pour le modèle d'appareil (repli : distribution globale)."""

    def fit(self, X: pd.DataFrame, y):
        y = np.asarray(y)
        self.classes_ = np.unique(y)
        self.cols_ = [c for c in X.columns if c.startswith("modele=")]
        glob = pd.Series(y).value_counts(normalize=True).reindex(self.classes_, fill_value=0).to_numpy()
        self.global_ = glob
        self.dist_ = {}
        modele = X[self.cols_].to_numpy().argmax(axis=1)
        for m in np.unique(modele):
            vc = pd.Series(y[modele == m]).value_counts(normalize=True).reindex(self.classes_, fill_value=0).to_numpy()
            self.dist_[m] = vc
        return self

    def predict_proba(self, X: pd.DataFrame):
        modele = X[self.cols_].to_numpy().argmax(axis=1)
        return np.vstack([self.dist_.get(m, self.global_) for m in modele])

    def predict(self, X):
        return self.classes_[self.predict_proba(X).argmax(axis=1)]


class MedianeParPanne(BaseEstimator):
    """Baseline : durée médiane observée pour la panne."""

    def fit(self, X: pd.DataFrame, y):
        self.cols_ = [c for c in X.columns if c.startswith("panne=")]
        y = np.asarray(y, dtype=float)
        panne = X[self.cols_].to_numpy().argmax(axis=1)
        self.global_ = float(np.median(y))
        self.med_ = {p: float(np.median(y[panne == p])) for p in np.unique(panne)}
        return self

    def predict(self, X: pd.DataFrame):
        panne = X[self.cols_].to_numpy().argmax(axis=1)
        return np.array([self.med_.get(p, self.global_) for p in panne])


class Colonne(BaseEstimator):
    """Prévision « recopie d'une colonne » : lag1 = naïf (semaine précédente), ma4 = moyenne mobile 30 j."""

    def __init__(self, colonne: str = "lag1"):
        self.colonne = colonne

    def fit(self, X, y=None):
        return self

    def predict(self, X: pd.DataFrame):
        return X[self.colonne].to_numpy(dtype=float)

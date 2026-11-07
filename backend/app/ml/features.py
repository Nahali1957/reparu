"""Préparation des données et feature engineering (Pandas / NumPy), partagés entre entraînement et inférence."""

from __future__ import annotations

import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import TypeMouvement
from app.models.tables import (
    Appareil, ModeleAppareil, MouvementStock, Panne, Piece, Reparation, ReparationPanne, ReparationSymptome, Symptome, TempsPasse,
)

MOIS_ETE = {6, 7, 8, 9}


def _df(db: Session, stmt) -> pd.DataFrame:
    return pd.read_sql(stmt, db.connection())


# ---------------------------------------------------------------- référentiels


def referentiels(db: Session) -> dict:
    return {
        "symptomes": list(db.scalars(select(Symptome.code).order_by(Symptome.id))),
        "modeles": list(db.scalars(select(ModeleAppareil.modele).order_by(ModeleAppareil.id))),
        "marques": sorted(set(db.scalars(select(ModeleAppareil.marque)))),
        "pannes": list(db.scalars(select(Panne.code).order_by(Panne.id))),
    }


# ---------------------------------------------------------------- jeu « dossiers »


def dossiers(db: Session) -> pd.DataFrame:
    """Un dossier par ligne, avec sa panne confirmée, ses symptômes catégorisés et son temps réel."""
    base = _df(db, select(Reparation.id, Reparation.recu_le, Reparation.statut, Reparation.duree_estimee_min,
                          ModeleAppareil.modele, ModeleAppareil.marque, Panne.code.label("panne"))
               .join(Appareil, Appareil.id == Reparation.appareil_id).join(ModeleAppareil, ModeleAppareil.id == Appareil.modele_id)
               .join(ReparationPanne, ReparationPanne.reparation_id == Reparation.id).join(Panne, Panne.id == ReparationPanne.panne_id)
               .where(ReparationPanne.finale.is_(True)))
    sym = _df(db, select(ReparationSymptome.reparation_id, Symptome.code).join(Symptome))
    base["symptomes"] = base["id"].map(sym.groupby("reparation_id")["code"].apply(list)).apply(lambda v: v if isinstance(v, list) else [])
    tp = _df(db, select(TempsPasse.reparation_id, TempsPasse.debut, TempsPasse.fin).where(TempsPasse.fin.is_not(None)))
    if len(tp):
        tp["minutes"] = (pd.to_datetime(tp["fin"]) - pd.to_datetime(tp["debut"])).dt.total_seconds() / 60
        base["duree_reelle"] = base["id"].map(tp.groupby("reparation_id")["minutes"].sum())
    else:
        base["duree_reelle"] = np.nan
    base["recu_le"] = pd.to_datetime(base["recu_le"])
    base["statut"] = base["statut"].astype(str)
    return base.sort_values("recu_le").reset_index(drop=True)


def matrice_diagnostic(df: pd.DataFrame, ref: dict) -> pd.DataFrame:
    """Symptômes (multi-hot) + modèle et marque (one-hot) + saison."""
    X = pd.DataFrame(0, index=df.index, columns=[f"sym={s}" for s in ref["symptomes"]] + [f"modele={m}" for m in ref["modeles"]]
                     + [f"marque={m}" for m in ref["marques"]] + ["ete"], dtype=np.int8)
    for i, syms in df["symptomes"].items():
        for sy in syms:
            if f"sym={sy}" in X.columns:
                X.at[i, f"sym={sy}"] = 1
    for col, pref in (("modele", "modele="), ("marque", "marque=")):
        for i, v in df[col].items():
            if f"{pref}{v}" in X.columns:
                X.at[i, f"{pref}{v}"] = 1
    X["ete"] = df["recu_le"].dt.month.isin(MOIS_ETE).astype(np.int8)
    return X


def matrice_estimation(df: pd.DataFrame, ref: dict) -> pd.DataFrame:
    """Panne, modèle et marque (one-hot) : la durée dépend du geste technique et de l'appareil."""
    X = pd.DataFrame(0, index=df.index, columns=[f"panne={p}" for p in ref["pannes"]] + [f"modele={m}" for m in ref["modeles"]]
                     + [f"marque={m}" for m in ref["marques"]], dtype=np.int8)
    for col, pref in (("panne", "panne="), ("modele", "modele="), ("marque", "marque=")):
        for i, v in df[col].items():
            if f"{pref}{v}" in X.columns:
                X.at[i, f"{pref}{v}"] = 1
    return X


# ---------------------------------------------------------------- séries de consommation (modèle 3)

LAGS = 4


def consommation_hebdo(db: Session) -> pd.DataFrame:
    """Consommation par pièce et par semaine (lundi), sorties liées à une réparation. Semaines sans sortie = 0."""
    mv = _df(db, select(MouvementStock.piece_id, MouvementStock.qte, MouvementStock.le)
             .where(MouvementStock.type == TypeMouvement.sortie, MouvementStock.reparation_id.is_not(None)))
    pieces = list(db.scalars(select(Piece.id).order_by(Piece.id)))
    if mv.empty:
        return pd.DataFrame(columns=["piece_id", "semaine", "conso"])
    mv["semaine"] = pd.to_datetime(mv["le"]).dt.to_period("W-SUN").dt.start_time
    mv["conso"] = -mv["qte"]
    semaines = pd.date_range(mv["semaine"].min(), mv["semaine"].max(), freq="W-MON")
    grille = pd.MultiIndex.from_product([pieces, semaines], names=["piece_id", "semaine"])
    serie = mv.groupby(["piece_id", "semaine"])["conso"].sum().reindex(grille, fill_value=0).reset_index()
    return serie


def features_prevision(serie: pd.DataFrame) -> pd.DataFrame:
    """Retards (lags) 1 à 4, moyenne mobile 4 semaines (≈ 30 j) et 12 semaines, saisonnalité annuelle."""
    out = []
    for pid, g in serie.sort_values("semaine").groupby("piece_id"):
        g = g.copy()
        for k in range(1, LAGS + 1):
            g[f"lag{k}"] = g["conso"].shift(k)
        g["ma4"] = g["conso"].shift(1).rolling(4).mean()
        g["ma12"] = g["conso"].shift(1).rolling(12, min_periods=4).mean()
        semaine = g["semaine"].dt.isocalendar().week.astype(float)
        g["sin"], g["cos"] = np.sin(2 * np.pi * semaine / 52), np.cos(2 * np.pi * semaine / 52)
        out.append(g)
    df = pd.concat(out).dropna(subset=[f"lag{LAGS}", "ma4"]).reset_index(drop=True)
    return df


COLONNES_PREVISION = [f"lag{k}" for k in range(1, LAGS + 1)] + ["ma4", "ma12", "sin", "cos"]

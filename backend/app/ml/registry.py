"""Chargement paresseux des modèles actifs (Joblib), mis en cache par version."""

from functools import lru_cache

import joblib
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.tables import ModeleIA


@lru_cache(maxsize=16)
def _charger(chemin: str) -> dict:
    return joblib.load(chemin)


def actif(db: Session, nom: str) -> tuple[ModeleIA, dict]:
    m = db.scalar(select(ModeleIA).where(ModeleIA.nom == nom, ModeleIA.actif.is_(True)))
    if m is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            f"Modèle « {nom} » non entraîné : lancez l'entraînement (Rapports › Fiabilité des modèles).")
    try:
        return m, _charger(m.chemin_joblib)
    except FileNotFoundError:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"Fichier du modèle « {nom} » {m.version} introuvable.")


def vider_cache() -> None:
    _charger.cache_clear()

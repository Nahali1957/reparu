"""Remplit la base avec les données SYNTHÉTIQUES de ml/data/generate.py.

    python -m app.seed            # ne fait rien si la base contient déjà des comptes
    python -m app.seed --reset    # vide toutes les tables puis recharge

Tous les comptes de démo reçoivent le mot de passe DEMO_PASSWORD (.env).
"""

import argparse
import hashlib
import math
import os
from datetime import date, datetime
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import Base
from app.models.tables import User
from ml.data.generate import generate

ORDRE = [
    "users", "modeles_appareil", "pannes", "symptomes", "pieces", "compatibilites", "fournisseurs",
    "offres_fournisseur", "clients", "appareils", "reparations", "reparation_symptomes", "reparation_pannes",
    "historique_statuts", "checklist_etapes", "photos", "temps_passe", "reparation_pieces", "bons_commande",
    "lignes_bon_commande", "mouvements_stock", "devis", "lignes_devis", "factures", "lignes_facture", "reglements",
    "capteurs", "lectures_capteurs", "audit_log", "parametres",
]

PHOTO_SVG = """<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
<rect width="640" height="480" fill="#e8ecf3"/><rect x="250" y="90" width="140" height="300" rx="22" fill="#c5cede"/>
<text x="320" y="440" font-family="sans-serif" font-size="22" text-anchor="middle" fill="#55627a">{label} — photo de démonstration</text>
</svg>"""
LIBELLES_PHOTO = {"etat_general": "État général", "zone_endommagee": "Zone endommagée", "apres_intervention": "Après intervention"}


def _valeur(v):
    if v is None or v is pd.NaT:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    if isinstance(v, pd.Timestamp):
        return v.to_pydatetime()
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, np.floating):
        return None if np.isnan(v) else float(v)
    if isinstance(v, np.bool_):
        return bool(v)
    return v


def _records(df: pd.DataFrame) -> list[dict]:
    return [{k: _valeur(v) for k, v in row.items()} for row in df.astype(object).to_dict("records")]


def _photos_demo(data_dir: str) -> dict[str, str]:
    dossier = Path(data_dir) / "photos" / "demo"
    dossier.mkdir(parents=True, exist_ok=True)
    empreintes = {}
    for typ, label in LIBELLES_PHOTO.items():
        contenu = PHOTO_SVG.format(label=label).encode()
        (dossier / f"{typ}.svg").write_bytes(contenu)
        empreintes[typ] = hashlib.sha256(contenu).hexdigest()
    return empreintes


def vider(db: Session) -> None:
    mysql = db.bind.dialect.name == "mysql"
    if mysql:
        db.execute(text("SET FOREIGN_KEY_CHECKS=0"))
    for table in reversed(Base.metadata.sorted_tables):
        db.execute(text(f"TRUNCATE TABLE {table.name}") if mysql else table.delete())
    if mysql:
        db.execute(text("SET FOREIGN_KEY_CHECKS=1"))
    db.commit()


def charger(db: Session, fin: date | None = None, mot_de_passe: str | None = None, data_dir: str | None = None) -> dict[str, int]:
    frames = generate(fin=fin)
    mdp = mot_de_passe or os.environ.get("DEMO_PASSWORD")
    if not mdp:
        raise SystemExit("DEMO_PASSWORD manquant dans l'environnement (.env).")
    hash_demo = hash_password(mdp)
    frames["users"]["password_hash"] = hash_demo
    empreintes = _photos_demo(data_dir or get_settings().data_dir)
    frames["photos"]["sha256"] = frames["photos"]["type"].map(empreintes)

    tables = Base.metadata.tables
    compte = {}
    for nom in ORDRE:
        rows = _records(frames[nom])
        for k in range(0, len(rows), 2000):
            db.execute(tables[nom].insert(), rows[k:k + 2000])
        compte[nom] = len(rows)
    db.commit()
    return compte


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--fin", type=date.fromisoformat, default=None)
    args = parser.parse_args()
    with SessionLocal() as db:
        if db.scalar(select(func.count()).select_from(User)) and not args.reset:
            print("Base déjà remplie : rien à faire (utiliser --reset pour recharger).")
            return
        if args.reset:
            vider(db)
        debut = datetime.now()
        compte = charger(db, args.fin)
        print(f"Seed terminé en {(datetime.now() - debut).total_seconds():.1f} s : {compte}")


if __name__ == "__main__":
    main()

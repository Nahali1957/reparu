"""Règles métier transverses (maquette + DECISIONS D-B*)."""

import re
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.tables import Parametre

PARAMETRES_DEFAUT = {
    "taux_horaire": 45.0, "tva": 0.20, "marge_visee": 0.90, "capacite_jour_h": 7.0, "seuil_charge": 0.85,
    "sla_h": 48.0, "conservation_ans": 3.0,
}
CENT = Decimal("0.01")
TELEPHONE_RE = re.compile(r"^0[1-9]([ .-]?[0-9]{2}){4}$")  # repris de la maquette (5.6)


def parametre(db: Session, cle: str) -> float:
    valeur = db.scalar(select(Parametre.valeur).where(Parametre.cle == cle))
    return float(valeur) if valeur is not None else PARAMETRES_DEFAUT[cle]


def refus_metier(message: str) -> HTTPException:
    """Règle métier non respectée : 422 avec un message lisible par l'utilisateur."""
    return HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, message)


# ---------------------------------------------------------------- IMEI


def luhn_valide(imei: str) -> bool:
    if not re.fullmatch(r"\d{15}", imei or ""):
        return False
    total = 0
    for i, ch in enumerate(reversed(imei)):
        d = int(ch)
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


# ---------------------------------------------------------------- stock


def statut_stock(stock: int, seuil: int) -> str:
    """Codes couleur imposés : En stock / Seuil bas / Rupture."""
    if stock <= 0:
        return "Rupture"
    if stock <= seuil:
        return "Seuil bas"
    return "En stock"


def niveau_stock(stock: int, seuil: int) -> float:
    """Remplissage de la jauge (D-B12) : stock / (seuil × 1,6), plafonné à 1."""
    return round(min(1.0, max(0.0, stock / max(seuil * 1.6, 1))), 3)


# ---------------------------------------------------------------- prix (D-B3, D-B4)


def money(x) -> Decimal:
    return Decimal(str(x)).quantize(CENT, rounding=ROUND_HALF_UP)


def heures(minutes: int) -> Decimal:
    """Quantité d'heures facturée, arrondie au centième (elle apparaît sur la ligne de devis)."""
    return money(Decimal(minutes) / 60)


@dataclass
class Montants:
    cout_pieces: Decimal
    main_oeuvre: Decimal
    prix_ht: Decimal
    tva: Decimal
    prix_ttc: Decimal
    marge_brute: Decimal
    marge_nette: Decimal


def main_oeuvre(minutes: int, taux: float) -> Decimal:
    return money(heures(minutes) * Decimal(str(taux)))


def prix_conseille(cout_pieces: float, minutes: int, taux: float, marge_visee: float) -> Decimal:
    """Prix HT = coût pièces × (1 + marge visée), arrondi au demi-euro, + main-d'œuvre."""
    pieces = Decimal(str(round(float(cout_pieces) * (1 + marge_visee) * 2) / 2))
    return money(pieces + main_oeuvre(minutes, taux))


def montants(prix_ht, cout_pieces, minutes: int, taux: float, tva: float) -> Montants:
    ht, cout = money(prix_ht or 0), money(cout_pieces or 0)
    mo = main_oeuvre(minutes or 0, taux)
    t = money(ht * Decimal(str(tva)))
    return Montants(cout_pieces=cout, main_oeuvre=mo, prix_ht=ht, tva=t, prix_ttc=ht + t,
                    marge_brute=ht - cout, marge_nette=ht - cout - mo)


# ---------------------------------------------------------------- numérotation (D-B5)


def prochain_numero(db: Session, colonne, prefixe: str, annee: int | None = None, largeur: int = 4) -> str:
    """Séquence continue : PREFIXE-AAAA-NNNN (ou PREFIXE-NNNN sans année)."""
    base = f"{prefixe}-{annee}-" if annee else f"{prefixe}-"
    derniers = db.scalars(select(colonne).where(colonne.like(f"{base}%"))).all()
    n = max((int(x[len(base):]) for x in derniers if x[len(base):].isdigit()), default=0) + 1
    return f"{base}{n:0{largeur}d}"

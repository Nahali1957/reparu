"""Indicateurs de pilotage (F-09) : tableau de bord 5.2 et rapports 5.11.

Les indicateurs sont calculés côté serveur en quelques requêtes agrégées
(exigence < 3 s), sur les dossiers clôturés (statut « Livré ») de la période.
"""

import csv
import io
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import maintenant
from app.models.enums import Statut
from app.models.tables import Facture, HistoriqueStatut, Panne, Piece, Reparation, ReparationPanne
from app.schemas import pilotage as s
from app.services.planning import charges
from app.services.regles import niveau_stock, statut_stock
from app.services.reparations import carte, sla_depasse

MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]
MOIS_LONG = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre",
             "décembre"]
PERIODES = {"7j": "7 jours", "mois": "Mois en cours", "trimestre": "Trimestre", "12m": "12 mois"}


@dataclass
class Periode:
    code: str
    du: date
    au: date  # inclus

    @property
    def debut(self) -> datetime:
        return datetime.combine(self.du, time.min)

    @property
    def fin(self) -> datetime:
        return datetime.combine(self.au + timedelta(days=1), time.min)

    def precedente(self) -> "Periode":
        duree = (self.au - self.du).days + 1
        return Periode(self.code, self.du - timedelta(days=duree), self.du - timedelta(days=1))

    def libelle(self) -> str:
        if self.code == "mois":
            return f"{MOIS_LONG[self.du.month - 1]} {self.du.year}"
        return f"du {self.du:%d/%m/%Y} au {self.au:%d/%m/%Y}"

    def out(self) -> s.PeriodeOut:
        return s.PeriodeOut(code=self.code, du=self.du, au=self.au, libelle=self.libelle())


def periode(code: str | None, du: date | None = None, au: date | None = None) -> Periode:
    today = maintenant().date()
    if du and au:
        return Periode("perso", min(du, au), max(du, au))
    match code:
        case "7j":
            return Periode("7j", today - timedelta(days=6), today)
        case "trimestre":
            return Periode("trimestre", today - timedelta(days=89), today)
        case "12m":
            return Periode("12m", today - timedelta(days=364), today)
    return Periode("mois", today.replace(day=1), today)


def _delta(v, p) -> float | None:
    if v is None or p in (None, 0):
        return None
    return round((float(v) - float(p)) / abs(float(p)) * 100, 1)


def kpi(v, p) -> s.KpiOut:
    return s.KpiOut(valeur=None if v is None else float(v), precedent=None if p is None else float(p), delta_pct=_delta(v, p))


# ---------------------------------------------------------------- agrégats


def clotures(db: Session, p: Periode) -> int:
    return db.scalar(select(func.count()).select_from(Reparation).where(
        Reparation.statut == Statut.livre, Reparation.cloture_le >= p.debut, Reparation.cloture_le < p.fin)) or 0


def finances(db: Session, p: Periode) -> tuple[Decimal, Decimal, int]:
    """(CA HT, marge brute, nombre de factures) des factures émises sur la période."""
    ca, cout, n = db.execute(
        select(func.coalesce(func.sum(Facture.total_ht), 0), func.coalesce(func.sum(Reparation.cout_pieces_retenu), 0), func.count(Facture.id))
        .join(Reparation, Reparation.id == Facture.reparation_id)
        .where(Facture.emise_le >= p.debut, Facture.emise_le < p.fin)).one()
    return Decimal(ca), Decimal(ca) - Decimal(cout), n


def delai_moyen_j(db: Session, p: Periode) -> float | None:
    """Délai réception → « Prêt », en jours, des dossiers clôturés sur la période."""
    rows = db.execute(select(Reparation.recu_le, func.min(HistoriqueStatut.le))
                      .join(HistoriqueStatut, HistoriqueStatut.reparation_id == Reparation.id)
                      .where(HistoriqueStatut.vers_statut == Statut.pret, Reparation.statut == Statut.livre,
                             Reparation.cloture_le >= p.debut, Reparation.cloture_le < p.fin)
                      .group_by(Reparation.id, Reparation.recu_le)).all()
    if not rows:
        return None
    return round(sum((pret - recu).total_seconds() for recu, pret in rows) / len(rows) / 86400, 1)


def taux_retour(db: Session, p: Periode) -> float | None:
    n = clotures(db, p)
    if not n:
        return None
    retours = db.scalar(select(func.count()).select_from(Reparation).where(
        Reparation.retour_de_id.is_not(None), Reparation.recu_le >= p.debut, Reparation.recu_le < p.fin))
    return round(retours / n * 100, 1)


def serie_mensuelle(db: Session, mois: int = 12) -> list[s.PointMoisOut]:
    today = maintenant().date()
    premiers = []
    d = today.replace(day=1)
    for _ in range(mois):
        premiers.append(d)
        d = (d - timedelta(days=1)).replace(day=1)
    out = []
    for debut in reversed(premiers):
        fin = (debut + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        p = Periode("mois", debut, fin)
        ca, marge, _n = finances(db, p)
        out.append(s.PointMoisOut(mois=f"{debut:%Y-%m}", libelle=MOIS[debut.month - 1], reparations=clotures(db, p), ca=ca,
                                  marge=marge, courant=debut == today.replace(day=1)))
    return out


def par_categorie(db: Session, p: Periode) -> list[s.RepartitionOut]:
    rows = db.execute(
        select(Panne.categorie, func.count(Reparation.id)).select_from(Reparation)
        .join(ReparationPanne, ReparationPanne.reparation_id == Reparation.id).join(Panne, Panne.id == ReparationPanne.panne_id)
        .where(Reparation.statut == Statut.livre, Reparation.cloture_le >= p.debut, Reparation.cloture_le < p.fin)
        .group_by(Panne.categorie)).all()
    total = sum(n for _, n in rows) or 1
    # Marge brute = CA HT facturé − coût des pièces (dossiers facturés uniquement).
    marges = dict(db.execute(
        select(Panne.categorie, func.coalesce(func.sum(Facture.total_ht - Reparation.cout_pieces_retenu), 0))
        .select_from(Facture).join(Reparation, Reparation.id == Facture.reparation_id)
        .join(ReparationPanne, ReparationPanne.reparation_id == Reparation.id).join(Panne, Panne.id == ReparationPanne.panne_id)
        .where(Reparation.cloture_le >= p.debut, Reparation.cloture_le < p.fin).group_by(Panne.categorie)).all())
    out = [s.RepartitionOut(label=cat, dossiers=n, pct=round(n / total * 100, 1), marge=Decimal(marges.get(cat, 0)))
           for cat, n in rows]
    return sorted(out, key=lambda r: -r.dossiers)


def alertes_stock(db: Session) -> list[s.AlertePieceOut]:
    pieces = db.scalars(select(Piece).where(Piece.stock <= Piece.seuil).order_by(Piece.stock, Piece.designation)).all()
    return [s.AlertePieceOut(piece_id=p.id, designation=p.designation, stock=p.stock, seuil=p.seuil,
                             statut=statut_stock(p.stock, p.seuil), niveau=niveau_stock(p.stock, p.seuil)) for p in pieces]


# ---------------------------------------------------------------- écrans


def dashboard(db: Session, code: str | None) -> s.DashboardOut:
    p = periode(code)
    prev = p.precedente()
    _ca, marge, _n = finances(db, p)
    _ca_prev, marge_prev, _n_prev = finances(db, prev)
    alertes = alertes_stock(db)
    ouverts = db.scalars(select(Reparation).where(Reparation.statut.in_([Statut.recu, Statut.en_diagnostic, Statut.en_reparation]))
                         .order_by(Reparation.recu_le)).all()
    derniers = db.scalars(select(Reparation).where(Reparation.statut == Statut.livre).order_by(Reparation.cloture_le.desc()).limit(5)).all()
    factures = {f.reparation_id: f.total_ttc for f in db.scalars(select(Facture).where(Facture.reparation_id.in_([r.id for r in derniers])))}
    return s.DashboardOut(
        periode=p.out(), reparations=kpi(clotures(db, p), clotures(db, prev)), marge=kpi(marge, marge_prev),
        ruptures=len(alertes), delai_moyen_j=kpi(delai_moyen_j(db, p), delai_moyen_j(db, prev)),
        sla_depasses=[carte(db, r) for r in ouverts if sla_depasse(db, r)],
        serie=serie_mensuelle(db), alertes=alertes[:3], alertes_total=len(alertes), repartition=par_categorie(db, p),
        derniers_clotures=[s.ClotureOut(numero=r.numero, client_nom=r.client.nom,
                                        appareil=f"{r.appareil.modele.marque} {r.appareil.modele.modele}", cloture_le=r.cloture_le,
                                        prix_ttc=factures.get(r.id)) for r in derniers],
        charge=charges(db),
    )


def rapport(db: Session, code: str | None, du: date | None = None, au: date | None = None) -> s.RapportOut:
    p = periode(code, du, au)
    prev = p.precedente()
    ca, marge, n = finances(db, p)
    ca_p, marge_p, n_p = finances(db, prev)
    panier = (ca / n).quantize(Decimal("0.01")) if n else None
    panier_p = (ca_p / n_p).quantize(Decimal("0.01")) if n_p else None
    return s.RapportOut(
        periode=p.out(), ca=kpi(ca, ca_p), marge_brute=kpi(marge, marge_p), reparations=kpi(clotures(db, p), clotures(db, prev)),
        delai_moyen_j=kpi(delai_moyen_j(db, p), delai_moyen_j(db, prev)), taux_retour_pct=kpi(taux_retour(db, p), taux_retour(db, prev)),
        panier_moyen=kpi(panier, panier_p), marge_par_mois=serie_mensuelle(db), rentabilite=par_categorie(db, p),
    )


def export_csv(db: Session, code: str | None, du: date | None = None, au: date | None = None) -> str:
    """Une ligne par dossier clôturé. Pas de nom de client (minimisation RGPD)."""
    p = periode(code, du, au)
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["dossier", "recu_le", "cloture_le", "appareil", "panne", "categorie", "ca_ht", "cout_pieces", "marge_brute",
                "duree_estimee_min", "retour"])
    rows = db.execute(
        select(Reparation, Panne.libelle, Panne.categorie, Facture.total_ht)
        .outerjoin(ReparationPanne, ReparationPanne.reparation_id == Reparation.id).outerjoin(Panne, Panne.id == ReparationPanne.panne_id)
        .outerjoin(Facture, Facture.reparation_id == Reparation.id)
        .where(Reparation.statut == Statut.livre, Reparation.cloture_le >= p.debut, Reparation.cloture_le < p.fin)
        .order_by(Reparation.cloture_le)).all()
    for r, panne, cat, ht in rows:
        cout = r.cout_pieces_retenu or Decimal(0)
        w.writerow([r.numero, f"{r.recu_le:%Y-%m-%d %H:%M}", f"{r.cloture_le:%Y-%m-%d %H:%M}",
                    f"{r.appareil.modele.marque} {r.appareil.modele.modele}", panne or "", cat or "",
                    f"{ht or 0:.2f}".replace(".", ","), f"{cout:.2f}".replace(".", ","),
                    f"{(ht or 0) - cout if ht else 0:.2f}".replace(".", ","), r.duree_estimee_min or "", "oui" if r.retour_de_id else "non"])
    return buf.getvalue()

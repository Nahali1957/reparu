from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from app.models.enums import Disponibilite
from app.models.tables import Devis
from app.schemas.pilotage import ChargeTechOut
from app.services.pilotage import Periode, _delta, periode
from app.services.planning import equilibre, statut_charge
from app.services.regles import (
    heures, luhn_valide, main_oeuvre, montants, niveau_stock, prix_conseille, prochain_numero, statut_stock,
)
from app.services.stocks import libelle_fiabilite, scorer


def test_luhn():
    assert luhn_valide("490154203237518")
    assert not luhn_valide("490154203237519")
    assert not luhn_valide("49015420323751")
    assert not luhn_valide("49015420323751a")


def test_statut_et_niveau_stock():
    assert statut_stock(0, 3) == "Rupture"
    assert statut_stock(3, 3) == "Seuil bas"
    assert statut_stock(4, 3) == "En stock"
    assert niveau_stock(100, 2) == 1.0 and niveau_stock(0, 2) == 0.0
    assert niveau_stock(4, 5) == 0.5


def test_prix_et_marges():
    assert heures(45) == Decimal("0.75") and heures(35) == Decimal("0.58")
    assert main_oeuvre(45, 45) == Decimal("33.75")
    assert main_oeuvre(30, 45) == Decimal("22.50")
    # 80 € × 1,9 = 152 € + 33,75 € de main-d'œuvre
    assert prix_conseille(80, 45, 45, 0.9) == Decimal("185.75")
    m = montants(Decimal("185.75"), 80, 45, 45, 0.2)
    assert m.tva == Decimal("37.15") and m.prix_ttc == Decimal("222.90")
    assert m.marge_brute == Decimal("105.75") and m.marge_nette == Decimal("72.00")


def test_numerotation_continue(sdb):
    assert prochain_numero(sdb, Devis.numero, "DV", 2030) == "DV-2030-0001"
    sdb.add(Devis(numero="DV-2030-0041", reparation_id=1, emis_le=date(2030, 1, 1), total_ht=0, tva=0, total_ttc=0))
    sdb.flush()
    assert prochain_numero(sdb, Devis.numero, "DV", 2030) == "DV-2030-0042"
    assert prochain_numero(sdb, Devis.numero, "DV", 2031) == "DV-2031-0001"


def test_charge_et_equilibre():
    assert [statut_charge(n) for n in (0, 1, 2, 3, 4)] == ["Disponible", "Disponible", "Chargé", "Chargé", "Surchargé"]
    def t(n):
        return ChargeTechOut(id=n, nom="X", initiales="X", specialite=None, ouverts=n, charge_min=0, statut="")
    assert equilibre([t(1), t(2)]) == "Charge équilibrée"
    assert equilibre([t(1), t(3)]) == "Écart modéré"
    assert equilibre([t(0), t(4)]) == "Charge déséquilibrée"
    assert equilibre([]) == "Charge équilibrée"


def test_score_fournisseur_exclut_les_ruptures():
    f_fiable = SimpleNamespace(fiabilite=0.95)
    f_lent = SimpleNamespace(fiabilite=0.7)
    offres = [
        SimpleNamespace(id=1, prix_ht=Decimal("10"), delai_jours=9, disponibilite=Disponibilite.dispo, fournisseur=f_lent),
        SimpleNamespace(id=2, prix_ht=Decimal("12"), delai_jours=1, disponibilite=Disponibilite.dispo, fournisseur=f_fiable),
        SimpleNamespace(id=3, prix_ht=Decimal("5"), delai_jours=1, disponibilite=Disponibilite.rupture, fournisseur=f_fiable),
    ]
    scores = scorer(offres)
    assert 3 not in scores and scores[2] > scores[1]
    assert scorer([offres[2]]) == {}
    assert libelle_fiabilite(0.95) == "Excellente" and libelle_fiabilite(0.85) == "Bonne" and libelle_fiabilite(0.5) == "Moyenne"


def test_periodes():
    p = Periode("perso", date(2026, 3, 1), date(2026, 3, 31))
    prev = p.precedente()
    assert prev.au == date(2026, 2, 28) and (prev.au - prev.du).days == 30
    assert periode("mois").du.day == 1
    assert (periode("7j").au - periode("7j").du).days == 6
    assert periode(None, date(2026, 5, 2), date(2026, 5, 1)).du == date(2026, 5, 1)
    assert _delta(12, 10) == 20.0 and _delta(5, 0) is None and _delta(None, 3) is None

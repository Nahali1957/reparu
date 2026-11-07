"""Générateur de données SYNTHÉTIQUES pour Repar U.

Aucun historique réel n'est disponible : ce module fabrique 18 mois d'activité
plausibles (≈ 1 300 réparations) à partir de règles explicites et d'une graine
fixe. Même graine + même date de fin => mêmes données, à l'octet près.

Règles de génération (documentées dans ml/reports/data_profile.md) :
- volume journalier Poisson, saisonnalité (été et fêtes), fermeture le dimanche,
  croissance de +20 % sur la période ;
- mix de modèles d'appareils (iPhone 13, iPhone 12, Galaxy S22, Galaxy S21,
  Redmi Note 11 et Pixel 7 en tête) ;
- panne tirée selon l'âge de l'appareil et la saison, symptômes tirés
  conditionnellement à la panne (avec bruit), d'où une corrélation
  symptômes → panne réaliste mais imparfaite ;
- simulation chronologique du stock : consommation par les réparations,
  réapprovisionnement au seuil auprès du meilleur fournisseur, attente de pièce ;
- devis, factures et règlements cohérents avec la règle de prix unique
  (coût pièces × (1 + marge visée) + durée × 45 € HT, TVA 20 %).

Usage :
    python -m ml.data.generate --profile            # écrit ml/reports/data_profile.md
    python -m ml.data.generate --fin 2026-11-07     # date de fin explicite
"""

from __future__ import annotations

import argparse
import hashlib
import random
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

SEED = 42
NB_REPARATIONS_CIBLE = 1300
DUREE_JOURS = 548  # 18 mois
TAUX_HORAIRE = 45.0
TVA = 0.20
MARGE_VISEE = 0.90

# ---------------------------------------------------------------- référentiels

# marque, modèle, année de sortie, gamme, poids dans la clientèle
MODELES = [
    ("Apple", "iPhone 13", 2021, "haut", 0.15),
    ("Apple", "iPhone 12", 2020, "haut", 0.12),
    ("Samsung", "Galaxy S22", 2022, "haut", 0.09),
    ("Samsung", "Galaxy S21", 2021, "haut", 0.085),
    ("Xiaomi", "Redmi Note 11", 2022, "eco", 0.08),
    ("Google", "Pixel 7", 2022, "haut", 0.065),
    ("Apple", "iPhone 11", 2019, "moyen", 0.07),
    ("Apple", "iPhone 14", 2022, "haut", 0.06),
    ("Samsung", "Galaxy A52", 2021, "moyen", 0.05),
    ("Samsung", "Galaxy A53", 2022, "moyen", 0.04),
    ("Xiaomi", "Redmi Note 12", 2023, "eco", 0.04),
    ("Apple", "iPhone SE 2022", 2022, "moyen", 0.03),
    ("Google", "Pixel 6a", 2022, "moyen", 0.03),
]
FREQUENTS = ["iPhone 13", "iPhone 12", "Galaxy S22", "Galaxy S21", "Redmi Note 11", "Pixel 7"]

# code, libellé (repris de la maquette), catégorie de rentabilité (5.11), type de pièce, durée de base (min)
PANNES = [
    ("ecran", "Écran / vitre tactile HS", "Écran cassé", "Écran", 45),
    ("batterie", "Batterie en fin de vie", "Batterie", "Batterie", 30),
    ("connecteur", "Connecteur de charge HS", "Connecteur de charge", "Connecteur de charge", 40),
    ("camera", "Module caméra HS", "Autres (caméra, HP…)", "Module caméra", 35),
    ("haut_parleur", "Haut-parleur interne HS", "Autres (caméra, HP…)", "Haut-parleur", 30),
    ("pmic", "Circuit de charge (PMIC) défaillant", "Carte mère / logique", "Carte mère", 120),
    ("oxydation", "Oxydation après contact liquide", "Carte mère / logique", None, 90),
    ("thermique", "Dissipation thermique / pad HS", "Autres (caméra, HP…)", None, 60),
]
PANNE_POIDS = {"ecran": 0.35, "batterie": 0.22, "connecteur": 0.14, "camera": 0.06, "haut_parleur": 0.06,
               "pmic": 0.05, "oxydation": 0.06, "thermique": 0.06}

# code, libellé, mots-clés (servent à catégoriser le texte libre saisi à l'accueil), formulations
SYMPTOMES = [
    ("ecran_fissure", "Écran fissuré / vitre cassée", "écran,ecran,vitre,fissur,dalle,cassé",
     ["écran fissuré", "vitre cassée", "dalle fendue sur toute la largeur"]),
    ("tactile", "Tactile ne répond plus", "tactile", ["le tactile ne répond plus", "zones tactiles mortes"]),
    ("affichage", "Affichage défaillant", "affichage,lignes,noir", ["lignes vertes à l'affichage", "écran noir mais le téléphone vibre"]),
    ("autonomie", "Autonomie faible", "batterie,autonomie,décharge,tient plus",
     ["la batterie ne tient plus la journée", "se décharge très vite", "autonomie en forte baisse"]),
    ("gonflement", "Batterie gonflée", "gonfl", ["la coque se soulève, batterie gonflée"]),
    ("charge_ko", "Ne charge plus", "charge,chargeur", ["ne charge plus", "charge seulement en tenant le câble"]),
    ("faux_contact", "Faux contact du câble", "câble,cable,port,connecteur", ["faux contact au niveau du port", "le câble ne tient plus dans le port"]),
    ("photo_floue", "Photos floues / caméra noire", "photo,caméra,camera,flou,objectif", ["photos floues", "caméra arrière noire"]),
    ("son_ko", "Pas de son / grésillements", "son,haut-parleur,grésill", ["plus de son en haut-parleur", "le son grésille"]),
    ("micro_ko", "Micro / appels inaudibles", "micro,appel", ["les correspondants ne l'entendent plus", "micro inaudible en appel"]),
    ("ne_s_allume_pas", "Ne s'allume plus", "allume,démarre,mort,aucune réaction", ["ne s'allume plus", "aucune réaction à l'appui sur le bouton"]),
    ("eteint_seul", "S'éteint ou redémarre seul", "éteint,redémarr", ["s'éteint tout seul", "redémarre en boucle"]),
    ("chauffe", "Chauffe anormalement", "chauff,surchauff", ["chauffe fortement", "surchauffe en charge"]),
    ("lent", "Lenteurs", "lent", ["devenu très lent"]),
    ("liquide", "Contact avec un liquide", "eau,humid,oxyd,liquide,piscine", ["tombé dans l'eau", "contact avec un liquide", "oublié au bord de la piscine"]),
    ("chute", "Chute récente", "chute,tombé", ["après une chute", "tombé par terre"]),
]
# Probabilité qu'un symptôme soit signalé sachant la panne (les autres : bruit à 3 %).
SYMPTOMES_PAR_PANNE = {
    "ecran": {"ecran_fissure": 0.85, "tactile": 0.45, "affichage": 0.35, "chute": 0.6},
    "batterie": {"autonomie": 0.9, "gonflement": 0.18, "eteint_seul": 0.35, "chauffe": 0.2, "lent": 0.15},
    "connecteur": {"charge_ko": 0.9, "faux_contact": 0.6, "liquide": 0.08},
    "camera": {"photo_floue": 0.9, "chute": 0.35},
    "haut_parleur": {"son_ko": 0.85, "micro_ko": 0.4},
    "pmic": {"ne_s_allume_pas": 0.8, "charge_ko": 0.45, "chauffe": 0.3, "eteint_seul": 0.3},
    "oxydation": {"liquide": 0.85, "ne_s_allume_pas": 0.35, "son_ko": 0.3, "charge_ko": 0.3, "affichage": 0.2},
    "thermique": {"chauffe": 0.85, "lent": 0.55, "eteint_seul": 0.45},
}

PRIX_PIECE = {  # (min, max) prix d'achat HT par type de pièce et gamme
    "Écran": {"haut": (72, 115), "moyen": (42, 62), "eco": (24, 36)},
    "Batterie": {"haut": (18, 26), "moyen": (14, 19), "eco": (10, 14)},
    "Connecteur de charge": {"haut": (11, 16), "moyen": (8, 12), "eco": (6, 9)},
    "Module caméra": {"haut": (28, 45), "moyen": (18, 26), "eco": (12, 18)},
    "Haut-parleur": {"haut": (8, 12), "moyen": (6, 9), "eco": (4, 7)},
    "Carte mère": {"haut": (18, 28), "moyen": (14, 20), "eco": (10, 14)},
}
FACTEUR_DUREE_GAMME = {"haut": 1.0, "moyen": 0.95, "eco": 0.9}

FOURNISSEURS = [  # nom, contact, ville, délai (j), fiabilité, facteur de prix
    ("MobiParts Europe", "commandes@mobiparts.example", "Lyon", 2, 0.95, 1.00),
    ("iRepair Pro", "pro@irepair.example", "Paris", 1, 0.90, 1.12),
    ("PhoneSpare Asia", "sales@phonespare.example", "Shenzhen", 9, 0.72, 0.78),
    ("TechniPièces Sud", "contact@technipieces.example", "Marseille", 2, 0.86, 1.05),
    ("GSM Distribution", "achats@gsmdistri.example", "Lille", 3, 0.81, 0.95),
]

# nom, e-mail, rôle, spécialité, facteur de durée, poids d'affectation, actif jusqu'à (fraction de la période)
EQUIPE = [
    ("Claire Vasseur", "c.vasseur@reparu.fr", "admin", "Gérante", None, 0.0, None),
    ("Rémi Lambert", "r.lambert@reparu.fr", "responsable", "Responsable d'atelier", 1.0, 0.08, None),
    ("Lucas Marchand", "l.marchand@reparu.fr", "technicien", "Micro-soudure", 1.0, 0.34, None),
    ("Farid Haddad", "f.haddad@reparu.fr", "technicien", "Écrans & vitres", 0.9, 0.30, None),
    ("Sarah Benali", "s.benali@reparu.fr", "technicien", "Batteries & connectique", 1.1, 0.28, None),
    ("Thomas Aubry", "t.aubry@reparu.fr", "technicien", "Polyvalent", 1.05, 0.25, 0.62),
]

VILLES = [("Montpellier", 0.55), ("Castelnau-le-Lez", 0.07), ("Lattes", 0.06), ("Pérols", 0.04), ("Juvignac", 0.05),
          ("Saint-Jean-de-Védas", 0.05), ("Grabels", 0.03), ("Mauguio", 0.05), ("Lunel", 0.05), ("Sète", 0.05)]
PRENOMS = ["Camille", "Léa", "Manon", "Chloé", "Inès", "Sarah", "Emma", "Jade", "Louise", "Lina", "Nora", "Julie",
           "Lucas", "Hugo", "Louis", "Nathan", "Gabriel", "Yanis", "Adam", "Mehdi", "Théo", "Paul", "Karim", "Antoine",
           "Mathilde", "Sofia", "Amine", "Bastien", "Elsa", "Quentin", "Marion", "Rayan", "Clément", "Aïcha", "Victor"]
NOMS = ["Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Petit", "Durand", "Leroy", "Moreau", "Simon",
        "Laurent", "Lefebvre", "Michel", "Garcia", "David", "Bertrand", "Roux", "Vincent", "Fournier", "Morel", "Girard",
        "André", "Mercier", "Dupont", "Lambert", "Bonnet", "François", "Martinez", "Benali", "Haddad", "Rossi", "Nguyen",
        "Lopez", "Fontaine", "Chevalier", "Robin", "Masson", "Sanchez", "Muller", "Faure", "Blanc", "Guerin", "Boyer"]

CHECKLIST = [("Réception et constat photo", 5), ("Diagnostic et devis validé client", 15),
             ("Démontage et remplacement pièce", 30), ("Remontage et nettoyage", 10), ("Test de sortie complet", 10)]
MODES_REGLEMENT = [("carte", 0.62), ("especes", 0.15), ("virement", 0.08), ("trois_fois", 0.15)]

OUVERTURE, FERMETURE = 9, 19  # heures d'ouverture de l'atelier, du lundi au samedi


# ---------------------------------------------------------------- utilitaires


def luhn_imei(rng: random.Random, tac: str) -> str:
    """IMEI de 15 chiffres dont le dernier est la clé de Luhn."""
    corps = tac + "".join(str(rng.randrange(10)) for _ in range(14 - len(tac)))
    total = 0
    for i, ch in enumerate(corps):
        d = int(ch)
        if i % 2 == 1:
            d *= 2
            d = d - 9 if d > 9 else d
        total += d
    return corps + str((10 - total % 10) % 10)


def ouvre(t: datetime) -> datetime:
    """Ramène un horodatage dans les heures d'ouverture (lun.-sam., 9 h-19 h)."""
    if t.hour >= FERMETURE:
        t = datetime.combine(t.date() + timedelta(days=1), time(OUVERTURE, 30))
    elif t.hour < OUVERTURE:
        t = datetime.combine(t.date(), time(OUVERTURE, 30))
    while t.weekday() == 6:
        t = datetime.combine(t.date() + timedelta(days=1), time(OUVERTURE, 30))
    return t


def arrondi_demi(x: float) -> float:
    return round(x * 2) / 2


def r2(x: float) -> float:
    return round(x + 1e-9, 2)


# ---------------------------------------------------------------- génération


@dataclass
class Rep:
    id: int
    client_id: int
    appareil_id: int
    modele: str
    panne: str
    priorite: str
    recu: datetime
    tech_id: int | None
    symptomes: list[str]
    texte: str
    piece_id: int | None
    cout: float
    duree_estimee: int
    duree_reelle: int
    accepte: bool
    retour_de: int | None = None
    jalons: dict[str, datetime] = field(default_factory=dict)


def generate(seed: int = SEED, fin: date | None = None) -> dict[str, pd.DataFrame]:
    fin = fin or date.today()
    fin_dt = datetime.combine(fin, time(8, 0))  # photographie de l'atelier à l'ouverture du jour de fin
    debut = fin - timedelta(days=DUREE_JOURS)
    rng = np.random.default_rng(seed)
    prng = random.Random(seed)
    T: dict[str, list[dict]] = defaultdict(list)

    # -- utilisateurs
    users = {}
    for i, (nom, email, role, spec, *_rest) in enumerate(EQUIPE, start=1):
        users[email] = i
        T["users"].append(dict(id=i, nom=nom, email=email, role=role, specialite=spec, actif=email != "t.aubry@reparu.fr",
                               echecs_connexion=0))
    techs = [(users[e], fd, w, until) for _, e, role, _, fd, w, until in EQUIPE if role in ("technicien", "responsable")]
    admin_id, resp_id = users["c.vasseur@reparu.fr"], users["r.lambert@reparu.fr"]
    depart_aubry = debut + timedelta(days=int(DUREE_JOURS * 0.62))

    # -- modèles, pannes, symptômes
    modele_id = {}
    for i, (marque, modele, *_r) in enumerate(MODELES, start=1):
        modele_id[modele] = i
        T["modeles_appareil"].append(dict(id=i, marque=marque, modele=modele))
    infos_modele = {m[1]: m for m in MODELES}
    panne_id = {}
    for i, (code, libelle, cat, _p, _d) in enumerate(PANNES, start=1):
        panne_id[code] = i
        T["pannes"].append(dict(id=i, code=code, libelle=libelle, categorie=cat))
    infos_panne = {p[0]: p for p in PANNES}
    symptome_id = {}
    for i, (code, libelle, kw, _f) in enumerate(SYMPTOMES, start=1):
        symptome_id[code] = i
        T["symptomes"].append(dict(id=i, code=code, libelle=libelle, mots_cles=kw))
    formulations = {s[0]: s[3] for s in SYMPTOMES}

    # -- pièces et compatibilités
    pieces = {}  # (type, modele) -> id
    piece_info = {}
    pid = 0
    for marque, modele, annee, gamme, poids in MODELES:
        types = ["Écran", "Batterie", "Connecteur de charge"]
        if modele in FREQUENTS:
            types += ["Module caméra", "Haut-parleur"]
        if marque == "Apple":
            types.append("Carte mère")
        for typ in types:
            pid += 1
            lo, hi = PRIX_PIECE[typ][gamme]
            prix = r2(rng.uniform(lo, hi))
            suffixe = {"Écran": " OLED" if gamme == "haut" else " LCD", "Carte mère": " — circuit de charge (PMIC)"}.get(typ, "")
            conso_attendue = poids * NB_REPARATIONS_CIBLE / DUREE_JOURS * 30  # ordre de grandeur mensuel
            seuil = max(1, int(round(conso_attendue * {"Écran": 0.35, "Batterie": 0.22, "Connecteur de charge": 0.14}.get(typ, 0.06))))
            ref = f"{typ[:3].upper().replace('É', 'E')}-{marque[:2].upper()}{modele_id[modele]:02d}-{pid:03d}"
            pieces[(typ, modele)] = pid
            piece_info[pid] = dict(id=pid, designation=f"{typ}{suffixe} {modele}", reference=ref, categorie=typ,
                                   stock=seuil * 3, seuil=seuil, prix_achat=prix)
            T["compatibilites"].append(dict(piece_id=pid, modele_id=modele_id[modele]))

    # -- fournisseurs et offres
    for i, (nom, contact, ville, delai, fiab, _f) in enumerate(FOURNISSEURS, start=1):
        T["fournisseurs"].append(dict(id=i, nom=nom, contact=contact, ville=ville, delai_jours=delai, fiabilite=fiab))
    offres = defaultdict(list)  # piece -> [(fournisseur, prix, delai, dispo)]
    oid = 0
    for p in piece_info.values():
        choix = prng.sample(range(1, len(FOURNISSEURS) + 1), k=prng.randint(2, 4))
        for f in choix:
            _n, _c, _v, delai, fiab, facteur = FOURNISSEURS[f - 1]
            oid += 1
            prix = r2(p["prix_achat"] * facteur * rng.uniform(0.95, 1.05))
            d = max(1, delai + prng.choice([0, 0, 1]))
            dispo = "rupture" if prng.random() < 0.08 else "dispo"
            offres[p["id"]].append((f, prix, d, dispo, fiab))
            T["offres_fournisseur"].append(dict(id=oid, fournisseur_id=f, piece_id=p["id"], prix_ht=prix, delai_jours=d,
                                                disponibilite=dispo, minimum_commande=prng.choice([1, 1, 2, 5])))

    def meilleure_offre(piece: int):
        ok = [o for o in offres[piece] if o[3] == "dispo"] or offres[piece]
        prix = [o[1] for o in ok]
        delais = [o[2] for o in ok]
        def score(o):
            sp = 1 - (o[1] - min(prix)) / ((max(prix) - min(prix)) or 1)
            sd = 1 - (o[2] - min(delais)) / ((max(delais) - min(delais)) or 1)
            return 0.5 * sp + 0.25 * sd + 0.25 * o[4]
        return max(ok, key=score)

    # -- volume journalier
    jours = [debut + timedelta(days=k) for k in range(DUREE_JOURS + 1)]
    lam = np.zeros(len(jours))
    for k, d in enumerate(jours):
        if d.weekday() == 6:
            continue
        saison = 1 + 0.22 * np.exp(-((d.timetuple().tm_yday - 205) / 30) ** 2) + 0.15 * np.exp(-((d.timetuple().tm_yday - 5) / 12) ** 2)
        semaine = {0: 1.15, 1: 1.0, 2: 1.0, 3: 0.95, 4: 1.05, 5: 1.2}[d.weekday()]
        tendance = 0.9 + 0.2 * k / DUREE_JOURS
        lam[k] = saison * semaine * tendance
    lam *= NB_REPARATIONS_CIBLE * 0.97 / lam.sum()  # ~3 % de retours s'ajoutent
    volumes = rng.poisson(lam)

    # -- clients, appareils, réparations
    clients: list[dict] = []
    appareils: list[dict] = []
    appareils_client = defaultdict(list)
    imeis = set()
    reps: list[Rep] = []
    poids_modeles = np.array([m[4] for m in MODELES])
    poids_modeles /= poids_modeles.sum()
    villes, pv = zip(*VILLES)
    pv = np.array(pv) / sum(pv)

    def nouveau_client(quand: datetime) -> int:
        cid = len(clients) + 1
        prenom, nom = prng.choice(PRENOMS), prng.choice(NOMS)
        tel = "0" + prng.choice("67") + "".join(f" {prng.randrange(100):02d}" for _ in range(4))
        email = f"{prenom.lower()}.{nom.lower()}{prng.randrange(10, 99)}@exemple.fr".translate(str.maketrans("éèëïçà", "eeeica")) \
            if prng.random() < 0.6 else None
        clients.append(dict(id=cid, nom=f"{prenom} {nom}", telephone=tel, email=email,
                            ville=villes[rng.choice(len(villes), p=pv)], created_at=quand))
        return cid

    def nouvel_appareil(cid: int, quand: datetime) -> int:
        modele = MODELES[rng.choice(len(MODELES), p=poids_modeles)][1]
        tac = {"Apple": "35", "Samsung": "35", "Xiaomi": "86", "Google": "35"}[infos_modele[modele][0]]
        imei = luhn_imei(prng, tac)
        while imei in imeis:
            imei = luhn_imei(prng, tac)
        imeis.add(imei)
        aid = len(appareils) + 1
        appareils.append(dict(id=aid, client_id=cid, modele_id=modele_id[modele], imei=imei,
                              couleur=prng.choice(["Noir", "Blanc", "Bleu", "Graphite", "Rose", "Vert", None]),
                              depose_le=quand, _modele=modele))
        appareils_client[cid].append(aid)
        return aid

    def tirer_panne(modele: str, quand: datetime) -> str:
        age = quand.year - infos_modele[modele][2]
        doy = quand.timetuple().tm_yday
        poids = dict(PANNE_POIDS)
        poids["batterie"] *= 0.5 + 0.2 * age
        poids["connecteur"] *= 0.8 + 0.15 * age
        if 160 <= doy <= 250:  # été : chutes et baignades
            poids["oxydation"] *= 1.8
            poids["ecran"] *= 1.1
        if infos_modele[modele][0] != "Apple":
            poids["pmic"] *= 0.5
        codes = list(poids)
        p = np.array([poids[c] for c in codes])
        return codes[rng.choice(len(codes), p=p / p.sum())]

    def tirer_symptomes(panne: str) -> list[str]:
        out = [s for s, p in SYMPTOMES_PAR_PANNE[panne].items() if rng.random() < p]
        out += [s for s in symptome_id if s not in SYMPTOMES_PAR_PANNE[panne] and rng.random() < 0.03]
        if not out:
            out = [max(SYMPTOMES_PAR_PANNE[panne], key=SYMPTOMES_PAR_PANNE[panne].get)]
        return out

    def texte_symptomes(codes: list[str]) -> str:
        morceaux = [prng.choice(formulations[c]) for c in codes]
        intro = prng.choice(["Le client signale : ", "Constat à l'accueil : ", "", "Selon la cliente, "])
        txt = intro + ", ".join(morceaux) + "."
        return txt[0].upper() + txt[1:]

    def choisir_tech(quand: datetime, panne: str) -> int:
        dispo = [(tid, w) for tid, _fd, w, until in techs if until is None or quand.date() < depart_aubry]
        ids, w = zip(*dispo)
        w = np.array(w, dtype=float)
        for k, tid in enumerate(ids):  # spécialités
            if tid == users["f.haddad@reparu.fr"] and panne == "ecran":
                w[k] *= 1.6
            if tid == users["s.benali@reparu.fr"] and panne in ("batterie", "connecteur"):
                w[k] *= 1.6
            if tid == users["l.marchand@reparu.fr"] and panne in ("pmic", "oxydation"):
                w[k] *= 2.0
        return int(ids[rng.choice(len(ids), p=w / w.sum())])

    facteur_tech = {users[e]: fd for _, e, role, _, fd, _w, _u in EQUIPE if fd}

    def creer_rep(quand: datetime, cid: int, aid: int, panne: str, retour_de: int | None = None) -> Rep:
        modele = appareils[aid - 1]["_modele"]
        gamme = infos_modele[modele][3]
        typ = infos_panne[panne][3]
        piece = pieces.get((typ, modele)) if typ else None
        if panne == "oxydation" and rng.random() < 0.4:
            piece = pieces.get(("Connecteur de charge", modele))
        cout = piece_info[piece]["prix_achat"] if piece else 0.0
        base = infos_panne[panne][4] * FACTEUR_DUREE_GAMME[gamme]
        duree_est = int(max(15, round(base * rng.uniform(0.85, 1.2) / 5) * 5))
        tech = choisir_tech(quand, panne)
        duree_reelle = int(max(10, duree_est * facteur_tech[tech] * rng.lognormal(0, 0.22)))
        syms = tirer_symptomes(panne)
        prio = "haute" if retour_de else rng.choice(["basse", "normale", "haute"], p=[0.1, 0.78, 0.12])
        return Rep(id=0, client_id=cid, appareil_id=aid, modele=modele, panne=panne, priorite=str(prio), recu=quand,
                   tech_id=tech, symptomes=syms, texte=texte_symptomes(syms), piece_id=piece, cout=cout,
                   duree_estimee=duree_est, duree_reelle=duree_reelle,
                   accepte=bool(retour_de) or rng.random() > 0.08, retour_de=retour_de)

    for k, d in enumerate(jours):
        for _ in range(volumes[k]):
            quand = datetime.combine(d, time(9, 30)) + timedelta(minutes=int(rng.integers(0, 540)))
            if quand >= fin_dt:
                continue
            if clients and rng.random() < 0.18:
                cid = int(rng.integers(1, len(clients) + 1))
                aid = prng.choice(appareils_client[cid]) if rng.random() < 0.6 else nouvel_appareil(cid, quand)
            else:
                cid = nouveau_client(quand)
                aid = nouvel_appareil(cid, quand)
            reps.append(creer_rep(quand, cid, aid, tirer_panne(appareils[aid - 1]["_modele"], quand)))

    # -- simulation chronologique : jalons, stock, commandes
    stock = {p: info["stock"] for p, info in piece_info.items()}
    commandes_en_cours: dict[int, tuple[datetime, int, int]] = {}  # piece -> (arrivée, qte, bc_id)
    mouvements: list[dict] = []
    bons: list[dict] = []
    stock_journal = defaultdict(list)  # piece -> [(t, stock)] pour les capteurs

    def mvt(piece, typ, qte, quand, motif, par, **kw):
        stock[piece] += qte
        mouvements.append(dict(piece_id=piece, type=typ, qte=qte, source=kw.pop("source", "manuel"), motif=motif,
                               par_user_id=par, le=quand, **kw))
        stock_journal[piece].append((quand, stock[piece]))

    def recevoir_jusqua(quand: datetime):
        for p, (arrivee, qte, bc) in list(commandes_en_cours.items()):
            if arrivee <= quand:
                mvt(p, "entree", qte, arrivee, "Réception fournisseur", admin_id, bon_commande_id=bc)
                bons[bc - 1]["statut"] = "recu"
                del commandes_en_cours[p]

    def commander(p: int, quand: datetime):
        if p in commandes_en_cours:
            return
        f, prix, delai, _dispo, _fiab = meilleure_offre(p)
        qte = max(piece_info[p]["seuil"] * 3 - stock[p], 1)
        bc = len(bons) + 1
        bons.append(dict(id=bc, numero=f"BC-{quand.year}-{bc:04d}", fournisseur_id=f, statut="envoye",
                         cree_par=prng.choice([admin_id, resp_id]), le=quand, _lignes=[(p, qte, prix)]))
        commandes_en_cours[p] = (ouvre(quand + timedelta(days=delai, hours=int(rng.integers(0, 6)))), qte, bc)

    def jalonner(r: Rep):
        h = lambda a, b: timedelta(hours=float(rng.uniform(a, b)))
        vitesse = 0.5 if r.priorite == "haute" else 1.6 if r.priorite == "basse" else 1.0
        j = r.jalons
        j["recu"] = r.recu
        j["en_diagnostic"] = ouvre(r.recu + h(0.5, 24) * vitesse)
        j["devis"] = j["en_diagnostic"] + timedelta(minutes=20)
        j["reponse"] = ouvre(j["devis"] + h(1, 40))
        if not r.accepte:
            j["pret"] = j["reponse"] + timedelta(minutes=30)
        else:
            debut_rep = ouvre(j["reponse"] + h(1, 36) * vitesse)
            if r.piece_id:
                recevoir_jusqua(debut_rep)
                if stock[r.piece_id] <= 0:
                    commander(r.piece_id, debut_rep)
                    arrivee = commandes_en_cours[r.piece_id][0]
                    recevoir_jusqua(arrivee)
                    debut_rep = ouvre(arrivee + h(0.5, 4))
                    j["attente_piece"] = arrivee
                mvt(r.piece_id, "sortie", -1, debut_rep, f"Réparation REP-{r.id:04d}", r.tech_id, reparation_id=r.id)
                if stock[r.piece_id] <= piece_info[r.piece_id]["seuil"]:
                    commander(r.piece_id, debut_rep)
            j["en_reparation"] = debut_rep
            j["pret"] = ouvre(debut_rep + timedelta(minutes=r.duree_reelle) + h(0.3, 3))
        j["livre"] = ouvre(j["pret"] + h(3, 120))

    reps.sort(key=lambda r: r.recu)
    i = 0
    retours_crees = 0
    while i < len(reps):
        r = reps[i]
        r.id = i + 1
        jalonner(r)
        # retour sous garantie (6 mois), plus fréquent sur la connectique
        p_retour = {"connecteur": 0.06, "ecran": 0.03, "batterie": 0.02}.get(r.panne, 0.025)
        if r.accepte and not r.retour_de and rng.random() < p_retour:
            quand = ouvre(r.jalons["livre"] + timedelta(days=float(rng.uniform(3, 60))))
            if quand < fin_dt:
                retour = creer_rep(quand, r.client_id, r.appareil_id, r.panne, retour_de=r.id)
                # insertion à sa place chronologique (la liste est triée par date de réception)
                pos = next((k for k in range(i + 1, len(reps)) if reps[k].recu > quand), len(reps))
                reps.insert(pos, retour)
                retours_crees += 1
        i += 1
    recevoir_jusqua(fin_dt)

    # inventaires mensuels : petits écarts corrigés à la main
    d = debut.replace(day=1)
    while d < fin:
        d = (d + timedelta(days=32)).replace(day=1)
        if d >= fin:
            break
        quand = ouvre(datetime.combine(d, time(18, 0)) + timedelta(days=1))
        for p in prng.sample(sorted(piece_info), k=3):
            ecart = prng.choice([-1, -1, 1])
            if stock[p] + ecart >= 0:
                mvt(p, "ajustement", ecart, quand, "Ajustement inventaire mensuel", prng.choice([admin_id, resp_id]))

    # -- état à la date de fin et tables dépendantes
    ordre = ["recu", "en_diagnostic", "en_reparation", "pret", "livre"]
    devis_seq, facture_seq = defaultdict(int), defaultdict(int)
    devis_rows, lignes_devis, factures, lignes_fact, reglements = [], [], [], [], []
    for r in reps:
        j = r.jalons
        atteints = [s for s in ordre if s in j and j[s] <= fin_dt]
        statut = atteints[-1] if atteints else "recu"
        ouvert = statut != "livre"
        cloture = j["livre"] if not ouvert else None
        tech = r.tech_id
        planifie = None
        if ouvert:
            if statut == "recu" and rng.random() < 0.45:
                tech = None  # en attente d'affectation (5.13)
            planifie = (fin_dt + timedelta(days=int(rng.integers(0, 5)))).date()
            while planifie.weekday() == 6:
                planifie += timedelta(days=1)
        diag_fait = j["devis"] <= fin_dt
        piece_pu = arrondi_demi(r.cout * (1 + MARGE_VISEE * rng.uniform(0.9, 1.1))) if r.piece_id else 0.0
        heures = r.duree_estimee / 60
        mo = r2(r2(heures) * TAUX_HORAIRE)  # = qte × P.U. de la ligne de devis
        prix_ht = 0.0 if r.retour_de else r2(piece_pu + mo)
        valide = j["reponse"] if (diag_fait and r.accepte and j["reponse"] <= fin_dt and not r.retour_de) else None
        T["reparations"].append(dict(
            id=r.id, numero=f"REP-{r.id:04d}", appareil_id=r.appareil_id, client_id=r.client_id, tech_id=tech,
            statut=statut, priorite=r.priorite, recu_le=r.recu, planifie_le=planifie, cloture_le=cloture,
            retour_de_id=r.retour_de, symptomes_texte=r.texte,
            diagnostic_final=(infos_panne[r.panne][1] + (" — remplacement de la pièce" if r.piece_id else " — intervention sans pièce"))
            if diag_fait else None,
            duree_estimee_min=r.duree_estimee if diag_fait else None,
            cout_pieces_retenu=r.cout if diag_fait else None, prix_retenu_ht=prix_ht if diag_fait else None,
            valide_client_le=valide,
        ))
        for s in r.symptomes:
            T["reparation_symptomes"].append(dict(reparation_id=r.id, symptome_id=symptome_id[s]))
        if diag_fait:
            T["reparation_pannes"].append(dict(reparation_id=r.id, panne_id=panne_id[r.panne], finale=True))
        prec = None
        for s in atteints:
            T["historique_statuts"].append(dict(reparation_id=r.id, de_statut=prec, vers_statut=s,
                                                par_user_id=tech or admin_id, le=j[s]))
            prec = s
        faites = {"recu": 1, "en_diagnostic": 1, "en_reparation": 2, "pret": 5, "livre": 5}[statut]
        if statut == "en_diagnostic" and diag_fait and r.accepte:
            faites = 2
        for k, (lib, dmin) in enumerate(CHECKLIST, start=1):
            fait = k <= faites and (r.accepte or k <= 2 or k == 5)
            T["checklist_etapes"].append(dict(reparation_id=r.id, ordre=k, libelle=lib, duree_min=dmin, faite=fait,
                                              faite_par=(tech or admin_id) if fait else None,
                                              faite_le=min(j.get(ordre[min(k, 4)], r.recu), fin_dt) if fait else None))
        for typ, t in (("etat_general", r.recu), ("zone_endommagee", r.recu + timedelta(minutes=1))):
            T["photos"].append(dict(reparation_id=r.id, type=typ, chemin=f"demo/{typ}.svg", sha256="", prise_le=t,
                                    par_user_id=tech or admin_id))
        if statut in ("pret", "livre") and r.accepte:
            T["photos"].append(dict(reparation_id=r.id, type="apres_intervention", chemin="demo/apres_intervention.svg",
                                    sha256="", prise_le=j["pret"], par_user_id=tech or admin_id))
        if "en_reparation" in atteints:
            fin_tp = j["en_reparation"] + timedelta(minutes=r.duree_reelle)
            T["temps_passe"].append(dict(reparation_id=r.id, user_id=tech or admin_id, debut=j["en_reparation"],
                                         fin=fin_tp if fin_tp <= fin_dt else None))
            if r.piece_id:
                T["reparation_pieces"].append(dict(reparation_id=r.id, piece_id=r.piece_id, qte=1, prix_achat_unitaire=r.cout))
        # devis (pas de devis pour un retour sous garantie)
        if diag_fait and not r.retour_de:
            an = j["devis"].year
            devis_seq[an] += 1
            did = len(devis_rows) + 1
            tva = r2(prix_ht * TVA)
            reponse_connue = j["reponse"] <= fin_dt
            statut_devis = ("accepte" if r.accepte else "refuse") if reponse_connue else "emis"
            devis_rows.append(dict(id=did, numero=f"DV-{an}-{devis_seq[an]:04d}", reparation_id=r.id, statut=statut_devis,
                                   emis_le=j["devis"], envoye_le=j["devis"] + timedelta(minutes=2),
                                   accepte_le=j["reponse"] if statut_devis == "accepte" else None,
                                   total_ht=prix_ht, tva=tva, total_ttc=r2(prix_ht + tva)))
            lignes = []
            if r.piece_id:
                lignes.append(dict(designation=piece_info[r.piece_id]["designation"], detail="Pièce de remplacement",
                                   qte=1, pu_ht=piece_pu, type="piece"))
            lignes.append(dict(designation="Main-d'œuvre atelier",
                               detail=f"{r.duree_estimee} min · taux horaire 45 € HT", qte=r2(heures), pu_ht=TAUX_HORAIRE,
                               type="main_oeuvre"))
            lignes.append(dict(designation="Forfait diagnostic", detail="déduit si réparation acceptée", qte=1, pu_ht=0,
                               type="forfait"))
            for li in lignes:
                lignes_devis.append(dict(devis_id=did, **li))
            if statut == "livre" and r.accepte:
                an_f = j["livre"].year
                facture_seq[an_f] += 1
                fid = len(factures) + 1
                factures.append(dict(id=fid, numero=f"FA-{an_f}-{facture_seq[an_f]:04d}", devis_id=did, reparation_id=r.id,
                                     client_nom=clients[r.client_id - 1]["nom"],
                                     emise_le=j["livre"], total_ht=prix_ht, tva=tva, total_ttc=r2(prix_ht + tva), acquittee=True))
                for li in lignes:
                    lignes_fact.append(dict(facture_id=fid, **li))
                modes, pm = zip(*MODES_REGLEMENT)
                reglements.append(dict(facture_id=fid, mode=modes[rng.choice(len(modes), p=pm)],
                                       montant=r2(prix_ht + tva), encaisse_le=j["livre"], par_user_id=tech or admin_id))

    for c in clients:
        c["derniere_intervention_le"] = None
    for r in T["reparations"]:
        c = clients[r["client_id"] - 1]
        if c["derniere_intervention_le"] is None or r["recu_le"] > c["derniere_intervention_le"]:
            c["derniere_intervention_le"] = r["recu_le"]

    # -- capteurs IoT : 6 bacs à forte rotation, une lecture toutes les 6 h sur 30 jours
    rotation = defaultdict(int)
    for m in mouvements:
        if m["type"] == "sortie":
            rotation[m["piece_id"]] += 1
    surveilles = [p for p, _ in sorted(rotation.items(), key=lambda kv: -kv[1])[:6]]
    lectures = []
    for k, p in enumerate(surveilles, start=1):
        code = f"iot-cap-{k:03d}"
        T["capteurs"].append(dict(id=k, code=code, piece_id=p, emplacement=f"Armoire A · bac {k:02d}",
                                  device_id=f"esp32-{hashlib.sha1(code.encode()).hexdigest()[:8]}", mqtt_username=code,
                                  actif=True, derniere_lecture_le=None))
        journal = sorted(stock_journal[p])
        t = datetime.combine(fin - timedelta(days=30), time(0, 0))
        muet = k == 6  # un capteur cesse d'émettre 36 h avant la fin
        while t <= fin_dt:
            if muet and t > fin_dt - timedelta(hours=36):
                break
            niveau = next((s for ts, s in reversed(journal) if ts <= t), piece_info[p]["stock"])
            if rng.random() < 0.03:
                niveau = max(0, niveau + prng.choice([-1, 1]))  # bruit de comptage ponctuel
            lectures.append(dict(capteur_id=k, niveau=niveau, recu_le=t, brut={"device": code, "niveau": niveau}))
            t += timedelta(hours=6)
    # écart injecté sur le capteur 2 : le bac est presque vide alors que le stock comptable ne l'est pas
    ecart_cap = 2
    derniers = [lec for lec in lectures if lec["capteur_id"] == ecart_cap][-2:]
    for lec in derniers:
        lec["niveau"] = max(0, min(1, stock[surveilles[ecart_cap - 1]] - 6))
        lec["brut"] = {"device": f"iot-cap-{ecart_cap:03d}", "niveau": lec["niveau"]}
    for cap in T["capteurs"]:
        ts = [lec["recu_le"] for lec in lectures if lec["capteur_id"] == cap["id"]]
        cap["derniere_lecture_le"] = max(ts) if ts else None
    # garantit un stock comptable suffisant pour que l'écart soit visible (« 7 à 1 unité »)
    p_ecart = surveilles[ecart_cap - 1]
    if stock[p_ecart] < 7:
        mvt(p_ecart, "entree", 7 - stock[p_ecart], fin_dt - timedelta(days=2), "Réception fournisseur", admin_id)

    # -- historique de connexions (base d'apprentissage de la détection d'anomalies, M7)
    for d in jours:
        if d.weekday() == 6 or d >= fin:
            continue
        for _nom, email, role, *_x in EQUIPE:
            if email == "t.aubry@reparu.fr" and d >= depart_aubry:
                continue
            if role == "admin" and rng.random() < 0.15:
                continue
            if rng.random() < 0.06:  # absence
                continue
            uid = users[email]
            t = datetime.combine(d, time(8, 30)) + timedelta(minutes=float(rng.normal(25, 12)))
            if rng.random() < 0.03:
                T["audit_log"].append(dict(user_id=uid, email_tente=email, action="login_echec", ressource=None,
                                           details={"motif": "mot de passe incorrect", "echecs": 1}, ip="192.168.1.20",
                                           horodatage=t - timedelta(seconds=40)))
            T["audit_log"].append(dict(user_id=uid, email_tente=email, action="login_ok", ressource=None,
                                       details={"se_souvenir": role == "technicien"}, ip="192.168.1.20", horodatage=t))
            # reconnexions dans la journée : retour de pause, session expirée, second poste
            for debut_h, fin_h, p in ((13, 15, 0.55), (10, 19, 0.35), (10, 19, 0.15)):
                if rng.random() < p:
                    t2 = datetime.combine(d, time(debut_h, 0)) + timedelta(minutes=float(rng.uniform(0, (fin_h - debut_h) * 60)))
                    T["audit_log"].append(dict(user_id=uid, email_tente=email, action="login_ok", ressource=None,
                                               details={"se_souvenir": False}, ip="192.168.1.20", horodatage=t2))
            # activité d'écriture pendant la journée (dossiers, checklist, devis…), journalisée par le middleware
            for h in range(9, 19):
                n = int(rng.poisson(2.2 if role == "technicien" else 0.8))
                for _ in range(n):
                    T["audit_log"].append(dict(user_id=uid, email_tente=None, action="ecriture", ressource="/api/reparations",
                                               details={"methode": "PATCH", "statut_http": 200}, ip="192.168.1.20",
                                               horodatage=datetime.combine(d, time(h, 0)) + timedelta(minutes=float(rng.uniform(0, 59)))))
            if role == "technicien" and rng.random() < 0.01:
                T["audit_log"].append(dict(user_id=uid, email_tente=email, action="acces_refuse", ressource="dashboard",
                                           details={"chemin": "/api/dashboard", "methode": "GET"}, ip="192.168.1.20",
                                           horodatage=t + timedelta(minutes=float(rng.uniform(5, 300)))))
            if role in ("admin", "responsable") and d.day == 1:
                T["audit_log"].append(dict(user_id=uid, email_tente=email, action="export", ressource="rapports",
                                           details={"format": "pdf"}, ip="192.168.1.20", horodatage=t + timedelta(hours=1)))
    T["audit_log"].append(dict(user_id=admin_id, email_tente="t.aubry@reparu.fr", action="compte_toggle", ressource="users",
                               details={"actif": False}, ip="192.168.1.20",
                               horodatage=datetime.combine(depart_aubry, time(15, 12))))

    # -- assemblage
    T["clients"] = clients
    T["appareils"] = [{k: v for k, v in a.items() if not k.startswith("_")} for a in appareils]
    T["pieces"] = [dict(p, stock=stock[p["id"]]) for p in piece_info.values()]
    T["bons_commande"] = [{k: v for k, v in b.items() if not k.startswith("_")} for b in bons]
    T["lignes_bon_commande"] = [dict(bon_commande_id=b["id"], piece_id=p, qte=q, prix_ht=px) for b in bons for p, q, px in b["_lignes"]]
    T["mouvements_stock"] = [dict(id=k, **m) for k, m in enumerate(sorted(mouvements, key=lambda m: m["le"]), start=1)]
    T["devis"], T["lignes_devis"], T["factures"], T["lignes_facture"], T["reglements"] = (
        devis_rows, lignes_devis, factures, lignes_fact, reglements)
    T["lectures_capteurs"] = lectures
    T["parametres"] = [dict(cle=k, valeur=str(v)) for k, v in dict(
        taux_horaire=TAUX_HORAIRE, tva=TVA, marge_visee=MARGE_VISEE, capacite_jour_h=7, seuil_charge=0.85, sla_h=48,
        conservation_ans=3).items()]

    frames = {name: pd.DataFrame(rows) for name, rows in T.items()}
    frames["_meta"] = pd.DataFrame([dict(seed=seed, debut=debut, fin=fin, fin_dt=fin_dt, retours=retours_crees)])
    return frames


# ---------------------------------------------------------------- profil


def profile(frames: dict[str, pd.DataFrame]) -> str:
    meta = frames["_meta"].iloc[0]
    rep = frames["reparations"].copy()
    rp = frames["reparation_pannes"].merge(frames["pannes"], left_on="panne_id", right_on="id")
    app = frames["appareils"].merge(frames["modeles_appareil"], left_on="modele_id", right_on="id")
    rep = rep.merge(app[["id_x", "modele"]].rename(columns={"id_x": "appareil_id"}), on="appareil_id")
    rep["mois"] = pd.to_datetime(rep["recu_le"]).dt.to_period("M").astype(str)
    fact = frames["factures"]
    out = [
        "# Profil des données synthétiques",
        "",
        "> **Données synthétiques.** Aucune de ces données ne provient de l'atelier réel : elles sont générées par "
        "`ml/data/generate.py` (graine fixe) pour développer et évaluer la plateforme. Les chiffres ci-dessous décrivent le "
        "jeu généré, pas l'activité réelle de Repar U.",
        "",
        f"- Graine : `{meta['seed']}` · période : {meta['debut']} → {meta['fin']} (18 mois)",
        f"- Réparations : **{len(rep)}**, dont {int(meta['retours'])} retours sous garantie ; dossiers ouverts à la date "
        f"de fin : {int((rep['statut'] != 'livre').sum())}",
        f"- Clients : {len(frames['clients'])} · appareils : {len(frames['appareils'])} · pièces : {len(frames['pieces'])} "
        f"· fournisseurs : {len(frames['fournisseurs'])} · mouvements de stock : {len(frames['mouvements_stock'])}",
        f"- Devis : {len(frames['devis'])} (dont {int((frames['devis']['statut'] == 'refuse').sum())} refusés) · factures : "
        f"{len(fact)} · CA HT total : {fact['total_ht'].sum():,.0f} €".replace(",", " "),
        "",
        "## Volume mensuel (saisonnalité été et fêtes, croissance +20 %)",
        "",
        "| Mois | Réparations |", "|---|---|",
        *[f"| {m} | {n} |" for m, n in rep.groupby("mois").size().items()],
        "",
        "## Répartition des pannes confirmées",
        "",
        "| Panne | Catégorie | Part |", "|---|---|---|",
        *[f"| {lib} | {cat} | {n / len(rp):.1%} |" for (lib, cat), n in
          rp.groupby(["libelle", "categorie"]).size().sort_values(ascending=False).items()],
        "",
        "## Modèles d'appareils",
        "",
        "| Modèle | Part |", "|---|---|",
        *[f"| {m} | {n / len(rep):.1%} |" for m, n in rep["modele"].value_counts().items()],
        "",
        "## Durées et prix",
        "",
        "| Panne | Durée estimée médiane (min) | Prix HT médian (€) |", "|---|---|---|",
    ]
    rep2 = rep.merge(rp[["reparation_id", "libelle"]], left_on="id", right_on="reparation_id")
    for lib, g in rep2.groupby("libelle"):
        out.append(f"| {lib} | {g['duree_estimee_min'].median():.0f} | {g['prix_retenu_ht'].median():.2f} |")
    sym = frames["reparation_symptomes"].merge(frames["symptomes"], left_on="symptome_id", right_on="id")
    sym = sym.merge(rp[["reparation_id", "code"]].rename(columns={"code": "panne"}), on="reparation_id")
    out += ["", "## Corrélation symptômes → panne (part des dossiers de la panne où le symptôme est signalé)", "",
            "| Panne | Symptômes les plus signalés |", "|---|---|"]
    nb_par_panne = rp.groupby("code").size()
    for panne, g in sym.groupby("panne"):
        top = g["libelle"].value_counts().head(3)
        out.append(f"| {panne} | " + ", ".join(f"{s} ({n / nb_par_panne[panne]:.0%})" for s, n in top.items()) + " |")
    pieces = frames["pieces"]
    statut = np.where(pieces["stock"] == 0, "Rupture", np.where(pieces["stock"] <= pieces["seuil"], "Seuil bas", "En stock"))
    out += ["", "## Stock à la date de fin", "",
            *[f"- {s} : {n}" for s, n in pd.Series(statut).value_counts().items()],
            f"- Capteurs IoT : {len(frames['capteurs'])}, {len(frames['lectures_capteurs'])} lectures "
            "(un écart injecté sur `iot-cap-002`, `iot-cap-006` muet depuis 36 h)",
            "", "## Règles de génération", "",
            "Voir la docstring de `ml/data/generate.py` : Poisson saisonnier, panne conditionnée par l'âge du modèle et la "
            "saison, symptômes tirés conditionnellement à la panne avec 3 % de bruit, simulation du stock avec "
            "réapprovisionnement au seuil, règle de prix unique (DECISIONS D-B3)."]
    return "\n".join(out) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--fin", type=date.fromisoformat, default=None)
    parser.add_argument("--profile", action="store_true", help="écrit ml/reports/data_profile.md")
    args = parser.parse_args()
    frames = generate(args.seed, args.fin)
    print({k: len(v) for k, v in frames.items() if not k.startswith("_")})
    if args.profile:
        path = Path(__file__).resolve().parents[1] / "reports" / "data_profile.md"
        path.write_text(profile(frames), encoding="utf-8")
        print(f"profil écrit dans {path}")


if __name__ == "__main__":
    main()

# Profil des données synthétiques

> **Données synthétiques.** Aucune de ces données ne provient de l'atelier réel : elles sont générées par `ml/data/generate.py` (graine fixe) pour développer et évaluer la plateforme. Les chiffres ci-dessous décrivent le jeu généré, pas l'activité réelle de Repar U.

- Graine : `42` · période : 2025-05-08 → 2026-11-07 (18 mois)
- Réparations : **1302**, dont 35 retours sous garantie ; dossiers ouverts à la date de fin : 18
- Clients : 1007 · appareils : 1118 · pièces : 56 · fournisseurs : 5 · mouvements de stock : 1483
- Devis : 1263 (dont 117 refusés) · factures : 1134 · CA HT total : 108 054 €

## Volume mensuel (saisonnalité été et fêtes, croissance +20 %)

| Mois | Réparations |
|---|---|
| 2025-05 | 36 |
| 2025-06 | 64 |
| 2025-07 | 74 |
| 2025-08 | 78 |
| 2025-09 | 73 |
| 2025-10 | 60 |
| 2025-11 | 54 |
| 2025-12 | 76 |
| 2026-01 | 77 |
| 2026-02 | 76 |
| 2026-03 | 63 |
| 2026-04 | 65 |
| 2026-05 | 77 |
| 2026-06 | 79 |
| 2026-07 | 94 |
| 2026-08 | 91 |
| 2026-09 | 81 |
| 2026-10 | 66 |
| 2026-11 | 18 |

## Répartition des pannes confirmées

| Panne | Catégorie | Part |
|---|---|---|
| Écran / vitre tactile HS | Écran cassé | 30.9% |
| Batterie en fin de vie | Batterie | 24.6% |
| Connecteur de charge HS | Connecteur de charge | 20.4% |
| Oxydation après contact liquide | Carte mère / logique | 7.2% |
| Module caméra HS | Autres (caméra, HP…) | 5.1% |
| Dissipation thermique / pad HS | Autres (caméra, HP…) | 4.6% |
| Haut-parleur interne HS | Autres (caméra, HP…) | 4.0% |
| Circuit de charge (PMIC) défaillant | Carte mère / logique | 3.2% |

## Modèles d'appareils

| Modèle | Part |
|---|---|
| iPhone 13 | 17.5% |
| iPhone 12 | 11.4% |
| Galaxy S22 | 9.9% |
| Galaxy S21 | 9.1% |
| Pixel 7 | 7.5% |
| iPhone 14 | 7.3% |
| iPhone 11 | 7.1% |
| Redmi Note 11 | 7.1% |
| Galaxy A52 | 6.9% |
| Redmi Note 12 | 5.4% |
| Galaxy A53 | 4.6% |
| iPhone SE 2022 | 3.2% |
| Pixel 6a | 2.8% |

## Durées et prix

| Panne | Durée estimée médiane (min) | Prix HT médian (€) |
|---|---|---|
| Batterie en fin de vie | 30 | 63.50 |
| Circuit de charge (PMIC) défaillant | 125 | 121.05 |
| Connecteur de charge HS | 40 | 53.20 |
| Dissipation thermique / pad HS | 60 | 45.00 |
| Haut-parleur interne HS | 30 | 38.00 |
| Module caméra HS | 35 | 84.05 |
| Oxydation après contact liquide | 90 | 71.10 |
| Écran / vitre tactile HS | 45 | 175.35 |

## Corrélation symptômes → panne (part des dossiers de la panne où le symptôme est signalé)

| Panne | Symptômes les plus signalés |
|---|---|
| batterie | Autonomie faible (94%), S'éteint ou redémarre seul (35%), Chauffe anormalement (23%) |
| camera | Photos floues / caméra noire (95%), Chute récente (39%), Ne charge plus (6%) |
| connecteur | Ne charge plus (92%), Faux contact du câble (59%), Contact avec un liquide (6%) |
| ecran | Écran fissuré / vitre cassée (86%), Chute récente (63%), Tactile ne répond plus (44%) |
| haut_parleur | Pas de son / grésillements (85%), Micro / appels inaudibles (35%), Contact avec un liquide (6%) |
| oxydation | Contact avec un liquide (87%), Ne s'allume plus (37%), Pas de son / grésillements (31%) |
| pmic | Ne s'allume plus (83%), Ne charge plus (40%), S'éteint ou redémarre seul (31%) |
| thermique | Chauffe anormalement (90%), Lenteurs (53%), S'éteint ou redémarre seul (38%) |

## Stock à la date de fin

- En stock : 40
- Seuil bas : 11
- Rupture : 5
- Capteurs IoT : 6, 726 lectures (un écart injecté sur `iot-cap-002`, `iot-cap-006` muet depuis 36 h)

## Règles de génération

Voir la docstring de `ml/data/generate.py` : Poisson saisonnier, panne conditionnée par l'âge du modèle et la saison, symptômes tirés conditionnellement à la panne avec 3 % de bruit, simulation du stock avec réapprovisionnement au seuil, règle de prix unique (DECISIONS D-B3).

# Correspondance avec le référentiel RNCP 39394

Certification : **Expert en systèmes d'information et sécurité** (RNCP39394, niveau 7).

Source : fiche France Compétences (francecompetences.fr/recherche/rncp/39394). Les intitulés des blocs sont exacts. Les compétences sont **résumées** : reprendre le libellé officiel de chaque compétence dans le rapport.

> **Écart avec le cahier des charges.** Sa table §7 présente le « Bloc 4 » comme « Données ». Le BC04 officiel porte en réalité sur le « Développement, intégration et exploitation d'Objets Connectés (IoT) sécurisés, avec renforcement par l'IA ». Le volet IoT du projet (M6, M7) répond à ce bloc. Voir DECISIONS D-M10-1.

La colonne « Preuve » renvoie à un fichier, une capture ou une métrique du dépôt. « Couvert hors projet » signale une compétence que ce projet n'illustre pas : elle doit être démontrée par une autre activité de l'alternance.

## BC01 — Pilotage stratégique de la gestion, de la sécurité et de l'innovation d'un système d'information

| # | Compétence (résumé) | Preuve dans le projet |
|---|---|---|
| 1 | Piloter des projets interdisciplinaires intégrant les nouvelles technologies | `PLAN.md` (11 jalons avec critères d'acceptation), `docs/JOURNAL.md`, historique git (un commit par jalon) |
| 2 | Traduire les besoins métier en solutions techniques | `docs/cahier_des_charges.md` → `docs/DECISIONS.md` (arbitrages D-A/D-B), `docs/MCD.md`, règles métier dans `backend/app/services/regles.py` |
| 3 | Budget, plan stratégique, retour sur investissement | Couvert hors projet (chiffrage non demandé). Éléments à réutiliser : objectifs −50 % de temps de diagnostic, +20 % de marge, −30 % de ruptures (écran 5.1) ; KPI de rentabilité (5.11) |
| 4 | Cycle de vie IT et adoption des systèmes | Migrations Alembic versionnées, modèles IA versionnés `v1.x` (F-11), `docs/GUIDE_UTILISATEUR.md` (conduite du changement) |
| 5 | Évaluer les systèmes (performance, sécurité) | Temps de réponse mesurés (< 0,6 s, `docs/JOURNAL.md` M4/M5), `ml/reports/evaluation.md`, `docs/SECURITE.md` |
| 6 | Aligner le SI sur les tendances et la stratégie | IA d'aide à la décision, IoT, tableau de bord (`docs/ARCHITECTURE.md`) |
| 7 | Plans d'action et résilience face aux cybermenaces | `docs/SECURITE.md` §2-3 (menaces, mesures, risques résiduels, actions), sauvegarde et restauration testées (M9) |
| 8 | Documenter les résultats et suivre les améliorations | `docs/JOURNAL.md`, `docs/DECISIONS.md`, `docs/ECARTS_MAQUETTE.md` (pistes d'alignement) |
| 9 | Culture de sécurité et audit continu | Journal d'audit (toute écriture, connexions, refus), journal des accès sensibles (5.12), détection IA continue (M7) |
| 10 | Constituer et manager des équipes (dont collaborateurs handicapés) | Couvert hors projet |
| 11 | Accessibilité et développement durable dans la conception | Mode accessibilité (contraste renforcé, tailles ≥ 13 px, focus 4 px, `docs/screens/mode-accessibilite-5.3.png`), navigation clavier du Kanban (◀ ▶), libellés ARIA ; sobriété : modèles légers (entraînement en ~15 s), pas de CDN, capteurs toutes les 6 h |
| 12 | Engager les parties prenantes, évaluer l'impact | Couvert partiellement : validation du cadrage par le porteur (DECISIONS, en-tête) ; F-11 (suivi de la fiabilité en production) |

## BC02 — Optimisation des services et de la sécurité du SI par le développement et la mise en œuvre de technologies avancées

| # | Compétence (résumé) | Preuve dans le projet |
|---|---|---|
| 1 | Choisir et appliquer les technologies et méthodes adaptées | Stack imposée maîtrisée (FastAPI, SQLAlchemy 2, React 18 + TS, MySQL 8, scikit-learn) ; types TS générés depuis l'OpenAPI (D-M8-2) |
| 2 | Améliorer l'expérience utilisateur et la décision par l'analyse et l'IA | Diagnostic assisté (top 3, confiance colorée, 5.4), estimation de prix, prévision d'achat (5.8/5.9), tableau de bord (5.2) |
| 3 | Sécurité, performance, disponibilité, continuité | Healthchecks et redémarrage automatique, sauvegardes, temps de réponse < 3 s, TLS (M9) |
| 4 | Alignement métier et amélioration continue | Règles visibles appliquées côté serveur (Luhn, 2 photos, test de sortie, encaissement) : `tests/test_metier.py` |
| 5 | Analyses de données avancées | `ml/data/generate.py` + `ml/reports/data_profile.md`, rapports 5.11 (CA, marge, délai, taux de retour, rentabilité par panne) |
| 6 | Conformité réglementaire, communication, évaluation continue | RGPD (`docs/SECURITE.md` §4, `services/rgpd.py`, `tests/test_rgpd.py`), mentions légales des factures, TVA |
| 7 | Solutions d'IA personnalisées | 5 modèles comparés à une baseline, sélection automatique (`backend/app/ml/train.py`, `ml/reports/evaluation.md`) |
| 8 | Renforcer la sécurité des plateformes par l'IA et protéger les données | Détection d'anomalies du journal d'audit (LOF, F1 0,93), brute force signalé (`tests/test_securite_ia.py`) |
| 9 | Adapter l'IA aux besoins métier avec les équipes | Le modèle propose, l'humain décide (« valeur retenue » fait foi) ; métrique top 3 choisie pour coller à l'écran (D-M5-1) |
| 10 | Former les utilisateurs aux outils d'IA | `docs/GUIDE_UTILISATEUR.md` (lecture de la confiance, F-11, limites des données synthétiques) |
| 11 | Sécuriser applications, bases de données et infrastructures d'analyse | RBAC sur 100 % des routes, MySQL local uniquement, comptes non root, ORM paramétré (`docs/SECURITE.md` M3, M5, M13) |

## BC03 — Mise en place, gestion et optimisation des infrastructures numériques et de la cybersécurité par l'IA

| # | Compétence (résumé) | Preuve dans le projet |
|---|---|---|
| 1 | Infrastructure performante, fiable et résiliente | Docker Compose (6 services + profil e2e), conteneurs non root, déploiement depuis un clone propre en 86 s (`docs/JOURNAL.md` M9) |
| 2 | Haute disponibilité des services critiques | Healthchecks sur les 6 services, `restart: unless-stopped`, ordre de démarrage piloté par l'état de santé. Haute disponibilité multi-nœuds : couvert hors projet (mono-serveur) |
| 3 | Mesures de cybersécurité et conformité | `docs/SECURITE.md` (STRIDE, 15 menaces, mesures, risques résiduels), en-têtes HTTP de sécurité, TLS, RGPD |
| 4 | IA dans la stratégie de sécurité | M7 : détection non supervisée des rafales, horaires inhabituels, refus et exports ; alertes dans le journal 5.12 et la cloche ; démonstration `python -m app.simulation brute-force` |

## BC04 — Développement, intégration et exploitation d'objets connectés (IoT) sécurisés, avec renforcement par l'IA

| # | Compétence (résumé) | Preuve dans le projet |
|---|---|---|
| 1 | Solutions IoT intégrées au SI existant, données protégées | Capteurs de bacs → MQTT → backend → stock et prévision (`iot-sim/`, `services/iot.py`, écran 5.10) ; règle « une lecture ne modifie jamais le stock » (`tests/test_iot.py`) |
| 2 | IA pour analyser les données IoT et détecter les menaces | Lectures alimentant la prévision (stock observé, D-M5-4) ; IsolationForest sur les lectures (F1 0,69) ; capteur muet et écart persistant détectés |
| 3 | Sécurité avancée dans la conception et le déploiement IoT | MQTT en TLS uniquement, un compte par capteur, ACL par topic ; vérifié : anonyme, mauvais mot de passe, absence de TLS, port 1883 et usurpation de topic refusés (D-M6-2) |

## Synthèse

| Bloc | Compétences | Couvertes par le projet | Couvertes partiellement | Hors projet |
|---|---|---|---|---|
| BC01 | 12 | 9 | 1 (12) | 2 (3, 10) |
| BC02 | 11 | 11 | 0 | 0 |
| BC03 | 4 | 3 | 1 (2 : mono-serveur) | 0 |
| BC04 | 3 | 3 | 0 | 0 |

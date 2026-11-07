# Repar U : plateforme d'aide à la décision (PFE RNCP 39394)

## Mission
Construire l'application décrite dans `docs/cahier_des_charges.md`, en reproduisant fidèlement la maquette `docs/maquette/` (lire d'abord `docs/maquette/LISEZMOI.md`). Version web 1440 px uniquement : pas de mobile.

## Hiérarchie des sources
1. La maquette fait foi pour les écrans, les libellés, les parcours et les règles métier visibles (IMEI vérifié par Luhn, 2 photos à l'accueil, test de sortie obligatoire avant « Prêt à facturer », taux horaire 45 € HT, TVA 20 %, conservation RGPD 3 ans, etc.).
2. Le cahier des charges fait foi pour la stack, l'IA et les exigences non fonctionnelles.
3. En cas de conflit, suivre la maquette et noter l'écart dans `docs/DECISIONS.md`.

## Rôles
Trois rôles en back (cahier des charges) : `admin`, `responsable`, `technicien`. La maquette montre deux comptes de démo, à créer tels quels : `c.vasseur@reparu.fr` (admin) et `l.marchand@reparu.fr` (technicien). `responsable` = droits admin sauf « Gestion des comptes ».

## Services externes : simulés, jamais réels
SMS, e-mail et « Programmer l'envoi » écrivent dans une table `outbox` et s'affichent dans les logs. Aucune clé d'API tierce.

## Mode de travail (autonomie)
- Suivre `PLAN.md` jalon par jalon, dans l'ordre. Ne jamais sauter les critères d'acceptation.
- Ne PAS poser de questions : en cas d'ambiguïté, choisir l'option la plus simple conforme au cahier des charges, et la consigner dans `docs/DECISIONS.md` (date, question, choix, raison).
- À la fin de chaque jalon : lancer les tests, cocher la case dans `PLAN.md`, écrire 3 lignes dans `docs/JOURNAL.md`, puis `git commit` (message : `M<n>: <résumé>`). Puis enchaîner sur le jalon suivant.
- Si bloqué plus de 3 tentatives sur la même erreur : documenter dans `docs/BLOCKERS.md`, contourner si possible, passer à la suite.
- Ne jamais toucher à quoi que ce soit en dehors de ce dépôt (le VPS héberge d'autres projets).

## Stack imposée (ne pas substituer)
- Frontend : React 18 + TypeScript + Vite, Recharts, Axios, React Router. CSS : reprendre les tokens de la maquette.
- Backend : Python 3.11, FastAPI, Uvicorn, SQLAlchemy 2 + Alembic, Pydantic v2.
- Données / IA : Pandas, NumPy, Scikit-learn, Joblib.
- BDD : MySQL 8.
- IoT : broker Mosquitto (MQTT sur TLS, port 8883, authentification par utilisateur) + simulateur Python de capteurs, client `paho-mqtt` côté backend.
- PDF : WeasyPrint (devis, factures, rapports).
- Déploiement : Docker Compose (services `frontend`, `backend`, `db`, `mqtt`, `iot-sim`, `proxy` Caddy pour TLS).

## Structure
```
backend/app/{api,core,models,schemas,services,ml}/
backend/tests/
backend/alembic/
ml/{data,notebooks,reports}/      # génération données, entraînement, métriques
frontend/src/{pages,components,api,hooks,styles}/
docs/
docker-compose.yml
```

## Règles de qualité
- Chaque endpoint : schéma Pydantic en entrée et sortie, contrôle RBAC, test pytest.
- Rôles : `admin` (gérant), `responsable`, `technicien`. Une seule matrice de droits dans `backend/app/core/rbac.py`.
- Journalisation d'audit : toute écriture et toute connexion (succès/échec) dans la table `audit_log`.
- Aucun secret dans le code : `.env` (non commité) + `.env.example`.
- Modèles IA : toujours comparer au moins 2 algorithmes + une baseline naïve, retenir le meilleur automatiquement, sauvegarder métriques en JSON (exposées par F-11).
- Données : pas d'historique réel disponible. Générateur synthétique réaliste et reproductible (`seed` fixe) dans `ml/data/generate.py`. Le dire clairement dans les docs, ne jamais prétendre que ce sont des données réelles.

## Commandes
- Tests back : `docker compose run --rm backend pytest -q`
- Lancer : `docker compose up -d --build`
- Vérif visuelle : `npx playwright test` (captures dans `docs/screens/`, à comparer à la maquette)

## Ports (éviter les conflits avec les autres projets du VPS)
Front 5180, API 8010, MySQL 33070 et MQTT 8883 (MySQL exposé en local uniquement : `127.0.0.1:33070`). `COMPOSE_PROJECT_NAME=reparu`.

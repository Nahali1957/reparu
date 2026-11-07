# Journal

## M0 · Socle (2026-11-07)
Squelette du dépôt (backend FastAPI, frontend Vite React TS servi par Caddy), docker-compose `reparu` (db, backend, frontend) sur les ports 33070 (local), 8010 (local) et 5180.
`/api/health` renvoie `{"status":"ok"}`, en direct et via le proxy du frontend ; test pytest vert.
Arbitrages de cadrage reportés dans DECISIONS.md (D-A*, D-B*, D-C*) ; `.env` généré localement avec des secrets aléatoires, non commité.

## M1 · Modèle de données (2026-11-07)
35 tables SQLAlchemy 2 (`backend/app/models/tables.py`) avec ENUM, FK RESTRICT/CASCADE/SET NULL et index sur les dates et les FK ; migration Alembic `0001`.
Vérifié : `alembic upgrade head` sur base vide, puis `downgrade base` et `upgrade` sans erreur, `alembic check` sans écart ; 4 tests verts.
`docs/MCD.md` : diagramme Mermaid et règles d'intégrité.

## M2 · Sécurité (2026-11-07)
JWT signé (8 h, ou 30 j avec « se souvenir »), sessions révocables en base, bcrypt, verrouillage après 5 échecs, mot de passe oublié via outbox.
Matrice RBAC unique (`core/rbac.py`) et dépendance `require_role` : 403 explicite et journalisé. Audit des connexions, des refus, des écritures et des comptes ; en-têtes de sécurité, CORS restreint, rate limiting sur /auth.
19 tests verts, dont le 403 du technicien sur toutes les routes admin ; endpoints comptes et journal sensible (5.12) déjà exposés.

## M3 · Données synthétiques (2026-11-07)
`ml/data/generate.py` (graine 42) simule 18 mois : 1 308 réparations dont 41 retours, saisonnalité, symptômes conditionnés par la panne, stock avec réapprovisionnement au seuil, devis, factures et règlements, lectures capteurs (un écart injecté, un capteur muet), historique de connexions.
`app.seed` charge la base en ~3 s ; profil dans `ml/reports/data_profile.md`, clairement signalé comme synthétique.
25 tests verts (reproductibilité, Luhn, test de sortie, 2 photos, cohérence devis = somme des lignes ; ce dernier test a corrigé un arrondi de main-d'œuvre).

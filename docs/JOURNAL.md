# Journal

## M0 · Socle (2026-11-07)
Squelette du dépôt (backend FastAPI, frontend Vite React TS servi par Caddy), docker-compose `reparu` (db, backend, frontend) sur les ports 33070 (local), 8010 (local) et 5180.
`/api/health` renvoie `{"status":"ok"}`, en direct et via le proxy du frontend ; test pytest vert.
Arbitrages de cadrage reportés dans DECISIONS.md (D-A*, D-B*, D-C*) ; `.env` généré localement avec des secrets aléatoires, non commité.

## M1 · Modèle de données (2026-11-07)
35 tables SQLAlchemy 2 (`backend/app/models/tables.py`) avec ENUM, FK RESTRICT/CASCADE/SET NULL et index sur les dates et les FK ; migration Alembic `0001`.
Vérifié : `alembic upgrade head` sur base vide, puis `downgrade base` et `upgrade` sans erreur, `alembic check` sans écart ; 4 tests verts.
`docs/MCD.md` : diagramme Mermaid et règles d'intégrité.

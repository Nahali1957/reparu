# Journal

## M0 · Socle (2026-11-07)
Squelette du dépôt (backend FastAPI, frontend Vite React TS servi par Caddy), docker-compose `reparu` (db, backend, frontend) sur les ports 33070 (local), 8010 (local) et 5180.
`/api/health` renvoie `{"status":"ok"}`, en direct et via le proxy du frontend ; test pytest vert.
Arbitrages de cadrage reportés dans DECISIONS.md (D-A*, D-B*, D-C*) ; `.env` généré localement avec des secrets aléatoires, non commité.

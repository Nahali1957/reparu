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

## M4 · API métier (2026-11-07)
62 opérations REST typées (clients/appareils, dossiers, Kanban, planning, devis/factures/PDF, stocks, bons de commande, fournisseurs, tableau de bord, rapports CSV/PDF, recherche, cloche), chacune protégée par `require_role`.
Règles serveur : Luhn et unicité de l'IMEI, 2 photos avant diagnostic, devis avant intervention, test de sortie avant « Prêt », encaissement avant restitution, mouvements de stock nominatifs, numérotation DV/FA/BC continue.
54 tests verts, couverture `services/` 91 %. Tous les endpoints répondent en moins de 0,6 s sur la base MySQL (PDF compris). Les tests ont corrigé le score fournisseur (ratio au lieu de min-max) et le planning (jours passés = temps pointé).

## M5 · Pipeline IA (2026-11-07)
Trois modèles comparés à une baseline sur découpage temporel : diagnostic (régression logistique retenue, top-3 97,7 % contre 77,7 %), estimation (Ridge, MAE 9,45 min contre 9,6) et prévision (moyenne mobile 30 j, MAE 0,355 contre 0,380). Sélection automatique, Joblib versionné (`v1.x`), métriques JSON, `ml/reports/evaluation.md`.
Temps de réponse mesurés sur MySQL : diagnostic 59 ms, estimation 23 ms, prévision des 56 pièces 1,15 s, recommandation 74 ms, fiabilité 18 ms (exigence < 3 s).
61 tests verts, couverture `services` + `ml` 91 %. Un bug de pickle (`__main__.Colonne`) a été corrigé en isolant les baselines dans un module.

## M6 · IoT sécurisé (2026-11-07)
Mosquitto en TLS 8883 (CA auto-signée générée au démarrage), un compte par capteur et ACL par topic ; simulateur de 6 bacs en jumeau numérique (consigne retenue + bruit, dérive, valeur aberrante, capteur muet) ; client paho côté backend.
Vérifié en réel : 5 capteurs actifs sur 6, l'écart injecté (`iot-cap-002`, 1 lu pour 7) et le capteur muet (`iot-cap-006`) apparaissent en anomalies ; anonyme, mauvais mot de passe, sans TLS, port 1883 et usurpation de topic sont refusés.
70 tests verts : une lecture ne modifie jamais le stock, correction nominative `source=capteur`, faux positifs ; la prévision (modèle 3) utilise le minimum entre le stock comptable et la lecture récente.

## M7 · IA appliquée à la sécurité (2026-11-07)
Détection d'anomalies sur des fenêtres horaires du journal d'audit et sur les lectures capteurs : LOF retenu pour la sécurité (F1 0,93, 0,57 % de fausses alertes, contre 0,44 pour la baseline), IsolationForest pour les capteurs (F1 0,69 contre 0,43), sélection automatique et versionnage comme en M5.
Acceptation vérifiée en réel : `python -m app.simulation brute-force` (30 essais : 401, puis 423 compte verrouillé, puis 429) déclenche 2 alertes `brute_force` (par compte et par IP, score 1,0), visibles dans le journal 5.12 et la cloche ; aucune alerte sur l'activité normale.
76 tests verts. Corrigés au passage : 429 non journalisés, boucle de rétroaction des alertes, historique synthétique trop étroit, seuil trop bruyant.

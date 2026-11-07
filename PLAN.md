# PLAN : jalons et critères d'acceptation

Chaque jalon se termine par : tests verts, case cochée, entrée dans JOURNAL.md, commit.
Les numéros d'écran (5.x) renvoient à `docs/maquette/`.

## M0 · Socle
- [x] Squelette du dépôt, docker-compose (db, backend, frontend), `.env.example`, healthcheck `/api/health`
- Acceptation : `docker compose up -d --build` puis `curl localhost:8010/api/health` renvoie `{"status":"ok"}`

## M1 · Modèle de données
- [x] Tables : users, clients, appareils (IMEI unique), reparations (numéro REP-xxxx), symptomes, pannes, historique_statuts, checklist_etapes, photos, temps_passe, pieces, compatibilites, mouvements_stock (source : manuel ou capteur), fournisseurs, offres_fournisseur, devis, factures, lignes_facture, reglements, capteurs, lectures_capteurs, outbox, audit_log
- [x] Migrations Alembic, index sur les dates, intégrité référentielle
- [x] `docs/MCD.md` avec diagramme Mermaid
- Acceptation : `alembic upgrade head` sur base vide sans erreur

## M2 · Sécurité (F-10)
- [x] Login JWT (session 8 h, option « se souvenir de ce poste » 30 jours), hash bcrypt, verrouillage après 5 échecs
- [x] RBAC centralisé, dépendance FastAPI `require_role` ; une route refusée renvoie 403 avec un message explicite (l'écran affiche l'état « Verrouillé »)
- [x] Audit log : connexions (succès et échecs), refus d'accès, écritures, corrections de stock, (dés)activation de comptes
- [x] En-têtes de sécurité, CORS restreint, rate limiting sur /auth
- Acceptation : tests pytest prouvant qu'un technicien reçoit 403 sur les routes admin

## M3 · Données synthétiques
- [ ] `ml/data/generate.py` : 18 mois d'historique, environ 1 300 réparations (la maquette annonce 1 284 interventions), saisonnalité, corrélations symptômes vers pannes plausibles, modèles fréquents (iPhone 13, iPhone 12, Galaxy S22, Galaxy S21, Redmi Note 11, Pixel 7), techniciens, fournisseurs, pièces
- [ ] Script de seed de la base, avec les deux comptes de démo
- Acceptation : base remplie, `ml/reports/data_profile.md` décrivant la distribution

## M4 · API métier
- [ ] Clients et appareils (F-01) : CRUD, IMEI validé par Luhn, pagination, tri par nom
- [ ] Dossier de réparation (F-02) : symptômes, diagnostic final, photos (2 minimum à l'accueil, stockées sur volume), chronomètre de temps passé, checklist (test de sortie obligatoire avant « Prêt à facturer »), historique des statuts
- [ ] Kanban (F-03) : statuts Reçu, En diagnostic, En réparation, Prêt, Livré ; filtres « Mes dossiers », « Priorité haute »
- [ ] Affectation et planning (5.13) : charge par technicien, capacité 7 h par jour, alerte au delà de 85 %
- [ ] Devis et facturation (5.14) : lignes, main-d'œuvre 45 € HT, TVA 20 %, statut du règlement, modes de paiement, PDF
- [ ] Stocks (F-06) : mouvements, seuils, statut En stock / Seuil bas / Rupture, bon de commande
- [ ] Fournisseurs (F-08) : offres par pièce, délai, fiabilité, comparaison
- [ ] Rapports (F-09, 5.11) : CA, marge brute, réparations, délai moyen, taux de retour, panier moyen, rentabilité par type de panne, export PDF et CSV
- [ ] Gestion des comptes (5.12) : création, désactivation, journal des accès sensibles
- Acceptation : Swagger complet, couverture tests ≥ 70 % sur `services/`

## M5 · Pipeline IA (F-04, F-05, F-07, F-11)
- [ ] Prétraitement + feature engineering (Pandas/NumPy)
- [ ] Modèle 1 diagnostic : top 3 pannes + pièces + probabilité. Comparer LogisticRegression, RandomForest, GradientBoosting contre la baseline « panne la plus fréquente par modèle d'appareil »
- [ ] Modèle 2 estimation : régression du temps de réparation + règles de prix (coût pièces + temps × taux + marge visée) ; renvoie coût, prix client, marge brute
- [ ] Modèle 3 prévision : consommation par pièce et par semaine ; comparer moyenne mobile 30 j contre régression sur lags ; quantité à commander = prévision + stock de sécurité − stock actuel
- [ ] Recommandation d'achat fournisseur (5.9) : score prix, délai, fiabilité
- [ ] Sélection automatique du meilleur modèle, sauvegarde Joblib, versionnage (`modèle v1.x`), métriques en JSON
- [ ] Endpoints `/api/ia/diagnostic`, `/api/ia/estimation`, `/api/ia/prevision`, `/api/ia/recommandation-achat`, `/api/ia/fiabilite`
- Acceptation : `ml/reports/evaluation.md` avec tableaux de métriques, chaque appel < 3 s

## M6 · IoT sécurisé (Bloc 4, écran 5.10)
- [ ] Mosquitto en MQTT/TLS (certificats auto-signés générés par script), un compte par capteur, ACL par topic
- [ ] Simulateur : capteurs de bacs de pièces (poids ou comptage) qui publient toutes les 6 h (accéléré en démo), avec anomalies injectées
- [ ] Le backend consomme les lectures, les stocke, les rapproche du stock comptable ; les lectures ne modifient jamais le stock : toute correction est un mouvement tracé et nominatif
- [ ] Les lectures alimentent le modèle 3
- Acceptation : écran 5.10 avec capteurs actifs, anomalies ouvertes, dernière remontée ; un écart injecté apparaît comme anomalie

## M7 · IA appliquée à la sécurité (Bloc 2 compétence 8, Bloc 3 compétence 4)
- [ ] Détection d'anomalies (IsolationForest) sur `audit_log` : horaires inhabituels, rafales d'échecs, refus d'accès répétés, volume d'exports anormal
- [ ] Même approche sur les lectures capteurs (capteur muet, valeurs aberrantes)
- [ ] Alertes affichées dans le journal des accès sensibles (5.12) et la cloche de notifications
- Acceptation : un brute force simulé est signalé

## M8 · Frontend fidèle à la maquette (vue web uniquement)
- [ ] Tokens (couleurs oklch, Public Sans, IBM Plex Mono, rayons, ombres) extraits de `docs/maquette/src/` vers `frontend/src/styles/tokens.css`
- [ ] Coquille : barre latérale, en-tête avec recherche globale et cloche d'alertes, menu filtré par rôle
- [ ] Les 14 écrans : 5.1 Connexion, 5.2 Tableau de bord, 5.3 Kanban, 5.4 Dossier, 5.13 Planning, 5.14 Devis et facturation, 5.6 Clients, 5.5 Fiche client, 5.7 Appareil, 5.8 Inventaire, 5.9 Fournisseurs, 5.10 Capteurs IoT, 5.11 Rapports, 5.12 Comptes
- [ ] F-11 Fiabilité des modèles : pas d'écran dédié dans la maquette, l'ajouter comme section de 5.11 dans le même style
- [ ] États Loading / Empty / Error / Verrouillé sur chaque écran, mode accessibilité
- [ ] Kanban : glisser-déposer + boutons clavier ◀ ▶
- Acceptation : captures Playwright 1440 × 900 de chaque écran dans `docs/screens/`, comparées à `docs/maquette/screens/`, écarts listés dans `docs/ECARTS_MAQUETTE.md`

## M9 · Déploiement et durcissement
- [ ] Reverse proxy Caddy en TLS, conteneurs non root, healthchecks, sauvegarde MySQL (script)
- [ ] `docs/SECURITE.md` : analyse de risques (actifs, menaces, mesures), RGPD (finalité, conservation 3 ans, droits, purge automatique)
- Acceptation : déploiement en une commande depuis un clone propre

## M10 · Livrables pour le rapport
- [ ] `docs/ARCHITECTURE.md`, `docs/GUIDE_UTILISATEUR.md` (formation des utilisateurs, Bloc 2 compétence 10)
- [ ] `docs/RNCP_MAPPING.md` : chaque compétence des blocs BC01 à BC04 → preuve concrète (fichier, capture, métrique) ou mention « couvert hors projet »

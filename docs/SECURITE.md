# Sécurité et RGPD

Périmètre : la plateforme Repar U, déployée par Docker Compose sur un VPS partagé. Ce document présente l'analyse de risques (actifs, menaces, mesures, risques résiduels) puis la conformité RGPD. Chaque mesure renvoie au code qui la met en œuvre.

## 1. Actifs à protéger

| Actif | Description | Sensibilité (D/I/C) |
|---|---|---|
| Données clients | Nom, téléphone, e-mail, ville, appareils (IMEI), historique des réparations | Moyenne / Haute / **Haute** (données personnelles) |
| Données financières | Devis, factures, règlements, marges | Moyenne / **Haute** (obligation légale) / Haute |
| Stock et achats | Pièces, mouvements, fournisseurs, prix d'achat | Haute / **Haute** (le stock fait foi) / Moyenne |
| Comptes et sessions | Comptes du personnel, empreintes bcrypt, jetons JWT | Haute / Haute / **Haute** |
| Journal d'audit | Preuve des connexions, refus, écritures et corrections | Moyenne / **Haute** (valeur probante) / Moyenne |
| Modèles d'IA | Fichiers Joblib, métriques | Moyenne / Haute (un modèle altéré fausse les décisions) / Faible |
| Flux IoT | Lectures des bacs, consignes, comptes MQTT | Haute / Haute / Moyenne |
| Secrets | `.env` : mots de passe MySQL et MQTT, secret JWT | — / — / **Critique** |

D/I/C : disponibilité, intégrité, confidentialité.

## 2. Menaces et mesures

| # | Menace (STRIDE) | Scénario | Mesures en place | Où |
|---|---|---|---|---|
| M1 | Usurpation | Brute force ou bourrage d'identifiants sur `/auth/login` | bcrypt (coût 12) ; verrouillage 15 min après 5 échecs ; limitation à 10 requêtes/min par IP (429 journalisé) ; message générique ; détection IA des rafales (LOF, M7) | `services/auth.py`, `core/middleware.py`, `services/securite.py` |
| M2 | Usurpation | Vol ou rejeu de jeton | JWT signé HS256, durée 8 h (30 j avec « se souvenir de ce poste ») ; session en base, révocable à la déconnexion et invalidée si le compte est désactivé ; HTTPS uniquement | `core/security.py`, `api/deps.py` |
| M3 | Élévation de privilèges | Un technicien appelle une route d'administration | Matrice RBAC unique ; dépendance `require_role` sur chaque route ; 403 explicite et journalisé ; l'interface affiche « Verrouillé », jamais un masquage silencieux | `core/rbac.py`, `tests/test_securite.py` |
| M4 | Altération | Correction de stock frauduleuse ou silencieuse | Mouvement obligatoirement nominatif (`par_user_id` NOT NULL) ; une lecture capteur ne modifie jamais le stock ; correction réservée à admin et responsable, journalisée `stock_correction` | `services/stocks.py`, `services/iot.py` |
| M5 | Altération | Injection SQL ou de données | ORM SQLAlchemy (requêtes paramétrées) ; validation Pydantic stricte en entrée (IMEI, téléphone, montants bornés) ; Luhn côté serveur | `schemas/*`, `services/regles.py` |
| M6 | Altération | Capteur usurpé ou falsifié | MQTT en TLS uniquement (8883, port 1883 fermé) ; un compte par capteur ; ACL limitant chaque capteur à son propre topic ; identité topic/charge vérifiée ; valeurs aberrantes détectées | `infra/mqtt/`, `services/iot.py` |
| M7 | Répudiation | « Ce n'est pas moi qui ai modifié… » | Journal d'audit : connexions (succès et échecs), refus, toute écriture (middleware), actions métier, exports | `core/audit.py`, `core/middleware.py` |
| M8 | Divulgation | Interception réseau | TLS de bout en bout côté client (Caddy sur 5180, HSTS) ; API et MySQL exposés en local seulement (`127.0.0.1`) | `infra/proxy/Caddyfile`, `docker-compose.yml` |
| M9 | Divulgation | XSS, clickjacking, fuite par l'en-tête Referer | React échappe les sorties ; CSP stricte (`default-src 'self'`, `frame-ancestors 'none'`) ; `X-Frame-Options: DENY` ; `nosniff` ; `Referrer-Policy: same-origin` ; pas de CDN externe (polices embarquées) | `infra/proxy/Caddyfile`, `core/middleware.py` |
| M10 | Divulgation | Fuite de secrets | `.env` hors dépôt (`.gitignore`), modèle `.env.example` ; aucun secret dans le code ; clé privée de la CA MQTT jamais partagée (volume séparé pour `ca.crt`) | `.env.example`, `infra/mqtt/entrypoint.sh` |
| M11 | Divulgation | Export massif de données | Export CSV sans données nominatives ; exports journalisés ; détection IA d'un volume d'export anormal | `services/pilotage.py`, `ml/anomalies.py` |
| M12 | Déni de service | Saturation de l'API ou de l'authentification | Limitation de débit sur `/auth` ; healthchecks et `restart: unless-stopped` ; temps de réponse mesurés < 3 s | `docker-compose.yml` |
| M13 | Élévation | Compromission d'un conteneur | Conteneurs applicatifs non root (UID 1000 : backend, frontend, proxy, simulateur) ; Mosquitto et MySQL sous leur propre utilisateur ; isolation réseau Compose ; aucun port privilégié | Dockerfiles |
| M14 | Perte de données | Panne disque, erreur de manipulation | Sauvegarde `mysqldump` cohérente, compressée, en mode 600, rotation sur 14 jours ; restauration testée (même nombre de lignes avant et après) | `scripts/sauvegarde-mysql.sh`, `scripts/restauration-mysql.sh` |
| M15 | Altération | Modèle d'IA dégradé ou empoisonné | Versionnage `v1.x`, métriques comparées à une baseline, sélection automatique, historique des versions (F-11) ; la suggestion est en lecture seule et c'est la décision humaine qui fait foi | `ml/train.py`, `services/ia.py` |

## 3. Matrice des risques résiduels

| Risque | Probabilité | Impact | Niveau | Action recommandée |
|---|---|---|---|---|
| Certificat TLS interne non reconnu par les navigateurs | Certaine | Faible (avertissement) | Faible | Certificat ACME dès qu'un nom de domaine est attribué |
| Secret JWT ou `.env` compromis sur le VPS | Faible | Critique | Moyen | Droits 600 sur `.env`, rotation des secrets, coffre-fort de secrets |
| Limitation de débit en mémoire (un seul worker) | Faible | Moyen | Faible | Passer à Redis si plusieurs workers |
| Sauvegardes sur le même serveur | Moyenne | Élevé | Moyen | Copie chiffrée hors site (rclone + GPG) |
| Pas d'authentification à deux facteurs | Moyenne | Élevé | Moyen | TOTP pour les comptes admin et responsable |
| Détecteur IA entraîné sur des données synthétiques | Certaine | Moyen | Moyen | Réentraînement sur l'activité réelle après quelques semaines (bouton F-11) |

## 4. RGPD

### Registre du traitement « Gestion de l'atelier »

| Rubrique | Contenu |
|---|---|
| Responsable | Repar U, 14 rue des Ateliers, 34000 Montpellier |
| Finalités | Gestion des réparations (accueil, diagnostic, suivi), devis et facturation, garantie, information du client sur l'avancement |
| Bases légales | Exécution du contrat (réparation) ; obligation légale (facturation, conservation comptable) ; intérêt légitime (sécurité du SI, journalisation) |
| Personnes concernées | Clients ; personnel de l'atelier (comptes, journal) |
| Données | Clients : nom, téléphone, e-mail (facultatif), ville, appareils et IMEI, symptômes, photos de l'appareil. Personnel : nom, e-mail professionnel, rôle, horodatage des connexions, IP. Pas de donnée sensible au sens de l'art. 9. |
| Destinataires | Personnel habilité selon son rôle (RBAC). Aucun transfert à des tiers ; SMS et e-mails simulés (`outbox`). Pas de transfert hors UE. |
| Durées de conservation | Clients : **3 ans après la dernière intervention**, puis anonymisation automatique. Factures : 10 ans (art. L123-22 du Code de commerce), avec le nom figé sur la facture. Journal d'audit : 1 an. Messages : 1 an. Sauvegardes : 14 jours. |
| Sécurité | Voir la section 2 (TLS, RBAC, bcrypt, journalisation, non-root, sauvegardes) |

### Mise en œuvre

- **Information** : mention sur la fiche client (5.5) : « Données personnelles — conservation 3 ans après la dernière intervention (registre RGPD) », avec la date de fin de conservation calculée.
- **Minimisation** :
  - e-mail facultatif ;
  - l'export CSV des rapports ne contient ni nom ni contact ;
  - les données de démonstration sont synthétiques.
- **Purge automatique** (`services/rgpd.py`, tâche quotidienne, ou `python -m app.services.rgpd`) :
  - les clients sans intervention depuis 3 ans et sans dossier ouvert sont anonymisés (nom remplacé, téléphone et e-mail effacés, IMEI remplacé par un identifiant technique) ;
  - le journal d'audit et les messages de plus d'un an sont supprimés ;
  - chaque purge est journalisée (`rgpd_purge`).
- **Droits des personnes** :
  - accès et portabilité : `GET /api/clients/{id}/export-rgpd` (JSON complet, admin ou responsable, journalisé `rgpd_export`) ;
  - rectification : édition de la fiche client ;
  - effacement : `POST /api/clients/{id}/anonymiser` (admin, journalisé `rgpd_effacement`). Il est refusé tant qu'un dossier est ouvert ; les factures déjà émises sont conservées (obligation légale).
- **Concilier conservation et effacement** : la facture fige le nom du client à son émission (migration `0002`). L'anonymisation de la fiche client ne détruit donc pas une pièce comptable que la loi impose de conserver.
- **Sous-traitance** : aucun service tiers (SMS et e-mail simulés). Un futur prestataire SMS imposera un contrat au titre de l'article 28.

### Tests

`backend/tests/test_rgpd.py` vérifie :
- l'anonymisation à 3 ans ;
- l'absence d'anonymisation tant qu'un dossier est ouvert ;
- la conservation des noms sur les factures ;
- l'idempotence de la purge ;
- les droits d'accès et d'effacement, avec leur contrôle de rôle.

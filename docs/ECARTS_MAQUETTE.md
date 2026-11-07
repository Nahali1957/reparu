# Écarts avec la maquette

Les captures de l'application sont dans `docs/screens/`, en 1440 × 900 et en rôle Administrateur (sauf mention). Celles de la maquette sont dans `docs/maquette/screens/`.

Pour régénérer les captures : `docker compose --profile tests run --rm e2e`. La commande lance Playwright dans l'image officielle `mcr.microsoft.com/playwright`, car Chromium ne peut pas tourner sur l'hôte (bibliothèques système absentes, pas de `sudo`).

## Écarts généraux

| Sujet | Maquette | Application | Raison |
|---|---|---|---|
| Captures de référence | 1122 × 872 (cadre navigateur réduit), sans données (`data.js` absent) | 1440 × 900, données synthétiques réelles | La comparaison porte sur la structure, les libellés et le style ; les volumes ne sont pas comparables (D-A0, D-C4). |
| Mode accessibilité | Bouton du panneau de démonstration | Bouton « ◑ Mode accessibilité » dans l'en-tête, persisté par poste | Le panneau de démonstration n'existe pas dans l'application. |
| Couleurs des statuts | Définies dans `data.js` (absent) | Reçu bleu ●, En diagnostic teal ◎, En réparation orange ⚙, Prêt vert ✓, Livré neutre ⤴ | Palette de la maquette, réutilisée de façon cohérente. |
| Dates figées (26/07/2026, « vs juin ») | Statiques | Calculées (date du jour, mois précédent réel) | D-B9. |
| Rôle Responsable | Fusionné dans Administrateur | Rôle distinct (sélecteur de 5.12, badge) | D-A1. |

## Écarts par écran

- **5.1 Connexion.** Conforme. Les messages d'erreur sont ceux de l'API : tentatives restantes, compte verrouillé, limitation de débit.
- **5.2 Tableau de bord.**
  - Les « Derniers dossiers clôturés » affichent le prix TTC au lieu de « +marge ».
  - Une alerte de rupture affiche « seuil · unités restantes » au lieu de « compatibilité · couverture ».
  - Ces deux écarts viennent de champs absents des schémas `ClotureOut` et `AlertePieceOut`.
- **5.3 Kanban.**
  - Les cartes affichent les alertes (SLA 48 h, attente pièce, retour garantie) au lieu de la pastille « IA nn % », absente de `CarteOut`.
  - « Nouveau dossier » est un panneau intégré (comme la maquette) ; on y choisit d'abord le client.
- **5.4 Dossier.**
  - Le chronomètre affiche « Démarrer / Arrêter » au lieu de « Pause ».
  - Ajout de la « Durée estimée » dans la valeur retenue : le devis en a besoin (main-d'œuvre = durée × 45 €).
  - Les symptômes reconnus s'affichent en pastilles.
  - Un dossier clôturé passe en lecture seule.
- **5.5 / 5.6 Clients.**
  - La colonne APPAREILS affiche « N appareil(s) » au lieu des puces marque/modèle.
  - Le sous-titre de ligne affiche `#id` au lieu de « client depuis ».
  - Ces deux écarts viennent de champs absents de `ClientLigneOut`.
  - La mention RGPD est complétée par la date de fin de conservation.
- **5.7 Appareil.** La clé de Luhn est contrôlée en direct côté client, en plus du serveur. Le message de succès devient un toast sur la fiche client.
- **5.8 Inventaire.**
  - Ajout d'un champ de recherche.
  - La prévision affiche le modèle réellement retenu (moyenne mobile 30 j) et la lecture capteur quand elle est plus basse que le stock.
- **5.9 Fournisseurs.**
  - Les offres en rupture sont grisées et exclues de la recommandation (D-B8).
  - Ajout du lien « + Ajouter une offre ».
- **5.10 Capteurs IoT.**
  - Les cartes affichent le stock comptable, la lecture et l'écart.
  - « toutes les 6 h » devient « toutes les 2 min » en démo (période accélérée, D-M6-6).
- **5.11 Rapports.**
  - Les variations sont colorées selon leur sens : rouge si défavorable (la maquette met toujours du vert).
  - « Programmer l'envoi » ne prend que les périodes prédéfinies.
  - **Ajout F-11 Fiabilité des modèles** (pas d'écran dans la maquette, D-A5).
- **5.12 Comptes.**
  - Trois rôles au lieu de deux.
  - La note de création mentionne bcrypt et la transmission du mot de passe par un canal séparé (la maquette annonçait Argon2 et un e-mail).
  - Ajout de l'encart « Alertes IA de sécurité » (M7).
- **5.13 Planning.**
  - Les taux de charge sont réels et faibles (2 à 8 %, contre 72 à 94 % sur la maquette) : le volume synthétique est d'environ 2,4 dossiers par jour pour 3 techniciens (D-M4-4).
  - Les cartes affichent les symptômes au lieu de « Hypothèse : … ».
- **5.14 Facturation.**
  - Ajout des boutons de réponse du client (envoyer, accepté, refusé) et de la raison de blocage de l'encaissement.
  - Sans dossier sélectionné, la page liste les documents récents (D-M4-11).

## Pistes d'alignement

Pour coller exactement à la maquette, il faudrait ajouter quelques champs à l'API, sans impact sur les règles métier :
- `confiance_ia` dans `CarteOut` ;
- `marge` dans `ClotureOut` ;
- compatibilité et couverture dans `AlertePieceOut` ;
- `client_depuis` et les modèles d'appareils dans `ClientLigneOut`.

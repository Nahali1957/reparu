# Maquette Repar U : comment l'utiliser

## Contenu
- `maquette.html` : export d'origine (bundle autonome). Ouvrir dans Chromium pour naviguer : rôle, écran, état.
- `src/` : sources décompressées, lisibles. Un fichier par groupe d'écrans :
  - `Repar-Coeur.dc.html` : 5.1 Connexion, 5.2 Tableau de bord, 5.3 Kanban, 5.4 Dossier de réparation
  - `Repar-Gestion.dc.html` : clients, fiche client, appareil
  - `Repar-Stocks.dc.html` : inventaire, fournisseurs, capteurs IoT
  - `Repar-Pilotage.dc.html` : rapports, gestion des comptes
  - `Repar-Extra.dc.html` : affectation & planning, devis & facturation
  - `Repar-Etats.dc.html` : états Loading / Empty / Error / Verrouillé
  - `index.template.html` : coquille, navigation, légende, logique et jeux de données de démo
- `screens/*.png` : capture de la vue web de chaque écran (rôle Administrateur, état nominal). Les graphiques sont vides sur les captures car les données de démo sont générées côté navigateur ; se référer au code source pour leur forme.
- `textes_ecrans.txt` : tous les libellés de chaque écran (à reprendre mot pour mot).

## Règles de reproduction
- Format source : HTML à styles inline + balises de template (`sc-if`, `sc-for`, `{{ }}`). Ce n'est PAS du React : le traduire en composants React/TS, ne pas le copier tel quel.
- Couleurs en `oklch(...)` : les centraliser dans `frontend/src/styles/tokens.css` (variables CSS) en reprenant les valeurs exactes.
- Polices : Public Sans (texte) et IBM Plex Mono (libellés, chiffres, sur-titres).
- Seule la vue **Web 1440 × 900** est à produire. Ignorer tout le cadre mobile, le panneau de sélection de rôle/écran/état et le badge « Made with ».
- Les quatre états (Loading, Empty, Error, Verrouillé) font partie de la maquette : chaque page doit les gérer.
- « Verrouillé » = refus explicite affiché quand le rôle n'a pas le droit, jamais un masquage silencieux.
- Le « Mode accessibilité » existe dans la maquette : le reproduire (contraste renforcé, tailles plus grandes). Il sert la compétence accessibilité du Bloc 1.
- Codes couleur imposés : stock (En stock / Seuil bas / Rupture), confiance IA (≥ 80 % haute, 50 à 79 % moyenne, < 50 % indéterminée, jamais de rouge).

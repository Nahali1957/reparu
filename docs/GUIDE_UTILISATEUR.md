# Guide utilisateur Repar U

Ce guide sert de support de formation pour le personnel de l'atelier. Adresse : **https://\<serveur\>:5180**.

> Version de démonstration : toutes les données (clients, réparations, stock) sont **fictives**. Comptes de démonstration : `l.marchand@reparu.fr` (technicien), `c.vasseur@reparu.fr` (administratrice). Le mot de passe est communiqué par l'administrateur.

## 1. Se connecter

1. Saisir son e-mail professionnel et son mot de passe.
2. Cocher **« Se souvenir de ce poste (30 jours) »** uniquement sur un poste personnel de l'atelier. Sinon, la session dure 8 h.
3. Après **5 erreurs**, le compte est verrouillé 15 minutes. En cas d'oubli, cliquer sur « Mot de passe oublié ? » : l'administrateur est prévenu.
4. Pour terminer : **⏻ Se déconnecter**, en bas de la barre latérale.

**Qui voit quoi ?**

| Écran | Technicien | Responsable | Administrateur |
|---|---|---|---|
| Kanban, dossiers, devis et factures, clients, appareils | ✓ | ✓ | ✓ |
| Inventaire | lecture seule | ✓ | ✓ |
| Tableau de bord, planning, fournisseurs, capteurs IoT, rapports | 🔒 | ✓ | ✓ |
| Gestion des comptes, journal des accès sensibles | 🔒 | 🔒 | ✓ |

Un écran marqué 🔒 affiche **« Accès non autorisé »**, avec des raccourcis utiles. La tentative est journalisée : ce n'est pas une erreur.

**Mode accessibilité** (bouton ◑ en haut) : contraste renforcé et textes plus grands. Le réglage est mémorisé sur le poste.

## 2. Accueillir un appareil

1. **Liste des clients** → rechercher le client, ou **+ Ajouter un client** (téléphone au format 06 12 34 56 78).
2. Sur la fiche client : **+ Appareil**. Saisir la marque, le modèle et l'**IMEI** (`*#06#` sur le téléphone, 15 chiffres). Un IMEI erroné est refusé (contrôle de Luhn), et un IMEI déjà connu indique son propriétaire.
3. **Kanban** → **+ Nouveau dossier** : choisir le client et l'appareil, décrire les symptômes (15 caractères minimum) et la priorité. L'aperçu de diagnostic s'affiche pendant la saisie.
4. Dans le dossier : **📷 Ajouter une photo** → *État général*, puis *Zone endommagée*. **Ces deux photos sont obligatoires** pour démarrer le diagnostic : elles protègent l'atelier en cas de litige.
5. **🏷 Imprimer l'étiquette** et la coller sur l'appareil.

## 3. Diagnostiquer avec l'assistant IA

1. Dans le dossier, cliquer sur **🧠 Lancer le diagnostic assisté**.
2. Lire la **Suggestion IA** : trois pannes probables, avec les pièces compatibles et leur stock.
   - **Confiance haute** (vert, ≥ 80 %) : hypothèse très probable.
   - **Confiance moyenne** (orange, 50 à 79 %) : à confirmer par un test.
   - **Confiance indéterminée** (gris, < 50 %) : diagnostic manuel nécessaire.
3. **L'IA propose, vous décidez.** « Reprendre cette hypothèse » remplit le diagnostic final et les montants, que vous pouvez **modifier** : seule la **valeur retenue** fait foi pour le devis.
4. Renseigner la **durée estimée** : la main-d'œuvre est facturée 45 € HT de l'heure.

À savoir : en démonstration, les modèles ont appris sur des données fictives. Leur fiabilité réelle s'affiche dans **Rapports › Fiabilité des modèles**, et sera mesurée sur l'activité réelle de l'atelier.

## 4. Suivre la réparation (Kanban)

- Déplacer une carte d'une colonne à la fois, par glisser-déposer ou avec les boutons **◀ ▶** (au clavier : Tab puis Entrée).
- Si un déplacement est refusé, le message explique pourquoi :
  - pas de diagnostic sans les 2 photos ;
  - pas d'intervention sans réponse du client au devis ;
  - pas de passage à **« Prêt »** sans le **test de sortie** coché ;
  - pas de restitution sans règlement encaissé.
- **◷ Temps passé** : Démarrer ou Arrêter le chronomètre pendant l'intervention.
- **Pièces engagées** : « + Ajouter » retire la pièce du stock, à votre nom.
- **✉ Notifier le client (SMS)** : message adapté au statut. En démonstration, les envois sont simulés.

## 5. Devis et encaissement

1. Dans le dossier, cliquer sur **Éditer le devis**. Le devis reprend la valeur retenue (pièces, main-d'œuvre, forfait diagnostic offert, TVA 20 %).
2. **Envoyer le devis par SMS**, puis noter la réponse : **Accepté** ou **Refusé**.
3. Une fois la réparation **Prête** : choisir le mode (Carte, Espèces, Virement, 3 fois), puis **Encaisser**. La facture est créée (numéro FA-AAAA-NNNN).
4. Remettre l'appareil avec le **bon de restitution** à signer, puis passer le dossier en **Livré**.

## 6. Stock, fournisseurs et capteurs (responsable, administrateur)

- **Inventaire.** Codes couleur : ● En stock, ▲ Seuil bas, ■ Rupture.
  - **± Correction** : quantité et motif obligatoires, tracés à votre nom.
  - **⇄ Générer un bon de commande** : regroupe les pièces sous le seuil par meilleur fournisseur ; envoyer, puis réceptionner à la livraison.
  - **Prévision de consommation** : quantité conseillée = prévision sur 30 jours + stock de sécurité − stock.
- **Fournisseurs.** La recommandation pondère le prix (50 %), le délai (25 %) et la fiabilité (25 %). Les offres en rupture sont exclues.
- **Capteurs IoT.** Les bacs remontent leur niveau. Un **écart**, un **capteur muet** ou une **lecture atypique** ouvre une anomalie.
  - **Vérifier et corriger le stock** : recompter le bac physiquement, puis saisir le nombre réel.
  - **Ignorer (faux positif)** : si le capteur s'est trompé.
  - Le capteur ne modifie **jamais** le stock tout seul.

## 7. Pilotage (responsable, administrateur)

- **Tableau de bord.**
  - Réparations, marge, ruptures et délai moyen sur la période choisie.
  - Dossiers qui dépassent **48 h** ; au-delà de 85 % de charge, reprogrammer les dépôts non urgents.
- **Affectation & planning.** Sélectionner un dossier puis un technicien, ou utiliser le menu de la carte.
- **Rapports.** Six indicateurs, rentabilité par type de panne, export **PDF/CSV**, **Programmer l'envoi** (chaque lundi à 8 h).
- **Fiabilité des modèles.** Score de chaque modèle comparé à une règle simple, version en service, bouton **Réentraîner**.

## 8. Administration (administrateur)

- **Gestion des comptes.** Créer un compte (e-mail @reparu.fr, mot de passe provisoire d'au moins 10 caractères, à transmettre par un canal séparé) ; désactiver un compte quand une personne quitte l'atelier.
- **Journal des accès sensibles.** Connexions, refus, corrections de stock, exports.
- **Alertes IA de sécurité.** Rafales d'échecs de connexion, activité nocturne, exports massifs… Classer chaque alerte en **Traitée** ou **Faux positif**.
- **RGPD.** Les données d'un client sont anonymisées automatiquement 3 ans après sa dernière intervention. Sur demande du client : export de ses données (`/api/clients/{id}/export-rgpd`) ou effacement (anonymisation). Les factures restent conservées 10 ans, comme la loi l'impose.

## 9. Que faire si…

| Situation | Action |
|---|---|
| « Impossible de charger… » | Cliquer sur **Réessayer**. Si le problème persiste, **Signaler l'incident** (le code HTTP est fourni). |
| Compte verrouillé | Attendre 15 minutes, ou demander à l'administrateur. |
| Pièce en rupture au moment de réparer | Fournisseurs → **Commander chez…**. Le dossier sort du calcul des 48 h tant qu'il attend la pièce. |
| Le navigateur signale un certificat non reconnu | Normal en démonstration (certificat interne) : l'accepter une fois sur le poste. |

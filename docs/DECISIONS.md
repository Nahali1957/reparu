# Décisions

Format : date · question · choix · raison. Les décisions D-A*, D-B* et D-C* ont été validées par le porteur du projet le 2026-11-07 (cadrage avant M0).

## Cadrage (2026-11-07)

| Réf | Question | Choix | Raison |
|---|---|---|---|
| D-A1 | Le cahier des charges prévoit 3 rôles, mais la maquette a fusionné « Responsable » dans « Administrateur ». | 3 rôles en back. `responsable` = droits `admin` moins « Gestion des comptes ». Le libellé « Responsable » est ajouté au sélecteur de 5.12. | Le cahier des charges (F-10) et CLAUDE.md priment pour les rôles. |
| D-A2 | Le cahier des charges dit « dashboard accessible à tout l'atelier », la maquette le réserve à l'admin. | Le technicien voit « Verrouillé » sur 5.2, 5.9, 5.10, 5.11, 5.12 et 5.13. | La maquette fait foi pour les écrans. |
| D-A3 | « Responsive, ordinateur et tablette » (cahier des charges) contre « 1440 px uniquement » (CLAUDE.md). | Mise en page conçue pour 1440, avec des grilles fluides jusqu'à 1280 px. Rien en dessous. | Compromis le plus simple. |
| D-A4 | IoT, MQTT, Caddy, outbox et sécurité par IA sont absents du cahier des charges. | Conservés comme extension de périmètre. | Ils sont demandés par PLAN.md (Blocs 2 à 4 RNCP). |
| D-A5 | F-11 n'a pas d'écran. | Section en bas de 5.11. | PLAN.md M8. |
| D-A6 | Le schéma des flux du cahier des charges est absent du kit. | Recréé en Mermaid dans ARCHITECTURE.md. | Image manquante. |
| D-A0 | Le fichier `data.js` de la maquette est absent : les captures sont vides. | Champs et règles déduits du code des templates. Les données de démo sont générées par `ml/data/generate.py`. | Aucune autre source disponible. |
| D-B1 | Statuts : « Prêt à facturer », « Clôturé », et des définitions d'« ouvert » qui varient. | 5 statuts (`recu`, `en_diagnostic`, `en_reparation`, `pret`, `livre`). « Clôturé » = `livre`. Un dossier est **ouvert** tant qu'il n'est pas `livre`. Le SLA 48 h exclut `pret` et `livre`. | Cahier des charges F-03 et texte de 5.2. |
| D-B2 | Le test de sortie, les 2 photos et le Luhn ne sont pas contrôlés dans la maquette. | Contrôlés côté serveur (422 avec message explicite). Une checklist persistée par dossier. | Règles visibles de la maquette, CLAUDE.md. |
| D-B3 | Trois formules de prix incompatibles. | MO = durée estimée × 45 € HT. Prix conseillé HT = coût pièces × (1 + marge visée) + MO, avec une marge visée paramétrable (0,90). Montants stockés HT, TTC calculé avec la TVA à 20 %. | Une règle unique et cohérente (modèle 2). |
| D-B4 | Les définitions de marge diffèrent entre 5.4 et 5.14. | Marge brute = HT − pièces. Marge nette = HT − pièces − MO valorisée. | Cohérence entre les écrans. |
| D-B5 | Les numéros DV et FA sont dérivés du numéro REP. | Séquences annuelles indépendantes `DV-AAAA-NNNN` et `FA-AAAA-NNNN`. | Numérotation continue obligatoire pour les factures. |
| D-B6 | L'encaissement n'est conditionné à rien, et le mode de paiement est ignoré. | Encaissement possible seulement avec un devis accepté et un dossier `pret`. Le mode est enregistré. Le passage à `livre` se fait par le Kanban. | Cohérence du parcours. |
| D-B7 | Le technicien voit les marges et peut encaisser. | Conservé. | La maquette fait foi. |
| D-B8 | La recommandation fournisseur se limite au moins cher, rupture comprise. | Score pondéré prix / délai / fiabilité, offres en rupture exclues. | PLAN.md M5. |
| D-B9 | Dates figées (26/07/2026, « vs juin »). | Tout est calculé à partir de la date du jour. | Application réelle. |
| D-B10 | Libellés divergents (« Ce mois » / « Mois en cours », source capteur). | Libellés gardés par écran ; une seule valeur en base (`manuel`, `capteur`). | La maquette fait foi. |
| D-B11 | Le compteur « Ruptures imminentes » est plafonné à 3. | Compte toutes les pièces `stock ≤ seuil` ; la liste affiche 3 lignes. | Bug de la maquette. |
| D-B12 | Deux formules pour la barre de stock. | `stock / (seuil × 1,6)`, plafonnée à 100 %. | Uniformité. |
| D-B13 | La capacité du planning est statique. | Charge = Σ durées estimées des dossiers ouverts affectés ce jour ÷ (7 h × nombre de techniciens actifs). | Règle 7 h / 85 % de la maquette. |
| D-B14 | Des actions n'ont ni écran ni handler. | Implémentées au minimum : modales, `outbox`, PDF WeasyPrint. | Parcours complets. |
| D-B15 | « Mes dossiers » est codé en dur. | Filtre `tech_id = utilisateur courant` ; le technicien voit tout l'atelier par défaut. | Comportement de la maquette. |
| D-B16 | « 1 284 interventions » et « modèle v1.4 » sont codés en dur. | Lus dynamiquement. | Données réelles du modèle actif. |
| D-C1 | Les ports 80 et 443 sont déjà pris sur le VPS. | Caddy en HTTPS sur 5180 (`tls internal`) ; API sur `127.0.0.1:8010`. | Ne pas gêner les autres projets. |
| D-C2 | PLAN M1 ne prévoit pas toutes les tables nécessaires. | Ajout de : sessions, modeles_appareil, reparation_symptomes, reparation_pannes, diagnostics_ia, reparation_pieces, lignes_devis, bons_commande, lignes_bon_commande, anomalies, modeles_ia, parametres. | Couvrir les écrans. |
| D-C3 | Pas de moyen de calculer le taux de retour. | Colonne `reparations.retour_de_id`. | KPI de 5.11. |
| D-C4 | Les captures de référence font 1122 × 872 et sont vides. | Captures Playwright en 1440 × 900 ; l'écart est noté dans ECARTS_MAQUETTE.md. | PLAN.md M8. |

## Décisions d'exécution

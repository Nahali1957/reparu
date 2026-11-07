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

| Réf | Question | Choix | Raison |
|---|---|---|---|
| D-M1-1 (2026-11-07) | Sur quelle base tourner les tests pytest ? | SQLite en mémoire, schéma créé par `Base.metadata.create_all`. Les types sont compatibles (variante `Integer` pour les ID). La conformité MySQL est vérifiée par `alembic upgrade`, `downgrade`, `check`. | Tests rapides et isolés, sans dépendre de l'état de la base de démo. |
| D-M1-2 (2026-11-07) | Le cadrage annonçait 34 tables, il y en a 35. | 35 tables (erreur de comptage dans le plan ; aucune table ajoutée hors liste). | Exactitude. |
| D-M1-3 (2026-11-07) | Quand appliquer les migrations ? | Le conteneur backend lance `alembic upgrade head` à chaque démarrage. | Déploiement en une commande. |
| D-M2-1 (2026-11-07) | Quelle durée de verrouillage après 5 échecs ? | 15 minutes, réponse 423. Le compteur est remis à zéro après chaque verrouillage ou succès. | Valeur usuelle, non précisée par les sources. |
| D-M2-2 (2026-11-07) | Comment garantir que « toute écriture » est journalisée ? | Un middleware journalise toute requête POST/PUT/PATCH/DELETE sous `ecriture` (chemin, méthode, statut HTTP, auteur). Les services ajoutent des actions métier fines (`stock_correction`, `compte_toggle`…). | Couverture garantie même si un service oublie de journaliser. |
| D-M2-3 (2026-11-07) | Comment limiter le débit sur /auth ? | Fenêtre glissante en mémoire : 10 POST par minute et par IP, réponse 429. | Un seul worker uvicorn ; pas de Redis dans la stack imposée. |
| D-M2-4 (2026-11-07) | Le responsable a-t-il accès au journal d'audit ? | Non : le journal des accès sensibles fait partie de « Gestion des comptes » (5.12). | Règle CLAUDE.md : responsable = admin sauf Gestion des comptes. |
| D-M2-5 (2026-11-07) | Que fait « Mot de passe oublié » ? | Un e-mail simulé est écrit dans `outbox`. La réponse est identique que le compte existe ou non. | Services externes simulés ; pas d'énumération de comptes. |
| D-M3-1 (2026-11-07) | Comment rendre le générateur reproductible alors que les données s'arrêtent « aujourd'hui » ? | `generate(seed=42, fin=date)` : même graine et même date de fin donnent des données identiques (test `test_reproductible`). L'état de l'atelier est photographié à 8 h le jour de fin. | Données ancrées sur la date courante (D-B9) tout en restant reproductibles. |
| D-M3-2 (2026-11-07) | Quels comptes de démo créer, et avec quel mot de passe ? | `c.vasseur` (admin) et `l.marchand` (technicien), plus `r.lambert` (responsable), `f.haddad` et `s.benali` (techniciens) et `t.aubry` (désactivé, comme dans le journal de 5.12). Mot de passe commun lu dans `DEMO_PASSWORD` (.env). | Comptes de la maquette, plus le nécessaire au planning et au RBAC ; aucun secret dans le code. |
| D-M3-3 (2026-11-07) | Une correction de stock déclenchée par un capteur porte-t-elle la source `capteur` ? | Oui : la source indique l'origine de la détection. Le mouvement reste nominatif (`par_user_id` obligatoire) et lié à l'anomalie. Les ajustements d'inventaire portent la source `manuel`. | Distinguer les deux pastilles de la maquette (◉ capteur / ✎ manuel) sans jamais laisser un capteur modifier le stock seul. |
| D-M3-4 (2026-11-07) | Quelles photos pour l'historique synthétique ? | Trois SVG génériques « photo de démonstration », écrits sur le volume `/data/photos/demo`, avec leur empreinte SHA-256. | Pas de vraies photos ; la règle des 2 clichés reste respectée en base. |
| D-M3-5 (2026-11-07) | Quand charger les données de démo ? | Au démarrage du backend, après les migrations, seulement si la base n'a aucun compte (`python -m app.seed`). Rechargement explicite avec `--reset`. | Déploiement en une commande depuis un clone propre. |
| D-M4-1 (2026-11-07) | Quand exiger les 2 photos d'accueil ? | Au passage `recu` → `en_diagnostic` (état général + zone endommagée), pas à la création du dossier. | Permet de créer le dossier puis de photographier, sans laisser le diagnostic commencer sans constat. |
| D-M4-2 (2026-11-07) | Quels garde-fous sur les autres transitions ? | Une colonne à la fois. `en_reparation` exige une réponse du client au devis. `pret` exige le test de sortie. `livre` exige une facture acquittée ou un devis refusé. Un retour sous garantie est exempté des contraintes de devis et de facture. `livre` est définitif. | Parcours de la maquette (checklist, « Prêt à facturer », étapes du règlement). |
| D-M4-3 (2026-11-07) | Que montre la colonne « Livré » du Kanban ? | Les dossiers clôturés depuis moins de 7 jours. | Sinon la colonne afficherait plus de 1 200 cartes. |
| D-M4-4 (2026-11-07) | Comment calculer la charge de la semaine (5.13) ? | Jours passés : temps réellement pointé (`temps_passe`). Aujourd'hui et la suite : durées estimées des dossiers planifiés. Le tout ÷ (7 h × techniciens actifs). Avec le volume synthétique (~2,4 dossiers par jour), les taux sont faibles (< 10 %), contre 72 à 94 % sur la maquette. | Chiffres honnêtes plutôt que gonflés ; l'écart sera noté dans ECARTS_MAQUETTE.md. |
| D-M4-5 (2026-11-07) | Quelle formule pour le score fournisseur ? | 50 % × prix min / prix + 25 % × (délai min + 1) / (délai + 1) + 25 % × fiabilité, offres en rupture exclues. | La normalisation min-max initiale rendait un écart de 2 € décisif (constaté par un test). |
| D-M4-6 (2026-11-07) | Panier moyen et contenu de l'export CSV ? | Panier moyen = CA HT ÷ factures de la période. L'export CSV contient une ligne par dossier clôturé, sans nom ni contact client. | Cohérence avec le CA HT ; minimisation RGPD des exports. |
| D-M4-7 (2026-11-07) | Les endpoints binaires ont-ils un schéma Pydantic de sortie ? | Non : les PDF, photos et CSV renvoient un fichier, documenté dans OpenAPI par son type MIME. Tous les autres endpoints ont un schéma Pydantic en entrée et en sortie. | Un fichier n'est pas un objet JSON. |
| D-M4-8 (2026-11-07) | Quel fuseau horaire ? | `TZ=Europe/Paris` pour MySQL et le backend ; une seule horloge `core.clock.maintenant()`. | Horodatages lisibles et cohérents entre la base et l'application. |
| D-M4-9 (2026-11-07) | L'acceptation du devis coche-t-elle la checklist ? | Oui, l'étape 2 « Diagnostic et devis validé client ». | Libellé de l'étape. |
| D-M4-10 (2026-11-07) | Que fait « Programmer l'envoi » (5.11) ? | Un e-mail simulé, dans `outbox` avec `programme_pour`, le lundi suivant à 8 h, pièce jointe nommée. | Services externes simulés (CLAUDE.md). |
| D-M4-11 (2026-11-07) | Que montre 5.14 depuis le menu, sans dossier sélectionné ? | `GET /api/facturation/recents` : les derniers devis et factures. | Libellé de menu « Devis & facturation ». |

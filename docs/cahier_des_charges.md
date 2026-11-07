<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>PROJET DE FIN D'ÉTUDES · MASTER 2 — EXPERT SI &amp;
SÉCURITÉ (ESIS)</strong></p>
<p><strong>CAHIER DES CHARGES</strong></p>
<p><strong>Plateforme intelligente &amp; sécurisée d'aide à la
décision</strong></p>
<p>Gestion et optimisation d'un atelier de réparation de
smartphones</p></td>
</tr>
</tbody>
</table>

**Étudiant :** Nahali Mohamed **Entreprise :** Repar U (alternance)
**Année :** 2026 – 2027

|                          |                                                                                        |
|--------------------------|----------------------------------------------------------------------------------------|
| **Domaine**              | Réparation de smartphones — aide à la décision                                         |
| **Type de projet**       | Application web Full-Stack + Intelligence Artificielle (SI sécurisé)                   |
| **Entreprise d'accueil** | Repar U — alternance                                                                   |
| **Utilisateurs cibles**  | Techniciens · Administrateur                                                           |
| **Technologies**         | React + TypeScript · Python (FastAPI) · MySQL · Pandas · NumPy · Scikit-learn · Docker |
| **Sécurité**             | Authentification JWT · rôles (RBAC) · chiffrement TLS · journalisation                 |
| **Niveau**               | RNCP 39394 — Expert en Systèmes d'Information et Sécurité — Niveau 7                   |

|       |                              |
|-------|------------------------------|
| **1** | **Contexte & problématique** |

Repar U est un atelier spécialisé dans la réparation et la vente de
smartphones : accueil des clients, diagnostic des appareils, réparation,
gestion des pièces détachées et des fournisseurs, suivi des
interventions et vente d'accessoires. Aujourd'hui, ces décisions
reposent surtout sur l'expérience des techniciens et sur des traitements
manuels, ce qui entraîne des diagnostics inégaux, des ruptures de
pièces, des devis peu homogènes et une rentabilité difficile à suivre.

La problématique est la suivante : **comment assister le diagnostic des
pannes, fiabiliser l'estimation des prix et anticiper les besoins en
pièces**, tout en sécurisant les données de l'atelier ? L'objectif est
de passer d'une gestion réactive et intuitive à un pilotage appuyé sur
la donnée et l'intelligence artificielle.

<table>
<colgroup>
<col style="width: 0%" />
<col style="width: 99%" />
</colgroup>
<tbody>
<tr class="odd">
<td></td>
<td><p><strong>En bref</strong></p>
<p>La plateforme centralise clients, appareils et réparations dans une
base unique, exploite l'historique via un pipeline d'IA, puis restitue
diagnostics, estimations et alertes de stock au sein d'un tableau de
bord web accessible à tout l'atelier.</p></td>
</tr>
</tbody>
</table>

|       |                         |
|-------|-------------------------|
| **2** | **Objectifs du projet** |

La solution vise à assister la prise de décision au quotidien. Elle
répond à quatre objectifs opérationnels, présentés par ordre de priorité
:

1\. Assister le diagnostic des pannes (objectif principal) — à partir
des symptômes observés et de l'historique des interventions, proposer
automatiquement les pannes les plus probables et les pièces à prévoir,
avec un score de confiance. La décision finale reste au technicien.

2\. Fiabiliser l'estimation des prix — calculer un coût, un prix
conseillé et une marge à partir du prix des pièces, du temps de
réparation et de la marge visée, pour des devis rapides et cohérents.

3\. Anticiper les besoins en pièces — prévoir la consommation à partir
de l'historique afin d'éviter ruptures et sur-stockage.

4\. Piloter l'activité — suivre chiffre d'affaires, marges, pannes
fréquentes et rentabilité pour éclairer les décisions du responsable.

|       |                           |
|-------|---------------------------|
| **3** | **Périmètre fonctionnel** |

Le périmètre se décline en fonctionnalités identifiées par un code
(F-xx). Elles couvrent l'ensemble du cycle, de l'accueil du client
jusqu'au pilotage de l'activité.

| **Réf.** | **Fonctionnalité**      | **Description**                                                                                                             |
|----------|-------------------------|-----------------------------------------------------------------------------------------------------------------------------|
| **F-01** | Clients & appareils     | Fiches clients, historique des appareils déposés et suivi des interventions par client.                                     |
| **F-02** | Dossier de réparation   | Dossier lié au client et à l'appareil : symptômes, diagnostic, pièces, coût et numéro de suivi unique.                      |
| **F-03** | Suivi Kanban            | Statuts (Reçu, En diagnostic, En réparation, Prêt, Livré) et affectation des techniciens.                                   |
| **F-04** | Diagnostic assisté (IA) | Estimation des pannes probables et des pièces associées à partir des symptômes et de l'historique, avec score de confiance. |
| **F-05** | Estimation des prix     | Calcul du coût, du prix conseillé et de la marge selon le prix des pièces, le temps de réparation et la marge visée.        |
| **F-06** | Stocks & alertes        | Suivi des pièces, mouvements de stock et alertes de rupture par seuil et code couleur.                                      |
| **F-07** | Prévision des besoins   | Estimation des quantités de pièces à commander à partir de l'historique de consommation.                                    |
| **F-08** | Fournisseurs            | Catalogue des fournisseurs, prix des pièces et comparaison des offres.                                                      |
| **F-09** | Tableau de bord         | CA, marges, nombre de réparations, consommation des pièces et indicateurs d'activité.                                       |
| **F-10** | Sécurité & accès        | Authentification JWT et rôles Administrateur / Responsable / Technicien (RBAC).                                             |
| **F-11** | Fiabilité des modèles   | Indicateurs de fiabilité des prédictions pour informer l'utilisateur du niveau de confiance.                                |

|       |                                                        |
|-------|--------------------------------------------------------|
| **4** | **Pipeline de traitement & Intelligence Artificielle** |

Le traitement suit cinq étapes, de la collecte des données jusqu'à la
restitution des recommandations. Le cœur du système est un pipeline d'IA
intégré au backend FastAPI.

<table>
<colgroup>
<col style="width: 0%" />
<col style="width: 99%" />
</colgroup>
<tbody>
<tr class="odd">
<td></td>
<td><p><strong>ÉTAPE 01 · Collecte &amp; stockage</strong></p>
<p><strong>Accueil et enregistrement des données</strong></p></td>
</tr>
</tbody>
</table>

Dès la réception, le technicien enregistre le client, le modèle de
l'appareil et les symptômes constatés. Ces informations, avec
l'historique des interventions, sont stockées de façon structurée dans
une base MySQL — matière première de toute l'analyse.

<table>
<colgroup>
<col style="width: 0%" />
<col style="width: 99%" />
</colgroup>
<tbody>
<tr class="odd">
<td></td>
<td><p><strong>ÉTAPE 02 · Analyse</strong></p>
<p><strong>Traitement et calcul des indicateurs</strong></p></td>
</tr>
</tbody>
</table>

Le système extrait les indicateurs utiles : pannes fréquentes, temps
moyen de réparation, coût des pièces, consommation des stocks et
rentabilité par intervention. Les données brutes deviennent des
informations exploitables.

<table>
<colgroup>
<col style="width: 0%" />
<col style="width: 99%" />
</colgroup>
<tbody>
<tr class="odd">
<td></td>
<td><p><strong>ÉTAPE 03 · Préparation IA</strong></p>
<p><strong>Feature engineering</strong></p></td>
</tr>
</tbody>
</table>

Les données sont transformées en variables explicatives : type
d'appareil, catégorie de symptômes, saisonnalité de la demande et
tendances récentes de consommation. La qualité de ces variables
conditionne la précision des recommandations.

<table>
<colgroup>
<col style="width: 0%" />
<col style="width: 99%" />
</colgroup>
<tbody>
<tr class="odd">
<td></td>
<td><p><strong>ÉTAPE 04 · Modèles</strong></p>
<p><strong>Trois modèles d'intelligence artificielle</strong></p></td>
</tr>
</tbody>
</table>

Le cœur du système repose sur trois modules complémentaires. Plusieurs
algorithmes sont évalués pour chacun afin de retenir automatiquement le
plus performant selon les données de l'atelier.

<table>
<colgroup>
<col style="width: 7%" />
<col style="width: 67%" />
<col style="width: 25%" />
</colgroup>
<tbody>
<tr class="odd">
<td><strong>1</strong></td>
<td><p><strong>Diagnostic intelligent des pannes</strong></p>
<p>Analyse les symptômes et l'historique pour classer les pannes
probables et les pièces à prévoir, avec un score de confiance.</p></td>
<td><p><strong>ALGORITHME</strong></p>
<p>Scikit-learn — classification</p></td>
</tr>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 7%" />
<col style="width: 67%" />
<col style="width: 25%" />
</colgroup>
<tbody>
<tr class="odd">
<td><strong>2</strong></td>
<td><p><strong>Estimation du coût et du prix</strong></p>
<p>Calcule un coût estimé, un prix conseillé et la marge attendue pour
des devis rapides et cohérents.</p></td>
<td><p><strong>ALGORITHME</strong></p>
<p>Régression + règles métier</p></td>
</tr>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 7%" />
<col style="width: 67%" />
<col style="width: 25%" />
</colgroup>
<tbody>
<tr class="odd">
<td><strong>3</strong></td>
<td><p><strong>Prévision des besoins en pièces</strong></p>
<p>Anticipe les quantités à commander par période pour éviter ruptures
et sur-stockage.</p></td>
<td><p><strong>ALGORITHME</strong></p>
<p>Séries temporelles</p></td>
</tr>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 0%" />
<col style="width: 99%" />
</colgroup>
<tbody>
<tr class="odd">
<td></td>
<td><p><strong>ÉTAPE 05 · Restitution</strong></p>
<p><strong>Affichage des résultats</strong></p></td>
</tr>
</tbody>
</table>

Les résultats sont centralisés dans un tableau de bord web simple,
accessible depuis tout navigateur et lisible sans compétence technique :

| **Section du tableau de bord** | **Ce que l'utilisateur voit**                                          |
|--------------------------------|------------------------------------------------------------------------|
| Diagnostic assisté             | Pannes probables, pièces suggérées et niveau de confiance.             |
| Estimation de la réparation    | Coût, prix conseillé et marge, à valider ou ajuster par le technicien. |
| Suivi des réparations          | Avancement de chaque dossier sur un tableau Kanban.                    |
| Stocks & alertes               | Niveau des pièces, ruptures imminentes et quantités à commander.       |
| Performances                   | CA, marges, nombre de réparations et pannes les plus fréquentes.       |
| Fiabilité                      | Indicateurs de fiabilité des modèles d'IA.                             |

|       |                                  |
|-------|----------------------------------|
| **5** | **Exigences non fonctionnelles** |

| **Critère**    | **Exigence**               | **Solution technique**                                                                        |
|----------------|----------------------------|-----------------------------------------------------------------------------------------------|
| Performance    | Réponse \< 3 secondes      | Indexation MySQL sur les dates, requêtes optimisées, pré-calcul des indicateurs côté serveur. |
| Sécurité       | Données et accès protégés  | JWT, contrôle d'accès par rôles (RBAC), chiffrement TLS et journalisation des actions.        |
| Fiabilité      | Erreurs gérées proprement  | Gestion des exceptions, validation Pydantic en entrée, messages d'erreur clairs.              |
| Portabilité    | Local et production        | Conteneurisation Docker Compose : déploiement en une commande, en local ou sur le cloud.      |
| Maintenabilité | Code structuré & documenté | Architecture modulaire, documentation Swagger et scripts de migration.                        |
| Expérience     | Interface simple           | Design épuré, libellés clairs, graphiques lisibles, compatible ordinateur et tablette.        |

|       |                                 |
|-------|---------------------------------|
| **6** | **Architecture & technologies** |

L'application suit une architecture 3-tiers : une interface React
(présentation), un backend FastAPI intégrant le pipeline d'IA (métier),
et une base MySQL (données). L'ensemble est conteneurisé avec Docker
Compose.

| **Couche**            | **Technologie**                    | **Rôle dans le projet**                                                         |
|-----------------------|------------------------------------|---------------------------------------------------------------------------------|
| Interface             | React 18 + TypeScript + Vite       | Tableau de bord web interactif et responsive, composants réutilisables.         |
| Graphiques            | Recharts                           | Courbes (CA, réparations), histogrammes (pannes) et tableaux de suivi.          |
| Appels API            | HTTP REST + Axios                  | Communication sécurisée front ↔ back (JSON, JWT).                               |
| Backend & IA          | Python 3.11 + FastAPI (Uvicorn)    | API REST, règles métier et pipeline d'intelligence artificielle.                |
| Traitement données    | Pandas + NumPy                     | Nettoyage, agrégation et feature engineering des historiques.                   |
| Base de données       | MySQL 8                            | Stockage des clients, appareils, réparations, pièces, fournisseurs et factures. |
| Lien BDD ↔ code       | SQLAlchemy                         | ORM : interaction avec MySQL sans SQL brut et gestion des migrations.           |
| Modèle 1 — Diagnostic | Scikit-learn (classification)      | Estimation des pannes probables à partir des symptômes.                         |
| Modèle 2 — Estimation | Scikit-learn (régression) + règles | Calcul du coût, du prix conseillé et de la marge.                               |
| Modèle 3 — Stocks     | Scikit-learn / séries temporelles  | Prévision des besoins en pièces détachées.                                      |
| Sauvegarde modèles    | Joblib                             | Sérialisation des modèles entraînés (.pkl) pour rechargement rapide.            |
| Sécurité              | JWT · RBAC · TLS                   | Authentification, contrôle d'accès par rôle et chiffrement des échanges.        |
| Documentation         | Swagger / OpenAPI                  | Documentation interactive et test des points de terminaison de l'API.           |
| Déploiement           | Docker + Docker Compose            | Frontend, backend (FastAPI) et MySQL lancés ensemble.                           |

|       |                                                   |
|-------|---------------------------------------------------|
| **7** | **Correspondance avec le référentiel RNCP 39394** |

| **Bloc RNCP**           | **Compétence**           | **Mise en œuvre dans ce projet**                                               |
|-------------------------|--------------------------|--------------------------------------------------------------------------------|
| Bloc 1 — Pilotage SI    | Pilotage de projet SI    | Cahier des charges, architecture définie, découpage en étapes avec livrables.  |
| Bloc 1 — Pilotage SI    | Analyse des besoins      | Étude métier de l'atelier (diagnostic, stocks, tarification) et modélisation.  |
| Bloc 2 — Développement  | Développement Full-Stack | React (frontend) + FastAPI (backend) + MySQL : architecture 3-tiers complète.  |
| Bloc 2 — Développement  | Data Science & IA        | Pipeline complet : nettoyage, features, 3 modules de prédiction et évaluation. |
| Bloc 2 — Développement  | IA appliquée au métier   | 3 modules IA : diagnostic, estimation des prix et prévision des stocks.        |
| Bloc 3 — Infrastructure | Infrastructure IT        | Docker Compose : déploiement portable en local ou sur serveur cloud.           |
| Bloc 3 — Cybersécurité  | Sécurisation des données | JWT, RBAC, chiffrement TLS, journalisation et validation stricte des entrées.  |
| Bloc 4 — Données        | Collecte & intégration   | Stockage MySQL, historique complet des clients, appareils et réparations.      |
| Bloc 4 — Données        | Analyse & valorisation   | Pandas / NumPy : indicateurs, features IA et recommandations actionnables.     |

|       |                                       |
|-------|---------------------------------------|
| **8** | **Schéma global des flux de données** |

Le schéma ci-dessous détaille le parcours de la donnée, des acteurs de
l'atelier jusqu'au stockage MySQL, en passant par le backend FastAPI et
son pipeline d'intelligence artificielle.

<img src="media/53c52bc608ee8c6420903a66723f5a542f3868ff.png"
style="width:6.29167in;height:4.47917in" />

*— Fin du cahier des charges —*

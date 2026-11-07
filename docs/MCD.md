# Modèle de données (MCD)

- Moteur : MySQL 8, InnoDB, utf8mb4.
- Source de vérité : `backend/app/models/tables.py`. La migration initiale est `backend/alembic/versions/0001_schema_initial.py`.
- Le schéma compte 35 tables, plus `alembic_version`.

## Conventions
- Toutes les tables ont une clé `id` BIGINT auto-incrémentée, ainsi que `created_at` et `updated_at`.
- Les deux tables d'association `reparation_symptomes` et `compatibilites` font exception : elles ont une clé composite.
- Montants : `DECIMAL(10,2)`, en euros **HT**. Le TTC est calculé avec la TVA de la table `parametres`.
- Clés étrangères :
  - `RESTRICT` par défaut ;
  - `CASCADE` pour les dépendances fortes (checklist, photos, lignes…) ;
  - `SET NULL` pour les auteurs et les techniciens.
- Toutes les colonnes de date et toutes les clés étrangères sont indexées (exigence de performance < 3 s).
- Les statuts métier sont des `ENUM` MySQL. Les valeurs sont listées dans `backend/app/models/enums.py`.
- Le statut de stock (En stock / Seuil bas / Rupture) n'est pas stocké : il est calculé à partir de `stock` et `seuil`.

## Diagramme

```mermaid
erDiagram
    users ||--o{ sessions : ouvre
    users ||--o{ audit_log : "trace (nullable)"
    users ||--o{ reparations : "affecté à (tech_id)"

    clients ||--o{ appareils : possède
    modeles_appareil ||--o{ appareils : "modèle de"
    clients ||--o{ reparations : "client de"
    appareils ||--o{ reparations : concerne
    reparations |o--o{ reparations : "retour de"

    reparations ||--o{ reparation_symptomes : ""
    symptomes ||--o{ reparation_symptomes : ""
    reparations ||--o{ reparation_pannes : "panne finale"
    pannes ||--o{ reparation_pannes : ""
    reparations ||--o{ diagnostics_ia : "suggestion IA"
    reparations ||--o{ historique_statuts : ""
    reparations ||--|{ checklist_etapes : "5 étapes"
    reparations ||--o{ photos : "constat"
    reparations ||--o{ temps_passe : chronomètre
    reparations ||--o{ reparation_pieces : engage
    pieces ||--o{ reparation_pieces : ""

    pieces ||--o{ compatibilites : ""
    modeles_appareil ||--o{ compatibilites : ""
    pieces ||--o{ mouvements_stock : ""
    users ||--o{ mouvements_stock : "auteur (obligatoire)"
    fournisseurs ||--o{ offres_fournisseur : propose
    pieces ||--o{ offres_fournisseur : ""
    fournisseurs ||--o{ bons_commande : ""
    bons_commande ||--|{ lignes_bon_commande : ""
    bons_commande |o--o{ mouvements_stock : "réception"

    reparations ||--o{ devis : ""
    devis ||--|{ lignes_devis : ""
    devis ||--o| factures : "devient"
    factures ||--|{ lignes_facture : ""
    factures ||--o{ reglements : ""

    pieces ||--o{ capteurs : "bac surveillé"
    capteurs ||--o{ lectures_capteurs : publie
    capteurs |o--o{ anomalies : ""
    users |o--o{ anomalies : "sécurité / traitement"
    anomalies |o--o{ mouvements_stock : "correction tracée"

    users {
        string email UK
        enum role "admin|responsable|technicien"
        bool actif
        int echecs_connexion
        datetime verrouille_jusqu
    }
    reparations {
        string numero UK "REP-NNNN"
        enum statut "recu|en_diagnostic|en_reparation|pret|livre"
        enum priorite "basse|normale|haute"
        datetime recu_le
        date planifie_le
        int duree_estimee_min
        decimal cout_pieces_retenu
        decimal prix_retenu_ht
    }
    appareils {
        char15 imei UK "Luhn"
    }
    pieces {
        string reference UK
        int stock
        int seuil
        decimal prix_achat
    }
    mouvements_stock {
        enum type "entree|sortie|ajustement"
        int qte "signée"
        enum source "manuel|capteur"
        string motif
    }
    devis {
        string numero UK "DV-AAAA-NNNN"
        enum statut "emis|accepte|refuse"
    }
    factures {
        string numero UK "FA-AAAA-NNNN"
        bool acquittee
    }
    anomalies {
        enum origine "capteur|securite"
        string type
        enum statut "ouverte|corrigee|faux_positif"
    }
```

## Tables hors diagramme
- `modeles_ia` : nom, version `v1.x`, algorithme retenu, métriques en JSON, chemin Joblib, nombre de lignes d'entraînement, `actif`. Cette table alimente F-11.
- `parametres` : couples clé / valeur. On y trouve `taux_horaire` = 45, `tva` = 0,20, `marge_visee` = 0,90, `capacite_jour_h` = 7, `seuil_charge` = 0,85, `sla_h` = 48 et `conservation_ans` = 3.
- `outbox` : SMS et e-mails simulés (canal, destinataire, corps, `programme_pour`, statut).

## Règles d'intégrité portées par le schéma
- Un appareil appartient obligatoirement à un client (FK non nulle).
- L'IMEI est unique ; sa validité (Luhn) est vérifiée par le service.
- Tout mouvement de stock a un auteur (`par_user_id` NOT NULL) et une source. Une lecture capteur ne modifie jamais `pieces.stock`.
- Les numéros `REP`, `DV`, `FA` et `BC` sont uniques.

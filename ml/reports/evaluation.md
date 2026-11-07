# Évaluation des modèles d'IA

> Évaluation réalisée sur des **données synthétiques** (`ml/data/generate.py`), pas sur l'historique réel de l'atelier. Les scores mesurent la capacité des modèles à retrouver les régularités injectées par le générateur ; ils devront être recalculés sur données réelles.

Protocole : découpage **temporel** (apprentissage sur le passé, test sur la période la plus récente : 20 % des dossiers, ou les 12 dernières semaines pour la prévision). Chaque modèle est comparé à une baseline naïve ; le meilleur algorithme selon la métrique de sélection est retenu automatiquement puis réentraîné sur tout l'historique.

## Diagnostic — classification des pannes (top 3) · modèle v1.1

Métrique de sélection : `top3_accuracy` (plus haut = meilleur). Apprentissage : 1037 lignes, test : 260 lignes.

| Algorithme | accuracy | top3_accuracy | f1_macro | duree_entrainement_s |
|---|---|---|---|---|
| baseline_panne_frequente_par_modele *(baseline)* | 0.2885 | 0.7769 | 0.0783 | 0.01 |
| logistic_regression **(retenu)** | 0.9154 | 0.9769 | 0.857 | 0.02 |
| random_forest | 0.9154 | 0.9769 | 0.8647 | 0.77 |
| gradient_boosting | 0.8808 | 0.9731 | 0.8076 | 1.53 |

Gain du modèle retenu sur la baseline (top3_accuracy) : **0.2**.

**Lecture.** Le score élevé reflète la netteté des corrélations symptômes → panne du générateur ; sur données réelles (saisie libre plus bruitée), il faut s'attendre à moins. La baseline par modèle d'appareil plafonne car le modèle d'appareil seul ne dit presque rien de la panne. L'utilisateur voit 3 hypothèses : la métrique de sélection est donc le top 3.

## Estimation — régression du temps de réparation (minutes) · modèle v1.1

Métrique de sélection : `mae_min` (plus bas = meilleur). Apprentissage : 940 lignes, test : 236 lignes.

| Algorithme | mae_min | r2 |
|---|---|---|
| baseline_mediane_par_panne *(baseline)* | 9.6 | 0.6999 |
| ridge **(retenu)** | 9.45 | 0.7153 |
| random_forest | 9.88 | 0.6822 |
| gradient_boosting | 9.75 | 0.6874 |

Gain du modèle retenu sur la baseline (mae_min) : **0.15**.

**Lecture.** Le gain sur la médiane par panne est faible : la durée dépend surtout du type de panne, déjà capté par la baseline ; le reste (technicien, aléas) n'est pas prévisible à l'accueil. L'erreur au 80e centile est affichée comme marge d'incertitude.

## Prevision — consommation hebdomadaire par pièce · modèle v1.1

Métrique de sélection : `mae` (plus bas = meilleur). Apprentissage : 3528 lignes, test : 672 lignes.

| Algorithme | mae | wape_pct | biais_pct |
|---|---|---|---|
| baseline_naive_semaine_precedente *(baseline)* | 0.3795 | 160.4 | 8.2 |
| moyenne_mobile_30j **(retenu)** | 0.3549 | 150.0 | 8.2 |
| ridge_lags | 0.3642 | 153.9 | 8.7 |
| gradient_boosting_lags | 0.3552 | 150.1 | 2.6 |

Gain du modèle retenu sur la baseline (mae) : **0.0246**.

**Lecture.** La demande par pièce et par semaine est faible et intermittente (souvent 0 ou 1) : les erreurs relatives hebdomadaires (WAPE) sont donc mécaniquement élevées pour tous les algorithmes. La décision d'achat se prend sur 30 jours avec un stock de sécurité (1,65 σ √délai), ce qui absorbe cette variabilité.

## Temps de réponse

Inférence mesurée sur l'API (base MySQL de démonstration) : voir `docs/JOURNAL.md` (M5). Exigence du cahier des charges : moins de 3 s par appel.


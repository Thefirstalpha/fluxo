# Vision

## En une phrase

Fluxo aide chacun à **comprendre et piloter son argent** — dépenses, salaires, épargne — dans une application de bureau **locale, chiffrée et agréable**, qui automatise le fastidieux (imports, catégorisation, lecture des documents) sans jamais exiger de confier ses données à un tiers.

## Le problème

Suivre ses finances sérieusement demande aujourd'hui de choisir entre :

- **des tableurs** : souples, mais tout est manuel (ressaisie, catégories, graphiques) et rien n'est contrôlé ;
- **des applications bancaires ou agrégateurs en ligne** : pratiques, mais vos relevés, vos salaires et vos habitudes de consommation vivent sur des serveurs que vous ne maîtrisez pas, souvent avec un abonnement ;
- **des logiciels de comptabilité** : complets, mais pensés pour les entreprises, lourds et austères.

Et presque aucun outil grand public ne lit vraiment un **bulletin de paie** : la différence entre brut, net, net imposable et net payé, le poids des cotisations, l'effet du taux de prélèvement à la source, la part des primes et astreintes restent opaques.

## Ce que Fluxo apporte

1. **Toutes les finances au même endroit** : comptes, transactions, salaires, épargne, crédits, budgets.
2. **L'automatisation sans la dépossession** : import des relevés, catégorisation qui apprend localement, extraction des documents ; l'IA est facultative, locale de préférence, et chaque envoi vers un service en ligne est explicite.
3. **La compréhension** : synthèses mensuelles, analyses interactives (filtres, zoom, exploration), bulletin de paie expliqué « du brut au net ».
4. **La confiance** : code ouvert, données chiffrées, contrôles de cohérence visibles, aucune télémétrie.
5. **Le plaisir d'usage** : une interface légère inspirée des éditeurs de code modernes, avec une identité visuelle « coucher de soleil sur la côte » (rose néon, orange, violet, lagon) réservée aux cadres, textes d'accent, boutons et données.

## Publics

| Public                                    | Attentes principales                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Salarié·e qui veut comprendre sa paie** | Détail du bulletin, évolution du net, impact des primes et du prélèvement à la source.           |
| **Personne qui tient son budget**         | Import simple des relevés, catégories fiables, alertes, synthèse du mois.                        |
| **Personne soucieuse de sa vie privée**   | Aucune donnée en ligne, chiffrement, transparence du code.                                       |
| **Utilisateur·rice avancé·e**             | Filtres puissants, règles, export des données, raccourcis clavier.                               |
| **Contributeur·rice**                     | Architecture claire, tests, documentation, formats bancaires et modèles de bulletins à enrichir. |

Le premier marché visé est **francophone** (bulletins de paie et formats bancaires français), avec une architecture prévue pour d'autres pays (voir [questions ouvertes](../planning/questions-ouvertes.md)).

## Principes directeurs

1. **Local d'abord.** Les données restent sur l'appareil. Toute fonctionnalité réseau (IA cloud, taux de change, mises à jour) est facultative, explicite et désactivable.
2. **Sécurité par défaut.** Le renderer est traité comme non fiable : isolé, sandboxé, sans accès Node.js, sous CSP stricte ; toute entrée est validée côté process principal ; la base est chiffrée au repos.
3. **Exactitude.** Les montants sont des entiers en centimes ; chaque calcul important (bulletin, soldes, imports) a ses contrôles de cohérence et ses tests.
4. **Légèreté.** Peu de dépendances, chargées à la demande ; aucune bibliothèque ajoutée « au cas où ». Des budgets de poids et de démarrage sont suivis.
5. **Accessibilité.** Contrastes WCAG AA, navigation clavier, chaque graphique a sa vue tableau équivalente, la couleur n'est jamais le seul porteur d'information.
6. **Réversibilité.** Import, export, annulation : l'utilisateur garde la main sur ses données et peut partir avec elles.

## Périmètre de la version 1.0

Inclus : comptes et transactions (dont épargne et comptes externes à valorisation manuelle), étiquettes transverses aux catégories, import des formats bancaires standards, catégorisation automatique, analyses et synthèses mensuelles, suivi détaillé des salaires (France), analyse de documents assistée (relevés et bulletins), crédits et patrimoine net, budgets, prévisions et simulation à long terme des comptes, installeurs signés et mises à jour automatiques, interface en français et en anglais.

## Non-objectifs

- **Pas de comptabilité d'entreprise** (bilan, TVA, liasses fiscales).
- **Pas de conseil financier ou fiscal** : Fluxo calcule, explique et alerte ; il ne recommande pas de placements.
- **Pas de serveur Fluxo obligatoire** : aucune fonctionnalité essentielle ne dépend d'un service hébergé par le projet.
- **Pas de monétisation en v1** : gratuit et libre ; un mécanisme de don est une piste possible, explicitement différée ([ADR-016](../architecture/decisions.md#adr-016--modèle-économique--gratuit-et-libre-sans-monétisation-en-v1)).
- **Pas de connexion bancaire automatique en v1** (agrégation DSP2) : intérêt confirmé pour récupérer automatiquement les dernières opérations, mais envisagée seulement après la v1, sous conditions réglementaires — l'agrément requis est une charge significative pour un projet libre (voir [M10](../planning/M10-au-dela.md)).

## Indicateurs de réussite (v1.0)

- Importer un relevé et obtenir **≥ 85 %** de transactions correctement catégorisées sans intervention, après un mois d'usage.
- Saisir ou importer un bulletin et obtenir un détail cohérent (contrôles arithmétiques au vert) en **moins de 2 minutes**.
- Démarrage à froid **< 2 s**, mémoire au repos **< 300 Mo**, installeur **< 120 Mo** (voir [performance](../architecture/performance.md)).
- Aucune vulnérabilité connue de sévérité élevée dans les dépendances embarquées au moment de chaque release.

## Glossaire

| Terme                             | Définition                                                                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Brut**                          | Rémunération totale avant cotisations sociales.                                                                                         |
| **Cotisations salariales**        | Part des cotisations sociales prélevée sur le salaire (santé, retraite, chômage, CSG/CRDS…).                                            |
| **Net à payer avant impôt**       | Brut moins cotisations salariales.                                                                                                      |
| **Net imposable**                 | Base du prélèvement à la source (inclut notamment la CSG/CRDS non déductible).                                                          |
| **Prélèvement à la source (PAS)** | Impôt sur le revenu retenu par l'employeur : taux × net imposable.                                                                      |
| **Net payé**                      | Montant effectivement viré : net avant impôt − PAS ± autres éléments (titres-restaurant, acomptes…).                                    |
| **Montant net social**            | Mention obligatoire depuis juillet 2023, utilisée pour les prestations sociales.                                                        |
| **Astreinte**                     | Période de disponibilité rémunérée hors temps de travail.                                                                               |
| **13ᵉ mois**                      | Prime annuelle conventionnelle, souvent versée en décembre.                                                                             |
| **Ventilation**                   | Répartition d'une transaction sur plusieurs catégories.                                                                                 |
| **CAMT.053**                      | Format XML ISO 20022 de relevé de compte (très répandu en Europe).                                                                      |
| **Rapprochement**                 | Vérification qu'un solde ou un virement correspond aux données attendues.                                                               |
| **Étiquette**                     | Marqueur libre posé sur une dépense, indépendant de sa catégorie, pour la retrouver transversalement (ex. « Abonnement téléphonique »). |
| **Capital restant dû**            | Part du capital d'un crédit qu'il reste à rembourser à une date donnée.                                                                 |
| **TAEG**                          | Taux annuel effectif global : coût total d'un crédit (intérêts, assurance, frais) en pourcentage annuel.                                |
| **Patrimoine net**                | Valeur des actifs (comptes, épargne, placements) moins le capital restant dû de tous les crédits.                                       |

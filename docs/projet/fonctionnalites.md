# Catalogue des fonctionnalités

Référentiel unique des fonctionnalités de Fluxo. Chaque ligne a un identifiant stable, réutilisé dans les plans de jalons.

- **Origine** : `Besoin` (besoin fondateur) · `Proposition` (ajout suggéré, à valider — détail dans [propositions](../planning/propositions.md)) · `Socle` (nécessité technique).
- **Statut** : ✅ fait · 🟡 partiel / démonstration · ⬜ à faire.

## A. Expérience & interface

| ID  | Fonctionnalité                                                                                                  | Origine     | Jalon   | Statut |
| --- | --------------------------------------------------------------------------------------------------------------- | ----------- | ------- | ------ |
| A01 | Thème clair / sombre / système, choisi dans les paramètres, appliqué sans flash au démarrage                    | Besoin      | M0      | ✅     |
| A02 | Interface légère façon éditeur de code : barre de titre intégrée, barre latérale, barre d'état                  | Besoin      | M0      | ✅     |
| A03 | Identité visuelle « Vice Sunset » : fonds neutres, accents rose/orange/violet/lagon sur cadres, textes, boutons | Besoin      | M0      | ✅     |
| A04 | Interface en français et en anglais (dictionnaires typés), architecture extensible à d'autres packs de langue   | Socle       | M0 → M9 | 🟡     |
| A05 | Masquage des montants (bouton œil, partage d'écran)                                                             | Proposition | M0      | ✅     |
| A06 | Exclusion de la fenêtre des captures d'écran                                                                    | Proposition | M0      | ✅     |
| A07 | Palette de commandes (Ctrl/⌘ K) et recherche universelle                                                        | Proposition | M2      | ✅     |
| A08 | Raccourcis clavier documentés                                                                                   | Proposition | M2      | ✅     |
| A09 | Mode démonstration (données fictives déterministes)                                                             | Proposition | M0 → M1 | ✅     |
| A10 | Accessibilité WCAG 2.2 AA (clavier, lecteurs d'écran, contrastes, mouvement réduit)                             | Socle       | M0 → M9 | 🟡     |
| A11 | Assistant de premier lancement (langue, devise, sécurité, démo ou départ vierge)                                | Proposition | M9      | ⬜     |

## B. Données, sécurité & confidentialité

| ID  | Fonctionnalité                                                        | Origine     | Jalon   | Statut |
| --- | --------------------------------------------------------------------- | ----------- | ------- | ------ |
| B01 | Base locale chiffrée au repos (SQLCipher)                             | Besoin      | M1      | ✅     |
| B02 | Déverrouillage par trousseau du système et/ou mot de passe maître     | Besoin      | M1      | ✅     |
| B03 | Verrouillage automatique (inactivité, verrouillage de session)        | Proposition | M1      | ✅     |
| B04 | Sauvegardes chiffrées automatiques, restauration                      | Proposition | M1      | ✅     |
| B05 | Export complet des données (JSON, CSV) et suppression totale          | Proposition | M1 → M9 | ✅     |
| B06 | Aucune télémétrie ; journaux locaux expurgés des données personnelles | Besoin      | M0      | ✅     |
| B07 | Historique des modifications et annulation                            | Proposition | M2      | ✅     |

## C. Comptes & transactions

| ID  | Fonctionnalité                                                                                                                                                                                                                                                        | Origine     | Jalon | Statut |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----- | ------ |
| C01 | Comptes multiples (courant, épargne, carte, espèces, titres-restaurant…)                                                                                                                                                                                              | Besoin      | M2    | ✅     |
| C02 | Saisie d'opérations sur les comptes sans relevé (espèces, titres-restaurant) ; annotation des opérations importées, jamais de saisie libre sur un compte bancaire ([ADR-026](../architecture/decisions.md#adr-026--saisie-manuelle-réservée-aux-comptes-sans-relevé)) | Besoin      | M2    | ✅     |
| C03 | Ventilation d'une transaction sur plusieurs catégories                                                                                                                                                                                                                | Besoin      | M2    | ✅     |
| C04 | Virements internes exclus des dépenses                                                                                                                                                                                                                                | Socle       | M2    | ✅     |
| C05 | Catégories hiérarchiques personnalisables (pack France par défaut)                                                                                                                                                                                                    | Besoin      | M2    | ✅     |
| C06 | Étiquettes multiples par ventilation, indépendantes des catégories, pour une corrélation transverse (ex. tous les abonnements téléphoniques)                                                                                                                          | Proposition | M2    | ✅     |
| C07 | Recherche instantanée, filtres, tri, édition en masse                                                                                                                                                                                                                 | Besoin      | M2    | ✅     |
| C08 | Multi-devises (EUR, CHF…) avec devise de référence                                                                                                                                                                                                                    | Proposition | M2    | 🟡     |
| C10 | Comptes d'épargne multiples et comptes externes à valorisation manuelle (livret, PEA, assurance-vie, immobilier)                                                                                                                                                      | Besoin      | M2    | ✅     |
| C11 | Virement vers un compte d'épargne classé comme épargne (ni dépense, ni simple virement neutre)                                                                                                                                                                        | Besoin      | M2    | ✅     |

C09 (justificatifs attachés) a été retiré : Fluxo ne stocke aucun fichier ([ADR-025](../architecture/decisions.md#adr-025--revue-des-propositions-du-24-novembre-2026)). Les identifiants retirés ne sont pas réattribués.

## D. Import des relevés bancaires

| ID  | Fonctionnalité                                                                                                       | Origine     | Jalon | Statut |
| --- | -------------------------------------------------------------------------------------------------------------------- | ----------- | ----- | ------ |
| D01 | Import CSV avec assistant de correspondance et profils par banque                                                    | Besoin      | M3    | ✅     |
| D02 | Import OFX / QFX                                                                                                     | Besoin      | M3    | ✅     |
| D03 | Import QIF                                                                                                           | Besoin      | M3    | ✅     |
| D04 | Import CAMT.053 (ISO 20022)                                                                                          | Besoin      | M3    | ✅     |
| D05 | Import MT940                                                                                                         | Proposition | M3    | ✅     |
| D06 | Détection des doublons (exacte et approchée)                                                                         | Besoin      | M3    | ✅     |
| D07 | Aperçu avant import et annulation d'un import                                                                        | Besoin      | M3    | ✅     |
| D08 | Contrôle des soldes de début et de fin de relevé                                                                     | Proposition | M3    | ✅     |
| D09 | Relevés PDF (via le pipeline documents)                                                                              | Besoin      | M7    | ⬜     |
| D10 | Analyse robuste des montants (formats FR/EN/CH, notation comptable)                                                  | Socle       | M0    | ✅     |
| D11 | Écriture d'ajustement (rattrapage) d'un écart de solde détecté, annotée, remplaçable par l'import du relevé manquant | Proposition | M3    | ✅     |

## E. Catégorisation automatique

| ID  | Fonctionnalité                                                                | Origine     | Jalon | Statut |
| --- | ----------------------------------------------------------------------------- | ----------- | ----- | ------ |
| E01 | Normalisation des libellés et des marchands                                   | Besoin      | M4    | ✅     |
| E02 | Règles personnalisables (conditions → catégorie, étiquettes, renommage)       | Besoin      | M4    | ✅     |
| E03 | Apprentissage local à partir des corrections                                  | Besoin      | M4    | ✅     |
| E04 | File « à valider » avec niveau de confiance                                   | Besoin      | M4    | ✅     |
| E05 | Détection des récurrences et abonnements                                      | Proposition | M4    | ✅     |
| E06 | Alerte de hausse de prix d'un abonnement                                      | Proposition | M4    | ✅     |
| E07 | Détection automatique des virements internes                                  | Socle       | M4    | ✅     |
| E08 | Suggestions par IA pour les marchands inconnus (facultatif)                   | Besoin      | M7    | ⬜     |
| E09 | Règles pouvant poser une ou plusieurs étiquettes, pas seulement une catégorie | Besoin      | M4    | ✅     |

## F. Analyses & synthèses

| ID  | Fonctionnalité                                                                    | Origine     | Jalon   | Statut |
| --- | --------------------------------------------------------------------------------- | ----------- | ------- | ------ |
| F01 | Tableau de bord : indicateurs du mois et variations                               | Besoin      | M0 → M5 | ✅     |
| F02 | Synthèse mensuelle détaillée                                                      | Besoin      | M5      | ✅     |
| F03 | Filtres globaux (période, comptes, catégories, étiquettes, montants)              | Besoin      | M5      | ✅     |
| F04 | Zoom, sélection de plage, exploration année → mois → catégorie → transactions     | Besoin      | M0 → M5 | ✅     |
| F05 | Infobulles détaillées et vue tableau équivalente pour chaque graphique            | Besoin      | M0      | ✅     |
| F06 | Comparaisons M-1 / N-1, moyennes glissantes                                       | Besoin      | M5      | ✅     |
| F07 | Diagramme de flux (Sankey) revenus → catégories                                   | Proposition | M5      | ✅     |
| F08 | Calendrier des dépenses (carte de chaleur)                                        | Proposition | M5      | ✅     |
| F09 | Évolution des catégories dans le temps                                            | Besoin      | M5      | ✅     |
| F10 | Export des graphiques (PNG/SVG) et des données (CSV)                              | Proposition | M5      | ✅     |
| F11 | Rapport mensuel PDF                                                               | Proposition | M5      | ✅     |
| F12 | Détection d'anomalies (dépense inhabituelle, double prélèvement, frais bancaires) | Proposition | M5      | ✅     |

## G. Salaires & bulletins de paie

| ID  | Fonctionnalité                                                                                    | Origine     | Jalon   | Statut |
| --- | ------------------------------------------------------------------------------------------------- | ----------- | ------- | ------ |
| G01 | Employeurs et contrats (statut, temps de travail)                                                 | Besoin      | M6      | ✅     |
| G02 | Bulletin détaillé : base, brut, cotisations, net avant impôt, net imposable, net social, net payé | Besoin      | M6      | ✅     |
| G03 | Éléments variables : astreintes, heures supplémentaires, 13ᵉ mois, primes, avantages              | Besoin      | M6      | ✅     |
| G04 | Prélèvement à la source : taux (%) et montant prélevé, historique des taux                        | Besoin      | M6      | ✅     |
| G06 | Cumuls annuels et contrôle avec le bulletin de décembre                                           | Besoin      | M6      | ✅     |
| G07 | Contrôles de cohérence arithmétique                                                               | Socle       | M0 → M6 | ✅     |
| G08 | Tableau de bord salaire : évolution brut/net, part variable, taux effectifs                       | Besoin      | M6      | ✅     |
| G09 | Rapprochement bulletin ↔ virement reçu                                                            | Proposition | M6      | ✅     |
| G10 | Coût employeur et cotisations patronales                                                          | Proposition | M6      | ✅     |
| G11 | Simulateur brut → net (augmentation, changement de taux)                                          | Proposition | M6      | ✅     |

G05 (congés payés et RTT) a été retiré, jugé inutile ([ADR-025](../architecture/decisions.md#adr-025--revue-des-propositions-du-24-novembre-2026)).

## H. Documents & IA

| ID  | Fonctionnalité                                                                                            | Origine     | Jalon | Statut |
| --- | --------------------------------------------------------------------------------------------------------- | ----------- | ----- | ------ |
| H01 | Boîte de dépôt de documents (glisser-déposer)                                                             | Besoin      | M7    | ⬜     |
| H02 | Extraction du texte des PDF                                                                               | Besoin      | M7    | ⬜     |
| H03 | Reconnaissance de caractères (OCR) pour les scans                                                         | Besoin      | M7    | ⬜     |
| H04 | Modèles déterministes pour les formats connus                                                             | Socle       | M7    | ⬜     |
| H05 | Extraction structurée par IA (bulletins, relevés)                                                         | Besoin      | M7    | ⬜     |
| H06 | IA locale (sans réseau)                                                                                   | Proposition | M7    | ⬜     |
| H07 | IA cloud facultative, clé personnelle, consentement par document                                          | Besoin      | M7    | ⬜     |
| H08 | Anonymisation avant tout envoi                                                                            | Socle       | M7    | ⬜     |
| H09 | Relecture côte à côte avant validation                                                                    | Socle       | M7    | ⬜     |
| H10 | Export facultatif du document original, proposé juste après l'extraction (aucune conservation par défaut) | Proposition | M7    | ⬜     |

## I. Patrimoine, crédits, budgets & prévisions

| ID  | Fonctionnalité                                                                                                    | Origine     | Jalon | Statut |
| --- | ----------------------------------------------------------------------------------------------------------------- | ----------- | ----- | ------ |
| I01 | Budgets mensuels par catégorie (montant fixe ou % des revenus)                                                    | Proposition | M8    | ⬜     |
| I02 | Alertes de dépassement (notifications locales)                                                                    | Proposition | M8    | ⬜     |
| I03 | Objectifs d'épargne avec projection                                                                               | Proposition | M8    | ⬜     |
| I04 | Calendrier des prélèvements à venir (factures, mensualités de crédit)                                             | Proposition | M8    | ⬜     |
| I05 | Prévision du solde de fin de mois, « reste à vivre »                                                              | Proposition | M8    | ⬜     |
| I06 | Défis et succès (gamification sobre)                                                                              | Proposition | M8    | ⬜     |
| I07 | Crédits (immobilier, consommation, auto, étudiant) : échéancier et tableau d'amortissement                        | Besoin      | M8    | ⬜     |
| I08 | Vue patrimoine net : actifs (comptes, épargne, placements valorisés) − passifs (capital restant dû) dans le temps | Besoin      | M8    | ⬜     |
| I09 | Rapprochement mensualité de crédit ↔ transaction                                                                  | Proposition | M8    | ⬜     |
| I10 | Alerte d'échéance de crédit et simulateur de remboursement anticipé                                               | Proposition | M8    | ⬜     |
| I11 | Valorisation manuelle périodique des actifs externes (placements, immobilier)                                     | Besoin      | M8    | ⬜     |
| I12 | Simulation à long terme des soldes (courant, épargne) : récurrences, crédits, salaire, charges futures prévues    | Proposition | M8    | ⬜     |
| I13 | Scénarios « et si » comparables (nouvel abonnement, hausse de l'énergie, fin de crédit, épargne mensuelle)        | Proposition | M8    | ⬜     |

## J. Distribution

| ID  | Fonctionnalité                                           | Origine | Jalon | Statut |
| --- | -------------------------------------------------------- | ------- | ----- | ------ |
| J01 | Intégration continue (qualité, sécurité, build multi-OS) | Besoin  | M0    | ✅     |
| J02 | Installeurs signés Windows, macOS, Linux                 | Socle   | M9    | 🟡     |
| J03 | Mises à jour automatiques vérifiées                      | Socle   | M9    | ⬜     |
| J04 | Documentation utilisateur en ligne                       | Socle   | M9    | ⬜     |

## K. Après la v1

| ID  | Fonctionnalité                                                                                        | Origine     | Jalon | Statut |
| --- | ----------------------------------------------------------------------------------------------------- | ----------- | ----- | ------ |
| K01 | Synchronisation chiffrée de bout en bout entre appareils                                              | Proposition | M10   | ⬜     |
| K02 | Connexion bancaire DSP2 via un agrégateur agréé                                                       | Proposition | M10   | ⬜     |
| K03 | Packs pays (Suisse, Belgique, Luxembourg, Québec…)                                                    | Proposition | M10   | ⬜     |
| K04 | Aide à la déclaration de revenus                                                                      | Proposition | M10   | ⬜     |
| K05 | Assistant conversationnel sur ses données (local)                                                     | Proposition | M10   | ⬜     |
| K06 | Extensions (formats, banques, pays) par la communauté                                                 | Proposition | M10   | ⬜     |
| K07 | Dépenses partagées et notes de frais à rembourser                                                     | Proposition | M10   | ⬜     |
| K08 | Cotations automatiques de placements (API boursière), en complément de la valorisation manuelle (I11) | Proposition | M10   | ⬜     |
| K09 | Mode « Foyer » : comptes et budgets partagés entre plusieurs personnes, visibilité par membre         | Proposition | M10   | ⬜     |

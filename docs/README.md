# Documentation de Fluxo

Ce dossier décrit le projet de bout en bout : ce que Fluxo veut être, comment il est construit, et dans quel ordre il sera livré. Chaque document est vivant : il est mis à jour à chaque jalon.

## Projet

| Document                                                   | Contenu                                                                       |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [Vision](projet/vision.md)                                 | Problème, publics, principes, périmètre, non-objectifs, glossaire.            |
| [Catalogue des fonctionnalités](projet/fonctionnalites.md) | Toutes les fonctionnalités, avec identifiant, origine, jalon cible et statut. |

## Planification

| Document                                                           | Contenu                                                    |
| ------------------------------------------------------------------ | ---------------------------------------------------------- |
| [Feuille de route](planning/README.md)                             | Vue d'ensemble des jalons, statuts, dépendances, versions. |
| [M0 — Fondations](planning/M0-fondations.md)                       | 🟡 En cours — socle livré, actions restantes.              |
| [M1 — Coffre-fort local](planning/M1-coffre-fort.md)               | Base chiffrée, déverrouillage, sauvegardes.                |
| [M2 — Comptes & transactions](planning/M2-comptes-transactions.md) | Registre des opérations.                                   |
| [M3 — Import des relevés](planning/M3-import-releves.md)           | CSV, OFX, QIF, CAMT.053.                                   |
| [M4 — Catégorisation automatique](planning/M4-categorisation.md)   | Règles, apprentissage local, abonnements.                  |
| [M5 — Analyses & synthèses](planning/M5-analyses.md)               | Tableaux de bord, filtres, exploration.                    |
| [M6 — Salaires & bulletins](planning/M6-salaires.md)               | Bulletin détaillé, du brut au net.                         |
| [M7 — Documents & IA](planning/M7-documents-ia.md)                 | Extraction PDF, OCR, IA locale/cloud.                      |
| [M8 — Patrimoine, crédits, budgets & prévisions](planning/M8-patrimoine-budgets.md) | Enveloppes, objectifs, crédits et amortissement, patrimoine net. |
| [M9 — Distribution v1.0](planning/M9-distribution.md)              | Installeurs signés, mises à jour, audits.                  |
| [M10 — Au-delà de la v1](planning/M10-au-dela.md)                  | Synchronisation, mobile, open banking…                     |
| [Propositions](planning/propositions.md)                           | Idées d'ajout, à valider.                                  |
| [Questions ouvertes](planning/questions-ouvertes.md)               | Décisions structurantes à prendre.                         |

## Architecture & design

| Document                                               | Contenu                                                                    |
| ------------------------------------------------------ | -------------------------------------------------------------------------- |
| [Vue d'ensemble](architecture/vue-ensemble.md)         | Stack, processus, arborescence, règles de dépendances.                     |
| [Sécurité](architecture/securite.md)                   | Modèle de menace, mesures en place et prévues, chaîne d'approvisionnement. |
| [Modèle de données](architecture/modele-de-donnees.md) | Entités cibles, règles monétaires, stockage chiffré.                       |
| [Analyse de documents & IA](architecture/ia.md)        | Pipeline d'extraction, fournisseurs, confidentialité, évaluation.          |
| [Performance & légèreté](architecture/performance.md)  | Budgets, mesures actuelles, leviers.                                       |
| [Décisions d'architecture](architecture/decisions.md)  | Journal des choix (ADR) et de leurs raisons.                               |
| [Système de design](design/systeme-de-design.md)       | Palette « Vice Sunset », typographie, composants, graphiques, logo.        |

## Conventions

- **Statuts** : ✅ fait · 🟡 en cours · ⬜ à faire · 💭 à l'étude.
- **Origine d'une tâche** : `Besoin` (besoin fondateur du projet) · `Proposition` (ajout suggéré, à valider) · `Socle` (nécessité technique).
- **Taille** (complexité relative d'un jalon) : S · M · L · XL.

# Fluxo

[![CI](https://github.com/Thefirstalpha/fluxo/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Thefirstalpha/fluxo/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Thefirstalpha/fluxo/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/Thefirstalpha/fluxo/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Thefirstalpha/fluxo/badge)](https://scorecard.dev/viewer/?uri=github.com/Thefirstalpha/fluxo)

**Vos finances personnelles, en local.** Fluxo est une application de bureau open source (Windows, macOS, Linux) pour suivre ses dépenses, comprendre ses salaires et analyser ses comptes — sans compte en ligne, sans télémétrie, avec des données chiffrées sur votre ordinateur.

> **Statut : pré-alpha (jalons M0 — Fondations et M1 — Coffre-fort local).** Le socle technique, l'interface, un tableau de bord de démonstration et le **coffre chiffré** (création, déverrouillage par la session ou un mot de passe, code de récupération, sauvegardes, restauration, export) sont en place ; la saisie et l'import de vos opérations arrivent avec les jalons M2 et M3. Voir la [feuille de route](docs/planning/README.md).

## Ce que Fluxo fera

- **Dépenses & comptes** — comptes multiples, transactions, ventilation, virements internes, étiquettes.
- **Import des relevés bancaires** — CSV, OFX/QFX, QIF, CAMT.053 ; détection des doublons, rapprochement des soldes.
- **Catégorisation automatique** — règles, apprentissage local de vos habitudes, détection des abonnements.
- **Salaires en détail** — brut, net, net imposable, prélèvement à la source (taux et montant), primes, astreintes, 13ᵉ mois, congés, cumuls annuels.
- **Analyses interactives** — synthèses mensuelles, filtres, zoom, exploration mois par mois, infobulles, vue tableau.
- **Analyse de documents** — extraction des relevés et bulletins PDF, IA locale ou cloud **uniquement avec votre accord**.
- **Budgets & prévisions** — enveloppes, objectifs d'épargne, prélèvements à venir, solde de fin de mois.

## Principes

| Principe                | Concrètement                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| **Local d'abord**       | Vos données ne quittent pas votre ordinateur. Aucun compte, aucune télémétrie.                     |
| **Sécurité par défaut** | Renderer isolé et sandboxé, CSP stricte, protocole privé `app://`, IPC validé, base chiffrée (M1). |
| **Léger**               | Dépendances minimales, graphiques « à la carte », chargement à la demande, budgets de poids.       |
| **Transparent**         | Code ouvert, décisions documentées, IA explicable et facultative.                                  |

## Démarrer (développement)

Prérequis : **Node.js ≥ 24.12** (26 LTS recommandé) et **npm ≥ 12.2** (requis : politique de scripts d'installation), Git.

```bash
npm ci          # installe les dépendances (scripts tiers bloqués, binaire Electron installé explicitement)
npm run dev     # lance l'application avec rechargement à chaud
npm run check   # types + lint + format + tests unitaires
npm run test:e2e  # build de production + tests de bout en bout (Playwright)
```

## Documentation

- [Vision du projet](docs/projet/vision.md) · [Catalogue des fonctionnalités](docs/projet/fonctionnalites.md)
- [Feuille de route et jalons](docs/planning/README.md) · [Propositions](docs/planning/propositions.md) · [Questions ouvertes](docs/planning/questions-ouvertes.md)
- [Architecture](docs/architecture/vue-ensemble.md) · [Sécurité](docs/architecture/securite.md) · [Système de design](docs/design/systeme-de-design.md)
- [Contribuer](CONTRIBUTING.md) (en anglais) · [Signaler une vulnérabilité](SECURITY.md) · [Code de conduite](CODE_OF_CONDUCT.md) · [Journal des modifications](CHANGELOG.md)

## Licence

[MIT](LICENSE). Les bibliothèques et polices tierces embarquées gardent leur propre licence : voir [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

L'identité visuelle de Fluxo s'inspire de l'esthétique « coucher de soleil sur la côte de Floride » ; elle est entièrement originale et n'est affiliée à aucun éditeur de jeu vidéo.

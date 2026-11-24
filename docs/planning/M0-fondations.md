# M0 — Fondations

> **Statut : 🟡 En cours** — socle applicatif livré et vérifié le 24/11/2026 ; restent l'outillage du dépôt public, la CI et la validation du packaging.
> Taille : M · Dépend de : — · Version : 0.1

## Objectif

Poser un socle **sûr, léger et testable** que les jalons suivants pourront enrichir sans retour en arrière : application Electron durcie, interface et système de design, internationalisation, chaîne de qualité, packaging.

## Livré ✅

### Application & sécurité

| Élément                       | Détail                                                                                                                                                                      | Emplacement                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Stack                         | Electron 45, electron-vite 6 (Vite 8), React 19, TypeScript 6 strict, Tailwind CSS 4                                                                                        | `package.json`, `electron.vite.config.ts`                    |
| Isolation                     | `sandbox`, `contextIsolation`, pas de `nodeIntegration`, `webviewTag` désactivé, `app.enableSandbox()`                                                                      | `src/main/window.ts`, `src/main/index.ts`                    |
| Protocole privé               | Interface servie par `app://fluxo/` (jamais `file://`), garde-fou contre la traversée de répertoires, liste blanche de types MIME                                           | `src/main/protocol.ts`, `src/main/security/paths.ts`         |
| CSP                           | En-tête HTTP strict en production (aucun script inline, aucun `eval`, aucun réseau depuis le renderer) ; assouplissements limités au serveur Vite en développement          | `src/main/security/csp.ts`                                   |
| Navigation                    | Navigations et redirections hors application bloquées, nouvelles fenêtres refusées (liens HTTPS autorisés ouverts dans le navigateur)                                       | `src/main/security/hardening.ts`                             |
| Permissions                   | Toutes refusées sauf l'écriture dans le presse-papiers ; téléchargements web bloqués ; correcteur orthographique coupé                                                      | `src/main/security/hardening.ts`                             |
| IPC                           | Émetteur vérifié, entrée validée par schéma zod, erreurs réduites à un code ; API preload minimale et typée                                                                 | `src/main/ipc/`, `src/preload/index.ts`, `src/shared/ipc.ts` |
| Préférences                   | Fichier JSON validé, écriture atomique, fichier corrompu mis de côté (jamais écrasé)                                                                                        | `src/main/settings/`                                         |
| Journaux                      | Locaux, rotation 1 Mo, masquage des IBAN, NIR, e-mails, numéros de carte et du dossier personnel                                                                            | `src/main/logger/`                                           |
| Instance unique, menu minimal | Pas de rechargement ni d'outils de développement par raccourci dans l'app packagée                                                                                          | `src/main/index.ts`, `src/main/menu.ts`                      |
| Binaire durci                 | Fuses Electron (pas de `RUN_AS_NODE`, pas de `NODE_OPTIONS`, intégrité ASAR, chargement depuis l'ASAR uniquement…), entitlements macOS minimaux, locales Chromium réduites  | `electron-builder.yml`, `build/`                             |
| Chaîne d'approvisionnement    | npm 12 : scripts d'installation tiers bloqués (`allowScripts`, mode strict), versions publiées depuis ≥ 7 jours, pas de dépendances Git/URL, versions exactes, `devEngines` | `.npmrc`, `package.json`                                     |

### Interface

- Coque façon éditeur de code : barre de titre intégrée (contrôles natifs Windows/Linux, feux macOS), barre latérale avec jalons à venir, barre d'état sur le dégradé d'action. (A02)
- Thème **Système / Clair / Sombre** dans les paramètres et en raccourci dans la barre de titre ; piloté par `nativeTheme`, donc appliqué dès la première image (pas de flash) et persistant. (A01)
- Système de design « Vice Sunset » : fonds neutres, accents sur cadres, titres en dégradé, boutons ; palette des graphiques **validée** (daltonisme, contraste, luminosité). (A03)
- Logo et icône d'application originaux (`build/icon.svg` → `npm run icons`).
- Paramètres : thème avec aperçus, langue (FR/EN), devise de référence, masquage des montants, protection contre les captures, informations de version. (A04, A05, A06)
- Tableau de bord de **démonstration** : 4 indicateurs avec variations, flux mensuels (colonnes divergentes + solde net), zoom (Ctrl + molette, curseur), sélection d'un mois au clic ou au clavier, infobulles complètes, vue tableau, dépenses par catégorie classées, aperçu du bulletin « du brut au net » avec contrôles de cohérence. (F01, F04, F05, G02)
- Pages « à venir » pour chaque section, reliées à leur jalon.

### Domaine (graines pour les jalons suivants)

- Montants en centimes, formatage localisé, analyse robuste des montants (FR/EN/CH, notation comptable, signe final). (D10)
- Calcul de mois indépendant du fuseau horaire.
- Modèle simplifié de bulletin + contrôles arithmétiques. (G07)
- Catégories par défaut (pack France) et générateur de données de démonstration déterministe. (C05, A09)

### Qualité & outillage

- ESLint (règles typées, interdiction d'`innerHTML`/`eval`, frontières d'architecture main/preload/renderer/shared), Prettier, EditorConfig.
- Vitest : **19 fichiers, 121 tests** (sécurité, montants, bulletins, préférences, état de la fenêtre, rapports d'erreur, palette, composants).
- Playwright : **8 tests E2E** sur la build de production — protocole `app://`, isolation du renderer, CSP qui bloque script injecté et réseau, rejet d'une mise à jour IPC invalide, thème appliqué et conservé au redémarrage, taille de fenêtre conservée, erreur de l'interface consignée et expurgée, `window.open` bloqué.
- Débogage VS Code (main + renderer), extensions recommandées.

### Vérifications réalisées (24/11/2026, Windows 11)

| Contrôle            | Résultat                                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck` | ✅ 0 erreur                                                                                                                        |
| `npm run lint`      | ✅ 0 erreur                                                                                                                        |
| `npm test`          | ✅ 121/121                                                                                                                         |
| `npm run test:e2e`  | ✅ 8/8                                                                                                                             |
| `npm run build`     | ✅ renderer 261 Ko + tableau de bord 604 Ko (ECharts inclus), CSS 25 Ko, main 184 Ko, preload 1,4 Ko                               |
| `npm run package`   | ✅ Windows x64 : démarrage de l'application packagée, fuses vérifiés dans l'exécutable                                             |
| Installeur NSIS x64 | ✅ 113 Mo (budget 120 Mo)                                                                                                          |
| Mémoire au repos    | ✅ 254 Mo de mémoire privée, 4 processus (budget 300 Mo)                                                                           |
| Revue visuelle      | ✅ tableau de bord et paramètres, clair et sombre, montants masqués                                                                |
| `npm audit`         | ⚠ 6 alertes « moderate » dans `minimatch` (dépendance d'electron-builder, outil de build — rien n'est embarqué dans l'application) |

### Écueils rencontrés et résolus

| Problème                                                                                           | Résolution                                                                   |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Vitest échoue sous Windows quand le terminal démarre en `c:\` minuscule (deux instances du runner) | Lanceur `scripts/vitest.mjs` qui normalise le répertoire courant             |
| `ELECTRON_RUN_AS_NODE` hérité des terminaux d'éditeurs basés sur Electron                          | Retiré dans les tests E2E ; neutralisé en production par le fuse `runAsNode` |
| Playwright émule `prefers-color-scheme: light`                                                     | `colorScheme: null` dans les tests E2E                                       |
| TypeScript 7 (compilateur natif) non pris en charge par typescript-eslint                          | TypeScript 6.0 conservé (à réévaluer)                                        |
| La paire rose/turquoise est indiscernable pour les daltoniens (ΔE 2,6)                             | Ordre des séries recalculé ; revenus/dépenses en lagon/couchant              |
| electron-vite ne minifie pas le renderer par défaut                                                | Minification activée : chunk du tableau de bord 1,4 Mo → 604 Ko              |
| L'infobulle ECharts masquée laissait un cadre vide                                                 | Habillage déplacé sur un conteneur interne                                   |

## Plan d'action restant ⬜

### Lot A — Dépôt public

- [x] Initialiser Git (`main`) et premier commit. `Socle`
- [ ] Créer le dépôt GitHub `Thefirstalpha/fluxo` et y pousser `main` — **action manuelle**. `Socle`
- [x] Licence tranchée : MIT ([ADR-015](../architecture/decisions.md#adr-015--licence-mit)), fichier [`LICENSE`](../../LICENSE) ajouté.
- [x] [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md), établi à partir des cartes de sources de la build (seul ce qui est réellement embarqué) ; copié avec la licence dans `resources/` de l'application packagée. `Socle`
- [x] Valeurs provisoires remplacées : propriétaire `Thefirstalpha`, `appId` `app.fluxo.desktop` confirmé ([ADR-021](../architecture/decisions.md#adr-021--nom-fluxo-confirmé-malgré-une-homonymie-btp)), contact `maintainer` Linux renvoyant aux tickets GitHub (aucune adresse e-mail publiée). `Socle`
- [x] [`CONTRIBUTING.md`](../../CONTRIBUTING.md), **en anglais** (public international de contributeurs) : prérequis, scripts, conventions (Conventional Commits), architecture, pièges Windows, règle « aucune donnée réelle dans les fixtures ». `Socle`
- [x] [`SECURITY.md`](../../SECURITY.md) : versions prises en charge, signalement privé (GitHub Private Vulnerability Reporting), délais de réponse (accusé sous 7 jours, évaluation sous 14 jours), périmètre. `Socle`
- [x] [`CODE_OF_CONDUCT.md`](../../CODE_OF_CONDUCT.md) (Contributor Covenant 2.1, signalement par la fonction « Report content » de GitHub), [`CHANGELOG.md`](../../CHANGELOG.md) (Keep a Changelog, en français). `Socle`
- [x] Formulaires d'issues en français (bug, fonctionnalité, nouveau format bancaire, nouveau modèle de bulletin — case obligatoire « aucune donnée personnelle réelle ») et modèle de pull request en anglais (cases sécurité, accessibilité, i18n, montants, tests, docs). `Socle`
- [ ] Réglages du dépôt GitHub — **actions manuelles** une fois le dépôt créé : protection de `main` (revue obligatoire, CI verte, historique linéaire), signalement privé des vulnérabilités activé, signalement de contenu (Settings → Moderation) activé pour le code de conduite, étiquettes `fonctionnalité`, `format bancaire` et `modèle de bulletin` créées (utilisées par les formulaires d'issues). `Socle`

### Lot B — Intégration continue (GitHub Actions)

Principes : actions **épinglées par SHA** (version en commentaire), permissions minimales (`contents: read` par défaut, élevées par job), aucun `pull_request_target` exécutant le code d'une PR, `persist-credentials: false`.

| Workflow                | Déclencheurs              | Contenu                                                                                                                                                                                                                                                     |
| ----------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`                | push `main`, pull request | Job qualité (Ubuntu) : npm 12, `npm ci`, typecheck, lint, format, tests + couverture, `npm audit --omit=dev --audit-level=high`. Matrice build + E2E sur Ubuntu (écran virtuel), Windows, macOS. Artefacts : couverture, rapport Playwright en cas d'échec. |
| `codeql.yml`            | push, PR, hebdomadaire    | CodeQL `javascript-typescript` et `actions`, requêtes `security-extended`.                                                                                                                                                                                  |
| `dependency-review.yml` | pull request              | Bloque les dépendances vulnérables (≥ moderate) et les licences incompatibles avec la licence retenue.                                                                                                                                                      |
| `scorecard.yml`         | hebdomadaire, push `main` | OpenSSF Scorecard (SARIF + badge public).                                                                                                                                                                                                                   |
| `release.yml`           | tag `v*.*.*`              | Squelette : build par OS, SBOM CycloneDX (`npm sbom`), sommes SHA-256, attestations de provenance, release **brouillon**. La signature est activée au [M9](M9-distribution.md).                                                                             |
| `dependabot.yml`        | hebdomadaire              | npm + actions, mises à jour groupées, délai de 7 jours (`cooldown`), TypeScript ≥ 7 ignoré tant que typescript-eslint ne le supporte pas.                                                                                                                   |

Versions vérifiées le 24/11/2026 :

| Action                             | Version | SHA                                        |
| ---------------------------------- | ------- | ------------------------------------------ |
| `actions/checkout`                 | v7.0.1  | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-node`               | v7.1.0  | `949feb2413d6458794dcd2491c4babbbce0c15c1` |
| `actions/upload-artifact`          | v7.0.2  | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` |
| `actions/download-artifact`        | v8.0.2  | `9000827ccba6bdab643e8b6fd33ac0654aef8333` |
| `github/codeql-action`             | v4.39.4 | `1bd86f2fdb4b86187fa4059f16f31a3202acc9ea` |
| `actions/dependency-review-action` | v5.0.1  | `bbc44d14a204704ccc493733616cd1e93a0321ec` |
| `ossf/scorecard-action`            | v2.6.0  | `23f22cd43608bae7a1f1fa2603d7314dee9538a5` |
| `actions/attest-build-provenance`  | v4.2.2  | `4d101475d8b20a2381f78447822ac1eab6504dd8` |

Tâches :

- [ ] Écrire les workflows et `dependabot.yml` ci-dessus. `Besoin`
- [ ] Contrôle de budget de poids (échec si un chunk dépasse son budget). `Proposition`
- [ ] Badges CI, CodeQL et Scorecard dans le README. `Socle`

Points d'attention :

- Node 26 LTS embarque npm 11 : installer npm ≥ 12.2 **hors du dossier du projet** (sinon `devEngines` bloque l'installation).
- Ubuntu 24.04 : `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0` pour le bac à sable Chromium, tests sous `xvfb-run`.
- Les secrets de signature ne servent qu'au workflow de release, dans un environnement GitHub protégé.

### Lot C — Packaging & finitions

- [x] Valider `npm run package` sous **Windows** (24/11/2026) : l'application packagée démarre avec les fuses actifs (lus dans `Fluxo.exe` : `RunAsNode`, `NODE_OPTIONS` et `--inspect` coupés ; intégrité ASAR et chargement depuis l'ASAR seul actifs) et sert l'interface par `app://`. `Socle`
- [ ] Valider `npm run package` sous **macOS et Linux** : étape `npm run package` de la matrice CI (lot B), à constater au premier passage de la CI. `Socle`
- [x] Mémoriser la taille, la position et la maximisation de la fenêtre (`window-state.json`, validé par schéma) ; une position hors des écrans actuels (écran débranché) est recentrée. `Proposition`
- [x] Gestion des erreurs de l'interface : `ErrorBoundary` global et par page (la navigation reste utilisable), écran d'erreur traduit, remontée des erreurs de rendu, exceptions et promesses rejetées vers le journal local — canal IPC dédié, schéma strict, champs bornés, 20 rapports par minute au plus, contenu expurgé par le journal. `Socle`
- [x] Polices : seuls les sous-ensembles latin et latin-ext d'Inter et de Bebas Neue sont déclarés, en WOFF2 uniquement (−101 Ko de polices dans le paquet ; CSS 26 → 25 Ko). `Proposition`

## Critères d'acceptation

- [x] L'application démarre en développement et en build de production ; thème appliqué sans flash.
- [x] Renderer isolé, CSP stricte, IPC validé — vérifiés par les tests E2E.
- [x] Tests unitaires et E2E verts ; types et lint sans erreur.
- [ ] CI verte sur Windows, macOS et Linux.
- [ ] Dépôt public prêt : licence, fichiers communautaires, valeurs provisoires remplacées.
- [ ] Packaging vérifié sur les trois systèmes.

## Risques & questions

- **Changements majeurs attendus** sur le périmètre ou la stack : c'est le bon moment (le socle est petit et testé). Voir [questions ouvertes](questions-ouvertes.md).
- Les données de démonstration du tableau de bord seront remplacées par les vraies données au M2 ; le mode démo restera disponible.

# Architecture — vue d'ensemble

## Stack

| Domaine               | Choix                                                                                                    | Version (nov. 2026) |
| --------------------- | -------------------------------------------------------------------------------------------------------- | ------------------- |
| Application de bureau | Electron                                                                                                 | 45                  |
| Build                 | electron-vite (Vite 8 / Rolldown)                                                                        | 6                   |
| Packaging             | electron-builder                                                                                         | 26                  |
| Interface             | React + TypeScript strict                                                                                | 19 / 6.0            |
| Styles                | Tailwind CSS + design tokens CSS                                                                         | 4                   |
| Graphiques            | Apache ECharts, importé « à la carte »                                                                   | 6                   |
| État d'interface      | Zustand                                                                                                  | 5                   |
| Routage               | wouter (routage par fragment `#/…`)                                                                      | 3                   |
| Validation            | zod (process main, service de données)                                                                   | 4                   |
| Base de données       | SQLite 3.54 chiffré (SQLite3 Multiple Ciphers, format SQLCipher 4) via `better-sqlite3-multiple-ciphers` | 13.2                |
| Dérivation de clé     | Argon2id (hash-wasm, WebAssembly)                                                                        | 4.13                |
| Icônes                | lucide-react                                                                                             | 1                   |
| Tests                 | Vitest + Testing Library (happy-dom), Playwright (Electron)                                              | 5 / 1.65            |
| Qualité               | ESLint (typescript-eslint, règles typées) + Prettier                                                     | 10 / 3              |

Prévu : TanStack Table/Virtual/Query (M2), pdf.js et tesseract.js (M7), SDK Anthropic et fournisseur local (M7), electron-updater (M9). Chaque dépendance est ajoutée **au jalon qui en a besoin**, pas avant.

## Processus et frontières de confiance

```mermaid
flowchart LR
  subgraph R["Renderer — non fiable (sandbox, CSP, sans Node)"]
    UI["React · ECharts · Zustand"]
  end
  subgraph P["Preload — pont minimal"]
    API["window.fluxo (API typée)"]
  end
  subgraph M["Process main — fiable"]
    IPC["Handlers IPC : émetteur vérifié + schéma zod"]
    SEC["Sécurité : app://, CSP, navigation, permissions"]
    SET["Préférences (JSON atomique)"]
    LOG["Journal local expurgé"]
    CLI["Client du service de données"]
  end
  subgraph D["Service de données — utilityProcess"]
    DATA[("Coffre SQLCipher : base, clés")]
  end
  subgraph F["Prévu"]
    PARSE["Analyse de fichiers isolée — M3/M7"]
    AI["Fournisseurs IA — M7"]
  end
  UI --> API --> IPC
  IPC --> SET
  IPC --> CLI
  CLI -- "MessagePort, requêtes validées" --> DATA
  IPC -.-> PARSE
  PARSE -.-> AI
```

- **Renderer** : tout ce qui s'affiche. Considéré comme compromettable (contenu importé, dépendances front) : il n'a ni Node.js, ni accès disque, ni réseau.
- **Preload** : expose `window.fluxo`, une fonction par besoin métier, sans accès générique à `ipcRenderer`.
- **Process main** : seul détenteur des privilèges ; valide **toute** entrée venant du renderer.
- **Service de données** (`src/data/`, `utilityProcess`) : seul à ouvrir la base chiffrée et à détenir sa clé en clair, le temps où le coffre est déverrouillé. Il dialogue avec le main par un `MessagePort` : requêtes validées par schéma, traitées une par une, erreurs réduites à un code ([ADR-027](decisions.md#adr-027--moteur-du-coffre--sqlite3-multiple-ciphers-format-sqlcipher-sql-typé-service-isolé)). Son code n'importe pas Electron : il est testé sous Node.
- **Processus utilitaires** (à venir) : analyse de fichiers hors du process main (M3/M7), pour la réactivité et l'isolation.

## Démarrage

1. Avant `ready` : bac à sable global, enregistrement du schéma privé `app://`, verrou d'instance unique.
2. Au `ready` : journal local, menu minimal, durcissement de la session et de chaque contenu web, protocole `app://` avec CSP, service de données, préférences, verrouillage automatique ; en mode session, déverrouillage du coffre par le trousseau ; handlers IPC.
3. Création de la fenêtre avec le fond du thème résolu (pas de flash), affichage à `ready-to-show`.
4. Le renderer charge les préférences et l'état du coffre par IPC, puis affiche l'écran du coffre (création ou déverrouillage) ou l'interface si le coffre est ouvert.

## Arborescence

```text
fluxo/
├─ src/
│  ├─ main/            Process main : fenêtre, protocole, sécurité, IPC, préférences, journal
│  │  ├─ security/     CSP, chemins, URL, durcissement (fonctions pures testées)
│  │  ├─ ipc/          Fabrique de handlers validés + enregistrement des canaux
│  │  ├─ settings/     Lecture/écriture atomique, store des préférences
│  │  ├─ logger/       Journal local + masquage des données personnelles
│  │  ├─ vault/        Coffre côté main : trousseau (safeStorage), orchestration, verrouillage auto
│  │  ├─ data/         Client du service de données (utilityProcess, MessagePort)
│  │  ├─ window-state/ Taille et position de la fenêtre (adaptées aux écrans branchés)
│  │  └─ fs/           Écriture atomique de petits fichiers
│  ├─ data/            Service de données (utilityProcess) : RPC, base SQLCipher, coffre,
│  │                   schéma et migrations, sauvegardes (backup/), export, démonstration (demo/),
│  │                   registre (ledger/ : comptes, écritures tracées, audit)
│  ├─ preload/         Pont contextBridge (window.fluxo) et ses types
│  ├─ renderer/        Interface React
│  │  └─ src/
│  │     ├─ app/       Coque : barre de titre, navigation, barre d'état ; UnlockedApp (chargée à la demande)
│  │     ├─ components/ Composants d'interface réutilisables, logo, ErrorBoundary
│  │     ├─ features/  Pages : tableau de bord, comptes, catégories et étiquettes, paramètres, coffre, pages à venir
│  │     ├─ lib/       API, cache du registre (TanStack Query), formatage, thème, graphiques (ECharts)
│  │     ├─ i18n/      Dictionnaires typés FR/EN
│  │     ├─ stores/    État (Zustand)
│  │     └─ styles/    Tokens de design, styles globaux
│  └─ shared/          TypeScript pur partagé : contrat IPC, registre (ledger/ : contrat, schémas, IBAN,
│                      pack de catégories), préférences, montants, mois, bulletins, démo
├─ tests/e2e/          Tests Playwright sur la build de production
├─ build/              Ressources de packaging (icône, entitlements)
├─ scripts/            Outils (lanceur Vitest, génération d'icônes)
└─ docs/               Cette documentation
```

## Règles de dépendances (vérifiées par ESLint)

| Code           | Peut importer                                            | Ne doit jamais importer                            |
| -------------- | -------------------------------------------------------- | -------------------------------------------------- |
| `src/shared`   | rien d'autre que `src/shared` et des bibliothèques pures | `electron`, React, `node:*`, main/preload/renderer |
| `src/renderer` | `src/shared`, bibliothèques front                        | `electron`, `node:*`, `src/main`, le preload       |
| `src/preload`  | `electron` (sous-ensemble sandbox), `src/shared`         | le reste                                           |
| `src/main`     | tout ce qui est côté Node, `src/shared`                  | le renderer                                        |

Règles de sécurité outillées : pas d'`innerHTML`/`outerHTML`/`insertAdjacentHTML`, pas de `dangerouslySetInnerHTML`, pas d'`eval` ni de `new Function`, promesses obligatoirement gérées.

## Bundling & dépendances

- Tout ce qui peut être bundlé est en `devDependencies` : rien n'est copié dans `app.asar/node_modules`, l'application reste légère.
- Seules les dépendances **natives** sont en `dependencies` et externalisées du bundle : `better-sqlite3-multiple-ciphers` (binaires N-API précompilés ; seul celui de la plateforme cible est embarqué, dans `app.asar.unpacked`).
- Le process main a deux points d'entrée : `out/main/index.js` et `out/main/data-service.js` (service de données).
- Le renderer est minifié ; le main ne l'est pas (traces d'erreur lisibles dans le journal).

## Conventions

- **Argent** : entiers en centimes (`MinorUnits`) ; formatage uniquement à l'affichage (`Intl.NumberFormat`).
- **Mois** : chaînes `AAAA-MM`, calculs en UTC, indépendants du fuseau horaire.
- **Textes** : jamais en dur dans les composants ; passer par `useT()` (dictionnaires typés, l'anglais doit avoir les mêmes clés que le français).
- **Tests** : à côté du code (`*.test.ts[x]`) ; E2E dans `tests/e2e`.
- **Commits** : Conventional Commits (`feat:`, `fix:`, `docs:`…).

## Scripts

| Commande                             | Rôle                                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `npm run dev`                        | Application en développement (rechargement à chaud)                                           |
| `npm run build`                      | Build de production (`out/`)                                                                  |
| `npm start`                          | Lance la build de production                                                                  |
| `npm run check`                      | Types + lint + format + tests unitaires                                                       |
| `npm test` · `npm run test:coverage` | Tests unitaires (via `scripts/vitest.mjs`)                                                    |
| `npm run test:perf`                  | Mesures de performance du coffre (50 000 opérations)                                          |
| `npm run test:e2e`                   | Build + tests de bout en bout (fenêtres invisibles ; `FLUXO_E2E_SHOW_WINDOW=1` pour les voir) |
| `npm run size`                       | Vérifie les budgets de poids de la build                                                      |
| `npm run icons`                      | Génère `build/icon.png` depuis `build/icon.svg`                                               |
| `npm run package` · `npm run dist`   | Application non empaquetée · installeurs                                                      |

# Contributing to Fluxo

Thank you for your interest in Fluxo! Fluxo is an open-source desktop application (Electron + React + TypeScript) to manage personal finances **locally**: expenses, bank statements, payslips and analyses, with no account and no telemetry.

User-facing documentation (README, `docs/`) is written in **French**; this guide and code-level contributor material are in **English** ([ADR-019](docs/architecture/decisions.md#adr-019--langue-de-la-documentation--français-pour-les-utilisateurs-anglais-pour-la-contribution-technique)). Code, identifiers and commit messages are in English. Issues and pull requests may be written in French or English.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). To report a vulnerability, **do not open a public issue**: see [SECURITY.md](SECURITY.md).

## Before you start

- The project moves forward in **small, validated increments**. The roadmap lives in [`docs/planning/`](docs/planning/README.md): each milestone page (`docs/planning/M*.md`) has an action plan split into "lots" and an explicit "out of scope" section. GitHub milestones and projects are intentionally not used ([ADR-020](docs/architecture/decisions.md#adr-020--confirmations-groupées-du-24-novembre-2026)).
- For anything larger than a bug fix, **open an issue first** and wait for feedback before writing code — especially for new dependencies, data-model changes or work outside the current milestone.
- If your change touches an [open question](docs/planning/questions-ouvertes.md), mention it in the issue rather than deciding it silently in code.
- Architecture decisions are recorded in [`docs/architecture/decisions.md`](docs/architecture/decisions.md) (ADRs). An accepted decision is never rewritten: a new ADR supersedes it.

## Prerequisites

| Tool    | Version                          | Notes                                                                              |
| ------- | -------------------------------- | ---------------------------------------------------------------------------------- |
| Node.js | **≥ 24.12** (26 LTS recommended) | Version pinned in [`.nvmrc`](.nvmrc).                                              |
| npm     | **≥ 12.2**                       | Required by the install-script policy ([ADR-007](docs/architecture/decisions.md)). |
| Git     | any recent version               |                                                                                    |

Node.js 26 ships with npm 11, so npm 12 must be installed separately. **Install it from outside the project folder**: inside the repository, `devEngines` (in `package.json`) refuses to run with npm 11, including for `npm install -g npm`.

```bash
cd ~                       # any folder outside the repository
npm install -g npm@12.2    # or a newer 12.x
npm --version              # ≥ 12.2.0
```

Then, in the repository:

```bash
npm ci        # installs dependencies; third-party install scripts are blocked (see below)
npm run dev   # starts the app with hot reload
```

Supply-chain policy ([`.npmrc`](.npmrc), [security doc](docs/architecture/securite.md#chaîne-dapprovisionnement)): dependency install scripts are blocked unless explicitly reviewed in `allowScripts`, only versions published more than 7 days ago are installed, Git/URL dependencies are forbidden and versions are exact. The Electron binary is installed by the project's own `postinstall` (`install-electron`).

## Scripts

| Script                                    | What it does                                                                                                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                             | Starts the app in development mode (Vite dev server, hot reload).                                                                                                     |
| `npm start`                               | Runs the production build locally (`electron-vite preview`).                                                                                                          |
| `npm run build`                           | Production build into `out/` (main, preload, renderer).                                                                                                               |
| `npm run size`                            | Checks the bundle-size budgets on `out/` (run after `npm run build`).                                                                                                 |
| `npm run typecheck`                       | TypeScript checks for main/preload, renderer and tests.                                                                                                               |
| `npm run lint` / `lint:fix`               | ESLint (type-aware rules, security and architecture boundaries).                                                                                                      |
| `npm run format` / `format:check`         | Prettier.                                                                                                                                                             |
| `npm test`                                | Unit and component tests (Vitest, happy-dom).                                                                                                                         |
| `npm run test:watch`                      | Vitest in watch mode.                                                                                                                                                 |
| `npm run test:coverage`                   | Unit tests with V8 coverage.                                                                                                                                          |
| `npm run test:e2e`                        | Production build, then end-to-end tests on the real Electron app (Playwright). Windows stay hidden and never take focus; set `FLUXO_E2E_SHOW_WINDOW=1` to watch them. |
| `npm run test:perf`                       | Performance measurements of the encrypted vault with 50,000 transactions (not part of `npm run check` or CI: timings depend on the machine).                          |
| `npm run check`                           | **typecheck + lint + format check + unit tests** — must be green before a PR.                                                                                         |
| `npm run icons`                           | Regenerates application icons from `build/icon.svg`.                                                                                                                  |
| `npm run package`                         | Build + unpacked package for the current OS (`electron-builder --dir`).                                                                                               |
| `npm run dist` (`:win`, `:mac`, `:linux`) | Build + installers (unsigned locally).                                                                                                                                |

## Architecture in a nutshell

Full description (in French): [`docs/architecture/vue-ensemble.md`](docs/architecture/vue-ensemble.md).

```text
src/
├─ main/       Main process — the only trusted process: window, app:// protocol, CSP, IPC handlers, settings, logs
├─ preload/    Minimal typed bridge exposed as window.fluxo (one function per business need)
├─ renderer/   React UI — untrusted: sandboxed, no Node.js, no network, strict CSP
└─ shared/     Pure, portable TypeScript shared by all processes (no Node, no DOM)
tests/e2e/     Playwright tests against the production build
docs/          Product, planning, architecture and design documentation (French)
```

- The **renderer is untrusted**: it has no Node.js, no disk access and no network. It only talks to the main process through `window.fluxo`.
- The **main process validates every input** coming from the renderer with a strict zod schema and returns errors as codes.
- **Everything that can be bundled is a `devDependency`**: nothing is copied into `app.asar/node_modules`. Only future native modules of the main process will be regular `dependencies`.
- ESLint enforces the process boundaries (`src/shared` imports nothing from Node/DOM; the renderer never imports `electron` or `node:*`).

## Conventions

### Commits and pull requests

- [Conventional Commits](https://www.conventionalcommits.org/): `feat(scope): …`, `fix(scope): …`, `docs: …`, `test: …`, `refactor: …`, `chore: …`, `ci: …`, `build: …`.
- **Small, reversible pull requests**: one lot of a milestone action plan at a time; avoid mixing refactoring and features.
- `npm run check` must be green; run `npm run test:e2e` when you touch the main process, the preload, security or the app shell.
- Fill in the [pull request template](.github/pull_request_template.md).

### Documentation is part of the change

The documentation in `docs/` is the project's reference, not an afterthought. A PR that changes application behaviour updates, **in the same PR**:

1. the action-plan checkboxes of the relevant milestone page (`docs/planning/M*.md`) — a box is only ticked for code that is merged, tested and documented;
2. the status of the affected feature IDs in [`docs/projet/fonctionnalites.md`](docs/projet/fonctionnalites.md) (✅ done · 🟡 partial · ⬜ to do);
3. the target data model in [`docs/architecture/modele-de-donnees.md`](docs/architecture/modele-de-donnees.md) if entities or rules change;
4. a new ADR in [`docs/architecture/decisions.md`](docs/architecture/decisions.md) for any structural decision (library, storage format, security or performance trade-off);
5. [`docs/planning/propositions.md`](docs/planning/propositions.md) and [`docs/planning/questions-ouvertes.md`](docs/planning/questions-ouvertes.md) if a proposal is implemented or a question is settled.

If you are not comfortable writing French, write the update in English and say so in the PR: a maintainer will translate it.

### Dependencies

Do not add a dependency "just in case": each one must answer a need already listed in `docs/projet/fonctionnalites.md` or explicitly agreed in an issue. Before adding one, check that it is not already in the project, measure its real weight (see [performance](docs/architecture/performance.md)) and add it as a `devDependency` (the build is bundled). Any new install script must be reviewed and recorded in `allowScripts`.

## Rules that matter most

### Security

The rules are detailed (in French) in [`docs/architecture/securite.md` — « Règles pour les contributions »](docs/architecture/securite.md#règles-pour-les-contributions). In short:

1. Never use `innerHTML`, `dangerouslySetInnerHTML` or HTML built from data: use JSX, `textContent` or explicit escaping. ESLint enforces it.
2. Every new IPC channel = one business function in the preload + a strict zod schema in the main process + errors as codes. Never expose `ipcRenderer` or a generic channel.
3. No network access from the renderer; any network call goes through the main process and must be optional, disabled by default, with explicit consent if personal data leaves the device.
4. No new web permission without a documented justification.
5. Never log the content of a transaction or a document.

### Money is integers

Every amount is an **integer number of minor units** (cents) plus an ISO 4217 currency code — see `MinorUnits` in [`src/shared/money.ts`](src/shared/money.ts) and `checkPayslip` in [`src/shared/payslip.ts`](src/shared/payslip.ts) and [ADR-009](docs/architecture/decisions.md#adr-009--montants-en-centimes-entiers). Never use a floating-point number for an amount, a withholding-tax rate or a loan instalment share. Every financial computation (payslip, amortisation table, category aggregate) comes with tested consistency checks (invariants): a financial computation without tests is not done.

### Internationalisation

No hard-coded user-facing string in components: every string goes through the typed dictionaries in [`src/renderer/src/i18n/`](src/renderer/src/i18n/), and must be added to **both** `fr` and `en` (the `en` dictionary is typed against `fr`, so TypeScript fails if a key is missing).

### Accessibility

Accessibility is part of the definition of done, not a follow-up: full keyboard navigation with visible focus, meaningful labels for screen readers, sufficient contrast in light and dark themes, respect for "reduced motion", and a **table view for every chart**. See the [design system](docs/design/systeme-de-design.md).

### No real data — ever

**Never put real personal or financial data** in test fixtures, unit or E2E tests, screenshots, issues, pull requests or commit messages: no real bank statement, payslip, IBAN, social security number, name or address. Use the app's demo mode, the deterministic demo-data generator, or files that you have **fully anonymised or invented**. Test fixtures (to live in `tests/fixtures/`) must be fake.

## Windows pitfalls

| Problem                                                                                                    | What to know                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest fails with "failed to find the runner" when the terminal starts in a lowercase `c:\` path (VS Code) | Always run tests through the npm scripts: they use [`scripts/vitest.mjs`](scripts/vitest.mjs), which normalises the current directory.                   |
| `ELECTRON_RUN_AS_NODE` is inherited from terminals of Electron-based editors (VS Code, Cursor…)            | Electron then starts as plain Node.js. The E2E tests remove it; in production the `runAsNode` fuse neutralises it. Unset it if `npm run dev` misbehaves. |
| npm 12 cannot be installed from inside the repository                                                      | `devEngines` blocks npm 11 in the project folder: run `npm install -g npm@12.2` from another folder.                                                     |

## License

By contributing, you agree that your contributions are licensed under the project's [MIT License](LICENSE). Do not submit code, icons, fonts or data you do not have the right to publish under these terms; any new shipped third-party component must be added to [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

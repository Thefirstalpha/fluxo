## Summary

<!-- What does this PR change, and why? Keep it to one lot of a milestone action plan. -->

## Milestone and lot

<!-- Link the milestone page and lot, e.g. docs/planning/M0-fondations.md — Lot B. Link the related issue if any (Closes #…). -->

- Milestone page:
- Lot:
- Feature IDs (`docs/projet/fonctionnalites.md`):

## How it was tested

<!-- Commands run, OS used, manual checks. -->

## Checklist

### Quality

- [ ] `npm run check` is green (types, lint, format, unit tests).
- [ ] `npm run test:e2e` is green, if the main process, preload, security or app shell changed.
- [ ] New or changed financial computations have tests covering their invariants.

### Documentation (same PR)

- [ ] Milestone page (`docs/planning/M*.md`) checkboxes ticked or corrected.
- [ ] Status updated in `docs/projet/fonctionnalites.md`.
- [ ] `docs/architecture/modele-de-donnees.md` updated if the data model changed.
- [ ] New ADR in `docs/architecture/decisions.md` for any structural decision (dependency, storage format, security or performance trade-off).
- [ ] `THIRD_PARTY_NOTICES.md` updated if a shipped dependency or asset was added, removed or upgraded.

### Security

- [ ] Any new capability exposed to the renderer goes through a dedicated preload function and a strict zod schema in the main process (no generic IPC access).
- [ ] No `innerHTML`, no network access from the renderer, no new web permission without a documented justification.
- [ ] Nothing leaves the device without an explicit, opt-in user action; no transaction or document content is logged.

### Accessibility

- [ ] Fully usable with the keyboard, with visible focus.
- [ ] Meaningful labels for screen readers; contrast checked in light and dark themes.
- [ ] Every new chart has a table view.

### Internationalisation and money

- [ ] No hard-coded user-facing strings: all text goes through the typed dictionaries, in both `fr` and `en`.
- [ ] All amounts are integer minor units (`MinorUnits`) with an ISO 4217 currency code — no floating-point amounts or rates.

### Privacy

- [ ] No real personal or financial data in code, fixtures, tests, screenshots or this description.

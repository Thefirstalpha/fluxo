# Security policy

> **En bref (français)** : pour signaler une vulnérabilité, **n'ouvrez pas de ticket public**. Utilisez le signalement privé de GitHub : onglet _Security_ du dépôt → « Report a vulnerability » ([lien direct](https://github.com/Thefirstalpha/fluxo/security/advisories/new)). Nous accusons réception sous 7 jours et donnons une première évaluation sous 14 jours. Ne joignez **jamais** de données financières ou personnelles réelles : un exemple inventé ou anonymisé suffit. Avant la version 1.0, seule la dernière version (et la branche `main`) reçoit des correctifs.

Fluxo handles some of the most sensitive data there is: bank transactions, salaries, IBANs, social security numbers. Security reports are very welcome and are handled with priority.

## Supported versions

Fluxo is pre-1.0 software. Only the **latest release** and the **`main` branch** receive security fixes; older pre-releases are not patched — please upgrade.

| Version                   | Supported |
| ------------------------- | --------- |
| Latest release / `main`   | ✅        |
| Any older 0.x pre-release | ❌        |

This policy will be revisited at version 1.0.

## Reporting a vulnerability

**Please do not open a public issue, discussion or pull request for a security problem.**

Use GitHub Private Vulnerability Reporting:

1. Go to the repository's **Security** tab and click **Report a vulnerability**, or open <https://github.com/Thefirstalpha/fluxo/security/advisories/new> directly.
2. Describe the issue, the affected version or commit, your operating system, the steps to reproduce and the impact you expect.
3. If you have a proof of concept, attach it — using **invented or fully anonymised data only** (see below).

No e-mail address is published for the project; GitHub's private reporting is the only channel. If you cannot use it, open a public issue that only asks for a private contact, **without any detail about the vulnerability**.

### Never include real data

Do not send real bank statements, payslips, account numbers, IBANs, social security numbers, names, addresses or screenshots of real accounts — not even in a private report. Reproduce the problem with the app's demo mode or a fake file you have written yourself. If a real file is the only way to trigger the problem, describe its structure instead.

## What to expect

| Step               | Target                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------- |
| Acknowledgement    | within **7 days**                                                                       |
| Initial assessment | within **14 days** (confirmed or not, severity, next steps)                             |
| Fix and advisory   | coordinated with you; disclosure once a fixed release is available                      |
| Credit             | offered in the GitHub security advisory and the changelog (or anonymity, if you prefer) |

Fluxo is maintained by volunteers: these are targets, not contractual guarantees. Please allow a reasonable delay before any public disclosure, and keep us informed if you plan to publish.

## Scope

The threat model is described (in French) in [`docs/architecture/securite.md`](docs/architecture/securite.md).

**In scope** — for example:

- Code execution or privilege escalation from the renderer: bypass of the sandbox, `contextIsolation`, the Content Security Policy or the `app://` protocol (path traversal, MIME types).
- IPC issues: missing or bypassable validation, a channel callable by an untrusted sender, information leaking through error messages.
- Malicious content: a crafted bank statement, PDF, payslip or label leading to HTML/script injection, crashes, excessive resource use or wrong financial results.
- Data leaks: personal data written to logs unmasked, sent over the network, left on disk unencrypted (once encryption at rest ships, milestone M1), or exposed in screenshots despite the protection setting.
- Navigation and permission issues: opening arbitrary windows or URLs, web permissions granted unexpectedly, downloads.
- Integrity of calculations: balances, imports or payslip computations that can be silently corrupted.
- Supply chain and build: compromised or unpinned dependencies or GitHub Actions, release artefacts that do not match the source (once signing and provenance ship, milestone M9).
- Weaknesses of the packaged binary (Electron fuses, ASAR integrity, macOS entitlements).

**Out of scope**:

- Malware that already runs with the user's privileges on their session (Fluxo only limits the impact: encrypted database, locking).
- Physical attacks on an unlocked computer.
- Vulnerabilities in Electron, Chromium or Node.js themselves that are fixed upstream — report them upstream; an outdated Electron version in Fluxo **is** in scope.
- Issues that require a modified build of Fluxo or disabled operating-system protections.
- Findings from automated scanners without a demonstrated impact, and missing hardening that is already documented as planned in the security document.
- Social engineering of maintainers or users.

## Security measures

Current and planned measures (renderer isolation, strict CSP, validated IPC, redacted logs, Electron fuses, supply-chain policy with blocked install scripts and a 7-day publication delay, CodeQL, dependency review, OpenSSF Scorecard, Dependabot, and later encryption at rest, signed releases, SBOM and provenance attestations) are listed in [`docs/architecture/securite.md`](docs/architecture/securite.md).

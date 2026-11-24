# Sécurité

Fluxo manipule des données parmi les plus sensibles qui soient : opérations bancaires, salaires, identifiants (IBAN, numéro de sécurité sociale). La sécurité est une exigence de conception, pas une option.

## Actifs à protéger

| Actif                 | Exemples                                                        | Conséquence d'une fuite                         |
| --------------------- | --------------------------------------------------------------- | ----------------------------------------------- |
| Données financières   | Opérations, soldes, budgets, crédits (taux, capital restant dû) | Atteinte à la vie privée, profilage             |
| Bulletins de paie     | Salaire, NIR, adresse, employeur                                | Usurpation d'identité                           |
| Secrets               | Clé de la base, clés d'API IA                                   | Accès à toutes les données, facturation abusive |
| Intégrité des calculs | Soldes, bulletins, imports, tableaux d'amortissement            | Mauvaises décisions financières                 |

## Menaces considérées

| Menace                             | Vecteur                                        | Atténuations                                                                                                 |
| ---------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Contenu malveillant                | Relevé ou PDF piégé, libellé contenant du HTML | Analyse dans un processus isolé, limites de taille, XML sans entités externes, échappement systématique, CSP |
| Exécution de code dans le renderer | Injection HTML, dépendance front compromise    | Sandbox, `contextIsolation`, pas de Node, CSP sans inline ni `eval`, API preload minimale, IPC validé        |
| Chaîne d'approvisionnement         | Paquet npm compromis, script d'installation    | Scripts bloqués par défaut, délai de publication de 7 jours, versions exactes, revue des dépendances, SBOM   |
| Vol ou copie de l'ordinateur       | Copie du fichier de base, d'une sauvegarde     | Chiffrement au repos (M1), verrouillage automatique, sauvegardes chiffrées                                   |
| Fuite vers un service en ligne     | IA cloud, télémétrie                           | Aucune télémétrie, IA désactivée par défaut, anonymisation, consentement par document                        |
| Fuite locale                       | Journaux, captures d'écran, épaule indiscrète  | Journaux expurgés, exclusion des captures, masquage des montants                                             |
| Mise à jour piégée                 | Binaire substitué                              | Installeurs signés, signature vérifiée par le système de mise à jour (M9)                                    |

Hors périmètre : un logiciel malveillant disposant déjà des droits de l'utilisateur sur sa session ; Fluxo en limite néanmoins l'impact (base chiffrée, verrouillage).

## Mesures en place (M0)

| Mesure                  | Détail                                                                                                                                                            | Code                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Isolation du renderer   | `sandbox`, `contextIsolation`, pas de `nodeIntegration`, `app.enableSandbox()`, pas de `<webview>`                                                                | `src/main/window.ts`                     |
| Protocole privé         | `app://fluxo/` au lieu de `file://` ; chemins contenus dans le dossier de build ; types MIME en liste blanche ; fuse `grantFileProtocolExtraPrivileges` désactivé | `src/main/protocol.ts`                   |
| Content Security Policy | `default-src 'none'`, scripts `'self'` uniquement, `connect-src 'self'` (aucun réseau), `object-src`, `frame-ancestors`, `base-uri`, `form-action` à `'none'`     | `src/main/security/csp.ts`               |
| Navigation              | Navigations et redirections hors origine bloquées ; `window.open` refusé ; liens HTTPS en liste blanche ouverts dans le navigateur                                | `src/main/security/hardening.ts`         |
| Permissions web         | Toutes refusées sauf l'écriture dans le presse-papiers ; périphériques refusés ; téléchargements bloqués                                                          | `src/main/security/hardening.ts`         |
| IPC                     | Vérification de l'émetteur (origine de la page), validation zod stricte (clés inconnues refusées), erreurs réduites à un code                                     | `src/main/ipc/handle.ts`                 |
| Préférences             | Lecture tolérante, écriture atomique, fichier illisible mis de côté                                                                                               | `src/main/settings/`                     |
| Journaux                | Locaux, rotation, masquage IBAN / NIR / e-mail / n° de carte / dossier personnel                                                                                  | `src/main/logger/`                       |
| Application packagée    | Pas d'outils de développement, pas de menu de rechargement, instance unique                                                                                       | `src/main/window.ts`, `src/main/menu.ts` |
| Fuses Electron          | `runAsNode`, `NODE_OPTIONS` et `--inspect` désactivés ; intégrité ASAR ; chargement depuis l'ASAR uniquement ; cookies chiffrés                                   | `electron-builder.yml`                   |
| macOS                   | Hardened Runtime, seul entitlement : JIT de V8                                                                                                                    | `build/entitlements.mac.plist`           |
| Confidentialité         | Masquage des montants, exclusion des captures d'écran, aucune télémétrie, aucune police ou ressource distante                                                     | `src/renderer/`, `src/main/index.ts`     |

Ces mesures sont couvertes par des tests unitaires (CSP, chemins, URL, masquage, schémas) et des tests E2E (isolation, CSP effective, rejet IPC, fenêtres bloquées).

## Mesures prévues

| Jalon | Mesure                                                                                                                              |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------- |
| M0    | CodeQL, revue des dépendances, OpenSSF Scorecard, Dependabot, `SECURITY.md`                                                         |
| M1    | Base SQLCipher, clé protégée par le trousseau ou un mot de passe maître (Argon2id), verrouillage automatique, sauvegardes chiffrées |
| M3    | Analyseurs dans un processus isolé, limites, protection XXE, neutralisation des formules à l'export CSV                             |
| M4    | Expressions régulières bornées (ReDoS)                                                                                              |
| M7    | Clés d'API chiffrées côté main, anonymisation, consentement, pdf.js sans évaluation de code, aucune requête sans accord (test)      |
| M9    | Signature et notarisation, mises à jour vérifiées, SBOM et attestations de provenance, audit externe                                |

## Chaîne d'approvisionnement

La politique est définie dans `.npmrc` et `package.json` (npm ≥ 12 requis via `devEngines`) :

- **Scripts d'installation bloqués** pour toutes les dépendances ; toute dépendance avec un script non revu fait échouer l'installation (`strict-allow-scripts`). Refus explicites (`allowScripts`) :
  - `electron` : le binaire est installé par le script du projet (`install-electron`), visible et maîtrisé ;
  - `electron-winstaller` : sert uniquement à la cible Squirrel.Windows, non utilisée (NSIS) ;
  - `esbuild` : ses binaires arrivent par dépendances optionnelles de plateforme, le script est superflu.
- **Délai de publication** : seules les versions publiées depuis **plus de 7 jours** sont installées (`min-release-age=7`), le temps que l'écosystème détecte un paquet compromis.
- **Pas de dépendances Git ni d'archives distantes** (`allow-git=none`, `allow-remote=none`).
- **Versions exactes** et `package-lock.json` versionné ; `npm ci` en intégration continue.
- **Légèreté = surface réduite** : chaque dépendance doit être justifiée ; les bibliothèques front sont bundlées, pas embarquées.
- **En CI** (M0) : revue des dépendances sur chaque PR, CodeQL, Scorecard, Dependabot avec délai de 7 jours, actions GitHub épinglées par SHA.
- **À la release** (M9) : SBOM CycloneDX, sommes SHA-256, attestations de provenance.

Point connu : `npm audit` signale 6 alertes de sévérité modérée dans `minimatch`, dépendance d'electron-builder (outil de build). Rien n'est embarqué dans l'application ; à suivre via Dependabot.

## Règles pour les contributions

1. Jamais d'`innerHTML` ni de HTML construit à partir de données : JSX, `textContent`, ou échappement explicite (`escapeHtml`).
2. Tout nouveau canal IPC : une fonction métier dans le preload, un schéma zod strict côté main, des erreurs sous forme de code.
3. Aucun accès réseau depuis le renderer ; tout appel réseau passe par le process main et doit être facultatif.
4. Aucune nouvelle permission web sans justification documentée ici.
5. **Aucune donnée réelle** dans les tests, captures ou tickets : utiliser le mode démo ou des fichiers anonymisés.
6. Ne jamais journaliser le contenu d'une transaction ou d'un document.

## Signaler une vulnérabilité

Merci de **ne pas ouvrir de ticket public**. Utilisez le signalement privé de GitHub (« Report a vulnerability » dans l'onglet _Security_ du dépôt). La politique complète figurera dans `SECURITY.md` (M0).

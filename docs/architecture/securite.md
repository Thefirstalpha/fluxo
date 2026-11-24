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

## Mesures en place (M0, M1)

| Mesure                  | Détail                                                                                                                                                                                                                                                                                                                                                                                                                                          | Code                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Isolation du renderer   | `sandbox`, `contextIsolation`, pas de `nodeIntegration`, `app.enableSandbox()`, pas de `<webview>`                                                                                                                                                                                                                                                                                                                                              | `src/main/window.ts`                                                  |
| Protocole privé         | `app://fluxo/` au lieu de `file://` ; chemins contenus dans le dossier de build ; types MIME en liste blanche ; fuse `grantFileProtocolExtraPrivileges` désactivé                                                                                                                                                                                                                                                                               | `src/main/protocol.ts`                                                |
| Content Security Policy | `default-src 'none'`, scripts `'self'` uniquement, `connect-src 'self'` (aucun réseau), `object-src`, `frame-ancestors`, `base-uri`, `form-action` à `'none'`                                                                                                                                                                                                                                                                                   | `src/main/security/csp.ts`                                            |
| Navigation              | Navigations et redirections hors origine bloquées ; `window.open` refusé ; liens HTTPS en liste blanche ouverts dans le navigateur                                                                                                                                                                                                                                                                                                              | `src/main/security/hardening.ts`                                      |
| Permissions web         | Toutes refusées sauf l'écriture dans le presse-papiers ; périphériques refusés ; téléchargements bloqués                                                                                                                                                                                                                                                                                                                                        | `src/main/security/hardening.ts`                                      |
| IPC                     | Vérification de l'émetteur (origine de la page), validation zod stricte (clés inconnues refusées), erreurs réduites à un code                                                                                                                                                                                                                                                                                                                   | `src/main/ipc/handle.ts`                                              |
| Préférences             | Lecture tolérante, écriture atomique, fichier illisible mis de côté                                                                                                                                                                                                                                                                                                                                                                             | `src/main/settings/`                                                  |
| Journaux                | Locaux, rotation, masquage IBAN / NIR / e-mail / n° de carte / dossier personnel                                                                                                                                                                                                                                                                                                                                                                | `src/main/logger/`                                                    |
| Erreurs de l'interface  | Remontées au journal local par un canal dédié : schéma strict, champs bornés, 20 rapports/minute au plus, contenu expurgé ; jamais envoyées en ligne                                                                                                                                                                                                                                                                                            | `src/main/ipc/register.ts`, `src/renderer/src/lib/error-reporting.ts` |
| Service de données      | Base ouverte dans un `utilityProcess` dédié ; requêtes du main validées par schéma, erreurs réduites à un code, journal relayé et expurgé par le main                                                                                                                                                                                                                                                                                           | `src/data/`, `src/main/data/`                                         |
| Coffre chiffré (M1)     | Base SQLCipher 4 (clé brute de 256 bits) ; clé enveloppée par le trousseau du système ou par Argon2id + AES-256-GCM ; code de récupération facultatif ; mot de passe actuel exigé pour toute action sensible ; délais croissants après échecs ; verrouillage manuel et automatique, interface démontée au verrouillage ([ADR-028](decisions.md#adr-028--clés-du-coffre--clé-aléatoire-enveloppée-session-ou-mot-de-passe-code-de-récupération)) | `src/data/`, `src/main/vault/`, `src/renderer/src/features/vault/`    |
| Sauvegardes (M1)        | Fichier unique chiffré (même clé), manifeste sans donnée personnelle, empreinte SHA-256 ; restauration vérifiée (intégrité complète, aperçu) puis confirmée, jamais coffre verrouillé ; chemins choisis par boîte de dialogue du main, jamais fournis par le renderer ; export CSV protégé contre l'injection de formule ([ADR-030](decisions.md#adr-030--sauvegardes--un-fichier-chiffré-portable-restauration-vérifiée-en-trois-temps))       | `src/data/backup/`, `src/data/export.ts`                              |
| Démonstration (M1)      | Coffre séparé, clé jamais enregistrée, supprimé à la sortie ; coffre réel verrouillé pendant la démonstration, opérations sur ses secrets refusées ([ADR-031](decisions.md#adr-031--coffre-de-démonstration-séparé-et-jetable))                                                                                                                                                                                                                 | `src/data/host.ts`                                                    |
| Registre (M2)           | Un canal IPC et une fonction preload par méthode (liste fermée, objet figé), entrée validée par le main puis par le service ; échecs attendus réduits à un code ; IBAN masqué partout (audit compris), en clair seulement pour une copie demandée ; fenêtre de test jamais affichée hors des tests E2E ([ADR-032](decisions.md#adr-032--registre--api-de-domaine-écritures-tracées-recherche-plein-texte))                                      | `src/shared/ledger/`, `src/data/ledger/`                              |
| Application packagée    | Pas d'outils de développement, pas de menu de rechargement, instance unique                                                                                                                                                                                                                                                                                                                                                                     | `src/main/window.ts`, `src/main/menu.ts`                              |
| Fuses Electron          | `runAsNode`, `NODE_OPTIONS` et `--inspect` désactivés ; intégrité ASAR ; chargement depuis l'ASAR uniquement ; cookies chiffrés                                                                                                                                                                                                                                                                                                                 | `electron-builder.yml`                                                |
| macOS                   | Hardened Runtime, seul entitlement : JIT de V8                                                                                                                                                                                                                                                                                                                                                                                                  | `build/entitlements.mac.plist`                                        |
| Confidentialité         | Masquage des montants, exclusion des captures d'écran, aucune télémétrie, aucune police ou ressource distante                                                                                                                                                                                                                                                                                                                                   | `src/renderer/`, `src/main/index.ts`                                  |

Ces mesures sont couvertes par des tests unitaires (CSP, chemins, URL, masquage, schémas, enveloppe de clé, coffre) et des tests E2E (isolation, CSP effective, rejet IPC, fenêtres bloquées, base illisible sans la clé, déverrouillage et verrouillage, clé refusée si fournie par le renderer).

## Mesures prévues

| Jalon | Mesure                                                                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| M0    | CodeQL, revue des dépendances, OpenSSF Scorecard, Dependabot (workflows écrits, actifs dès la création du dépôt GitHub) ; `SECURITY.md` en place |
| M3    | Analyseurs dans un processus isolé, limites, protection XXE                                                                                      |
| M4    | Expressions régulières bornées (ReDoS)                                                                                                           |
| M7    | Clés d'API chiffrées côté main, anonymisation, consentement, pdf.js sans évaluation de code, aucune requête sans accord (test)                   |
| M9    | Signature et notarisation, mises à jour vérifiées, SBOM et attestations de provenance, audit externe                                             |

## Chaîne d'approvisionnement

La politique est définie dans `.npmrc` et `package.json` (npm ≥ 12 requis via `devEngines`) :

- **Scripts d'installation bloqués** pour toutes les dépendances ; toute dépendance avec un script non revu fait échouer l'installation (`strict-allow-scripts`). Refus explicites (`allowScripts`) :
  - `electron` : le binaire est installé par le script du projet (`install-electron`), visible et maîtrisé ;
  - `electron-winstaller` : sert uniquement à la cible Squirrel.Windows, non utilisée (NSIS) ;
  - `esbuild` : ses binaires arrivent par dépendances optionnelles de plateforme, le script est superflu ;
  - `better-sqlite3-multiple-ciphers` : npm lui prête un script `node-gyp rebuild` (présence de `binding.gyp`) ; les binaires N-API précompilés sont dans le paquet, la compilation est inutile ([ADR-027](decisions.md#adr-027--moteur-du-coffre--sqlite3-multiple-ciphers-format-sqlcipher-sql-typé-service-isolé)).
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

Merci de **ne pas ouvrir de ticket public**. Utilisez le signalement privé de GitHub (« Report a vulnerability » dans l'onglet _Security_ du dépôt). La politique complète (versions prises en charge, délais de réponse, périmètre) est dans [`SECURITY.md`](../../SECURITY.md).

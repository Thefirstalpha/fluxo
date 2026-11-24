# Journal des décisions d'architecture

Chaque décision structurante est consignée ici : contexte, choix, conséquences. Une décision peut être remplacée par une nouvelle ; elle n'est jamais effacée.

---

### ADR-001 — Electron, electron-vite, electron-builder

- **Statut** : acceptée (M0).
- **Contexte** : application de bureau multiplateforme ; Electron est un besoin fondateur. Tauri, plus léger, a été écarté pour cette raison et pour l'homogénéité du moteur de rendu entre systèmes.
- **Décision** : Electron 45 ; electron-vite pour le build (main, preload, renderer) ; electron-builder pour les installeurs, la signature et les mises à jour.
- **Conséquences** : poids plancher de Chromium compensé par la discipline de dépendances ([performance](performance.md)).

### ADR-002 — React 19 et TypeScript strict

- **Statut** : acceptée, définitive (confirmée 2026-11-24, [ADR-020](#adr-020--confirmations-groupées-du-24-novembre-2026)).
- **Contexte** : écosystème le plus large (tableaux, graphiques, tests), vivier de contributeurs.
- **Décision** : React 19, TypeScript en mode strict avec `noUncheckedIndexedAccess`. La logique métier pure reste dans `src/shared`, sans dépendance à React ni à Electron (frontière vérifiée par ESLint) — séparation saine, indépendamment de tout projet mobile (abandonné, [ADR-023](#adr-023--compagnon-mobile-abandonné)).
- **Conséquences** : bundle de base plus lourd que Svelte ou Solid (~60 Ko compressés), jugé acceptable en local.

### ADR-003 — Styles : Tailwind CSS 4 + design tokens, thème piloté par `nativeTheme`

- **Statut** : acceptée (M0).
- **Décision** : tokens CSS (`--fx-*`) en clair dans `:root`, en sombre sous `prefers-color-scheme: dark` ; le process main règle `nativeTheme.themeSource` selon la préférence.
- **Conséquences** : bon thème dès la première image (sans script), barre de titre native assortie ; deux couleurs dupliquées côté TypeScript, alignement vérifié par un test.

### ADR-004 — Graphiques : Apache ECharts « à la carte »

- **Statut** : acceptée (M0).
- **Contexte** : besoin de zoom, sélection de plage, infobulles riches, Sankey, calendrier, rendu canvas performant.
- **Décision** : ECharts 6 via `echarts/core` avec enregistrement explicite des modules ; options construites par des fonctions pures testées.
- **Conséquences** : ~550 Ko minifiés isolés dans le chunk du tableau de bord ; infobulles HTML échappées systématiquement.

### ADR-005 — Protocole privé `app://` et CSP en en-tête

- **Statut** : acceptée (M0).
- **Décision** : servir le renderer par `protocol.handle('app', …)` avec garde-fou de chemins, liste blanche MIME et CSP envoyée en en-tête ; `file://` jamais utilisé (fuse désactivé).
- **Conséquences** : origine propre, CSP non contournable par le contenu, `frame-ancestors` effectif.

### ADR-006 — IPC : API métier minimale, validée côté main

- **Statut** : acceptée (M0).
- **Décision** : une fonction par besoin dans le preload ; côté main, vérification de l'émetteur + schéma zod strict ; erreurs réduites à `FORBIDDEN`, `INVALID_INPUT`, `INTERNAL_ERROR`.
- **Conséquences** : chaque nouvelle capacité est explicite, revue et testée.

### ADR-007 — npm 12 avec scripts bloqués et délai de publication

- **Statut** : acceptée (M0).
- **Contexte** : attaques récentes de l'écosystème npm via scripts d'installation et versions piégées éphémères.
- **Décision** : npm ≥ 12 (`devEngines`), `allowScripts` + `strict-allow-scripts`, `min-release-age=7`, pas de dépendances Git/URL ; pnpm non retenu pour éviter un prérequis supplémentaire à protections équivalentes.
- **Conséquences** : Node 26 fournit npm 11 → npm 12 à installer explicitement (documenté, géré en CI).

### ADR-008 — TypeScript 6.0 (et non 7)

- **Statut** : acceptée, à réévaluer.
- **Contexte** : TypeScript 7 (compilateur natif) n'est pas encore pris en charge par typescript-eslint (`typescript < 6.1`).
- **Décision** : TypeScript 6.0 ; Dependabot ignore TypeScript ≥ 7 en attendant.

### ADR-009 — Montants en centimes entiers

- **Statut** : acceptée (M0).
- **Décision** : tout montant est un entier en unités mineures + devise ; analyse et formatage centralisés (`src/shared/money.ts`).
- **Conséquences** : aucune erreur d'arrondi flottant dans les sommes et contrôles.

### ADR-010 — Local d'abord, base SQLCipher

- **Statut** : acceptée et précisée par [ADR-027](#adr-027--moteur-du-coffre--sqlite3-multiple-ciphers-format-sqlcipher-sql-typé-service-isolé) (M1) ; mot de passe maître facultatif tranché ([ADR-020](#adr-020--confirmations-groupées-du-24-novembre-2026)).
- **Décision envisagée** : SQLite chiffré (SQLCipher) dans un processus utilitaire ; clé protégée par le trousseau du système ou, à défaut (certains Linux) ou si l'utilisateur le préfère, un mot de passe maître facultatif (Argon2id).
- **Points ouverts** : couche de requêtes (Drizzle, Kysely ou SQL typé).

### ADR-011 — Internationalisation maison, typée

- **Statut** : acceptée (M0).
- **Décision** : dictionnaires TypeScript (`fr` définit la forme, `en` doit la respecter), fonctions pour les textes paramétrés ; aucune dépendance.
- **Conséquences** : clé manquante = erreur de compilation ; migration vers une bibliothèque possible si le pluriel ou la traduction communautaire l'exigent.

### ADR-012 — Routage par fragment (wouter) et état Zustand

- **Statut** : acceptée (M0).
- **Décision** : wouter (≈ 2 Ko) avec routes `#/…`, compatibles avec `app://` sans réécriture d'URL ; Zustand pour l'état d'interface ; données métier via le process main (TanStack Query au M2).

### ADR-013 — Étiquettes posées sur la ventilation (Split), pas sur la transaction

- **Statut** : acceptée (M2), réversible jusqu'au début du M2 si l'expérience de saisie s'y prête mal.
- **Contexte** : une dépense peut être scindée en plusieurs catégories (ventilation) ; les étiquettes doivent permettre une corrélation transverse aux catégories (ex. « tous mes abonnements téléphoniques », qu'ils soient classés en « Télécom » ou en « Pro »), indépendamment du nombre de parts.
- **Décision** : le `Tag` est associé au `Split`, en relation plusieurs-à-plusieurs. Une transaction non ventilée possède une seule part implicite, donc le cas courant (une transaction, une catégorie, quelques étiquettes) reste simple à saisir et à afficher.
- **Conséquences** : les filtres par étiquette (M2, M5) et les règles qui posent des étiquettes (M4) opèrent au niveau de la part, pas de la transaction ; une vue « Étiquettes » dédiée reste possible pour parcourir les dépenses par étiquette plutôt que par catégorie.

### ADR-014 — Crédits et actifs externes modélisés comme des comptes, valorisation manuelle par défaut

- **Statut** : acceptée (M8).
- **Contexte** : visibilité sur les crédits (immobilier, consommation) et le patrimoine (épargne, placements) demandée en plus du suivi des dépenses ; le principe local-first exclut une connexion bancaire ou boursière automatique par défaut ([vision](../projet/vision.md#principes-directeurs)).
- **Décision** : un crédit est un `Account` de type `prêt` doté d'un échéancier (`LoanInstallment`, capital/intérêts/assurance par mensualité) ; un actif externe (placement, immobilier) est un `Account` en mode « valorisation manuelle », alimenté par des `ValuationEntry` saisies périodiquement. Le patrimoine net est calculé (actifs − capital restant dû), jamais saisi directement.
- **Conséquences** : pas de cotation automatique en v1 (fiabilité et confidentialité) ; la précision du patrimoine net dépend de la régularité des valorisations saisies par l'utilisateur ; une connexion facultative à des cotations reste une piste post-v1 ([M10](../planning/M10-au-dela.md)).

### ADR-015 — Licence MIT

- **Statut** : acceptée (2026-11-24).
- **Contexte** : [Q1](../planning/questions-ouvertes.md) ; adoption la plus large possible, y compris par des utilisateurs ou intégrateurs non familiers des licences copyleft.
- **Décision** : licence MIT pour tout le code du dépôt (fichier [`LICENSE`](../../LICENSE)). Les polices et bibliothèques tierces embarquées gardent leur propre licence, listée dans `THIRD_PARTY_NOTICES` (M0, à faire).
- **Conséquences** : aucune obligation de réciprocité pour les dérivés ; cohérent avec l'absence de service hébergé à protéger.

### ADR-016 — Modèle économique : gratuit et libre, sans monétisation en v1

- **Statut** : acceptée (2026-11-24).
- **Contexte** : [Q3](../planning/questions-ouvertes.md) ; éviter qu'une fonctionnalité essentielle dépende d'un service payant, cohérent avec le principe local-first ([vision](../projet/vision.md)).
- **Décision** : Fluxo reste gratuit et son code reste libre (MIT, [ADR-015](#adr-015--licence-mit)). Un mécanisme de don est une piste possible, mais explicitement différée : aucune fonctionnalité de don, de compte ou de palier payant n'entre dans le périmètre de la v1.
- **Conséquences** : aucune dépendance à un service de paiement ou de compte à construire avant la v1 ; la question pourra être rouverte après la v1 si le projet grandit.

### ADR-017 — IA locale légère par défaut recommandée, cloud toujours facultatif

- **Statut** : acceptée (2026-11-24), précise le pipeline [IA](ia.md).
- **Contexte** : [Q4](../planning/questions-ouvertes.md) ; le principe local-first exige de ne pas rendre l'extraction de documents dépendante d'un service en ligne, mais un grand modèle de langage local (type Ollama) suppose une installation séparée que beaucoup d'utilisateurs ne feront pas.
- **Décision** : l'ordre reste déterministe → IA locale → IA cloud consentie → saisie assistée. Le fournisseur `local` cible en priorité un **petit modèle spécialisé embarqué** (quelques centaines de Mo, téléchargé à la demande avec empreinte vérifiée — jamais dans l'installeur, même principe que les données OCR), suffisant pour l'extraction de champs sur des documents structurés ; un utilisateur avancé peut pointer vers un serveur d'inférence local déjà installé (Ollama ou équivalent) pour un modèle plus capable. Le fournisseur cloud (`anthropic`) reste désactivé par défaut, avec clé personnelle et consentement par document.
- **Conséquences** : l'application reste légère par défaut (rien de lourd téléchargé sans action explicite) ; le choix du modèle léger exact reste ouvert ([Q2, nouvelle numérotation](../planning/questions-ouvertes.md)).

### ADR-018 — Pas de conservation des documents sources par défaut

- **Statut** : acceptée (2026-11-24) ; l'exception des justificatifs (C09) est retirée par [ADR-025](#adr-025--revue-des-propositions-du-24-novembre-2026).
- **Contexte** : [Q5](../planning/questions-ouvertes.md) ; Fluxo n'est pas conçu comme un système de stockage de documents, et conserver des bulletins ou relevés originaux élargit la surface de données sensibles à protéger.
- **Décision** : un document déposé (bulletin, relevé) est traité puis **supprimé** ; seules les données extraites, validées, et une empreinte (pour la détection de doublons) sont conservées dans la base chiffrée. Un export du fichier original reste possible **immédiatement après traitement, avant suppression**, à l'initiative de l'utilisateur. Les justificatifs attachés à une transaction (tickets, factures — C09) restent un geste délibéré et distinct, non concerné par cette règle.
- **Conséquences** : la proposition « Coffre des documents » (ancien H10 / P-29) est retirée du périmètre par défaut et remplacée par l'export immédiat facultatif ; le modèle de données `Document` ne prévoit plus de stockage chiffré de l'original par défaut.

### ADR-019 — Langue de la documentation : français pour les utilisateurs, anglais pour la contribution technique

- **Statut** : acceptée (2026-11-24).
- **Contexte** : [Q8](../planning/questions-ouvertes.md) ; premier public francophone, mais contributeurs techniques potentiellement internationaux.
- **Décision** : l'interface et les documents orientés utilisateur (`README.md`, `docs/projet/`, `docs/planning/`, `docs/design/`) restent en français. `CONTRIBUTING.md` et les futurs guides techniques destinés aux contributeurs de code sont rédigés en anglais. L'interface elle-même est conçue pour accueillir d'autres packs de langue au-delà de FR/EN (dictionnaires typés, `src/renderer/src/i18n/`), sans engagement de calendrier.
- **Conséquences** : pas de traduction immédiate de `docs/architecture/` ni de `docs/planning/` ; à réévaluer si des contributeurs non francophones rejoignent le projet.

### ADR-020 — Confirmations groupées du 24 novembre 2026

- **Statut** : acceptée.
- **Contexte** : réponses apportées aux questions ouvertes restantes ; chacune confirme la recommandation déjà documentée, consignées ici ensemble plutôt qu'en ADR séparées.
- **Décisions** :
  - **Pays** ([Q2](../planning/questions-ouvertes.md)) : France d'abord ; architecture « pack pays » prévue dès le M6 (salaires) pour accueillir d'autres pays francophones ensuite.
  - **Mot de passe maître** ([Q6](../planning/questions-ouvertes.md)) : facultatif, voir [ADR-010](#adr-010--local-dabord-base-sqlcipher).
  - **Synchronisation multi-appareils** ([Q7](../planning/questions-ouvertes.md)) : envisagée mais différée (M10) ; les identifiants UUIDv7 et le journal d'audit, déjà prévus dès le M1, gardent la porte ouverte sans surcoût immédiat.
  - **Framework** ([Q9](../planning/questions-ouvertes.md)) : React confirmé définitivement, voir [ADR-002](#adr-002--react-19-et-typescript-strict).
  - **Intensité visuelle** ([Q10](../planning/questions-ouvertes.md)) : le socle sobre actuel est conservé par défaut ; un thème « Néon » optionnel (P-37) reste la voie pour qui veut un rappel plus appuyé de l'esthétique visuelle.
  - **Plateformes** ([Q12](../planning/questions-ouvertes.md)) : les trois systèmes dès la CI du M0 (déjà le plan). L'intérêt pour une cible téléphone a été réévalué et abandonné ensuite, voir [ADR-023](#adr-023--compagnon-mobile-abandonné).
  - **Suivi GitHub** ([Q13](../planning/questions-ouvertes.md)) : pas de « milestones » ni d'issues GitHub reflétant les jalons ou les lots ; `docs/planning/` reste la seule référence de suivi. Les modèles d'issues de bug/fonctionnalité (M0) restent utiles pour les retours de la communauté et ne sont pas concernés par cette décision.
- **Conséquences** : aucune des recommandations initiales n'est remise en cause sur le fond, sauf le suivi GitHub (inversé) ; le tableau des questions ouvertes ne garde que les points réellement encore indécis.

### ADR-021 — Nom « Fluxo » confirmé malgré une homonymie BTP

- **Statut** : acceptée (2026-11-25).
- **Contexte** : [Q1](../planning/questions-ouvertes.md) ; une entreprise du BTP commercialisant des tuyaux utilise déjà « Fluxo ».
- **Décision** : le nom est conservé. Le secteur (bâtiment/plomberie) et la classe de produits sont suffisamment éloignés d'un logiciel de finances personnelles pour que le risque de confusion reste faible. La recherche formelle de marques déposées (INPI, EUIPO), de nom de domaine et de présence sur les boutiques applicatives reste à faire avant toute communication publique ([M9, lot « Juridique »](../planning/M9-distribution.md)).
- **Conséquences** : `appId` et nom restent `app.fluxo.desktop` / « Fluxo » ; si la recherche formelle révèle un conflit réel (même classe, même marché), cette décision sera révisée avant le M9, pas après.

### ADR-022 — Déclenchement de l'IA locale : sur document non reconnu ou champ manquant

- **Statut** : acceptée (2026-11-25), complète [ADR-017](#adr-017--ia-locale-légère-par-défaut-recommandée-cloud-toujours-facultatif).
- **Contexte** : [Q2](../planning/questions-ouvertes.md) ; un CSV, un OFX ou un bulletin dans un format déjà connu n'ont besoin d'aucun modèle — proposer une IA par défaut serait une complexité inutile pour le cas le plus fréquent.
- **Décision** : l'IA (locale ou cloud) n'est **proposée** que lorsque le traitement déterministe échoue ou reste incomplet : format de document non reconnu, champ attendu manquant ou non reconnu après extraction. Dans tous les autres cas (CSV, OFX/QFX, QIF, CAMT.053, format de bulletin connu), aucun modèle n'est sollicité.
- **Conséquences** : le fournisseur `none` traite la grande majorité des cas sans jamais proposer d'activer une IA ; l'invite d'activation (M7, Lot 3) n'apparaît que sur les cas réellement ambigus, avec le champ ou le document en cause affiché.

### ADR-023 — Compagnon mobile abandonné

- **Statut** : acceptée (2026-11-25).
- **Contexte** : [Q3](../planning/questions-ouvertes.md) ; un compagnon mobile (K02, saisie rapide, photo de ticket) avait été envisagé, avec une architecture React Native pressentie.
- **Décision** : l'idée est abandonnée, pas seulement différée. Les analyses et la gestion fine des finances se prêtent mal à un usage mobile ; les cas d'usage réellement mobiles (saisie instantanée) ne justifient pas, à eux seuls, le coût d'une seconde application à maintenir.
- **Conséquences** : K02 et la proposition associée (ancien P-41) sont retirés de [M10](../planning/M10-au-dela.md) et du [catalogue des fonctionnalités](../projet/fonctionnalites.md) ; la numérotation K02–K10 est décalée d'un rang. `src/shared` reste framework-agnostic pour de bonnes raisons indépendantes (séparation des couches), pas en vue d'un compagnon mobile.

### ADR-024 — Nom du thème visuel « Vice Sunset » conservé

- **Statut** : acceptée (2026-11-25).
- **Contexte** : [Q1](../planning/questions-ouvertes.md) ; « Vice » évoque « Vice City » (GTA), ce qui a motivé la question. Un thème de couleurs et de typographie n'est cependant pas un signe distinctif déposé par Rockstar, et le reste de l'identité (logo, nom de l'application, palette) est déjà entièrement original.
- **Décision** : le nom « Vice Sunset » est conservé pour désigner l'identité visuelle, dans tous les documents et dans le code.
- **Conséquences** : aucun changement de vocabulaire à faire ; à revisiter seulement si une mise en demeure ou un retour de la communauté l'exigeait.

### ADR-025 — Revue des propositions du 24 novembre 2026

- **Statut** : acceptée (2026-11-24) ; remplace la dernière phrase de la décision d'[ADR-018](#adr-018--pas-de-conservation-des-documents-sources-par-défaut).
- **Contexte** : revue des [propositions](../planning/propositions.md) par la personne qui pilote le projet.
- **Décisions** :
  - **Saisie en langage naturel** (ancienne P-11) abandonnée : la priorité est d'**annoter** les opérations issues des relevés (notes, étiquettes, catégories), pas d'accélérer leur saisie. Elle est remplacée par l'**écriture d'ajustement** (P-11 révisée, D11) : quand le rapprochement des soldes (D08) révèle un écart, l'utilisateur peut le combler par une opération d'ajustement annotée, sans disposer du relevé manquant ; si ce relevé est importé plus tard, l'ajustement est proposé à la suppression.
  - **Justificatifs attachés** (C09, ancienne P-12) retirés : Fluxo ne stocke aucun fichier, y compris les tickets et factures ; l'exception prévue par ADR-018 disparaît. Une note texte sur l'opération (« facture rangée dans… ») reste possible.
  - **Congés & RTT** (G05, ancienne P-24) retirés, jugés inutiles ; la section correspondante sort du modèle du bulletin.
  - Les identifiants retirés (C09, G05, P-12, P-24) ne sont **pas réattribués**, pour que les renvois existants restent sans ambiguïté.
- **Conséquences** : aucune entité de pièce jointe dans le modèle de données ; `Transaction` gagne une nature « ajustement », comptée dans le solde mais exclue par défaut des revenus et dépenses ; M6 et M7 perdent les lots correspondants.

### ADR-026 — Saisie manuelle réservée aux comptes sans relevé

- **Statut** : acceptée (2026-11-24) ; complète [ADR-025](#adr-025--revue-des-propositions-du-24-novembre-2026).
- **Contexte** : une dépense saisie à la main sur un compte bancaire peut ne jamais correspondre à une ligne du relevé (montant arrondi, date décalée, oubli, doublon avec l'import) : le solde de Fluxo s'écarte alors de celui de la banque sans qu'on sache pourquoi.
- **Décision** : le relevé de la banque fait foi. Chaque compte a un **mode de suivi** : _relevé importé_ (défaut pour courant, épargne, carte à débit différé), _saisie manuelle_ (défaut pour espèces et titres-restaurant, qui n'ont pas de relevé à contredire), _valorisation manuelle_ (placements, [ADR-014](#adr-014--crédits-et-actifs-externes-modélisés-comme-des-comptes-valorisation-manuelle-par-défaut)). Sur un compte à relevé, les opérations ne viennent que d'un import ou d'une écriture d'ajustement (D11) ; on les annote (catégorie, ventilation, étiquettes, notes, libellé affiché) sans toucher à leur montant, leur date ni leur compte. Le service de données refuse toute autre écriture.
- **Conséquences** : le statut « prévue » disparaît des opérations (l'anticipation relève des prévisions et de la simulation, M8) ; la saisie rapide (Ctrl/⌘ N) ne vise que les comptes en saisie manuelle ; avant le M3, les comptes à relevé ne contiennent que des données de démonstration. La saisie des bulletins (M6) et des valorisations (M8) n'est pas concernée : ce ne sont pas des opérations bancaires.

### ADR-027 — Moteur du coffre : SQLite3 Multiple Ciphers (format SQLCipher), SQL typé, service isolé

- **Statut** : acceptée (2026-11-24, M1 lot 1) ; tranche les points ouverts d'[ADR-010](#adr-010--local-dabord-base-sqlcipher).
- **Contexte** : prototype du 24/11/2026 (Windows 11, Node 26.13, Electron 45.3 / Node 24.22, ABI 150), mesures ci-dessous.
- **Décisions** :
  - **Liaison SQLite** : `better-sqlite3-multiple-ciphers` 13.2 (SQLite 3.54.1). Depuis la v13 elle passe par **N-API** : le même binaire fonctionne sous Node (tests unitaires) et sous Electron, sans recompilation ; les binaires précompilés (Windows, macOS, Linux glibc et musl, x64 et arm64) sont **dans le paquet npm** — aucun téléchargement à l'installation. npm 12 lui prête un script `node-gyp rebuild` (présence de `binding.gyp`) : il est **refusé** dans `allowScripts`, la compilation étant inutile. Seul le binaire de la plateforme cible est embarqué dans l'installeur.
  - **Chiffrement** : schéma **SQLCipher 4** (`cipher=sqlcipher`, `legacy=4` : AES-256-CBC, HMAC-SHA512 par page) avec une **clé brute** de 256 bits (pas de PBKDF2 : la clé est déjà aléatoire, voir lot 2). Avec sa clé, la base reste lisible par les outils SQLCipher standard : l'utilisateur n'est pas prisonnier de Fluxo. Vérifié : en-tête et contenu illisibles, mauvaise clé refusée (`SQLITE_NOTADB`), `VACUUM INTO` produit une copie chiffrée.
  - **Couche de requêtes : SQL typé, sans ORM**. Poids mesurés (bundle minifié d'une requête type) : Kysely 0.29 **158 Ko** (30 Ko compressés, API asynchrone posée sur un pilote synchrone), Drizzle 0.45 **64 Ko** (17 Ko ; migrations générées par drizzle-kit, version < 1.0), SQL typé **0 Ko**. Le typage repose sur des types de lignes et des fonctions de conversion par dépôt, couverts par des tests sur une vraie base chiffrée ; les migrations sont écrites à la main en SQL (les limites d'`ALTER TABLE` de SQLite l'imposent de toute façon). À réévaluer au M2 si le nombre de requêtes rend la vérification à la compilation rentable (Drizzle en premier candidat).
  - **Argon2id** : `crypto.argon2` de Node est indisponible dans Electron (BoringSSL : « Argon2 algorithm not supported ») → **hash-wasm** 4.13, module Argon2 autonome de 30 Ko (WebAssembly, bundlé). Paramètres : 64 Mio, 3 passes, parallélisme 1 (2ᵉ jeu recommandé par la RFC 9106) ≈ 215 ms sous Electron sur le poste de développement.
  - **Processus** : la base vit dans un `utilityProcess` (`src/data/`), relié au main par un `MessagePort`. Requêtes validées par schéma zod, traitées une par une, erreurs réduites à un code ; le journal du service est relayé au journal du main (expurgé). Le code du service n'importe pas Electron : il est testé sous Node.
- **Conséquences** : première entrée de `dependencies` (module natif, externalisé du bundle) ; environ +2,5 Mo par installeur ; la clé passe par une chaîne JavaScript pour `PRAGMA key`, qui ne peut pas être effacée de la mémoire (limite connue, le processus du service est le seul concerné).

### ADR-028 — Clés du coffre : clé aléatoire enveloppée, session ou mot de passe, code de récupération

- **Statut** : acceptée (2026-11-24, M1 lot 2) ; précise [ADR-010](#adr-010--local-dabord-base-sqlcipher) et [ADR-020](#adr-020--confirmations-groupées-du-24-novembre-2026) (mot de passe facultatif).
- **Contexte** : la base doit rester illisible si elle est copiée, s'ouvrir sans friction sur une session personnelle, et pouvoir exiger un mot de passe sur un ordinateur partagé ; un mot de passe oublié ne doit pas condamner les données si l'utilisateur a pris une précaution.
- **Décisions** :
  - **Clé de base** : 256 bits aléatoires, tirés à la création, jamais dérivés d'un secret, jamais affichés ni journalisés. Elle n'existe en clair que dans le service de données (coffre déverrouillé) et, en mode session, brièvement dans le main.
  - **Enveloppe** (`vault/keystore.json`, validée par schéma, écriture atomique) : la clé y est seulement **enveloppée**. Changer de mot de passe ou de mode ré-enveloppe la clé sans re-chiffrer la base.
    - **Mode session** : clé chiffrée par `safeStorage` (DPAPI, Trousseau macOS, libsecret/kwallet) ; seul le main sait l'ouvrir ; déverrouillage automatique au lancement. Sous Linux, le repli `basic_text` d'Electron (aucune protection réelle) est **refusé** : mot de passe imposé, avec explication.
    - **Mode mot de passe** : AES-256-GCM sous une clé dérivée par Argon2id (64 Mio, 3 passes, 1 voie — [ADR-027](#adr-027--moteur-du-coffre--sqlite3-multiple-ciphers-format-sqlcipher-sql-typé-service-isolé)), sel de 16 octets et IV de 12 octets tirés à chaque enveloppement, mot de passe normalisé NFC. Les données authentifiées (AAD) lient l'enveloppe au coffre et à son usage. Paramètres bornés à la lecture (un fichier modifié ne peut pas épuiser la mémoire). Longueur minimale de 10 caractères, sans règle de composition (recommandation NIST, phrase de passe encouragée).
    - Les deux modes sont exclusifs : passer au mot de passe retire l'enveloppe de session (sinon quiconque ouvre la session ouvrirait le coffre).
  - **Code de récupération** (facultatif, proposé coché à la création) : 160 bits aléatoires en Crockford base 32, 8 groupes de 4 caractères (saisie tolérante : casse, espaces, I/L/O), enveloppé comme un mot de passe. Affiché **une seule fois**, jamais stocké en clair ; en créer un nouveau invalide l'ancien. Après un déverrouillage par le code, un nouveau mot de passe est exigé (mode mot de passe) ou la clé est ré-enveloppée pour le trousseau (mode session). Sans code, un mot de passe oublié ou un trousseau perdu signifie des données perdues : c'est expliqué à la création et dans les paramètres.
  - **Actions sensibles** (changer le mot de passe, passer en mode session, créer ou supprimer le code) : le mot de passe actuel est exigé en mode mot de passe, avec les mêmes délais qu'au déverrouillage.
  - **Délais après échecs** : 3 essais libres, puis 1 s, 2 s, 4 s… plafonnés à 5 minutes ; compteur conservé sur disque (`vault/lockout.json`), un fichier altéré applique le plafond. C'est un frein aux essais par l'interface ; contre une copie du fichier, Argon2id et la longueur du mot de passe protègent.
  - **Verrouillage automatique** : session du système verrouillée ou mise en veille (`powerMonitor`), et inactivité du système (15 minutes par défaut, réglable : 5, 15, 30, 60 minutes ou jamais). En mode session, déverrouiller ne demande qu'un clic : le verrouillage protège alors du regard, pas d'une personne qui utilise la session.
  - **Préférences en JSON** (tranche la question du lot 3 du M1) : `settings.json` reste un fichier clair hors de la base, car il est lu **avant** le déverrouillage (thème et langue de l'écran du coffre, délai de verrouillage). Il ne contient aucune donnée personnelle ni financière ; tout réglage sensible ira dans la base.
- **Conséquences** : la clé de la base passe par des chaînes JavaScript (`safeStorage.encryptString`, `PRAGMA key`) qui ne peuvent pas être effacées de la mémoire : limite connue, confinée au main (mode session, brièvement) et au service. Un logiciel malveillant agissant dans la session de l'utilisateur reste hors du modèle de menace ([sécurité](securite.md)).

### ADR-029 — Schéma v1 : règles portées par la base, migrations transactionnelles

- **Statut** : acceptée (2026-11-24, M1 lot 3).
- **Contexte** : le modèle de données est coûteux à changer après coup ; les règles qui protègent les montants et l'origine des opérations ([ADR-026](#adr-026--saisie-manuelle-réservée-aux-comptes-sans-relevé)) ne doivent pas dépendre de la vigilance de chaque écran ou de chaque futur contributeur.
- **Décisions** :
  - **Tables `STRICT`** : un montant (`INTEGER`) n'accepte qu'un entier — un flottant ou un texte non entier est refusé par SQLite lui-même ([ADR-009](#adr-009--montants-en-centimes-entiers)).
  - **Contraintes `CHECK`** : identifiants de 36 caractères (UUIDv7, générés par `src/shared/uuid.ts`, triables), dates calendaires valides (`date(x) IS x` : le 30 février est refusé), horodatages au format `toISOString()`, devises ISO 4217 en majuscules, énumérations fermées, longueurs bornées, JSON valide ; une écriture d'ajustement exige une note.
  - **Triggers pour l'ADR-026** : sur un compte « relevé importé », une opération ne naît que d'un lot d'import ou d'un ajustement, et son montant, sa date, sa devise et son compte sont figés ; un compte en valorisation manuelle n'a pas d'opérations. L'annotation (libellé, notes, catégories) reste libre.
  - **Journal d'audit en ajout seul** (triggers interdisant modification et suppression) ; une écriture en masse (démonstration, import) produit une entrée par lot.
  - **Σ des ventilations = montant** : SQLite n'a pas de contrainte différée ; l'invariant est vérifié par le service à chaque écriture (M2) et par un contrôle de cohérence testé (`findUnbalancedTransactions`).
  - **Migrations** : SQL écrit à la main, versionné par `PRAGMA user_version`, chaque migration dans une transaction (schéma + version) ; une base existante est **copiée avant** la première migration (`backups/pre-migration-v<n>-<date>.db`, chiffrée avec la même clé) ; une base d'une version plus récente de Fluxo est **refusée sans être modifiée**. Une migration publiée ne se modifie plus.
- **Conséquences** : une erreur de programmation ne peut pas écrire un montant flottant ni une opération manuelle sur un compte bancaire ; le prix est un schéma plus verbeux et des migrations plus soigneuses (SQLite ne sait pas modifier une contrainte : il faut recréer la table).

### ADR-030 — Sauvegardes : un fichier chiffré portable, restauration vérifiée en trois temps

- **Statut** : acceptée (2026-11-24, M1 lot 4).
- **Contexte** : une sauvegarde doit rester illisible si elle est copiée, se restaurer sur un autre ordinateur, et ne jamais aggraver une situation (fichier endommagé, mauvais fichier, restauration par erreur).
- **Décisions** :
  - **Format** : un seul fichier `Fluxo-<date>-<type>.fluxo-backup` = signature `FLUXOBK1` + longueur + manifeste JSON + copie SQLCipher de la base (`VACUUM INTO`, même clé). Le manifeste, en clair, ne contient **aucune donnée personnelle** : type, date, versions, identifiant du coffre, taille et empreinte SHA-256 de la base, et les enveloppes **mot de passe** et **code de récupération** ([ADR-028](#adr-028--clés-du-coffre--clé-aléatoire-enveloppée-session-ou-mot-de-passe-code-de-récupération)) qui permettent de la restaurer ailleurs. L'enveloppe de session (liée au poste) n'y figure jamais : un coffre « session » sans code de récupération a des sauvegardes **non portables**, ce que les paramètres signalent. Une sauvegarde reste ouvrable avec le mot de passe en vigueur au moment où elle a été faite.
  - **Types** : manuelle, automatique (au déverrouillage puis toutes les 24 h, désactivable), avant migration, avant restauration. Seules les automatiques sont supprimées par la rotation : la plus récente de chacun des 7 derniers jours, des 4 dernières semaines ISO et des 12 derniers mois (UTC).
  - **Dossier** : par défaut `vault/backups/` ; un autre dossier (clé USB, disque externe) se choisit par une **boîte de dialogue du process main** — le renderer ne fournit jamais de chemin. Il est mémorisé dans la base (`meta`) ; s'il est indisponible, la sauvegarde retombe sur le dossier par défaut.
  - **Restauration en trois temps** : (1) choix du fichier par boîte de dialogue, lecture du manifeste, le renderer ne reçoit qu'un **jeton** ; (2) clé du coffre ouvert (même coffre) ou secret de la sauvegarde (autre coffre, mêmes délais après échecs qu'au déverrouillage), vérification de l'empreinte, extraction, `integrity_check` complet et **aperçu** (comptes, opérations, période) ; (3) confirmation : sauvegarde « avant restauration » de l'existant, remplacement de la base, migration éventuelle, audit. Autorisée sans coffre (nouvel ordinateur) ou coffre ouvert, **jamais coffre verrouillé**. Restaurée avec le code de récupération, ou depuis un coffre sans mot de passe, la base exige un nouveau mot de passe — ou reprend le mode session si c'était le choix de l'utilisateur.
  - **Export** : JSON (toutes les tables) et un CSV par table, **non chiffrés** (avertissement affiché) ; les cellules CSV commençant par `=`, `+`, `-`, `@`, tabulation ou retour chariot sont préfixées d'une apostrophe (injection de formule), les nombres restent tels quels.
  - **Tout effacer** : base, enveloppe, compteur d'échecs, sauvegardes du dossier par défaut et fichiers `Fluxo-*.fluxo-backup` du dossier choisi, journaux ; mot de passe actuel exigé (mode mot de passe) et mot de confirmation saisi. Les préférences d'affichage sont conservées.
- **Conséquences** : une sauvegarde se copie et se restaure comme un fichier ordinaire, sans service en ligne ; la base entière est lue en mémoire pour l'emballer (acceptable pour la taille d'une base personnelle, à revoir si elle dépassait quelques centaines de Mo).

### ADR-031 — Coffre de démonstration séparé et jetable

- **Statut** : acceptée (2026-11-24, M1 lot 5).
- **Contexte** : le mode démonstration (A09) sert à découvrir Fluxo, faire des captures et tester sans données réelles ; il ne doit jamais pouvoir modifier, révéler ou être confondu avec le coffre réel.
- **Décisions** :
  - Un **second coffre**, dans un dossier distinct (`demo-vault/`), créé à chaque entrée avec une clé aléatoire **jamais enregistrée**, rempli par le grand livre déterministe (`src/shared/demo/demo-ledger.ts`) et **supprimé** à la sortie (et au démarrage, après un arrêt brutal).
  - Entrer en démonstration **verrouille le coffre réel** ; on y entre depuis l'écran de création ou de déverrouillage, jamais coffre réel ouvert. En sortir le laisse verrouillé.
  - Pendant la démonstration, le service refuse tout ce qui concerne le coffre réel ou ses secrets : mots de passe, code de récupération, sauvegardes, restauration, export, effacement ; la sauvegarde automatique est suspendue. Verrouiller referme la démonstration.
  - Un bandeau permanent et la barre d'état signalent le mode démonstration.
  - Le grand livre reproduit **exactement** les synthèses du tableau de bord de démonstration (même graine, mêmes totaux par mois et par catégorie : vérifié par test) ; les comptes à relevé y reçoivent un lot d'import « démo », conformément à l'[ADR-026](#adr-026--saisie-manuelle-réservée-aux-comptes-sans-relevé).
- **Conséquences** : la démonstration coûte une création de coffre (≈ 0,2 s) à chaque entrée ; elle ne laisse aucune trace une fois fermée. Les libellés des comptes et catégories de démonstration (pack France, FR/EN) vivent dans `src/shared` car le service de données n'a pas accès aux dictionnaires du renderer.

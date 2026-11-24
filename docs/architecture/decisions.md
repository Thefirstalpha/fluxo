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

- **Statut** : proposée (M1) ; mot de passe maître facultatif tranché ([ADR-020](#adr-020--confirmations-groupées-du-24-novembre-2026)).
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

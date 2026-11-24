# M1 — Coffre-fort local

> **Statut : 🟡 En cours** (démarré le 24/11/2026) · Taille : L · Dépend de : M0 · Version : 0.2

## Objectif

Stocker durablement toutes les données financières sur l'appareil, **chiffrées au repos**, avec un déverrouillage simple et sûr, des sauvegardes, et un schéma capable d'accueillir tous les jalons suivants.

## Valeur pour l'utilisateur

« Mes données restent chez moi, illisibles sans ma session ou mon mot de passe, et je ne peux pas les perdre. »

## Périmètre

**Inclus** : moteur de stockage chiffré, gestion des clés, écran de déverrouillage, verrouillage automatique, schéma v1 et migrations, sauvegarde et restauration, export, mode démo en base, service de données isolé.
**Hors périmètre** : écrans de gestion des comptes et transactions (M2), synchronisation entre appareils (M10).

## Récits utilisateur

- En tant qu'utilisateur, je veux que le fichier de ma base soit **illisible** s'il est copié.
- Je veux ouvrir Fluxo **sans mot de passe** sur ma session (trousseau du système), ou **exiger un mot de passe maître** si je partage l'ordinateur.
- Je veux que Fluxo **se verrouille** quand je m'absente ou verrouille ma session.
- Je veux des **sauvegardes automatiques chiffrées** dans le dossier de mon choix, et pouvoir **restaurer** sur un autre ordinateur.
- Je veux **exporter** toutes mes données dans un format ouvert, ou **tout effacer**.

## Plan d'action

### Lot 1 — Moteur & architecture

- [x] Décision ([ADR-027](../architecture/decisions.md#adr-027--moteur-du-coffre--sqlite3-multiple-ciphers-format-sqlcipher-sql-typé-service-isolé)) : `better-sqlite3-multiple-ciphers` 13.2 au format SQLCipher 4, clé brute ; **SQL typé** sans ORM, départagé par un prototype (Kysely 158 Ko, Drizzle 64 Ko, SQL typé 0 Ko) ; Argon2id par hash-wasm (`crypto.argon2` absent d'Electron). `Socle`
- [x] **Service de données** dans un `utilityProcess` dédié (`src/data/`, `out/main/data-service.js`) : échanges par `MessagePort`, API typée, requêtes validées par zod et traitées une par une, erreurs réduites à un code, journal relayé au main ; relancé après un arrêt inattendu. `Socle`
- [x] Dépendance native : liaison **N-API** dont les binaires précompilés (3 OS × x64/arm64) sont dans le paquet npm — ni `npmRebuild` ni `install-app-deps` ; script implicite `node-gyp rebuild` refusé dans `allowScripts` ; seul le binaire de la cible est embarqué (vérifié sous Windows : `win32-x64.node` dans `app.asar.unpacked`, démarrage du service depuis l'application packagée). `Socle`
- [x] Réglages SQLite : `journal_mode=WAL`, `synchronous=FULL`, `foreign_keys=ON`, `secure_delete=ON`, `temp_store=MEMORY` ; `quick_check` à chaque ouverture (base endommagée signalée, testé par altération d'une page). `Socle`

### Lot 2 — Clés & déverrouillage

- [x] Clé de base aléatoire de 256 bits, jamais affichée ni journalisée, présente en clair uniquement dans le service de données (et brièvement dans le main en mode session) ; effacée de la mémoire au verrouillage ([ADR-028](../architecture/decisions.md#adr-028--clés-du-coffre--clé-aléatoire-enveloppée-session-ou-mot-de-passe-code-de-récupération)). `Besoin`
- [x] Mode **session** : clé protégée par `safeStorage` (DPAPI sous Windows, Trousseau macOS, libsecret/kwallet sous Linux), déverrouillage automatique au lancement. `Besoin`
- [x] Mode **mot de passe maître** : clé enveloppée (AES-256-GCM, données authentifiées) par une clé dérivée Argon2id (hash-wasm, 64 Mio, 3 passes : ≈ 215 ms), sel et paramètres stockés avec l'enveloppe et bornés à la lecture ; 10 caractères au minimum. `Besoin`
- [x] Linux sans trousseau sécurisé (`basic_text`) : mode session désactivé, mot de passe maître imposé, avec explication (testé avec un trousseau simulé ; à constater sur la CI Linux). `Socle`
- [x] **Code de récupération** (facultatif, proposé à la création) : 160 bits, 8 groupes de 4 caractères, affiché une seule fois avec copie et impression ; nouveau mot de passe exigé après usage ; conséquences d'un oubli expliquées. `Proposition`
- [x] Écrans de création et de déverrouillage ; verrouillage manuel (barre de titre, paramètres) et automatique (inactivité du système configurable, verrouillage de session et mise en veille via `powerMonitor`) ; l'interface est démontée au verrouillage. `Proposition`
- [x] Changement de mot de passe et de mode par ré-enveloppement de la clé (sans re-chiffrer la base, vérifié par test) ; mot de passe actuel exigé pour toute action sensible. `Socle`
- [x] Délais croissants après des échecs de déverrouillage (3 essais libres, puis 1 s à 5 min), conservés entre deux lancements. `Socle`

### Lot 3 — Schéma & migrations

- [ ] Schéma v1 (voir [modèle de données](../architecture/modele-de-donnees.md)) : comptes, catégories, tiers, transactions, ventilations, étiquettes, lots d'import, règles, journal d'audit, métadonnées. `Socle`
- [ ] Migrations versionnées et transactionnelles ; sauvegarde automatique avant chaque migration ; tests de montée de version. `Socle`
- [ ] Identifiants UUIDv7 (triables), dates ISO 8601, montants en centimes (contraintes `CHECK`). `Socle`
- [x] Préférences : restent en JSON, lues avant le déverrouillage et sans donnée sensible ([ADR-028](../architecture/decisions.md#adr-028--clés-du-coffre--clé-aléatoire-enveloppée-session-ou-mot-de-passe-code-de-récupération)). `Socle`

### Lot 4 — Sauvegarde, restauration, export

- [ ] Sauvegarde chiffrée (`VACUUM INTO` + manifeste + empreinte SHA-256), manuelle et automatique, rotation (7 quotidiennes, 4 hebdomadaires, 12 mensuelles), dossier au choix. `Proposition`
- [ ] Restauration avec vérification d'intégrité et aperçu (date, nombre d'opérations). `Proposition`
- [ ] Export complet JSON et CSV par entité. `Proposition`
- [ ] « Tout effacer » : base, sauvegardes locales, journaux, avec confirmation forte. `Proposition`

### Lot 5 — Démo & outillage

- [ ] Mode démo : coffre séparé, rempli par le générateur déterministe, sans jamais toucher au coffre réel. `Proposition`
- [ ] Générateur de jeux volumineux (50 000 transactions) pour les tests de performance. `Socle`

## Sécurité & confidentialité

- Le renderer ne voit jamais la clé ; le process main ne la manipule que le temps du déverrouillage.
- Test automatisé : ouvrir le fichier avec un SQLite standard **doit échouer**.
- Les sauvegardes restent chiffrées et restaurables sur un autre poste avec le mot de passe (ou le code de récupération).

## Légèreté & performance

- Ouverture + déverrouillage < 500 ms (hors dérivation Argon2id, calibrée à ~250 ms).
- Requêtes courantes < 20 ms à 50 000 transactions (index sur date, compte, catégorie, empreinte).

## Tests

- Unitaires : enveloppe de clé, mauvais mot de passe, migrations, aller-retour sauvegarde/restauration, détection de corruption.
- E2E : premier lancement → création du coffre → redémarrage → déverrouillage ; verrouillage automatique.

## Critères d'acceptation

- Données persistées entre redémarrages, chiffrées (vérifié par test) ; les deux modes de déverrouillage fonctionnent sur les 3 OS.
- Sauvegarde et restauration fonctionnelles ; migrations testées ; aucune donnée sensible dans les journaux.

## Risques & questions

- Modules natifs : builds multi-OS/arm64 plus complexes → binaires précompilés, CI matricielle.
- Mot de passe perdu = données perdues sans code de récupération : parcours à soigner.
- Choix de la couche de requêtes (Drizzle, Kysely ou SQL typé).

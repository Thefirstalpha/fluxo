# M1 — Coffre-fort local

> **Statut : ⬜ À venir** · Taille : L · Dépend de : M0 · Version : 0.2

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

- [ ] Décision (ADR) : SQLite chiffré via **SQLCipher** (`better-sqlite3-multiple-ciphers`) ; couche de requêtes typées (Drizzle ORM, Kysely ou SQL typé) départagée par un prototype : poids, typage, migrations. `Socle`
- [ ] **Service de données** dans un `utilityProcess` dédié : le process main reste réactif ; échanges par `MessagePort`, API typée et validée (même discipline que l'IPC). `Socle`
- [ ] Dépendance native : `npmRebuild: true`, `electron-builder install-app-deps`, revue de ses scripts d'installation dans `allowScripts`, binaires précompilés pour x64/arm64 sur les 3 OS. `Socle`
- [ ] Réglages SQLite : `journal_mode=WAL`, `foreign_keys=ON`, `secure_delete=ON`, contrôle d'intégrité au démarrage. `Socle`

### Lot 2 — Clés & déverrouillage

- [ ] Clé de base aléatoire de 256 bits, jamais affichée ni journalisée, présente en clair uniquement dans le service de données. `Besoin`
- [ ] Mode **session** : clé protégée par `safeStorage` (DPAPI sous Windows, Trousseau macOS, libsecret/kwallet sous Linux). `Besoin`
- [ ] Mode **mot de passe maître** : clé enveloppée par une clé dérivée Argon2id (WebAssembly, ~250 ms), sel et paramètres stockés avec l'enveloppe. `Besoin`
- [ ] Linux sans trousseau sécurisé (`basic_text`) : mot de passe maître imposé, avec explication. `Socle`
- [ ] **Code de récupération** imprimable (facultatif) ; sans lui, un mot de passe perdu signifie des données perdues — à expliquer clairement. `Proposition`
- [ ] Écran de verrouillage ; verrouillage automatique (inactivité configurable, verrouillage de session et mise en veille via `powerMonitor`). `Proposition`
- [ ] Changement de mot de passe par ré-enveloppement de la clé (sans re-chiffrer la base). `Socle`
- [ ] Délais croissants après des échecs de déverrouillage. `Socle`

### Lot 3 — Schéma & migrations

- [ ] Schéma v1 (voir [modèle de données](../architecture/modele-de-donnees.md)) : comptes, catégories, tiers, transactions, ventilations, étiquettes, lots d'import, règles, journal d'audit, métadonnées. `Socle`
- [ ] Migrations versionnées et transactionnelles ; sauvegarde automatique avant chaque migration ; tests de montée de version. `Socle`
- [ ] Identifiants UUIDv7 (triables), dates ISO 8601, montants en centimes (contraintes `CHECK`). `Socle`
- [ ] Décider si les préférences restent en JSON (non sensibles) ou migrent en base. `Socle`

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

# Performance & légèreté

Electron embarque Chromium : la légèreté se gagne sur tout le reste — dépendances, chargement, travail en arrière-plan. Elle se **mesure** à chaque jalon.

## Budgets

| Indicateur                                      | Budget v1.0 | Mesure actuelle (M2, lot 1)                                                                                                                    |
| ----------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Installeur Windows                              | < 120 Mo    | 114,5 Mo (NSIS x64, avec SQLCipher) ✅                                                                                                         |
| Démarrage à froid → interface utilisable        | < 2 s       | à mesurer                                                                                                                                      |
| Mémoire au repos (tous processus)               | < 300 Mo    | 283 Mo privés, 5 processus ⚠ proche du budget                                                                                                  |
| JS initial du renderer (minifié)                | ≤ 300 Ko    | 291 Ko ✅ (écran du coffre seul : l'application déverrouillée est chargée à la demande)                                                        |
| Chunk le plus lourd (tableau de bord + ECharts) | ≤ 700 Ko    | 604 Ko ✅                                                                                                                                      |
| CSS                                             | ≤ 40 Ko     | 25 Ko ✅                                                                                                                                       |
| Process main / preload                          | —           | 184 Ko / 1,4 Ko                                                                                                                                |
| Interaction (filtre, navigation)                | < 100 ms    | registre à 50 000 opérations : page 2 ms, recherche 0,2 à 12 ms, filtres 2 à 34 ms, synthèse 8,5 ms ✅ (service ; interface au lot 4)          |
| Ouverture du coffre (hors Argon2id), 50 000 op. | < 500 ms    | 6 ms ✅ ; contrôle de structure ≈ 480 ms, une fois par jour ([ADR-033](decisions.md#adr-033--contrôle-dintégrité-quotidien-et-cache-de-pages)) |
| Argon2id (déverrouillage par mot de passe)      | ≈ 250 ms    | 215 ms ✅                                                                                                                                      |
| Requêtes courantes à 50 000 opérations          | < 20 ms     | 0,02 à 7,4 ms ✅ (liste des comptes et soldes : 7,4 ms ; recherche plein texte : 0,07 ms)                                                      |
| Requête d'analyse à 50 000 opérations           | < 50 ms     | 20,57 ms ✅ (médiane sur agrégats `monthly_category_aggregate`, M5)                                                                            |

## Leviers en place

- **ECharts « à la carte »** : seuls les graphiques et composants utilisés sont enregistrés (barres, courbes, grille, infobulle, légende, zoom, zone de marquage).
- **Chargement à la demande** des pages lourdes (tableau de bord, paramètres).
- **Minification** du renderer (désactivée par défaut dans electron-vite).
- **Aucune dépendance copiée dans l'ASAR** : tout est bundlé.
- **Locales Chromium réduites** à `fr`, `en`, `en-US` (≈ 40 Mo économisés une fois installé).
- **Polices locales** (pas de requête réseau) : seuls les sous-ensembles latin et latin-ext sont embarqués, en WOFF2 (`src/renderer/src/styles/fonts.css`).
- **Cache de code V8** activé pour le protocole `app://`.
- Une seule fenêtre ; animations désactivées si « mouvement réduit » est demandé.
- **Base et requêtes dans un processus utilitaire** (M1) : le process main reste réactif pendant une dérivation de clé ou une sauvegarde.
- **Budgets vérifiés en CI** : `npm run size` échoue si un budget de poids du renderer est dépassé.

## Leviers prévus

| Jalon   | Levier                                                            |
| ------- | ----------------------------------------------------------------- |
| M2      | Tableaux virtualisés, pagination par curseur, recherche FTS5      |
| M3 / M7 | Analyse de fichiers et OCR hors du process main, avec progression |
| M5      | Agrégats mensuels précalculés ; recalcul différé si nécessaire    |
| M9      | Mesure du démarrage et de la mémoire en CI sur les 3 OS           |

## Mesurer

- Poids : `npm run build` affiche la taille de chaque fichier produit ; `npm run size` vérifie les budgets.
- Base de données : `npm run test:perf` crée un coffre de 50 000 opérations (générateur déterministe) et mesure l'ouverture et les requêtes courantes. Hors `npm run check` et de la CI : les durées dépendent de la machine.
- Registre : `+t.id IN (…)` dans les filtres d'une liste triée (SQLite parcourt l'index de tri au lieu de rechercher chaque opération puis de trier : 104 → 6 ms) ; forme normale pour une synthèse, qui part au contraire de la sous-requête. Cache de pages de 32 Mio (sans lui, une synthèse redéchiffre ses pages : 95 → 8,5 ms).
- À surveiller : le contrôle de structure quotidien croît avec la base (≈ 10 ms par Mo) ; le JS initial aussi (les dictionnaires des deux langues y sont : charger seulement la langue active si la marge disparaît).
- Démarrage et mémoire : `npm run package`, puis gestionnaire des tâches / Moniteur d'activité (mémoire **privée**, tous les processus Fluxo — le « working set » compte aussi la mémoire partagée de Chromium) ; à automatiser au M9.
- Analyse de bundle : `npx electron-vite build --sourcemap`, puis lecture des `sources` des fichiers `.map`.

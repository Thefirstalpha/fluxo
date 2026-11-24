# Performance & légèreté

Electron embarque Chromium : la légèreté se gagne sur tout le reste — dépendances, chargement, travail en arrière-plan. Elle se **mesure** à chaque jalon.

## Budgets

| Indicateur                                      | Budget v1.0 | Mesure actuelle (M0)  |
| ----------------------------------------------- | ----------- | --------------------- |
| Installeur Windows                              | < 120 Mo    | à mesurer (M0, lot C) |
| Démarrage à froid → interface utilisable        | < 2 s       | à mesurer             |
| Mémoire au repos (tous processus)               | < 300 Mo    | à mesurer             |
| JS initial du renderer (minifié)                | ≤ 300 Ko    | 259 Ko ✅             |
| Chunk le plus lourd (tableau de bord + ECharts) | ≤ 700 Ko    | 604 Ko ✅             |
| CSS                                             | ≤ 40 Ko     | 26 Ko ✅              |
| Process main / preload                          | —           | 184 Ko / 1,4 Ko       |
| Interaction (filtre, navigation)                | < 100 ms    | —                     |
| Requête d'analyse à 50 000 opérations           | < 50 ms     | — (M5)                |

## Leviers en place

- **ECharts « à la carte »** : seuls les graphiques et composants utilisés sont enregistrés (barres, courbes, grille, infobulle, légende, zoom, zone de marquage).
- **Chargement à la demande** des pages lourdes (tableau de bord, paramètres).
- **Minification** du renderer (désactivée par défaut dans electron-vite).
- **Aucune dépendance copiée dans l'ASAR** : tout est bundlé.
- **Locales Chromium réduites** à `fr`, `en`, `en-US` (≈ 40 Mo économisés une fois installé).
- **Polices locales** (pas de requête réseau) ; seules les plages Unicode affichées sont chargées.
- **Cache de code V8** activé pour le protocole `app://`.
- Une seule fenêtre ; animations désactivées si « mouvement réduit » est demandé.

## Leviers prévus

| Jalon   | Levier                                                                        |
| ------- | ----------------------------------------------------------------------------- |
| M0      | Contrôle de budget de poids en CI ; polices réduites à latin/latin-ext        |
| M1      | Base et requêtes dans un processus utilitaire (process main toujours réactif) |
| M2      | Tableaux virtualisés, pagination par curseur, recherche FTS5                  |
| M3 / M7 | Analyse de fichiers et OCR hors du process main, avec progression             |
| M5      | Agrégats mensuels précalculés ; recalcul différé si nécessaire                |
| M9      | Mesure du démarrage et de la mémoire en CI sur les 3 OS                       |

## Mesurer

- Poids : `npm run build` affiche la taille de chaque fichier produit.
- Démarrage et mémoire : `npm run package`, puis gestionnaire des tâches / Moniteur d'activité ; à automatiser au M9.
- Analyse de bundle : `npx electron-vite build --sourcemap`, puis lecture des `sources` des fichiers `.map`.

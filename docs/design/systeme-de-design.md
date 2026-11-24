# Système de design — « Vice Sunset »

## Intention

Une interface **légère et neutre**, dans l'esprit des éditeurs de code modernes (fonds gris profonds en sombre, blancs cassés en clair), où la couleur est **réservée** : cadres, titres, boutons, états actifs et données. Ces accents évoquent les couchers de soleil néon de la côte de Floride — rose, orange, violet, lagon — sans jamais envahir le fond.

Sources de vérité : `src/renderer/src/styles/tokens.css` (interface) et `src/renderer/src/lib/charts/chart-theme.ts` (graphiques) ; leur alignement est vérifié par un test.

## Couleurs

### Neutres

| Rôle                               | Token                               | Clair                | Sombre               |
| ---------------------------------- | ----------------------------------- | -------------------- | -------------------- |
| Fond d'application, barre de titre | `--fx-bg`, `--fx-titlebar`          | `#f8f8f8`            | `#181818`            |
| Surface (cartes)                   | `--fx-surface`                      | `#ffffff`            | `#1f1f1f`            |
| Surfaces secondaires               | `--fx-surface-2`, `--fx-surface-3`  | `#f3f3f3`, `#ebebeb` | `#262626`, `#2e2e2e` |
| Bordures                           | `--fx-border`, `--fx-border-strong` | `#e5e5e5`, `#d4d4d4` | `#2b2b2b`, `#3c3c3c` |
| Texte principal                    | `--fx-text`                         | `#1f1f1f` (16,5:1)   | `#e6e6e6` (13,2:1)   |
| Texte secondaire                   | `--fx-text-2`                       | `#4d4d4d` (8,5:1)    | `#b4b4b4` (8,0:1)    |
| Texte atténué                      | `--fx-text-muted`                   | `#6b6b6b` (5,3:1)    | `#8f8f8f` (5,1:1)    |

### Accents

Contrastes mesurés sur la surface ; tous ≥ 4,5:1 (WCAG AA, texte normal).

| Nom        | Token         | Clair             | Sombre             | Usage                                  |
| ---------- | ------------- | ----------------- | ------------------ | -------------------------------------- |
| Rose néon  | `--fx-pink`   | `#c8175f` (5,6:1) | `#ff5fa2` (5,8:1)  | Accent principal, icône active, badges |
| Couchant   | `--fx-orange` | `#b93c06` (5,7:1) | `#ff8a3d` (7,0:1)  | Accent secondaire, dépenses            |
| Crépuscule | `--fx-violet` | `#6d28d9` (7,1:1) | `#b392ff` (6,7:1)  | Accent tertiaire                       |
| Lagon      | `--fx-teal`   | `#0b7a72` (5,2:1) | `#2dd4c4` (8,9:1)  | Liens, focus clavier, information      |
| Or         | `--fx-gold`   | `#8a5a00` (5,9:1) | `#ffc24d` (10,3:1) | Mises en avant ponctuelles             |

### Dégradés

| Token                  | Clair                         | Sombre                        | Usage                                                     |
| ---------------------- | ----------------------------- | ----------------------------- | --------------------------------------------------------- |
| `--fx-gradient-sunset` | `#d9480f → #d0156a → #7c3aed` | `#ffb347 → #ff3d8b → #a970ff` | Titres d'affiche, liserés de cartes, cadres, barre active |
| `--fx-gradient-action` | `#c8175f → #c2410c`           | `#ff5fa2 → #ff8a3d`           | Boutons principaux, barre d'état                          |
| `--fx-on-action`       | `#ffffff` (≥ 5,2:1)           | `#1a0b14` (≥ 6,7:1)           | Texte posé sur le dégradé d'action                        |

Les arrêts des titres en dégradé restent ≥ 4:1 sur le fond (texte de grande taille : seuil 3:1).

### Sémantique financière & statuts

- **Revenus** `--fx-income` (`#08795f` / `#34d3a6`) et **dépenses** `--fx-expense` (`#b93c06` / `#ff8a3d`) : toujours accompagnés d'un signe `+` / `−`.
- **Statuts** fixes, jamais thématisés, toujours avec icône + libellé : bon `#0ca30c`, attention `#fab219`, important `#ec835a`, critique `#d03b3b`. Ils ne servent jamais à distinguer des séries.

## Typographie

| Rôle                          | Police                       | Règles                                                                              |
| ----------------------------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| Titres d'affiche, logotype    | **Bebas Neue** (SIL OFL)     | Capitales, interlettrage 0,04 em, dégradé « sunset » ; titres de page à 42 px.      |
| Interface, données            | **Inter Variable** (SIL OFL) | 14 px de base ; titres de carte 13 px semi-gras.                                    |
| Grands chiffres (indicateurs) | Inter semi-gras, 26 px       | Chiffres proportionnels ; jamais la police d'affiche (lisibilité avant décoration). |
| Colonnes de chiffres, axes    | Inter, `tabular-nums`        | Alignement vertical des montants.                                                   |

Polices embarquées localement (aucune requête réseau).

## Mise en page

- Barre de titre intégrée **40 px** (zone de déplacement ; boutons natifs à droite sous Windows/Linux, feux à gauche sous macOS).
- Barre latérale **224 px** : barre verticale dégradée et icône rose pour la page active ; jalon affiché pour les sections à venir.
- Contenu : largeur max **1 360 px**, marges 32 px ; barre d'état **24 px** sur le dégradé d'action.
- Cartes : rayon 12 px, bordure 1 px, liseré dégradé de 2 px en tête pour les cartes principales.

## Composants

| Composant          | Rôle                                              | Classe / fichier                            |
| ------------------ | ------------------------------------------------- | ------------------------------------------- |
| Carte              | Conteneur titré, liseré facultatif                | `.fx-card`, `.fx-card--accent` · `Card.tsx` |
| Cadre dégradé      | Élément actif ou mis en avant                     | `.fx-frame`                                 |
| Bouton principal   | Action principale (dégradé d'action)              | `.fx-btn--primary` · `Button.tsx`           |
| Bouton secondaire  | Action courante (cadre dégradé)                   | `.fx-btn--secondary`                        |
| Bouton discret     | Actions d'outillage, icônes                       | `.fx-btn--ghost`, `.fx-btn--icon`           |
| Contrôle segmenté  | Choix exclusif (groupe radio, flèches du clavier) | `SegmentedControl.tsx`                      |
| Interrupteur       | Option booléenne (`role="switch"`)                | `Switch.tsx`                                |
| Tuile d'indicateur | Libellé · valeur · variation (icône + signe)      | `StatTile.tsx`                              |
| En-tête de page    | Titre d'affiche en dégradé + sous-titre           | `PageHeader.tsx`                            |
| Badge              | Statut court (démo, jalon)                        | `Badge.tsx`                                 |

## Graphiques

### Palette catégorielle

Ordre **fixe** — c'est lui qui garantit la lisibilité pour les personnes daltoniennes. Une série garde sa couleur quel que soit le filtre ; au-delà de 8 séries, regrouper en « Autres ».

| Rang | Teinte    | Clair     | Sombre    |
| ---- | --------- | --------- | --------- |
| 1    | Rose néon | `#dd2a80` | `#e8428c` |
| 2    | Couchant  | `#e5690c` | `#e26b1b` |
| 3    | Lagon     | `#0e9b8f` | `#10a89b` |
| 4    | Or        | `#dca81c` | `#bb8d0d` |
| 5    | Violet    | `#7a40da` | `#8c5ee8` |
| 6    | Corail    | `#cc272e` | `#d33a3c` |
| 7    | Océan     | `#0977cb` | `#2f8adc` |
| 8    | Palmier   | `#278733` | `#409d48` |

Validation (OKLab, simulation protanopie/deutéranopie), voisins uniquement :

| Contrôle                                      | Clair (surface `#ffffff`)                                      | Sombre (surface `#1f1f1f`) |
| --------------------------------------------- | -------------------------------------------------------------- | -------------------------- |
| Bande de luminosité, chroma                   | ✅                                                             | ✅                         |
| Séparation daltonisme (pire paire, cible ≥ 8) | ✅ ΔE 13,9                                                     | ✅ ΔE 12,7                 |
| Vision normale (pire paire, plancher 15)      | ✅ ΔE 18,4                                                     | ✅ ΔE 16,7                 |
| Contraste ≥ 3:1                               | ⚠ or à 2,2:1 → étiquettes visibles ou vue tableau obligatoires | ✅                         |

Points notables :

- La paire **rose / lagon**, iconique de l'esthétique « Miami », est **indiscernable** pour les personnes daltoniennes (ΔE 2,6) : elle n'est jamais utilisée côte à côte.
- **Revenus / dépenses** utilisent la paire lagon / couchant (froid / chaud), validée comme voisine.
- Graphiques où toutes les séries peuvent se toucher (nuages de points, petits multiples) : **2 séries maximum** (rangs 1 et 2).

### Règles de tracé

- **Un seul axe des ordonnées** par graphique (jamais de double axe).
- Barres ≤ 24 px, extrémité côté donnée arrondie (4 px), côté ligne de base carrée ; 2 px d'espace couleur surface entre barres qui se touchent.
- Courbes de 2 px ; marqueurs ≥ 8 px cerclés de 2 px couleur surface.
- Grille et axes en filets fins et discrets ; textes en encre neutre, jamais dans la couleur d'une série.
- Légende dès 2 séries ; une seule série = pas de légende (le titre suffit).
- Infobulle : la valeur prime, le libellé suit ; clés en trait court ; zone de survol plus large que la marque (toute la bande d'un mois).
- **Vue tableau** équivalente pour chaque graphique ; l'infobulle complète, elle ne conditionne jamais l'accès à une valeur.
- Filtres sur une seule rangée, au-dessus de tout ce qu'ils pilotent.
- Montants masqués partout (axes compris) quand l'utilisateur l'a demandé.
- Sécurité : tout libellé inséré dans une infobulle HTML est échappé ; mise en forme par classes CSS.

## Logo

L'emblème est le **F de Fluxo en grand**, rempli d'un dégradé coucher de soleil et traversé de bandes sombres façon horizon — la lettre domine, à la manière d'un gros monogramme, plutôt qu'une icône séparée du nom. Création originale.

- Sources : `build/icon.svg` (icône d'application → `npm run icons`) et `src/renderer/src/components/Logo.tsx` (barre de titre).
- Toujours sur sa tuile sombre arrondie ; taille minimale 16 px ; ne pas recolorer, déformer ni ajouter de texte dans la tuile.
- Logotype « FLUXO » en Bebas Neue, rempli du dégradé « sunset ».

## Accessibilité

- Contrastes AA vérifiés pour tous les textes et accents (tableaux ci-dessus).
- Focus clavier visible (contour lagon 2 px), groupes radio navigables aux flèches, interrupteurs `role="switch"`.
- Couleur jamais seule porteuse de sens : signes, icônes, libellés, vue tableau.
- « Mouvement réduit » respecté (animations et transitions coupées).

## Marques tierces

L'esthétique s'inspire des couchers de soleil néon de la Floride popularisés par la culture pop (années 80, synthwave, jeux vidéo récents). Fluxo **n'utilise aucun élément protégé** : ni nom ou logo de jeu, ni police propriétaire, ni lieu fictif d'une licence tierce. Toute contribution graphique doit respecter cette règle.

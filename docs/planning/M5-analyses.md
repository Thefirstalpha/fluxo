# M5 — Analyses & synthèses

> **Statut : ⬜ À venir** (aperçu 🟡 dans le tableau de bord de démonstration) · Taille : L · Dépend de : M4 · Version : 0.6 — **Bêta**

## Objectif

Une **vraie partie analytique** : filtrer, zoomer sur certains mois, parcourir les graphiques, lire les détails dans des infobulles, et comprendre chaque mois en un coup d'œil grâce à une **synthèse mensuelle**.

## Déjà en place (démonstration M0)

- 4 indicateurs du mois (revenus, dépenses, épargne nette, taux d'épargne) avec variation vs mois précédent.
- Flux mensuels : colonnes divergentes revenus/dépenses + courbe du solde net, zoom (Ctrl + molette ou curseur), choix de la période (6/12/18 mois), sélection d'un mois au clic ou au clavier, infobulle sur toute la bande du mois, vue tableau équivalente.
- Dépenses par catégorie classées par montant, infobulle (part du mois, évolution), vue tableau.

## Récits utilisateur

- Je veux filtrer **toute la page** par période, compte, catégorie ou étiquette, et que tous les chiffres concordent.
- Je veux cliquer sur un mois, puis sur une catégorie, puis voir les opérations correspondantes.
- Je veux sélectionner une plage de mois à la souris pour zoomer.
- Je veux une synthèse de chaque mois : ce qui a changé, ce qui est inhabituel.
- Je veux exporter un graphique ou les données filtrées.

## Plan d'action

### Lot 1 — Socle analytique

- [ ] Agrégats en base (tables mensuelles par compte et catégorie, mises à jour à l'écriture) ; requêtes < 50 ms à 50 000 opérations. `Socle`
- [ ] **Barre de filtres globale** unique, au-dessus des graphiques qu'elle pilote : période (préréglages + plage personnalisée), comptes, catégories, étiquettes, montants, inclusion des virements ; état conservé entre pages. `Besoin`
- [ ] Recalcul sans saut visuel : graphiques conservés à opacité réduite pendant le chargement. `Socle`

### Lot 2 — Synthèse mensuelle

- [ ] Page « Synthèse de novembre » : revenus, dépenses, épargne et taux ; comparaison **M-1 et N-1** ; principales catégories et marchands ; plus grosses dépenses ; récurrences du mois ; **faits marquants** générés (« Loisirs +42 % vs votre moyenne ») ; lien vers le bulletin du mois. `Besoin`
- [ ] Navigation mois par mois (flèches, clavier). `Besoin`

### Lot 3 — Exploration

- [ ] Exploration **année → mois → catégorie → opérations** (chaque clic filtre et affiche la liste). `Besoin`
- [ ] **Sélection de plage** par glisser (brush) → filtre global. `Besoin`
- [ ] **Filtrage croisé** entre graphiques. `Besoin`
- [ ] Légendes interactives ; couleurs stables (une catégorie garde sa couleur, quel que soit le filtre). `Besoin`

### Lot 4 — Graphiques

- [ ] Évolution des catégories dans le temps (barres empilées, ≤ 8 séries + « Autres »). `Besoin`
- [ ] **Sankey** revenus → catégories → épargne. `Proposition`
- [ ] **Calendrier des dépenses** (carte de chaleur, rampe mono-teinte). `Proposition`
- [ ] Tendances avec moyenne glissante 3/6/12 mois. `Besoin`
- [ ] Répartition des montants (histogramme). `Proposition`

### Lot 5 — Export, rapports, alertes

- [ ] Export PNG/SVG d'un graphique et CSV des données filtrées (boîte de dialogue du process main). `Proposition`
- [ ] **Rapport mensuel PDF**. `Proposition`
- [ ] **Anomalies** : dépense inhabituelle (> 3× la médiane du marchand), double prélèvement, cumul des frais bancaires. `Proposition`

## Règles de visualisation

Un seul axe des ordonnées par graphique ; palette validée à ordre fixe ; ≤ 8 séries ; infobulles qui complètent sans conditionner ; vue tableau pour chaque graphique ; libellés en encre neutre ; montants masqués si demandé. Détails : [système de design § Graphiques](../design/systeme-de-design.md#graphiques).

## Critères d'acceptation

- Chaque graphique : infobulle, vue tableau, navigation clavier, masquage des montants respecté.
- Filtres cohérents : tous les chiffres d'une page concordent (tests d'invariants).
- Exploration complète d'une année à une opération en 3 clics.

## Risques & questions

- Volume d'options d'analyse : rester **léger** (peu de graphiques, mais justes) plutôt qu'exhaustif.
- Coût des agrégats en écriture : mesurer, éventuellement recalcul différé.

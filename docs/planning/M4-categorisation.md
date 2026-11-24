# M4 — Catégorisation automatique

> **Statut : ⬜ À venir** · Taille : L · Dépend de : M3 · Version : 0.5

## Objectif

Que la grande majorité des opérations soient **bien catégorisées sans effort**, que Fluxo **apprenne des corrections** — localement — et qu'il repère abonnements, récurrences et virements internes.

## Valeur pour l'utilisateur

« Je corrige une fois, Fluxo comprend. Et il me signale l'abonnement qui a augmenté. »

## Périmètre

**Inclus** : normalisation des libellés, règles, classifieur local, file « à valider », récurrences et abonnements, détection des virements internes.
**Hors périmètre** : suggestions par IA pour les marchands inconnus (M7).

## Récits utilisateur

- Je veux que « CB CARREFOUR 12/11 PARIS 15 » devienne « Carrefour » dans « Alimentation ».
- Je veux créer une règle en un clic depuis une correction.
- Je veux qu'une règle puisse aussi poser une ou plusieurs étiquettes (pas seulement une catégorie), pour que toutes mes dépenses « Abonnement téléphonique » restent regroupées même si elles tombent dans des catégories différentes.
- Je veux une boîte « À valider » pour les cas incertains, traitable au clavier.
- Je veux voir mes abonnements, leur coût annuel, et être prévenu d'une hausse de prix.

## Plan d'action

### Lot 1 — Normalisation

- [ ] Nettoyage des libellés : préfixes (`CB`, `PRLV SEPA`, `VIR`, `CARTE X1234`), dates et heures, références, villes, numéros → libellé canonique. `Besoin`
- [ ] Dictionnaire de marchands (pack communautaire France) : alias → marchand → catégorie suggérée. `Proposition`

### Lot 2 — Règles

- [ ] Conditions (contient, commence par, expression régulière bornée, montant, sens, compte) → actions (catégorie et/ou **une ou plusieurs étiquettes**, renommage, marquer comme virement). `Besoin`
- [ ] Priorités, aperçu des opérations concernées, application rétroactive. `Besoin`
- [ ] Création de règle depuis une correction (« toujours classer X en Y », « toujours étiqueter X »). `Proposition`

### Lot 3 — Apprentissage local

- [ ] Classifieur léger (Bayes naïf multinomial sur mots et n-grammes de caractères, quelques Ko), entraîné sur les opérations de l'utilisateur, ré-entraîné en tâche de fond. `Besoin`
- [ ] Score de confiance ; seuil d'auto-validation réglable ; en dessous → file « à valider ». `Besoin`
- [ ] Aucune donnée ne quitte l'appareil. `Socle`

### Lot 4 — File de validation

- [ ] Boîte « À valider » : accepter, corriger, créer une règle ; raccourcis (1–9, Entrée, flèches). `Besoin`

### Lot 5 — Récurrences & virements

- [ ] Détection des récurrences (mensuelle, trimestrielle, annuelle) : marchand, montant ± tolérance, périodicité, prochaine échéance. `Proposition`
- [ ] Vue **Abonnements** : coût mensuel et annuel total, **alerte de hausse de prix** (cas présent dans les données de démonstration), abonnements dormants. `Proposition`
- [ ] Détection des virements internes (montants opposés entre comptes, ± 3 jours) proposée à la validation. `Socle`

## Sécurité & confidentialité

- Expressions régulières des règles : validées à la saisie, temps d'exécution borné (protection ReDoS).
- Le modèle appris reste dans le coffre chiffré.

## Critères d'acceptation

- Sur le jeu de test : **≥ 85 %** de bonnes catégories après 200 opérations étiquetées ; **≥ 95 %** de précision au-dessus du seuil d'auto-validation.
- Catégoriser 10 000 opérations prend moins d'une seconde.

## Risques & questions

- Démarrage à froid (nouvel utilisateur sans historique) : le dictionnaire de marchands et les règles par défaut comblent le manque.
- Explicabilité : afficher **pourquoi** une catégorie a été choisie (règle, marchand connu, apprentissage).

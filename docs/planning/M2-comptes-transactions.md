# M2 — Comptes & transactions

> **Statut : ⬜ À venir** · Taille : L · Dépend de : M1 · Version : 0.3

## Objectif

Le registre de toutes les opérations : **rapide, fiable, agréable au clavier**, prêt à recevoir les imports (M3) et la catégorisation automatique (M4).

## Valeur pour l'utilisateur

« Je vois tous mes comptes et toutes mes opérations au même endroit, je retrouve n'importe quelle dépense en une seconde. »

## Périmètre

**Inclus** : comptes (dont épargne et comptes externes à valorisation manuelle), transactions, ventilations, virements internes, catégories, étiquettes transverses, recherche et filtres, saisie rapide, historique et annulation, bascule démo/réel du tableau de bord.
**Hors périmètre** : import de fichiers (M3), catégorisation automatique (M4), crédits et échéanciers d'amortissement, patrimoine net (M8 — le compte de type « prêt » n'est qu'un repère de solde ici).

## Récits utilisateur

- Je veux créer mes comptes (courant, livret, carte à débit différé, espèces, titres-restaurant, épargne, placement) et voir leurs soldes.
- Je veux noter une dépense en espèces en quelques touches, et répartir n'importe quelle opération sur plusieurs catégories (ventilation).
- Je veux que mes comptes bancaires ne contiennent que ce que dit ma banque : j'annote les opérations, je n'en invente pas.
- Je veux qu'un virement de mon compte courant vers mon livret ne compte ni comme dépense ni comme revenu, mais apparaisse comme de l'épargne, distinctement d'un simple virement neutre entre deux comptes courants.
- Je veux poser plusieurs étiquettes sur une même dépense (ex. « Abonnement téléphonique » et « Pro »), indépendamment de sa catégorie, pour pouvoir ensuite filtrer toutes mes dépenses « Abonnement téléphonique » quelle que soit la catégorie où elles sont classées.
- Je veux filtrer, trier, rechercher et modifier plusieurs opérations à la fois.
- Je veux pouvoir annuler une erreur.

## Plan d'action

### Lot 1 — Comptes

- [ ] Types : courant, épargne, carte à débit différé, espèces, titres-restaurant, placement, prêt (lecture seule — échéancier au M8), autre. `Besoin`
- [ ] **Mode de suivi** : relevé importé (défaut : courant, épargne, carte), saisie manuelle (défaut : espèces, titres-restaurant), valorisation manuelle (placement) ([ADR-026](../architecture/decisions.md#adr-026--saisie-manuelle-réservée-aux-comptes-sans-relevé)). `Besoin`
- [ ] Champs : nom, établissement, devise, solde et date d'ouverture, IBAN (chiffré, affiché masqué), couleur, icône, archivage. `Besoin`
- [ ] **Comptes multiples d'épargne et comptes externes** : plusieurs livrets, PEA, assurances-vie, etc., chacun avec son solde propre. `Besoin`
- [ ] Soldes calculés à date, rapprochés et non rapprochés. `Socle`

### Lot 2 — Transactions

- [ ] Saisie, modification, suppression **sur les comptes en saisie manuelle uniquement** ; sur un compte à relevé, montant, date et compte sont figés et seules les annotations changent (refus validé côté service, testé) ; date d'opération et date de valeur ; montant signé en centimes ; libellé bancaire brut et libellé affiché ; tiers ; notes. `Besoin`
- [ ] **Ventilation** avec contrôle que la somme des parts égale le montant. `Besoin`
- [ ] **Virements internes** : paire d'opérations liées, exclues des revenus et dépenses. `Socle`
- [ ] **Virement vers un compte d'épargne classé comme épargne** (catégorie de type `épargne`, pas `transfert`) : visible dans le taux d'épargne de la synthèse mensuelle (M5), distingué d'un virement neutre entre deux comptes courants. `Besoin`
- [ ] Statuts : en attente, pointée, rapprochée. `Proposition`
- [ ] **Étiquettes multiples par ventilation** (une part peut porter plusieurs étiquettes, indépendamment de sa catégorie), notes, favoris. `Proposition`
- [ ] Vue **Étiquettes** : liste des étiquettes avec total et nombre d'opérations, filtre transverse aux catégories (ex. toutes les dépenses « Abonnement téléphonique »). `Proposition`
- [ ] Multi-devises : montant d'origine + montant converti (taux saisi) ; synthèses dans la devise de référence. `Proposition`

### Lot 3 — Catégories

- [ ] Arbre à deux niveaux, pack France par défaut, types (dépense, revenu, épargne, transfert), icône, couleur issue de la palette validée. `Besoin`
- [ ] Fusion, déplacement et archivage avec réaffectation des opérations. `Socle`

### Lot 4 — Interface

- [ ] Tableau **virtualisé** (TanStack Table + Virtual) : 50 000 lignes fluides, colonnes configurables, tri, regroupement par jour ou par mois. `Besoin`
- [ ] Filtres combinables et recherche plein texte (FTS5) ; filtres enregistrés. `Besoin`
- [ ] Saisie rapide (Ctrl/⌘ N) sur les comptes en saisie manuelle, édition en ligne des annotations, édition en masse (catégorie, étiquettes). `Besoin`
- [ ] **Palette de commandes** (Ctrl/⌘ K) : navigation, actions, recherche d'opérations. `Proposition`
- [ ] Raccourcis clavier et aide intégrée (touche `?`). `Proposition`
- [ ] Panneau de détail latéral (historique, ventilation). `Proposition`

### Lot 5 — Fiabilité & intégration

- [ ] Journal d'audit et annuler/rétablir (Ctrl/⌘ Z, Ctrl/⌘ Maj Z). `Proposition`
- [ ] Couche de données du renderer avec TanStack Query (cache, invalidation après écriture) ; toute écriture passe par l'API validée du service de données. `Socle`
- [ ] Tableau de bord branché sur les vraies données, mode démo conservé. `Socle`

## Sécurité & confidentialité

- IBAN et numéros de carte stockés chiffrés (base chiffrée) et masqués à l'affichage (`FR76 •••• •••• 0189`).
- Copier un IBAN passe par la permission presse-papiers déjà autorisée, sans autre accès système.

## Légèreté & performance

- 50 000 opérations : défilement à 60 images/s, filtrage < 100 ms, saisie sans latence perceptible.
- Pagination par curseur côté service de données ; jamais de chargement intégral en mémoire.

## Critères d'acceptation

- Comptes, opérations, ventilations et virements cohérents dans les soldes et les agrégats (tests dédiés).
- Toute écriture validée côté service et annulable ; aucune opération ne peut être créée à la main sur un compte à relevé (test dédié).
- Avant le M3, les comptes à relevé ne se remplissent qu'avec les données de démonstration : c'est attendu.
- Tableau navigable entièrement au clavier, annonces correctes au lecteur d'écran.

## Risques & questions

- Ventilations et virements compliquent les agrégats : tests d'invariants (somme des catégories = total des dépenses).
- Performance de la recherche plein texte sur gros volumes.

# M8 — Patrimoine, crédits, budgets & prévisions

> **Statut : ⬜ À venir** · Taille : L · Dépend de : M2 (comptes), M4 (catégorisation, pour les budgets et les prévisions) · Version : 0.9 — **RC**

## Objectif

Passer du constat à l'**anticipation**, et donner une vision complète : budgets par catégorie, objectifs d'épargne, **crédits** (immobilier, consommation…) avec leur échéancier, **patrimoine net** dans le temps, prélèvements à venir et solde prévisionnel de fin de mois.

## Valeur pour l'utilisateur

« Je sais combien je dois encore rembourser sur mon crédit immobilier, ce que je possède au total, et si je vais tenir mon budget ce mois-ci. »

## Périmètre

**Inclus** : budgets, objectifs d'épargne, crédits et tableaux d'amortissement, comptes externes à valorisation manuelle (placements, immobilier), vue patrimoine net, prélèvements à venir, solde prévisionnel.
**Hors périmètre** : connexion bancaire ou boursière automatique (M10, sous conditions), aide à la déclaration de revenus (M10).

## Récits utilisateur

- Je veux un budget « Courses : 450 €/mois » et être prévenu à 80 % et à 100 %.
- Je veux savoir quand j'atteindrai mon objectif « Vacances : 1 500 € » au rythme actuel.
- Je veux renseigner mon crédit immobilier (capital, taux, durée) et voir son tableau d'amortissement, le capital restant dû et la date de fin.
- Je veux voir en un coup d'œil tous mes crédits en cours et le total qu'il me reste à rembourser.
- Je veux voir mon patrimoine net (ce que je possède moins ce que je dois) évoluer dans le temps.
- Je veux mettre à jour la valeur de mon PEA ou de mon bien immobilier de temps en temps, sans connexion automatique.
- Je veux voir les prélèvements des 30 prochains jours (factures et mensualités de crédit) et mon solde estimé en fin de mois.

## Plan d'action

### Lot 1 — Budgets

- [ ] Budget mensuel par catégorie : montant fixe, % des revenus ou moyenne des 3 derniers mois ; report du reliquat (mode enveloppes) facultatif. `Proposition`
- [ ] Jauges d'avancement : état porté par couleur **+ icône + libellé** (jamais la couleur seule), vue tableau. `Proposition`
- [ ] Alertes à 80 % et 100 % via notifications système locales, regroupées, désactivables. `Proposition`

### Lot 2 — Objectifs d'épargne

- [ ] Objectifs d'épargne (montant, échéance, compte associé), projection de la date d'atteinte au rythme actuel. `Proposition`

### Lot 3 — Crédits

- [ ] **Déclaration d'un crédit** (`Loan`) : type (immobilier, consommation, auto, étudiant, autre), capital initial, taux nominal, TAEG, assurance emprunteur, durée, date de début, périodicité ; compte associé de type « prêt ». `Besoin`
- [ ] **Tableau d'amortissement** généré (`LoanInstallment`) : part capital, part intérêts, part assurance et capital restant dû pour chaque échéance ; recalcul si le crédit est modifié. `Besoin`
- [ ] **Vue d'ensemble des crédits** : liste de tous les crédits en cours, mensualité totale, capital restant dû total, date de fin la plus lointaine. `Besoin`
- [ ] **Rapprochement** facultatif entre une mensualité et la transaction de prélèvement correspondante. `Proposition`
- [ ] Alerte avant une échéance importante (fin de période à taux fixe, dernier remboursement). `Proposition`
- [ ] **Simulateur de remboursement anticipé** : impact d'un versement exceptionnel sur la durée ou la mensualité restante. `Proposition`

### Lot 4 — Comptes externes & patrimoine

- [ ] **Comptes en mode valorisation manuelle** (placement, immobilier, autre actif) : pas de transactions, une suite de valorisations datées (`ValuationEntry`) saisies par l'utilisateur. `Besoin`
- [ ] **Vue patrimoine net** : actifs (comptes courants, épargne, placements valorisés) moins passifs (capital restant dû de tous les crédits), à la date du jour et dans le temps (graphique dédié, suivant les [règles de visualisation](../design/systeme-de-design.md#graphiques)). `Besoin`
- [ ] Rappel périodique (facultatif) pour mettre à jour une valorisation ancienne. `Proposition`

### Lot 5 — Prévisions

- [ ] Calendrier des prélèvements et revenus à venir (récurrences M4, salaire M6, mensualités de crédit M8). `Proposition`
- [ ] **Solde prévisionnel** de fin de mois avec intervalle (récurrences + dépenses variables moyennes) et **« reste à vivre »**. `Proposition`
- [ ] Alerte de découvert prévisionnel. `Proposition`

### Lot 6 — Motivation (facultatif)

- [ ] Défis (« 30 jours sans livraison de repas »), séries, succès ; écran de réussite stylisé « Vice Sunset » (création originale, discret, désactivable). `Proposition`

## Sécurité & confidentialité

- Taux, échéanciers et valorisations sont des données sensibles au même titre qu'un solde : chiffrés avec le reste de la base, jamais journalisés.
- Aucune cotation ni connexion bancaire automatique par défaut ([ADR-014](../architecture/decisions.md#adr-014--crédits-et-actifs-externes-modélisés-comme-des-comptes-valorisation-manuelle-par-défaut)) : la saisie manuelle garde l'utilisateur maître de ce qui est partagé.

## Critères d'acceptation

- Budgets et alertes fiables sur les données de démonstration et de test.
- Tableau d'amortissement exact à l'arrondi près (tests dédiés, taux fixes et variables courants du marché français).
- Patrimoine net cohérent avec la somme des soldes de comptes et des capitaux restants dus (tests d'invariants).
- Prévision de fin de mois avec une erreur médiane < 10 % sur l'historique de test (rétro-test).

## Risques & questions

- Prévisions trompeuses si les récurrences sont mal détectées : afficher l'incertitude et les hypothèses.
- Un patrimoine net dépend de valorisations à jour : afficher clairement la date de la dernière valorisation de chaque actif externe.
- Diversité des types de crédits français (taux fixe, variable, lissé, différé) : couvrir d'abord les cas les plus courants (taux fixe, mensualités constantes), documenter les limites.

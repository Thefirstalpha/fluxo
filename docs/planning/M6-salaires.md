# M6 — Salaires & bulletins de paie

> **Statut : ⬜ À venir** (aperçu 🟡 sur le tableau de bord) · Taille : XL · Dépend de : M2 (peut avancer en parallèle de M3–M5) · Version : 0.7

## Objectif

Le **vrai détail des salaires** : du brut au net payé, chaque cotisation, l'impôt prélevé (taux et montant), les éléments variables (astreintes, heures supplémentaires, primes, 13ᵉ mois…), les congés, les cumuls annuels — et leur évolution dans le temps.

## Déjà en place (démonstration M0)

- Modèle simplifié `PayslipSummary` et contrôles `checkPayslip` (brut, net avant impôt, prélèvement à la source, net payé), testés.
- Carte « Bulletin du mois » : salaire de base, éléments variables, brut, cotisations (taux), net avant impôt, net imposable, prélèvement à la source (taux), titres-restaurant, **net payé**, état des contrôles.
- Bulletins de démonstration réalistes : 13ᵉ mois en décembre, prime de vacances en juin, astreintes et heures supplémentaires aléatoires, changement de taux du prélèvement en septembre.

## Récits utilisateur

- Je veux saisir (ou importer, M7) mon bulletin et voir **où va mon brut** : cotisations, impôt, net payé.
- Je veux suivre l'évolution de mon **brut, net, net imposable** et de mon **taux de prélèvement** sur plusieurs années.
- Je veux connaître la part de mes **astreintes, primes et 13ᵉ mois** dans ma rémunération annuelle.
- Je veux vérifier que le **virement reçu** correspond au net payé, et que les **cumuls de décembre** collent à la somme des mois.
- Je veux suivre mes **congés et RTT**.

## Plan d'action

### Lot 1 — Modèle complet (France)

- [ ] **Employeurs** (raison sociale, SIRET facultatif) et **contrats** (CDI/CDD/intérim, cadre/non-cadre, temps plein/partiel, convention collective, date d'entrée). `Besoin`
- [ ] **Bulletin** : période, date de paiement, salaire de base (taux horaire × heures ou forfait), absences. `Besoin`
- [ ] **Éléments variables typés** : astreintes, heures supplémentaires (25 %, 50 %, défiscalisées), 13ᵉ mois, prime de vacances, ancienneté, objectifs, indemnités (transport, télétravail), avantages en nature. `Besoin`
- [ ] **Cotisations ligne à ligne** : base, taux et montant salarial, taux et montant patronal ; regroupements (santé, retraite de base et complémentaire, chômage, CSG/CRDS déductible et non déductible, prévoyance, mutuelle). `Besoin`
- [ ] **Totaux** : brut, total des cotisations salariales et patronales, net à payer avant impôt, net imposable, **montant net social**, **prélèvement à la source** (taux personnalisé ou non, base, montant), net payé. `Besoin`
- [ ] **Congés payés** (acquis, pris, soldes N et N-1) et **RTT**. `Proposition`
- [ ] **Cumuls annuels** (brut, net imposable, prélèvement, heures). `Besoin`
- [ ] Architecture **« pack pays »** : règles de validation et libellés propres à chaque pays, France en premier. `Socle`

### Lot 2 — Saisie & contrôles

- [ ] Formulaire par sections ; **duplication du mois précédent** ; saisie des seuls totaux possible (détail facultatif). `Besoin`
- [ ] Contrôles en direct, chacun expliqué : sommes, prélèvement = taux × net imposable, net payé, cumuls = somme des mois, plausibilité des taux. `Socle`
- [ ] Données sensibles du bulletin (NIR, adresse) chiffrées et masquées à l'affichage. `Socle`

### Lot 3 — Comprendre

- [ ] Vue bulletin **« du brut au net »** : barre segmentée (net payé, cotisations, impôt) et détail repliable des cotisations. `Besoin`
- [ ] **Tableau de bord salaire** : évolution brut / net / net imposable, taux de prélèvement dans le temps, part des éléments variables, astreintes cumulées, 13ᵉ mois, comparaisons annuelles ; chaque graphique avec vue tableau. `Besoin`
- [ ] **Coût employeur** (brut + cotisations patronales). `Proposition`
- [ ] **Rapprochement bulletin ↔ virement** : opération correspondant au net payé (± 1 €, ± 5 jours), alerte en cas d'écart. `Proposition`
- [ ] **Simulateur** : effet d'une augmentation brute, d'un changement de taux, d'heures supplémentaires. `Proposition`
- [ ] **Récapitulatif annuel** : cumul du net imposable, utile pour vérifier la déclaration pré-remplie. `Proposition`

## Sécurité & confidentialité

- Un bulletin contient des données très sensibles (identité, NIR, salaire) : stockage chiffré, masquage par défaut des identifiants, aucune journalisation de contenu.

## Critères d'acceptation

- Saisie d'un bulletin complet en **moins de 2 minutes** en dupliquant le mois précédent.
- Contrôles au vert sur l'ensemble des bulletins d'exemple ; chaque écart affiché avec sa cause probable.
- Tableau de bord salaire complet, accessible, respectant le masquage des montants.
- Mention claire : Fluxo n'est ni un logiciel de paie ni un conseiller fiscal.

## Risques & questions

- Diversité des bulletins (conventions collectives, logiciels de paie) → modèle extensible et lignes « autres ».
- Évolutions réglementaires (taux, mentions obligatoires) → données de référence versionnées, mises à jour par la communauté.
- Périmètre pays (France seule ou aussi Suisse, Belgique…) : voir [questions ouvertes](questions-ouvertes.md).

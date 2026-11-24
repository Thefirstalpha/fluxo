# Propositions

Ajouts suggérés au-delà des besoins fondateurs, **à valider** avant d'entrer dans un plan de jalon. Chaque proposition renvoie à une fonctionnalité du [catalogue](../projet/fonctionnalites.md).

- **Priorité** : ⭐⭐⭐ forte valeur · ⭐⭐ utile · ⭐ bonus.
- **Effort** : S · M · L · XL.
- **État** : ✅ implémenté (ou prototypé dès M0) · ⬜ à valider.

## 1. Propositions de fonctionnalités

### Confidentialité & sécurité

| ID   | Proposition                                  | Pourquoi                                                       | Jalon   | Priorité | Effort | État |
| ---- | -------------------------------------------- | -------------------------------------------------------------- | ------- | -------- | ------ | ---- |
| P-01 | **Masquage des montants** (bouton œil) — A05 | Partage d'écran, lieu public, démonstration à un proche.       | M0      | ⭐⭐⭐   | S      | ✅   |
| P-02 | **Exclusion des captures d'écran** — A06     | Empêche une visio ou un logiciel tiers de capturer la fenêtre. | M0      | ⭐⭐     | S      | ✅   |
| P-03 | **Verrouillage automatique** — B03           | Absence, ordinateur partagé.                                   | M1      | ⭐⭐⭐   | S      | ⬜   |
| P-04 | **Code de récupération** imprimable          | Sans lui, un mot de passe oublié = données perdues.            | M1      | ⭐⭐     | S      | ⬜   |
| P-05 | **Sauvegardes chiffrées automatiques** — B04 | La perte de données est le premier risque d'une app locale.    | M1      | ⭐⭐⭐   | M      | ⬜   |
| P-06 | **Export complet & « tout effacer »** — B05  | Réversibilité, maîtrise totale de ses données.                 | M1 → M9 | ⭐⭐     | S      | ⬜   |
| P-07 | **Historique & annulation** — B07            | Confiance : toute erreur se rattrape.                          | M2      | ⭐⭐     | M      | ✅   |

### Productivité

| ID   | Proposition                             | Pourquoi                                                                     | Jalon   | Priorité | Effort | État |
| ---- | --------------------------------------- | ---------------------------------------------------------------------------- | ------- | -------- | ------ | ---- |
| P-08 | **Palette de commandes** Ctrl/⌘ K — A07 | Cohérent avec l'esprit « éditeur de code » ; tout faire au clavier.          | M2      | ⭐⭐⭐   | M      | ✅   |
| P-09 | **Raccourcis clavier** documentés — A08 | Saisie et validation rapides.                                                | M2      | ⭐⭐     | S      | ✅   |
| P-10 | **Mode démo** — A09                     | Découvrir sans risque, captures d'écran, contributeurs sans données réelles. | M0 → M1 | ⭐⭐⭐   | S      | ✅   |

Retirées lors de la revue du 24 novembre 2026 ([ADR-025](../architecture/decisions.md#adr-025--revue-des-propositions-du-24-novembre-2026)) : P-11 (saisie en langage naturel, remplacée par l'écriture d'ajustement, voir « Imports & catégorisation ») et P-12 (justificatifs attachés : Fluxo ne stocke aucun fichier).

### Imports & catégorisation

| ID   | Proposition                                       | Pourquoi                                                                                                                                                                              | Jalon | Priorité | Effort | État |
| ---- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------- | ------ | ---- |
| P-13 | **Profils bancaires communautaires** — D01        | Chaque banque a son CSV : la communauté les décrit une fois pour tous. Retenue (2026-11-24).                                                                                          | M3    | ⭐⭐⭐   | M      | ✅   |
| P-14 | **Rapprochement des soldes** — D08                | Garantit qu'aucune opération ne manque.                                                                                                                                               | M3    | ⭐⭐⭐   | S      | ✅   |
| P-11 | **Écriture d'ajustement** (mode rattrapage) — D11 | Quand le rapprochement révèle un écart, le combler par une opération d'ajustement annotée, sans avoir le relevé manquant sous la main ; remplacée si le relevé est importé plus tard. | M3    | ⭐⭐     | S      | ✅   |
| P-15 | **Import MT940** — D05                            | Format encore fréquent dans certaines banques européennes.                                                                                                                            | M3    | ⭐       | S      | ✅   |
| P-16 | **Dictionnaire de marchands** — E01               | Bonne catégorisation dès le premier jour.                                                                                                                                             | M4    | ⭐⭐     | M      | ⬜   |
| P-17 | **Abonnements & alertes de hausse** — E05, E06    | Économies concrètes, effet « waouh » immédiat.                                                                                                                                        | M4    | ⭐⭐⭐   | M      | ⬜   |

### Analyses

| ID   | Proposition                                     | Pourquoi                                                        | Jalon | Priorité | Effort | État |
| ---- | ----------------------------------------------- | --------------------------------------------------------------- | ----- | -------- | ------ | ---- |
| P-18 | **Sankey** revenus → catégories → épargne — F07 | Voir d'un coup « où part le salaire ».                          | M5    | ⭐⭐     | S      | ⬜   |
| P-19 | **Calendrier des dépenses** — F08               | Repérer jours et périodes dépensières.                          | M5    | ⭐⭐     | S      | ⬜   |
| P-20 | **Export graphiques & données** — F10           | Partager, archiver, retravailler dans un tableur.               | M5    | ⭐⭐     | S      | ⬜   |
| P-21 | **Rapport mensuel PDF** — F11                   | Une synthèse à archiver ou imprimer.                            | M5    | ⭐⭐     | M      | ⬜   |
| P-22 | **Détection d'anomalies** — F12                 | Double prélèvement, dépense hors norme, frais bancaires.        | M5    | ⭐⭐⭐   | M      | ⬜   |
| P-23 | **Inflation personnelle**                       | Comparer l'évolution de son panier aux indices de prix publics. | M10   | ⭐       | M      | ⬜   |

### Salaires

| ID   | Proposition                                                                                                                                                                   | Pourquoi                                                                                                                          | Jalon    | Priorité | Effort | État |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- | ------ | ---- |
| P-25 | **Rapprochement bulletin ↔ virement** — G09                                                                                                                                   | Vérifier que le net payé a bien été versé.                                                                                        | M6       | ⭐⭐⭐   | S      | ⬜   |
| P-26 | **Coût employeur** — G10                                                                                                                                                      | Comprendre le coût total de son poste.                                                                                            | M6       | ⭐⭐     | S      | ⬜   |
| P-27 | **Simulateur brut → net** — G11                                                                                                                                               | Évaluer une augmentation, un changement de taux.                                                                                  | M6       | ⭐⭐     | M      | ⬜   |
| P-28 | **Récapitulatif annuel** (net imposable) puis aide à la déclaration — K04                                                                                                     | Vérifier la déclaration pré-remplie.                                                                                              | M6 → M10 | ⭐⭐     | S → M  | ⬜   |
| P-29 | **Export facultatif du document source** juste après extraction — H10 ([ADR-018](../architecture/decisions.md#adr-018--pas-de-conservation-des-documents-sources-par-défaut)) | Fluxo n'est pas un système de stockage ; l'original n'est pas conservé par défaut, mais l'utilisateur peut le garder de son côté. | M7       | ⭐⭐     | S      | ⬜   |

Retirée lors de la revue du 24 novembre 2026 ([ADR-025](../architecture/decisions.md#adr-025--revue-des-propositions-du-24-novembre-2026)) : P-24 (congés & RTT, jugé inutile).

### IA

| ID   | Proposition                                         | Pourquoi                                              | Jalon | Priorité | Effort | État |
| ---- | --------------------------------------------------- | ----------------------------------------------------- | ----- | -------- | ------ | ---- |
| P-30 | **IA locale recommandée** — H06                     | Analyse des documents sans qu'aucune donnée ne sorte. | M7    | ⭐⭐⭐   | M      | ⬜   |
| P-31 | **Estimation du coût et plafond** avant envoi cloud | Aucune surprise sur la facture de l'API.              | M7    | ⭐⭐     | S      | ⬜   |
| P-32 | **Assistant conversationnel** — K05                 | Interroger ses finances en langage naturel.           | M10   | ⭐⭐     | L      | ⬜   |

### Budgets & motivation

| ID   | Proposition                                                              | Pourquoi                                                                                                                               | Jalon | Priorité | Effort | État |
| ---- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------- | ------ | ---- |
| P-33 | **Budgets & enveloppes avec alertes** — I01, I02                         | Le besoin le plus courant après le suivi.                                                                                              | M8    | ⭐⭐⭐   | M      | ⬜   |
| P-34 | **Objectifs d'épargne** — I03                                            | Donner un but aux économies.                                                                                                           | M8    | ⭐⭐     | S      | ⬜   |
| P-35 | **Prévision de fin de mois & reste à vivre** — I04, I05                  | Anticiper un découvert.                                                                                                                | M8    | ⭐⭐⭐   | M      | ⬜   |
| P-55 | **Simulation à long terme** des comptes courants et d'épargne — I12, I13 | Anticiper sur plusieurs années les charges futures (abonnements, crédits, eau, gaz, électricité…) et comparer des scénarios « et si ». | M8    | ⭐⭐⭐   | L      | ⬜   |
| P-36 | **Défis & succès** façon « écran de mission réussie » — I06              | Rappel ludique de l'univers visuel, motivation. Création originale, désactivable.                                                      | M8    | ⭐       | S      | ⬜   |
| P-37 | **Thème « Néon » optionnel** (lueurs, animations discrètes)              | Pour qui veut un rappel plus appuyé de l'esthétique, sans toucher aux thèmes sobres.                                                   | M9    | ⭐       | S      | ⬜   |

### Écosystème

| ID   | Proposition                                        | Pourquoi                                                                                                      | Jalon | Priorité | Effort | État |
| ---- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----- | -------- | ------ | ---- |
| P-38 | **Multi-devises** (frontaliers EUR/CHF…) — C08     | Comptes dans plusieurs devises, synthèses dans une devise de référence.                                       | M2    | ⭐⭐     | M      | ✅   |
| P-39 | **Packs pays** — K03                               | Ouvrir Fluxo à la Suisse, la Belgique, le Luxembourg, le Québec.                                              | M10   | ⭐⭐     | L      | ⬜   |
| P-40 | **Synchronisation chiffrée** — K01                 | Plusieurs ordinateurs, sans cloud qui lit les données.                                                        | M10   | ⭐⭐     | XL     | ⬜   |
| P-42 | **Patrimoine & crédits** — I07, I08, I09, I10, I11 | Vision globale : épargne, placements, crédits, patrimoine net. Retenue : voir [M8](M8-patrimoine-budgets.md). | M8    | ⭐⭐⭐   | L      | ⬜   |
| P-43 | **Dépenses partagées & notes de frais** — K07      | Avances à se faire rembourser.                                                                                | M10   | ⭐       | M      | ⬜   |

### Compléments (novembre 2026)

| ID   | Proposition                                                                                                     | Pourquoi                                                              | Jalon | Priorité | Effort | État |
| ---- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----- | -------- | ------ | ---- |
| P-48 | **Vue Étiquettes** transverse aux catégories — C06, E09                                                         | Corréler des dépenses au-delà des catégories (abonnements, « pro »…). | M2    | ⭐⭐⭐   | S      | ✅   |
| P-49 | **Simulateur de remboursement anticipé** — I10                                                                  | Évaluer l'effet d'un versement exceptionnel sur un crédit.            | M8    | ⭐⭐     | M      | ⬜   |
| P-50 | **Assistant de migration** depuis d'autres applications (Bankin, Linxo, YNAB, tableur)                          | Faciliter l'arrivée de nouveaux utilisateurs avec leur historique.    | M3    | ⭐⭐     | M      | ⬜   |
| P-51 | **Déverrouillage biométrique** (Windows Hello, Touch ID, empreinte Linux) — B02                                 | Plus rapide qu'un mot de passe maître, sans l'affaiblir (facultatif). | M1    | ⭐⭐     | S      | ⬜   |
| P-52 | **Destination de sauvegarde au choix** (dossier synchronisé, WebDAV, S3 compatible), chiffrée avant envoi — B04 | Sauvegarde hors de l'appareil sans dépendre d'un service Fluxo.       | M1    | ⭐⭐     | M      | ⬜   |
| P-53 | **Mode Foyer** : comptes et budgets partagés, visibilité par membre — K09                                       | Suivre des finances à deux sans tout fusionner ni tout dupliquer.     | M10   | ⭐⭐     | XL     | ⬜   |
| P-54 | **Cotations automatiques** de placements (API boursière), en option — K08                                       | Éviter la ressaisie manuelle pour qui l'accepte ; reste facultatif.   | M10   | ⭐       | M      | ⬜   |

### Qualité du projet

| ID   | Proposition                                                              | Pourquoi                                                            | Jalon | Priorité | Effort | État |
| ---- | ------------------------------------------------------------------------ | ------------------------------------------------------------------- | ----- | -------- | ------ | ---- |
| P-44 | **Budget de poids en CI**                                                | La légèreté se mesure, sinon elle se perd.                          | M0    | ⭐⭐     | S      | ⬜   |
| P-45 | **Outil d'anonymisation** de relevés et bulletins pour les contributeurs | Collecter des fichiers de test réalistes sans aucune donnée réelle. | M3    | ⭐⭐⭐   | S      | ⬜   |
| P-46 | **Non-régression visuelle** (captures clair/sombre en CI)                | Protéger le système de design.                                      | M9    | ⭐       | S      | ⬜   |
| P-47 | **Assistant de premier lancement** — A11                                 | Premier contact réussi pour le grand public.                        | M9    | ⭐⭐⭐   | M      | ⬜   |

## 2. Propositions sur l'organisation des jalons

1. **Alpha publique dès M3** (déjà retenu) : à partir de l'import, Fluxo sert au quotidien ; les retours arrivent tôt.
2. **M6 en parallèle de M3–M5** : la saisie de bulletins ne dépend que des comptes (M2). Utile si le suivi des salaires est prioritaire pour vous.
3. **Scinder M7** en _M7a — extraction locale_ (texte PDF, OCR, modèles déterministes, relecture) et _M7b — IA_ : de la valeur plus tôt, et l'IA s'appuie sur une relecture déjà éprouvée.
4. **Jalon « Communauté » après M3** : outil d'anonymisation (P-45), formats de contribution (profils bancaires, modèles de bulletins, traductions), guide du contributeur — pour enrichir les formats avant la bêta.
5. **Accessibilité et performance en continu** : critères vérifiés à chaque jalon plutôt que concentrés au M9 (les budgets sont déjà dans [performance](../architecture/performance.md)).
6. **Vitrine publique au M5** : page de présentation du projet avec captures du mode démo, pour recruter testeurs et contributeurs.
7. **M8 élargi en « Patrimoine, crédits, budgets & prévisions »** (déjà retenu, 2026-11-24) : les crédits (immobilier, conso…) et le patrimoine net (K05 historique) rejoignent le jalon budgets plutôt que de rester une piste « après la v1 ». Raison : un crédit et un compte de valorisation manuelle sont avant tout des extensions du modèle `Account` (M2), et le patrimoine net est une anticipation au même titre qu'un budget — regrouper évite de créer un jalon supplémentaire qui aurait décalé la numérotation de M5 à M10.
8. **Simulation à long terme dans M8** (proposée, 2026-11-24, P-55) : un lot « Simulation » rejoint M8 plutôt qu'un jalon dédié, car il réutilise directement les récurrences (M4), les échéanciers de crédit (M8, lot 3) et le salaire (M6) ; il prolonge la prévision de fin de mois sur plusieurs années. M8 passe de la taille L à XL.

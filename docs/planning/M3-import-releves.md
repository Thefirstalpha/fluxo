# M3 — Import des relevés bancaires

> **Statut : ⬜ À venir** · Taille : L · Dépend de : M2 · Version : 0.4 — **Alpha**

## Objectif

Importer les relevés de **n'importe quelle banque** sans ressaisie, en sécurité, sans doublon, avec la possibilité d'annuler.

## Valeur pour l'utilisateur

« J'exporte mon relevé depuis ma banque, je le dépose dans Fluxo : mes opérations sont là, une seule fois, et les soldes collent. »

## Périmètre

**Inclus** : CSV (avec profils par banque), OFX/QFX, QIF, CAMT.053, MT940 (proposé), déduplication, aperçu, annulation, rapprochement des soldes, historique des imports.
**Hors périmètre** : relevés PDF (M7), connexion bancaire automatique (M10).

## Récits utilisateur

- Je veux déposer un fichier et voir un **aperçu** avant d'importer.
- Je veux associer une fois les colonnes du CSV de ma banque, puis que Fluxo s'en souvienne.
- Je veux ré-importer un relevé qui chevauche le précédent **sans créer de doublons**.
- Je veux **annuler** un import raté en un clic.
- Je veux être alerté si le solde final ne correspond pas à celui du relevé.

## Plan d'action

### Lot 1 — Pipeline

- [ ] Sélection par boîte de dialogue du process main ou glisser-déposer (chemin obtenu dans le preload via `webUtils.getPathForFile`, revalidé côté main : extension, taille, existence). `Socle`
- [ ] Analyse dans un **processus isolé sans réseau** : limites (20 Mo, 200 000 lignes, délai maximal), détection d'encodage (UTF-8, Windows-1252, ISO-8859-1) et du séparateur. `Socle`
- [ ] Étapes : lecture → normalisation (dates, montants, sens) → déduplication → aperçu → validation → écriture en **lot d'import**. `Besoin`
- [ ] Annulation d'un lot complet, tracée dans l'historique. `Besoin`

### Lot 2 — Formats

- [ ] **CSV** : assistant de correspondance (date, libellé, montant ou débit/crédit, solde), formats de date, lignes à ignorer ; profils enregistrables et partageables (JSON validé par schéma). `Besoin`
- [ ] Bibliothèque de **profils communautaires** (grandes banques françaises), enrichie par pull request avec un fichier d'exemple anonymisé. `Proposition`
- [ ] **OFX/QFX** (SGML 1.x et XML 2.x). `Besoin`
- [ ] **QIF**. `Besoin`
- [ ] **CAMT.053** (ISO 20022) : soldes d'ouverture et de clôture, références de bout en bout, devises. `Besoin`
- [ ] **MT940** (SWIFT). `Proposition`

### Lot 3 — Qualité des données

- [ ] Doublons : empreinte exacte (compte + date + montant + libellé normalisé) et correspondance approchée (± 3 jours, libellé proche) → choix « ignorer / importer quand même ». `Besoin`
- [ ] **Rapprochement des soldes** : solde calculé = solde de clôture du relevé (CAMT, OFX), sinon alerte expliquée. `Proposition`
- [ ] Opérations en attente et cartes à débit différé. `Socle`

### Lot 4 — Interface

- [ ] Assistant en 3 étapes (fichier → correspondance et aperçu → résultat) : nouvelles, doublons, erreurs, déjà catégorisées. `Besoin`
- [ ] Historique des imports (date, fichier, banque, volume, annulation). `Besoin`

## Sécurité & confidentialité

- Tout fichier est **non fiable** : aucune exécution, processus sans privilège, tailles bornées.
- XML : aucune entité externe (XXE), aucune expansion d'entités (« billion laughs »).
- Les fichiers source ne sont pas conservés par défaut (option : coffre des documents, M7).
- Export CSV : neutralisation des formules (cellules commençant par `=`, `+`, `-`, `@`).

## Légèreté & performance

- 10 000 lignes importées en moins de 3 s, interface réactive pendant l'analyse (progression affichée).

## Tests

- Fichiers d'exemple **anonymisés** par format et par banque, tests « golden » (sortie attendue figée).
- Tests de robustesse (fuzzing) des analyseurs CSV, OFX et XML.

## Critères d'acceptation

- Ré-importer le même fichier ne crée aucun doublon ; l'annulation restaure l'état antérieur exact.
- Les 4 formats principaux importent correctement leurs fichiers d'exemple sur les 3 OS.

## Risques & questions

- Hétérogénéité des CSV bancaires : la bibliothèque de profils et l'assistant sont la clé.
- Collecter des fichiers d'exemple réalistes **sans données réelles** : outil d'anonymisation à fournir aux contributeurs.

# M7 — Documents & IA

> **Statut : ✅ Livré** · Taille : XL · Dépend de : M3, M6 · Version : 0.8

## Objectif

Déposer un **relevé** ou un **bulletin** PDF (ou un scan) et obtenir des données **structurées, vérifiées et relues** — sans compromettre la confidentialité.

## Principes

1. **Déterministe d'abord, IA ensuite** : texte PDF et modèles connus avant tout modèle de langage.
2. **IA locale de préférence** ; cloud seulement avec une **clé personnelle** et un **consentement explicite par document**.
3. **Rien n'est enregistré sans relecture** (ou règle de confiance explicitement choisie).
4. **Mêmes schémas que la saisie manuelle** (M3, M6) : l'IA remplit un formulaire, elle n'invente pas de structure.

Architecture détaillée : [analyse de documents & IA](../architecture/ia.md).

## Récits utilisateur

- Je dépose mes 12 bulletins de l'année : Fluxo les lit, signale les incohérences et me laisse corriger avant d'enregistrer.
- Je dépose un relevé PDF que ma banque ne fournit pas en CSV : les opérations sont extraites comme un import classique.
- Je veux savoir **exactement** ce qui serait envoyé à un service en ligne, et pouvoir refuser.

## Plan d'action

### Lot 1 — Boîte de dépôt & stockage

- [x] Glisser-déposer PDF/PNG/JPEG ; empreinte SHA-256 (dédoublonnage) ; file de traitement avec états (en attente, extrait, à relire, enregistré, rejeté). `Besoin`
- [x] **Pas de conservation de l'original par défaut** ([ADR-018](../architecture/decisions.md#adr-018--pas-de-conservation-des-documents-sources-par-défaut)) : le fichier déposé est supprimé après extraction et validation ; seules les données structurées et l'empreinte (anti-doublon) restent. `Besoin`
- [x] **Export facultatif immédiat** du fichier original, proposé juste après l'extraction, avant sa suppression. `Proposition`

### Lot 2 — Extraction locale

- [x] Texte des PDF avec **pdf.js** dans un processus isolé (évaluation de code désactivée, aucune ressource distante). `Besoin`
- [x] **OCR** (tesseract.js, français/anglais) pour les scans ; données de langue téléchargées à la demande avec empreinte vérifiée. `Besoin`
- [x] Classification du document (relevé, bulletin, autre) par heuristiques. `Socle`
- [x] **Modèles déterministes** pour les formats fréquents (principaux logiciels de paie, relevés des grandes banques). `Socle`

### Lot 3 — Extraction par IA

- [x] Interface `AiProvider` ; fournisseurs : **aucun** (défaut), **local** (petit modèle spécialisé embarqué téléchargé à la demande ; ou, en option avancée, un serveur d'inférence local déjà installé type Ollama), **Claude** (clé personnelle) ; extensible par la communauté. `Besoin`
- [x] Sortie **structurée et validée** par schéma (le même que la saisie manuelle) ; toute réponse invalide est rejetée. `Socle`
- [x] **Anonymisation** avant tout envoi cloud (NIR, IBAN, noms, adresses) ; **aperçu** de ce qui part ; journal local des envois. `Socle`
- [x] **Estimation du coût** avant envoi et plafond mensuel. `Proposition`
- [x] Clés d'API chiffrées (`safeStorage`), utilisées uniquement côté process main/service, jamais exposées au renderer. `Socle`

### Lot 4 — Validation & relecture

- [x] Contrôles arithmétiques (bulletin) et de soldes (relevé) ; champs à faible confiance mis en évidence. `Socle`
- [x] **Vue côte à côte** : document à gauche (zone source surlignée), champs à droite, corrections au clavier, validation → enregistrement. `Besoin`

### Lot 5 — Catégorisation assistée

- [x] Suggestions IA pour les marchands inconnus : seuls des **libellés anonymisés** sont envoyés, par lots ; les suggestions arrivent dans la file « à valider » (M4). `Besoin`

### Lot 6 — Évaluation

- [x] Jeu de documents **anonymisés** avec vérité terrain ; précision et rappel par champ. `Socle`
- [x] Non-régression en CI à partir de réponses enregistrées (aucun appel réseau en CI). `Socle`

## Sécurité & confidentialité

- Documents = entrées non fiables : processus isolé, limites de taille et de pages, aucune exécution de contenu.
- Sans consentement, **aucune requête réseau** n'est possible (test automatisé).
- Les services cloud traitent les données hors de l'appareil (et possiblement hors de l'UE) : information claire avant activation.

## Critères d'acceptation

- Bulletin PDF « texte » d'un format connu : extraction complète **sans IA**, contrôles au vert.
- Bulletin scanné : OCR + IA locale, **≥ 90 %** des champs clés corrects, relecture en moins d'une minute.
- Aucun envoi réseau sans consentement explicite.

## Risques & questions

- Qualité variable des scans ; diversité des mises en page → modèles communautaires + IA en secours.
- Coût et disponibilité des modèles cloud : la clé appartient à l'utilisateur ; Fluxo reste gratuit et ne facture rien pour cet usage ([ADR-016](../architecture/decisions.md#adr-016--modèle-économique--gratuit-et-libre-sans-monétisation-en-v1)).
- Poids des modèles locaux : jamais embarqués dans l'installeur.

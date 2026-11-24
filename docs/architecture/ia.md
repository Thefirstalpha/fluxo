# Analyse de documents & IA

Conception du pipeline de lecture des relevés et bulletins (jalon [M7](../planning/M7-documents-ia.md)). Principe : **déterministe d'abord, IA ensuite, humain en dernier**.

## Pipeline

```mermaid
flowchart TD
  A["Dépôt du document"] --> B["Empreinte SHA-256 · dédoublonnage"]
  B --> C{"PDF avec texte ?"}
  C -- oui --> D["Extraction du texte (pdf.js, processus isolé)"]
  C -- non --> E["OCR (tesseract.js, local)"]
  D --> F{"Format connu ?"}
  E --> F
  F -- oui --> G["Modèle déterministe"]
  F -- non --> H{"IA autorisée ?"}
  H -- locale --> I["Modèle local"]
  H -- cloud + consentement --> J["Anonymisation → Claude"]
  H -- non --> K["Saisie assistée"]
  G --> L["Validation : schéma + contrôles arithmétiques / soldes"]
  I --> L
  J --> L
  K --> L
  L --> M["Relecture côte à côte"]
  M --> N["Enregistrement (audit : origine = document)"]
```

## Fournisseurs

```ts
/** Contrat commun ; la sortie est toujours validée par le schéma métier (zod). */
interface AiProvider {
  readonly id: 'none' | 'local' | 'anthropic'
  readonly runsOnDevice: boolean
  extractPayslip(input: ExtractionInput): Promise<ExtractionResult<PayslipDraft>>
  extractStatement(input: ExtractionInput): Promise<ExtractionResult<StatementDraft>>
  suggestCategories(labels: string[]): Promise<CategorySuggestion[]>
}
```

| Fournisseur | Fonctionnement                                                                             | Données envoyées                               | Par défaut |
| ----------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------- | ---------- |
| `none`      | Modèles déterministes + saisie assistée                                                    | Aucune                                         | ✅         |
| `local`     | **Petit modèle spécialisé embarqué** (quelques centaines de Mo, téléchargé à la demande, empreinte vérifiée) pour les champs non couverts par les modèles déterministes ; ou, en option avancée, un serveur d'inférence local déjà installé (Ollama ou équivalent) pour un modèle plus capable ; sortie JSON contrainte par le schéma | Aucune hors de l'appareil                      | Recommandé ([ADR-017](decisions.md#adr-017--ia-locale-légère-par-défaut-recommandée-cloud-toujours-facultatif)) |
| `anthropic` | API Claude, **clé personnelle**, chiffrée par `safeStorage`, utilisée uniquement côté main | Texte ou PDF **anonymisé**, après consentement | Non        |

Les modèles locaux ne sont **jamais** embarqués dans l'installeur : le modèle léger est téléchargé à la demande, comme les données de langue de l'OCR. Choix précis du modèle et du format (ONNX, GGUF…) : [Q2 des questions ouvertes](../planning/questions-ouvertes.md).

## Fournisseur Claude (esquisse M7)

- **Modèle** : `claude-opus-5-5` par défaut, configurable ; `claude-haiku-5-5` sélectionnable pour les gros volumes (suggestions de catégories).
- **Sorties structurées** : `client.messages.parse()` + `zodOutputFormat(schema)` ; `parsed_output` vaut `null` si la sortie ne respecte pas le schéma → rejet.
- **PDF** : bloc `document` en base64 (≤ 32 Mo, ≤ 600 pages), placé avant la consigne.
- **Refus** : vérifier `stop_reason === 'refusal'` avant de lire le contenu ; activer le repli côté serveur (paramètre `fallbacks`, bêta `server-side-fallback-2026-07-01`).
- **Coûts** : mise en cache du prompt système stable ; comptage des jetons avant envoi (estimation affichée) ; API Batches (−50 %) pour les suggestions de catégories non urgentes.
- **Erreurs** : classes typées du SDK (limite de débit, authentification…), nouvelles tentatives gérées par le SDK, message clair à l'utilisateur.
- **Localisation des traitements** : l'inférence est « globale » par défaut (option « US uniquement » disponible) ; il n'existe pas d'option « UE uniquement » → l'utilisateur en est informé avant activation.

```ts
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'

// Exécuté dans le process main : la clé ne quitte jamais ce processus.
const client = new Anthropic({ apiKey: userApiKey })

const response = await client.messages.parse({
  model: 'claude-opus-5-5',
  max_tokens: 16000,
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: anonymizedPdfBase64 },
        },
        { type: 'text', text: 'Extrais les champs de ce bulletin de paie selon le schéma fourni.' },
      ],
    },
  ],
  output_config: { format: zodOutputFormat(PayslipDraftSchema) },
})

if (response.stop_reason === 'refusal') throw new ExtractionRefused()
const draft = response.parsed_output // null → extraction rejetée, saisie assistée
```

## Confidentialité

1. **Consentement par document** (ou par lot explicitement choisi), révocable ; rappel du fournisseur et de la localisation des traitements.
2. **Anonymisation** avant envoi : NIR, IBAN, numéros de carte, noms et adresses remplacés par des jetons ; les montants et libellés comptables nécessaires restent.
3. **Aperçu** exact de ce qui sera envoyé.
4. **Journal local** des envois (date, fournisseur, type de document, taille) — jamais le contenu.
5. **Garde-fou technique** : aucun module ne peut joindre le réseau sans passer par le service d'envoi qui vérifie le consentement (testé).
6. **Pas de conservation du document original par défaut** ([ADR-018](decisions.md#adr-018--pas-de-conservation-des-documents-sources-par-défaut)) : une fois les données extraites et validées, le fichier déposé est supprimé ; seules les données structurées et une empreinte (anti-doublon) restent dans la base chiffrée. Un export du fichier original reste possible immédiatement après traitement, avant suppression, à la demande de l'utilisateur.

## Validation & relecture

- Validation par schéma (types, bornes, champs obligatoires).
- Contrôles métier : `checkPayslip` étendu (M6) pour les bulletins ; rapprochement des soldes (M3) pour les relevés.
- Score de confiance par champ ; champs incertains mis en évidence dans la vue côte à côte.
- Origine tracée (`document`, `ia:local`, `ia:anthropic`) dans le journal d'audit.

## Évaluation

- Corpus de documents **anonymisés** avec vérité terrain (contributions via l'outil d'anonymisation, proposition P-45).
- Mesures : précision et rappel par champ, taux de contrôles au vert, temps de relecture.
- Non-régression en CI sur des réponses enregistrées : **aucun appel réseau en CI**.

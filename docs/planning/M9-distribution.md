# M9 — Distribution grand public (v1.0)

> **Statut : ⬜ À venir** · Taille : XL · Dépend de : M5, M7, M8 · Version : **1.0**

## Objectif

Rendre Fluxo **installable et digne de confiance pour tous** : installeurs signés, mises à jour automatiques vérifiées, premier lancement guidé, documentation, et audits d'accessibilité, de sécurité et de performance.

## Plan d'action

### Lot 1 — Installeurs & signature

- [ ] **Windows** : NSIS x64 et arm64 (MSIX / Microsoft Store à l'étude) ; signature de code (Azure Trusted Signing ou certificat). `Socle`
- [ ] **macOS** : DMG arm64 et x64, signature Developer ID, **notarisation**, Hardened Runtime avec entitlements minimaux. `Socle`
- [ ] **Linux** : AppImage et deb (Flatpak / Flathub à l'étude) ; sommes de contrôle signées. `Socle`
- [ ] Vérification sur chaque OS des fuses Electron et de l'intégrité ASAR. `Socle`

### Lot 2 — Mises à jour

- [ ] `electron-updater` via GitHub Releases : vérification de signature, canaux stable et bêta, déploiement progressif, notes de version dans l'application, possibilité de désactiver. `Socle`

### Lot 3 — Pipeline de release

- [ ] Tag → builds par OS → SBOM CycloneDX → sommes SHA-256 → **attestations de provenance** → release brouillon → publication manuelle. `Socle`
- [ ] Secrets de signature dans un environnement GitHub protégé (validation manuelle). `Socle`
- [ ] Journal des modifications généré depuis les commits conventionnels. `Proposition`

### Lot 4 — Expérience

- [ ] **Assistant de premier lancement** : langue, devise, mode de sécurité (session / mot de passe maître), démo ou départ vierge, premier import. `Proposition`
- [ ] Traduction anglaise complète et formats régionaux. `Socle`
- [ ] **Documentation utilisateur** (site statique), FAQ, politique de confidentialité. `Socle`

### Lot 5 — Audits

- [ ] **Accessibilité** WCAG 2.2 AA : NVDA, VoiceOver, navigation clavier, contrastes, mouvement réduit. `Socle`
- [ ] **Sécurité** : revue du modèle de menace, analyse statique spécifique Electron, audit externe si possible, processus de divulgation testé. `Socle`
- [ ] **Performance** : budgets tenus sur une machine modeste (voir [performance](../architecture/performance.md)). `Socle`
- [ ] **Juridique** : licence, mentions des composants tiers, recherche formelle de marque « Fluxo » (INPI, EUIPO, nom de domaine, boutiques) — une homonymie BTP (tuyaux) déjà identifiée et jugée à faible risque, voir [ADR-021](../architecture/decisions.md#adr-021--nom--fluxo--confirmé-malgré-une-homonymie-btp) — avertissements (pas de conseil financier ni fiscal). `Socle`
- [ ] Rapports de plantage : **désactivés par défaut**, opt-in, sans données personnelles. `Proposition`

## Critères d'acceptation

- Installation sans alerte de sécurité système sur Windows et macOS (signature, notarisation).
- Mise à jour 1.0 → 1.0.1 réussie automatiquement sur les 3 OS.
- Audits d'accessibilité et de sécurité réalisés, points bloquants corrigés.

## Risques & questions

- Coût des certificats et du compte développeur Apple ; délais de notarisation.
- Réputation SmartScreen des nouveaux certificats Windows.

# Instructions pour les agents IA (Claude ou autre)

Ce fichier s'adresse à toute IA qui modifie ce dépôt. Il complète, sans les répéter, les documents de référence : [docs/README.md](docs/README.md) (index), [docs/planning/README.md](docs/planning/README.md) (feuille de route), [docs/planning/questions-ouvertes.md](docs/planning/questions-ouvertes.md) et [docs/architecture/decisions.md](docs/architecture/decisions.md). Lis-les avant de commencer une tâche non triviale ; ils priment sur ta mémoire d'entraînement si un conflit apparaît.

## Règle n°1 — mettre à jour les jalons et les docs à chaque implémentation

La documentation de `docs/` est la référence du projet, pas un rapport après coup. Après **chaque** lot de travail qui change le comportement de l'application, avant de considérer la tâche terminée :

1. **Coche ou corrige** les cases du plan d'action dans la page de jalon concernée (`docs/planning/M*.md`) — une case ne se coche que pour du code **fusionné, testé et documenté**, jamais pour du travail en cours.
2. **Mets à jour le statut** dans [docs/projet/fonctionnalites.md](docs/projet/fonctionnalites.md) (✅ fait · 🟡 partiel · ⬜ à faire) pour chaque identifiant concerné (ex. `C06`, `G02`).
3. **Répercute tout changement de modèle de données** dans [docs/architecture/modele-de-donnees.md](docs/architecture/modele-de-donnees.md) (entités, diagramme `erDiagram`, règles transverses) — ce document décrit le modèle **cible**, il doit rester vrai.
4. **Consigne toute décision structurante** (choix de bibliothèque, format de stockage, compromis de sécurité ou de performance) dans [docs/architecture/decisions.md](docs/architecture/decisions.md) sous un nouvel ADR, même bref. Une décision déjà actée ne se réécrit pas : une nouvelle ADR la remplace et l'explique.
5. Si une proposition ([docs/planning/propositions.md](docs/planning/propositions.md)) est implémentée, ou qu'une question ouverte ([docs/planning/questions-ouvertes.md](docs/planning/questions-ouvertes.md)) est tranchée par le travail effectué, mets ces documents à jour en conséquence (retire la question tranchée, renvoie vers l'ADR qui la documente).
6. Mets à jour la **feuille de route** ([docs/planning/README.md](docs/planning/README.md)) seulement si l'ordre, les dépendances ou le périmètre d'un jalon changent réellement — pas à chaque tâche.
7. Si le travail dépasse le périmètre annoncé d'un jalon (« Hors périmètre » dans sa page), ne l'implémente pas silencieusement : propose d'abord la mise à jour du plan, ou pose la question avant de continuer (voir « Ne pas anticiper » ci-dessous).

Les docs et le code se valident et se livrent **ensemble** (même commit ou même PR), pas dans un second temps.

## Ne pas anticiper au-delà de ce qui est demandé

Ce projet avance par petits incréments **validés** par la personne qui le pilote avant un gros chantier (voir le ton de [docs/planning/README.md](docs/planning/README.md) et de [docs/projet/vision.md](docs/projet/vision.md) — « Réversibilité », « Légèreté »). Concrètement :

- Ne commence pas un jalon ou un lot qui n'a pas été explicitement demandé, même s'il semble être la suite logique.
- Si une tâche touche une question encore ouverte (`docs/planning/questions-ouvertes.md`), signale-le et propose la recommandation documentée plutôt que de trancher silencieusement dans le code.
- Préfère plusieurs petits incréments testés à un gros changement d'un coup — surtout pour le modèle de données ([ADR](docs/architecture/decisions.md) : coûteux à changer après coup).
- N'ajoute pas de dépendance, d'abstraction ou de configuration « au cas où » : chaque ajout doit répondre à un besoin déjà dans `docs/projet/fonctionnalites.md` ou explicitement demandé.

## Bonnes pratiques d'intégration pour ce type de projet

Application de bureau Electron, données financières personnelles, destinée à un dépôt public : trois contraintes qui priment sur les habitudes génériques.

- **Sécurité par défaut, pas par exception.** Le renderer est non fiable (sandbox, pas de Node, CSP stricte, IPC validé par schéma zod côté main — voir [docs/architecture/securite.md](docs/architecture/securite.md)). Toute nouvelle capacité exposée au renderer passe par une fonction preload dédiée et un schéma de validation, jamais par un accès générique.
- **Argent = entiers.** Tout montant est un entier en centimes (`MinorUnits`, `src/shared/money.ts`) + un code devise ISO 4217. Jamais de nombre flottant pour un montant, un taux de prélèvement ou une part de mensualité de crédit.
- **Les calculs financiers ont des contrôles de cohérence testés.** Un bulletin de paie, un tableau d'amortissement, un agrégat de catégorie : chacun a ses invariants (ex. `checkPayslip`) et un test qui les vérifie — un calcul financier sans test n'est pas terminé.
- **Légèreté mesurée, pas supposée.** Avant d'ajouter une dépendance : vérifier qu'elle n'existe pas déjà dans le projet, regarder son poids réel (voir [docs/architecture/performance.md](docs/architecture/performance.md)), et l'ajouter en `devDependencies` (le build est bundlé, voir `package.json` et `.npmrc` — `allowScripts`, `min-release-age`).
- **Accessibilité non négociable.** Clavier, lecteur d'écran, contraste, vue tableau pour chaque graphique — dès l'implémentation, pas en rattrapage (voir [docs/design/systeme-de-design.md](docs/design/systeme-de-design.md)).
- **Rien ne quitte l'appareil sans un geste explicite.** IA cloud, synchronisation, cotations automatiques : toujours facultatif, désactivé par défaut, consentement explicite si une donnée personnelle part vers un service externe.
- **Le français est la langue des documents publics**, le code et les identifiants restent en anglais ; toute chaîne utilisateur passe par les dictionnaires typés (`src/renderer/src/i18n/`), jamais de texte en dur dans un composant.
- **Commits et PR petits et réversibles**, un lot de plan d'action à la fois ; `npm run check` (types, lint, format, tests) vert avant de proposer un changement comme terminé.

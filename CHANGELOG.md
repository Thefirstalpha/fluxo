# Journal des modifications

Toutes les évolutions notables de Fluxo sont consignées dans ce fichier.

Le format suit [Keep a Changelog 1.1.0](https://keepachangelog.com/fr/1.1.0/) et le projet respecte le [versionnage sémantique](https://semver.org/lang/fr/). Avant la version 1.0, une version mineure (0.x) peut contenir des changements incompatibles.

## [Non publié]

Jalons [M0 — Fondations](docs/planning/M0-fondations.md) (socle applicatif, interface, outillage) et [M1 — Coffre-fort local](docs/planning/M1-coffre-fort.md) (en cours). Aucune version n'est encore publiée.

### Ajouté

- Application de bureau Electron 45 (electron-vite 6, React 19, TypeScript 6 strict, Tailwind CSS 4) pour Windows, macOS et Linux.
- Coque façon éditeur de code : barre de titre intégrée (contrôles natifs Windows/Linux, feux macOS), barre latérale des sections et des jalons à venir, barre d'état.
- Thème Système / Clair / Sombre, appliqué dès la première image (sans flash) et conservé d'une session à l'autre.
- Système de design « Vice Sunset » : fonds neutres, accents en dégradé, palette des graphiques vérifiée pour le daltonisme et le contraste.
- Logo et icône d'application originaux.
- Paramètres : thème avec aperçus, langue (français, anglais), devise de référence, masquage des montants, protection contre les captures d'écran, informations de version.
- Tableau de bord de **démonstration** (données fictives) : indicateurs avec variations, flux mensuels avec solde net, zoom, sélection d'un mois au clic ou au clavier, infobulles, vue tableau, dépenses par catégorie, aperçu d'un bulletin « du brut au net » avec contrôles de cohérence.
- Pages « à venir » pour chaque section, reliées à leur jalon.
- Taille, position et maximisation de la fenêtre conservées d'un lancement à l'autre (fenêtre recentrée si son écran a été débranché).
- Écran d'erreur en cas de problème dans l'interface (la navigation reste utilisable si une seule page échoue) ; l'erreur est consignée, expurgée, dans le journal local.
- Polices allégées : seuls les jeux de caractères latins sont embarqués.
- Domaine : montants en centimes entiers, formatage localisé, analyse robuste des montants saisis ou importés (formats français, anglais, suisse, notation comptable), calcul de mois indépendant du fuseau horaire, modèle simplifié de bulletin et ses contrôles arithmétiques, catégories par défaut (France), générateur de données de démonstration déterministe.
- Qualité : ESLint (règles typées, frontières entre processus), Prettier, tests unitaires et de composants (Vitest), tests de bout en bout sur la build de production (Playwright).
- Fichiers du dépôt public : licence MIT, mentions des composants tiers, guide de contribution, politique de sécurité, code de conduite, modèles de tickets et de demandes de fusion.
- Intégration continue GitHub Actions : qualité, build et tests de bout en bout sur les trois systèmes, CodeQL, revue des dépendances, OpenSSF Scorecard, Dependabot, contrôle des budgets de poids, squelette de publication.

- **Coffre chiffré** (M1) : au premier lancement, création d'une base chiffrée sur l'ordinateur, ouverte par la session du système (sans mot de passe) ou par un mot de passe maître ; code de récupération facultatif, affiché une seule fois ; changement de mot de passe et de mode dans les paramètres ; verrouillage depuis la barre de titre, à l'inactivité, au verrouillage de la session et à la mise en veille.

- **Sauvegardes** (M1) : sauvegarde chiffrée automatique (quotidienne, conservée 7 jours, 4 semaines et 12 mois) et à la demande, dans le dossier de votre choix ; restauration vérifiée avec aperçu, y compris sur un autre ordinateur (mot de passe ou code de récupération) ; export complet en JSON et CSV ; « Tout effacer ».

- **Démonstration** (M1) : explorer Fluxo dans un coffre séparé rempli de données fictives, supprimé à la sortie, sans toucher à votre coffre.

- **Comptes** (M2) : comptes courants, livrets, cartes à débit différé, espèces, titres-restaurant, placements et prêts, avec leur solde à date et leur part rapprochée ; IBAN contrôlé et affiché masqué ; archivage.
- **Catégories par défaut** (M2) : pack France sur deux niveaux, créé avec chaque coffre dans la langue de l'interface.

### Sécurité

- Renderer isolé : `sandbox`, `contextIsolation`, pas de Node.js, balise `<webview>` désactivée, bac à sable activé pour toute l'application.
- Interface servie par un protocole privé `app://` (jamais `file://`), protégé contre la traversée de répertoires, avec liste blanche de types MIME.
- Content Security Policy stricte en production : aucun script en ligne, aucun `eval`, aucun accès réseau depuis l'interface.
- Navigations, redirections et nouvelles fenêtres bloquées ; seuls des liens HTTPS autorisés s'ouvrent dans le navigateur.
- Permissions web toutes refusées sauf l'écriture dans le presse-papiers ; téléchargements bloqués ; correcteur orthographique coupé.
- IPC : émetteur vérifié, entrées validées par schéma strict, erreurs réduites à un code ; API preload minimale.
- Préférences écrites de façon atomique ; un fichier corrompu est mis de côté, jamais écrasé.
- Journaux locaux avec rotation et masquage des IBAN, numéros de sécurité sociale, e-mails, numéros de carte et du dossier personnel.
- Binaire durci par les fuses Electron (pas de `RUN_AS_NODE`, pas de `NODE_OPTIONS`, intégrité de l'archive ASAR, chargement depuis l'ASAR uniquement), entitlements macOS minimaux.
- Base de données chiffrée au format SQLCipher 4 dans un processus dédié ; la clé n'est jamais affichée ni journalisée, enveloppée par le trousseau du système ou par Argon2id ; délais croissants après des échecs de déverrouillage.
- Chaîne d'approvisionnement : scripts d'installation des dépendances bloqués par défaut, versions publiées depuis au moins 7 jours, aucune dépendance Git ou distante, versions exactes ; actions GitHub épinglées par empreinte et permissions minimales en CI.

[Non publié]: https://github.com/Thefirstalpha/fluxo/commits/main

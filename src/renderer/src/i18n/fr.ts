/**
 * Dictionnaire de référence (français). La forme de cet objet définit le type `Dictionary` :
 * toute autre langue doit fournir exactement les mêmes clés (vérifié à la compilation).
 */
export const fr = {
  common: {
    demo: 'Démo',
    milestone: (id: string) => `Jalon ${id}`,
    chart: 'Graphique',
    table: 'Tableau',
    previous: 'Précédent',
    next: 'Suivant',
    plannedFeatures: 'Au programme',
    seeRoadmap: 'Voir la feuille de route',
  },
  app: {
    tagline: 'Vos finances, en local.',
    localData: 'Données 100 % locales',
    encrypted: 'Base chiffrée',
    demoMode: 'Mode démonstration',
  },
  error: {
    title: 'Un problème est survenu dans l’interface',
    description:
      'Vos données ne sont pas affectées. L’erreur a été consignée dans le journal local de Fluxo (rien n’est envoyé en ligne).',
    retry: 'Réessayer',
    reload: 'Recharger l’interface',
    details: 'Détail technique',
  },
  titleBar: {
    search: 'Rechercher…',
    searchSoon: 'Palette de commandes (bientôt)',
    showAmounts: 'Afficher les montants',
    hideAmounts: 'Masquer les montants',
    theme: (label: string) => `Thème : ${label} (cliquer pour changer)`,
  },
  nav: {
    main: 'Navigation principale',
    dashboard: 'Tableau de bord',
    transactions: 'Transactions',
    imports: 'Imports',
    payslips: 'Salaires',
    analytics: 'Analyses',
    budgets: 'Budgets',
    documents: 'Documents',
    settings: 'Paramètres',
  },
  theme: {
    system: 'Système',
    light: 'Clair',
    dark: 'Sombre',
  },
  categories: {
    housing: 'Logement',
    groceries: 'Alimentation',
    transport: 'Transport',
    health: 'Santé',
    leisure: 'Loisirs & sorties',
    subscriptions: 'Abonnements',
    shopping: 'Shopping',
    other: 'Divers',
  },
  payslipExtras: {
    'on-call': 'Astreintes',
    overtime: 'Heures supplémentaires',
    'thirteenth-month': '13e mois',
    'holiday-bonus': 'Prime de vacances',
    'performance-bonus': 'Prime sur objectifs',
    'seniority-bonus': 'Prime d’ancienneté',
    other: 'Autre élément variable',
  },
  dashboard: {
    title: 'Tableau de bord',
    subtitle: (month: string) => `Synthèse de ${month}`,
    demoNotice:
      'Données de démonstration générées sur votre poste. Vos propres comptes et relevés arrivent aux jalons M2 et M3.',
    period: 'Période',
    periodMonths: (count: number) => `${count} mois`,
    focusMonth: 'Mois analysé',
    kpi: {
      income: 'Revenus',
      expenses: 'Dépenses',
      savings: 'Épargne nette',
      savingsRate: 'Taux d’épargne',
      vs: (label: string) => `vs ${label}`,
      points: (value: string) => `${value} pt`,
    },
    cashflow: {
      title: 'Flux mensuels',
      subtitle: 'Revenus et dépenses — cliquez sur un mois pour l’analyser',
      income: 'Revenus',
      expenses: 'Dépenses',
      net: 'Solde net',
      month: 'Mois',
      savingsRate: 'Taux d’épargne',
      aria: (count: number) =>
        `Graphique en colonnes des revenus et des dépenses sur ${count} mois, avec la courbe du solde net. Une vue tableau équivalente est disponible.`,
      zoomHint: 'Zoom : Ctrl + molette ou curseur sous le graphique',
    },
    categories: {
      title: 'Dépenses par catégorie',
      subtitle: (month: string) => `${month} · classées par montant`,
      category: 'Catégorie',
      amount: 'Montant',
      share: 'Part',
      change: 'Évolution',
      ofTotal: (share: string) => `${share} des dépenses du mois`,
      vsPrevious: (change: string) => `${change} vs mois précédent`,
      aria: (month: string) =>
        `Barres horizontales des dépenses par catégorie pour ${month}. Une vue tableau équivalente est disponible.`,
    },
    payslip: {
      title: 'Bulletin du mois',
      subtitle: 'Aperçu du suivi détaillé des salaires (jalon M6)',
      base: 'Salaire de base',
      gross: 'Salaire brut',
      contributions: (rate: string) => `Cotisations salariales (${rate})`,
      netBeforeTax: 'Net à payer avant impôt',
      taxableNet: 'Net imposable',
      withholding: (rate: string) => `Prélèvement à la source (${rate})`,
      adjustments: 'Titres-restaurant (part salariale)',
      netPaid: 'Net payé',
      checksOk: 'Contrôles de cohérence : OK',
      checksKo: (count: number) => `${count} incohérence(s) détectée(s)`,
    },
  },
  vault: {
    loading: 'Ouverture du coffre…',
    lock: 'Verrouiller le coffre',
    setup: {
      title: 'Créer votre coffre',
      description:
        'Vos données restent sur cet ordinateur, dans une base chiffrée. Choisissez comment la déverrouiller.',
      protection: 'Déverrouillage',
      sessionTitle: 'Avec ma session (recommandé)',
      sessionDescription:
        'Fluxo s’ouvre sans mot de passe tant que vous êtes connecté à votre session : la clé est protégée par le trousseau du système.',
      sessionUnavailable: {
        'no-secure-storage':
          'Aucun trousseau sécurisé (GNOME Keyring, KWallet…) n’est disponible sur ce système : un mot de passe maître est nécessaire.',
        unavailable:
          'Le trousseau du système est indisponible : un mot de passe maître est nécessaire.',
      },
      passwordTitle: 'Avec un mot de passe maître',
      passwordDescription:
        'À privilégier si vous partagez cet ordinateur : le mot de passe est demandé à chaque ouverture.',
      password: 'Mot de passe maître',
      confirm: 'Confirmer le mot de passe',
      passwordHint: (min: number) =>
        `Au moins ${min} caractères. Une phrase de plusieurs mots est plus sûre et plus facile à retenir.`,
      recovery: 'Créer un code de récupération',
      recoveryHint:
        'Recommandé : c’est le seul moyen de retrouver vos données si vous oubliez le mot de passe ou si le trousseau du système est réinitialisé.',
      create: 'Créer mon coffre',
      working: 'Patientez…',
    },
    recoveryCode: {
      title: 'Votre code de récupération',
      description:
        'Notez-le ou imprimez-le et rangez-le en lieu sûr, hors de cet ordinateur. Il ne sera plus jamais affiché.',
      warning:
        'Sans ce code, un mot de passe oublié signifie des données perdues : personne, pas même les auteurs de Fluxo, ne peut les récupérer.',
      copy: 'Copier',
      copied: 'Copié',
      print: 'Imprimer',
      confirm: 'J’ai mis ce code en lieu sûr',
      continue: 'Continuer',
    },
    unlock: {
      title: 'Coffre verrouillé',
      descriptionSession: 'Vos données sont chiffrées. Déverrouillez pour continuer.',
      descriptionPassword: 'Saisissez votre mot de passe maître pour déverrouiller vos données.',
      unlock: 'Déverrouiller',
      password: 'Mot de passe maître',
      useRecovery: 'Mot de passe oublié ? Utiliser le code de récupération',
      recoveryCode: 'Code de récupération',
      recoveryHint: 'Majuscules, minuscules, espaces et tirets sont acceptés.',
      backToPassword: 'Revenir au déverrouillage habituel',
      noRecovery:
        'Aucun code de récupération n’a été créé pour ce coffre : sans le mot de passe, il ne peut pas être ouvert.',
      sessionFailed:
        'Le trousseau du système n’a pas pu ouvrir le coffre (autre session ou trousseau réinitialisé ?). Utilisez le code de récupération.',
    },
    newPassword: {
      title: 'Choisissez un nouveau mot de passe',
      description:
        'Vous avez ouvert le coffre avec le code de récupération. Définissez un nouveau mot de passe maître pour continuer.',
      save: 'Enregistrer le mot de passe',
    },
    showPassword: 'Afficher le mot de passe',
    hidePassword: 'Masquer le mot de passe',
    errors: {
      tooShort: (min: number) => `Le mot de passe doit contenir au moins ${min} caractères.`,
      tooLong: 'Ce mot de passe est trop long.',
      mismatch: 'Les deux mots de passe ne correspondent pas.',
      wrongPassword: 'Mot de passe incorrect.',
      wrongRecovery: 'Code de récupération incorrect.',
      lockedOut: (seconds: number) => `Trop d’essais. Réessayez dans ${seconds} s.`,
      sessionUnavailable: 'Le trousseau du système n’est pas disponible.',
      corrupt:
        'La base est endommagée et ne peut pas être ouverte. Elle n’a pas été modifiée ; une sauvegarde pourra la remplacer.',
      generic: 'L’opération a échoué. Le détail est consigné dans le journal local.',
    },
  },
  settings: {
    title: 'Paramètres',
    subtitle: 'Apparence, région et confidentialité',
    appearance: {
      title: 'Apparence',
      description: 'Thème de l’interface. « Système » suit le réglage de votre ordinateur.',
    },
    region: {
      title: 'Langue et région',
      language: 'Langue',
      currency: 'Devise de référence',
      currencyHint: 'Utilisée pour les synthèses ; chaque transaction conserve sa propre devise.',
    },
    privacy: {
      title: 'Confidentialité',
      hideAmounts: 'Masquer les montants',
      hideAmountsHint:
        'Remplace tous les montants par des points (lieu public, partage d’écran). Raccourci : bouton œil de la barre de titre.',
      contentProtection: 'Bloquer les captures d’écran',
      contentProtectionHint:
        'Exclut la fenêtre des captures et des partages d’écran (Windows et macOS).',
    },
    security: {
      title: 'Sécurité du coffre',
      description:
        'Base chiffrée (SQLCipher, AES-256). La clé ne quitte jamais cet ordinateur et n’est jamais affichée.',
      mode: 'Déverrouillage',
      modeSession: 'Par la session du système (trousseau)',
      modePassword: 'Par mot de passe maître',
      switchToPassword: 'Exiger un mot de passe maître',
      switchToSession: 'Ouvrir avec ma session',
      changePassword: 'Changer le mot de passe',
      currentPassword: 'Mot de passe actuel',
      newPassword: 'Nouveau mot de passe',
      confirmPassword: 'Confirmer le nouveau mot de passe',
      apply: 'Valider',
      cancel: 'Annuler',
      recoveryTitle: 'Code de récupération',
      recoveryOn: 'Un code de récupération existe pour ce coffre.',
      recoveryOff:
        'Aucun code de récupération : un mot de passe oublié ou un trousseau perdu rendrait vos données irrécupérables.',
      createRecovery: 'Créer un code',
      regenerateRecovery: 'Remplacer le code',
      removeRecovery: 'Supprimer le code',
      autoLock: 'Verrouillage automatique après inactivité',
      autoLockHint: 'Inactivité du clavier et de la souris, mesurée par le système.',
      autoLockNever: 'Jamais',
      autoLockMinutes: (minutes: number) => `${minutes} min`,
      lockOnSystemLock: 'Verrouiller avec la session du système',
      lockOnSystemLockHint:
        'Quand vous verrouillez votre session ou mettez l’ordinateur en veille.',
      lockNow: 'Verrouiller maintenant',
      saved: 'Modification enregistrée.',
    },
    about: {
      title: 'À propos',
      description:
        'Fluxo est un logiciel libre. Aucune inscription, aucune télémétrie : vos données restent sur votre ordinateur.',
      version: 'Version',
      runtime: 'Environnement',
      sourceCode: 'Code source',
      openRepository: 'Ouvrir le dépôt',
    },
  },
  coming: {
    transactions: {
      milestone: 'M2',
      description: 'Le registre de toutes vos opérations, rapide même avec des milliers de lignes.',
      features: [
        'Comptes courants, épargne, cartes et espèces',
        'Saisie rapide et ventilation d’une dépense sur plusieurs catégories',
        'Virements internes exclus automatiquement des dépenses',
        'Recherche instantanée, filtres, tri et étiquettes',
      ],
    },
    imports: {
      milestone: 'M3',
      description: 'Importez vos relevés bancaires sans ressaisie, en toute sécurité.',
      features: [
        'CSV (profils par banque), OFX/QFX, QIF et CAMT.053 (ISO 20022)',
        'Aperçu avant import et détection des doublons',
        'Annulation d’un import en un clic',
        'Contrôle des soldes de début et de fin de relevé',
      ],
    },
    payslips: {
      milestone: 'M6',
      description: 'Le détail complet de vos bulletins de paie, mois après mois.',
      features: [
        'Brut, net avant impôt, net imposable et net payé',
        'Taux et montant du prélèvement à la source',
        'Primes, astreintes, heures supplémentaires, 13e mois, avantages',
        'Évolution annuelle et rapprochement avec le virement reçu',
      ],
    },
    analytics: {
      milestone: 'M5',
      description: 'Explorez vos finances : filtrez, zoomez, comparez.',
      features: [
        'Filtres globaux : période, comptes, catégories, étiquettes',
        'Zoom, sélection de plage et exploration mois par mois',
        'Flux de trésorerie (Sankey) et calendrier des dépenses',
        'Comparaisons M-1 / N-1 et export des graphiques',
      ],
    },
    budgets: {
      milestone: 'M8',
      description: 'Anticipez au lieu de constater.',
      features: [
        'Budgets mensuels par catégorie, avec alertes',
        'Objectifs d’épargne et projections',
        'Calendrier des prélèvements à venir',
        'Prévision du solde de fin de mois',
      ],
    },
    documents: {
      milestone: 'M7',
      description: 'Déposez un relevé ou un bulletin PDF : Fluxo en extrait les données.',
      features: [
        'Glisser-déposer de relevés PDF et de bulletins de paie',
        'Extraction locale (texte, OCR), puis IA facultative',
        'Vérifications arithmétiques et relecture côte à côte',
        'IA locale ou cloud, uniquement avec votre accord explicite',
      ],
    },
  },
}

export type Dictionary = typeof fr

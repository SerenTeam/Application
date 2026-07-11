import type { RoadmapPhase } from './types'

export const DEFAULT_ROADMAP: RoadmapPhase[] = [
  {
    phase: 'Phase 1 : Premiers jours (J+0 à J+7)',
    steps: [
      {
        id: 1,
        title: 'Constat de décès',
        timeline: '⏱️ 24h',
        description:
          'Faire constater le décès par un médecin et obtenir le certificat de décès. C\'est la première démarche obligatoire qui doit être effectuée dans les 24 heures.',
        urgent: true,
      },
      {
        id: 2,
        title: 'Déclaration en mairie',
        timeline: '⏱️ 24h',
        description:
          'Déclarer le décès à la mairie du lieu de décès. Pensez à demander 10 à 15 copies de l\'acte de décès, vous en aurez besoin pour toutes les démarches suivantes.',
        urgent: true,
      },
      {
        id: 3,
        title: 'Prévenir les proches',
        timeline: '⏱️ 48h',
        description:
          'Informer la famille et les amis. Utilisez les contacts transmis dans la section Documents.',
        urgent: false,
      },
    ],
  },
  {
    phase: 'Phase 2 : Première semaine (J+1 à J+10)',
    steps: [
      {
        id: 4,
        title: 'Organismes sociaux',
        timeline: '⏱️ 1 semaine',
        description:
          'Informer la CPAM (Caisse Primaire d\'Assurance Maladie), la caisse de retraite et la mutuelle santé. Ces organismes doivent être prévenus rapidement.',
        urgent: false,
      },
      {
        id: 5,
        title: 'Employeur / Pôle emploi',
        timeline: '⏱️ 1 semaine',
        description:
          'Informer l\'employeur si le défunt était actif, ou Pôle emploi s\'il était demandeur d\'emploi.',
        urgent: false,
      },
      {
        id: 6,
        title: 'Services bancaires',
        timeline: '⏱️ 2 semaines',
        description:
          'Informer la ou les banques, bloquer les comptes si nécessaire et ouvrir un compte succession.',
        urgent: false,
      },
    ],
  },
  {
    phase: 'Phase 3 : Premier mois (J+7 à J+30)',
    steps: [
      {
        id: 7,
        title: 'Assurances et contrats',
        timeline: '⏱️ 2 semaines',
        description:
          'Contacter les assurances vie (bénéficiaires), assurance habitation, assurance auto et autres contrats d\'assurance.',
        urgent: false,
      },
      {
        id: 8,
        title: 'Services et abonnements',
        timeline: '⏱️ 1 mois',
        description:
          'Résilier ou transférer les contrats : eau, électricité, gaz, internet, téléphone et abonnements divers. Utilisez les informations transmises dans la section Documents.',
        urgent: false,
      },
      {
        id: 9,
        title: 'Impôts',
        timeline: '⏱️ 1 mois',
        description:
          'Informer le centre des impôts et préparer la déclaration des revenus du défunt.',
        urgent: false,
      },
    ],
  },
  {
    phase: 'Phase 4 : Deuxième mois (J+30 à J+60)',
    steps: [
      {
        id: 10,
        title: 'Allocations et prestations',
        timeline: '⏱️ 2 mois',
        description:
          'Contacter la CAF si des allocations étaient perçues, se renseigner sur la pension de réversion si applicable, et vérifier les autres prestations sociales.',
        urgent: false,
      },
      {
        id: 11,
        title: 'Propriété et logement',
        timeline: '⏱️ 2 mois',
        description:
          'Informer le propriétaire (si locataire), effectuer le changement de titulaire (si propriétaire), contacter le syndic de copropriété.',
        urgent: false,
      },
      {
        id: 12,
        title: 'Carte grise et permis',
        timeline: '⏱️ 2 mois',
        description:
          'Restituer le permis de conduire à la préfecture et modifier les cartes grises des véhicules.',
        urgent: false,
      },
    ],
  },
  {
    phase: 'Phase 5 : Suivi long terme (J+60+)',
    steps: [
      {
        id: 13,
        title: 'Suivi administratif',
        timeline: '⏱️ 3-6 mois',
        description:
          'Répondre aux courriers administratifs, clôturer progressivement les dossiers et archiver les documents importants.',
        urgent: false,
      },
    ],
  },
]

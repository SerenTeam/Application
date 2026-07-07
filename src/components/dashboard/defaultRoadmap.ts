import type { RoadmapPhase } from './types'

export const DEFAULT_ROADMAP: RoadmapPhase[] = [
  {
    phase: 'Phase 1 : Premiers jours (J+0 a J+7)',
    steps: [
      {
        id: 1,
        title: 'Constat de deces',
        timeline: '\u23F1\uFE0F 24h',
        description:
          'Faire constater le deces par un medecin et obtenir le certificat de deces. C\'est la premiere demarche obligatoire qui doit etre effectuee dans les 24 heures.',
        urgent: true,
      },
      {
        id: 2,
        title: 'Declaration en mairie',
        timeline: '\u23F1\uFE0F 24h',
        description:
          'Declarer le deces a la mairie du lieu de deces. Pensez a demander 10 a 15 copies de l\'acte de deces, vous en aurez besoin pour toutes les demarches suivantes.',
        urgent: true,
      },
      {
        id: 3,
        title: 'Prevenir les proches',
        timeline: '\u23F1\uFE0F 48h',
        description:
          'Informer la famille et les amis. Utilisez les contacts transmis dans la section Documents.',
        urgent: false,
      },
    ],
  },
  {
    phase: 'Phase 2 : Premiere semaine (J+1 a J+10)',
    steps: [
      {
        id: 4,
        title: 'Organismes sociaux',
        timeline: '\u23F1\uFE0F 1 semaine',
        description:
          'Informer la CPAM (Caisse Primaire d\'Assurance Maladie), la caisse de retraite et la mutuelle sante. Ces organismes doivent etre prevenus rapidement.',
        urgent: false,
      },
      {
        id: 5,
        title: 'Employeur / Pole emploi',
        timeline: '\u23F1\uFE0F 1 semaine',
        description:
          'Informer l\'employeur si le defunt etait actif, ou Pole emploi s\'il etait demandeur d\'emploi.',
        urgent: false,
      },
      {
        id: 6,
        title: 'Services bancaires',
        timeline: '\u23F1\uFE0F 2 semaines',
        description:
          'Informer la ou les banques, bloquer les comptes si necessaire et ouvrir un compte succession.',
        urgent: false,
      },
    ],
  },
  {
    phase: 'Phase 3 : Premier mois (J+7 a J+30)',
    steps: [
      {
        id: 7,
        title: 'Assurances et contrats',
        timeline: '\u23F1\uFE0F 2 semaines',
        description:
          'Contacter les assurances vie (beneficiaires), assurance habitation, assurance auto et autres contrats d\'assurance.',
        urgent: false,
      },
      {
        id: 8,
        title: 'Services et abonnements',
        timeline: '\u23F1\uFE0F 1 mois',
        description:
          'Resilier ou transferer les contrats : eau, electricite, gaz, internet, telephone et abonnements divers. Utilisez les informations transmises dans la section Documents.',
        urgent: false,
      },
      {
        id: 9,
        title: 'Impots',
        timeline: '\u23F1\uFE0F 1 mois',
        description:
          'Informer le centre des impots et preparer la declaration des revenus du defunt.',
        urgent: false,
      },
    ],
  },
  {
    phase: 'Phase 4 : Deuxieme mois (J+30 a J+60)',
    steps: [
      {
        id: 10,
        title: 'Allocations et prestations',
        timeline: '\u23F1\uFE0F 2 mois',
        description:
          'Contacter la CAF si des allocations etaient percues, se renseigner sur la pension de reversion si applicable, et verifier les autres prestations sociales.',
        urgent: false,
      },
      {
        id: 11,
        title: 'Propriete et logement',
        timeline: '\u23F1\uFE0F 2 mois',
        description:
          'Informer le proprietaire (si locataire), effectuer le changement de titulaire (si proprietaire), contacter le syndic de copropriete.',
        urgent: false,
      },
      {
        id: 12,
        title: 'Carte grise et permis',
        timeline: '\u23F1\uFE0F 2 mois',
        description:
          'Restituer le permis de conduire a la prefecture et modifier les cartes grises des vehicules.',
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
        timeline: '\u23F1\uFE0F 3-6 mois',
        description:
          'Repondre aux courriers administratifs, cloturer progressivement les dossiers et archiver les documents importants.',
        urgent: false,
      },
    ],
  },
]

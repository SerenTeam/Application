import { describe, it, expect } from 'vitest'
import { generateRoadmap } from '@/lib/roadmap-generator'
import { STEPS_CATALOG } from '@/data/steps-catalog'
import type { QuestionnaireAnswersV2 } from '@/types/questionnaire'

const base: QuestionnaireAnswersV2 = {
  relation: 'parent', deceased_firstname: 'Pierre', deceased_lastname: 'Dupont',
  deceased_dod: '2026-04-10', statut_professionnel: 'sans_activite', logement: ['heberge_ou_autre'],
  enfants: 'aucun', has_notary: true, has_life_insurance: 'non',
  has_vehicle: false, has_credits: false, employait_aide_domicile: false,
  aides_percues: [],
  contrat_obseques: 'non', abonnements: [], organismes_contactes: [],
}
const ids = (a: QuestionnaireAnswersV2) => generateRoadmap(a).map((s) => s.id)

describe('isApplicable v2', () => {
  it('profil minimal : aucune étape conditionnelle', () => {
    const r = ids(base)
    expect(r).not.toContain('banque-debloquer-compte-joint')
    expect(r).not.toContain('logement-resilier-bail')
    expect(r).not.toContain('assurance-vie-contact')
    expect(r).not.toContain('succession-recherche-testament-fcddv') // has_notary: true
  })
  it('enum : salarie déclenche employeur + prévoyance ; retraite non', () => {
    expect(ids({ ...base, statut_professionnel: 'salarie' }))
      .toEqual(expect.arrayContaining(['administratif-prevenir-employeur', 'assurance-prevoyance-employeur']))
    expect(ids({ ...base, statut_professionnel: 'retraite' })).not.toContain('administratif-prevenir-employeur')
    expect(ids({ ...base, statut_professionnel: 'fonctionnaire' })).toContain('administratif-prevenir-employeur')
    expect(ids({ ...base, statut_professionnel: 'fonctionnaire' })).not.toContain('assurance-prevoyance-employeur')
  })
  it('tristate : oui → contact assurance vie ; ne_sait_pas → recherche AGIRA', () => {
    expect(ids({ ...base, has_life_insurance: 'oui' })).toContain('assurance-vie-contact')
    expect(ids({ ...base, has_life_insurance: 'oui' })).not.toContain('assurance-vie-recherche-agira')
    expect(ids({ ...base, has_life_insurance: 'ne_sait_pas' })).toContain('assurance-vie-recherche-agira')
    expect(ids({ ...base, has_life_insurance: 'ne_sait_pas' })).not.toContain('assurance-vie-contact')
  })
  it('réversion et transfert de contrats : mariage vs couple', () => {
    expect(ids({ ...base, relation: 'conjoint_marie' })).toContain('administratif-pension-reversion')
    expect(ids({ ...base, relation: 'concubin' })).not.toContain('administratif-pension-reversion')
    expect(ids({ ...base, relation: 'concubin' })).toContain('logement-transfert-contrats')
  })
  it('nouvelles branches : mineurs, véhicule, crédits, aide à domicile, contrat obsèques, FCDDV', () => {
    expect(ids({ ...base, enfants: 'mineurs' })).toContain('famille-juge-tutelles')
    expect(ids({ ...base, enfants: 'majeurs' })).not.toContain('famille-juge-tutelles')
    expect(ids({ ...base, has_vehicle: true })).toContain('patrimoine-carte-grise')
    expect(ids({ ...base, has_credits: true })).toContain('patrimoine-assurance-emprunteur')
    expect(ids({ ...base, employait_aide_domicile: true })).toContain('administratif-aide-domicile')
    expect(ids({ ...base, contrat_obseques: 'ne_sait_pas' })).toContain('obseques-recherche-contrat-agira')
    expect(ids({ ...base, has_notary: false })).toContain('succession-recherche-testament-fcddv')
  })
  it('tri par urgence conservé', () => {
    const r = generateRoadmap({ ...base, statut_professionnel: 'salarie', logement: ['locataire'] })
    const order = { urgent: 0, week: 1, month: 2, later: 3 } as const
    for (let i = 1; i < r.length; i++) {
      expect(order[r[i].urgency]).toBeGreaterThanOrEqual(order[r[i - 1].urgency])
    }
  })
})

describe('organismes_contactes → initial_status done', () => {
  it('banque contactée : étapes banque pré-cochées, les autres non', () => {
    const r = generateRoadmap({ ...base, organismes_contactes: ['banque'] })
    const byId = Object.fromEntries(r.map((s) => [s.id, s.initial_status]))
    expect(byId['banque-declaration-principale']).toBe('done')
    expect(byId['banque-autres-banques']).toBe('todo') // volontaire : « la banque » ≠ toutes les banques
    expect(byId['administratif-caf']).toBe('todo')
  })
  it('chaque organisme du contrat a ≥ 1 étape porteuse de son organisme_key', () => {
    const organismes = ['banque','assurance','caf','retraite','employeur','mutuelle','cpam','impots']
    for (const org of organismes) {
      expect(
        STEPS_CATALOG.some((s) => s.organisme_key === org),
        `organisme ${org} sans étape`
      ).toBe(true)
    }
  })
})

describe('atteignabilité', () => {
  it('chaque étape conditionnelle est atteignable par au moins un profil', () => {
    const maximal: QuestionnaireAnswersV2 = {
      ...base, relation: 'conjoint_marie', statut_professionnel: 'salarie',
      logement: ['locataire'], enfants: 'mineurs', has_notary: false,
      has_life_insurance: 'oui', has_joint_account: true, has_vehicle: true,
      has_credits: true, employait_aide_domicile: true, contrat_obseques: 'ne_sait_pas',
      aides_percues: ['apa', 'ash', 'aspa', 'pch', 'aides_logement'],
      abonnements: ['presse', 'telephonie', 'sport_loisirs', 'streaming', 'services_en_ligne', 'reseaux_sociaux', 'email', 'photos_documents'],
    }
    const reached = new Set([
      ...ids(maximal),
      ...ids({ ...maximal, has_life_insurance: 'ne_sait_pas', contrat_obseques: 'oui', relation: 'concubin' }),
      // Chaque valeur de statut_professionnel qui conditionne une étape doit être représentée
      ...ids({ ...maximal, statut_professionnel: 'fonctionnaire' }),
      ...ids({ ...maximal, statut_professionnel: 'independant' }),
      ...ids({ ...maximal, statut_professionnel: 'demandeur_emploi' }),
      // Chaque valeur de logement / contrat_obseques qui conditionne une étape doit être représentée
      ...ids({ ...maximal, logement: ['proprietaire'] }),
      ...ids({ ...maximal, logement: ['ehpad'] }),
      ...ids({ ...maximal, contrat_obseques: 'oui' }),
    ])
    for (const s of STEPS_CATALOG) {
      if (Object.keys(s.applicable_when).length > 0) {
        expect(reached.has(s.id), `étape inatteignable : ${s.id}`).toBe(true)
      }
    }
  })
})

describe('personnalisation v2 — EHPAD et aides perçues', () => {
  const NEW_STEPS = ['logement-ehpad', 'aides-departement', 'aides-recuperation-succession', 'aides-logement']
  it('profil de base (hébergé, aucune aide) : aucune des 4 nouvelles étapes', () => {
    for (const id of NEW_STEPS) expect(ids(base)).not.toContain(id)
  })
  it('EHPAD : libérer la chambre, pas d’étape énergie ; locataire : énergie, pas d’EHPAD', () => {
    expect(ids({ ...base, logement: ['ehpad'] })).toContain('logement-ehpad')
    expect(ids({ ...base, logement: ['ehpad'] })).not.toContain('logement-resiliation-energies')
    expect(ids({ ...base, logement: ['locataire'] })).toContain('logement-resiliation-energies')
    expect(ids({ ...base, logement: ['proprietaire'] })).toContain('logement-resiliation-energies')
    expect(ids({ ...base, logement: ['locataire'] })).not.toContain('logement-ehpad')
    expect(ids({ ...base, logement: ['proprietaire'] })).not.toContain('logement-ehpad')
    expect(ids({ ...base, logement: ['heberge_ou_autre'] })).not.toContain('logement-ehpad')
    expect(ids({ ...base, logement: ['heberge_ou_autre'] })).not.toContain('logement-resiliation-energies')
  })
  it('EHPAD avec logement conservé (choix multiples) : chambre, attestation immobilière et énergie', () => {
    expect(ids({ ...base, logement: ['ehpad', 'proprietaire'] })).toEqual(
      expect.arrayContaining(['logement-ehpad', 'logement-attestation-immobiliere', 'logement-resiliation-energies'])
    )
  })
  it('syndic et « ne pas résilier trop tôt » : seulement si locataire ou propriétaire', () => {
    const without: QuestionnaireAnswersV2['logement'][] = [['heberge_ou_autre'], ['ehpad']]
    for (const logement of without) {
      const r = ids({ ...base, logement })
      expect(r).not.toContain('logement-prevenir-syndic')
      expect(r).not.toContain('logement-ne-pas-resilier-trop-tot')
    }
    const withHome: QuestionnaireAnswersV2['logement'][] = [['locataire'], ['proprietaire']]
    for (const logement of withHome) {
      expect(ids({ ...base, logement })).toEqual(
        expect.arrayContaining(['logement-prevenir-syndic', 'logement-ne-pas-resilier-trop-tot'])
      )
    }
  })
  it('aides : APA, ASH ou PCH → département ; ASPA ou ASH → récupération ; aide au logement → CAF ; AAH seule → aucune des deux', () => {
    expect(ids({ ...base, aides_percues: ['apa'] })).toContain('aides-departement')
    expect(ids({ ...base, aides_percues: ['pch'] })).toContain('aides-departement')
    expect(ids({ ...base, aides_percues: ['apa'] })).not.toContain('aides-recuperation-succession')
    expect(ids({ ...base, aides_percues: ['pch'] })).not.toContain('aides-recuperation-succession')
    // L'AAH est versée par la CAF ou la MSA, pas par le département : couverte par l'étape
    // universelle administratif-caf.
    expect(ids({ ...base, aides_percues: ['aah'] })).not.toContain('aides-departement')
    expect(ids({ ...base, aides_percues: ['aah'] })).not.toContain('aides-recuperation-succession')
    expect(ids({ ...base, aides_percues: ['aspa'] })).toContain('aides-recuperation-succession')
    expect(ids({ ...base, aides_percues: ['aspa'] })).not.toContain('aides-departement')
    expect(ids({ ...base, aides_percues: ['ash'] })).toEqual(
      expect.arrayContaining(['aides-departement', 'aides-recuperation-succession'])
    )
    expect(ids({ ...base, aides_percues: ['aides_logement'] })).toContain('aides-logement')
    expect(ids({ ...base, aides_percues: ['aides_logement'] })).not.toContain('aides-departement')
    expect(ids({ ...base, aides_percues: ['aides_logement'] })).not.toContain('aides-recuperation-succession')
  })
  it('aide au logement : étape pré-cochée si la CAF a déjà été contactée', () => {
    const r = generateRoadmap({ ...base, aides_percues: ['aides_logement'], organismes_contactes: ['caf'] })
    expect(r.find((s) => s.id === 'aides-logement')?.initial_status).toBe('done')
  })
})

describe('personnalisation v2 — abonnements et comptes', () => {
  it('chaque case cochée ajoute sa démarche, et seulement elle', () => {
    const CASES: Array<[string, string]> = [
      ['presse', 'abonnements-presse'],
      ['telephonie', 'logement-resiliation-telecom'],
      ['sport_loisirs', 'abonnements-sport-association'],
      ['streaming', 'abonnements-streaming'],
      ['services_en_ligne', 'abonnements-services-en-ligne'],
      ['reseaux_sociaux', 'numerique-reseaux-sociaux'],
      ['email', 'numerique-boite-email'],
      ['photos_documents', 'numerique-photos-documents'],
    ]
    for (const [value, stepId] of CASES) {
      const r = ids({ ...base, abonnements: [value] as QuestionnaireAnswersV2['abonnements'] })
      expect(r, value).toContain(stepId)
      expect(ids(base), `${stepId} sans case cochée`).not.toContain(stepId)
      // Exclusivité croisée : une case cochée seule n'ajoute aucune des 7 autres démarches de la table.
      for (const [, other] of CASES) {
        if (other !== stepId) expect(r, `${value} ne doit pas ajouter ${other}`).not.toContain(other)
      }
    }
  })
  it('le filet « repérer les prélèvements encore actifs » reste proposé à tous', () => {
    expect(ids(base)).toContain('numerique-abonnements')
  })
  it('photos et documents : « Dans le mois », affichée avant les services en ligne', () => {
    const photos = STEPS_CATALOG.find((s) => s.id === 'numerique-photos-documents')!
    const services = STEPS_CATALOG.find((s) => s.id === 'abonnements-services-en-ligne')!
    expect(photos.urgency).toBe('month')
    expect(photos.display_order).toBeLessThan(services.display_order)
    // Même urgence : l'ordre d'affichage départage — récupérer les contenus avant de résilier.
    const r = ids({ ...base, abonnements: ['services_en_ligne', 'photos_documents'] })
    expect(r).toEqual(expect.arrayContaining(['numerique-photos-documents', 'abonnements-services-en-ligne']))
    expect(r.indexOf('numerique-photos-documents')).toBeLessThan(r.indexOf('abonnements-services-en-ligne'))
  })
})

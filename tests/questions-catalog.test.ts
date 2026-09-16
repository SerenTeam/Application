import { describe, it, expect } from 'vitest'
// @ts-expect-error — module JS serveur sans déclarations
import { QUESTIONS_CATALOG, textIn } from '../server/lib/questions-catalog.js'

// Clés autorisées = champs du contrat v2 (dupliqué sciemment : le test casse si l'un bouge sans l'autre)
const CONTRACT_KEYS = [
  'relation', 'deceased_firstname', 'deceased_lastname', 'deceased_dod', 'deceased_department',
  'statut_professionnel', 'logement', 'enfants', 'has_notary', 'has_life_insurance',
  'has_joint_account', 'has_vehicle', 'has_credits', 'employait_aide_domicile',
  'contrat_obseques', 'organismes_contactes',
]

describe('questions-catalog', () => {
  it('16 questions, ids uniques, tous dans le contrat', () => {
    const ids = QUESTIONS_CATALOG.map((q: { id: string }) => q.id)
    expect(ids).toHaveLength(16)
    expect(new Set(ids).size).toBe(16)
    for (const id of ids) expect(CONTRACT_KEYS).toContain(id)
  })
  it('orders uniques', () => {
    const orders = QUESTIONS_CATALOG.map((q: { order: number }) => q.order)
    expect(new Set(orders).size).toBe(orders.length)
  })
  it('select/multiselect ont ≥ 2 options { value, label: { fr, en } } ; boolean/tristate/text/date n\'en ont pas', () => {
    for (const q of QUESTIONS_CATALOG) {
      if (q.type === 'select' || q.type === 'multiselect') {
        expect(q.options.length).toBeGreaterThanOrEqual(2)
        for (const o of q.options) {
          expect(typeof o.value).toBe('string')
          for (const lang of ['fr', 'en'] as const) {
            expect(textIn(o.label, lang).length).toBeGreaterThan(0)
          }
        }
      } else {
        expect(q.options).toBeUndefined()
      }
    }
  })
  it('chaque question a un fallback_text.question non vide, en français et en anglais', () => {
    for (const q of QUESTIONS_CATALOG) {
      for (const lang of ['fr', 'en'] as const) {
        expect(textIn(q.fallback_text.question, lang).trim().length).toBeGreaterThan(10)
      }
    }
  })
  it('les questions conditionnelles référencent des champs posés avant elles', () => {
    const seen = new Set<string>()
    for (const q of [...QUESTIONS_CATALOG].sort((a, b) => a.order - b.order)) {
      for (const key of Object.keys(q.applicable_when ?? {})) {
        expect(seen.has(key), `condition ${key} de ${q.id} doit être posée avant`).toBe(true)
      }
      seen.add(q.id)
    }
  })

  // chantier 2a : question d'adressage pour l'annuaire des organismes (résolution à l'envoi
  // papier), donnée pure comme le prénom/nom du défunt — jamais transmise au rédacteur
  // (voir tests/questionnaire-routes.test.ts, describe « PII : rédacteur Mistral »).
  it('deceased_department : select, bloc identité, 101 départements, textes {fr,en}', () => {
    const q = QUESTIONS_CATALOG.find((x: { id: string }) => x.id === 'deceased_department')
    expect(q, 'question deceased_department absente du catalogue').toBeDefined()
    expect(q.type).toBe('select')
    expect(q.categorie).toEqual({ fr: 'Votre situation', en: 'Your situation' })
    expect(q.options).toHaveLength(101)
    expect(new Set(q.options.map((o: { value: string }) => o.value)).size).toBe(101)
    for (const lang of ['fr', 'en'] as const) {
      expect(textIn(q.fallback_text.question, lang).trim().length).toBeGreaterThan(10)
    }
  })

  // v2 (contrat §7.6) : le catalogue français s'adresse à une personne dont on ignore le genre
  // (le défunt comme la famille). Les formes « (e) », « il/elle » sont donc proscrites des
  // questions, des textes d'aide et des libellés d'options. Les VALEURS enum, elles, ne bougent
  // jamais (contrat de données avec roadmap-generator).
  it('aucune forme genrée en français (questions, aides, libellés d’options)', () => {
    const GENDERED = /\(e\)|il\/elle|\/elle/i
    const offenders: string[] = []
    for (const q of QUESTIONS_CATALOG) {
      const texts = [
        textIn(q.fallback_text.question, 'fr'),
        q.fallback_text.aide ? textIn(q.fallback_text.aide, 'fr') : '',
        ...(q.options ?? []).map((o: { label: unknown }) => textIn(o.label, 'fr')),
      ]
      for (const text of texts) if (GENDERED.test(text)) offenders.push(`${q.id} → ${text}`)
    }
    expect(offenders).toEqual([])
  })
})

import { describe, it, expect } from 'vitest'
// @ts-expect-error — module JS serveur sans déclarations
import { QUESTIONS_CATALOG } from '../server/lib/questions-catalog.js'

// Clés autorisées = champs du contrat v2 (dupliqué sciemment : le test casse si l'un bouge sans l'autre)
const CONTRACT_KEYS = [
  'relation', 'deceased_firstname', 'deceased_lastname', 'deceased_dod',
  'statut_professionnel', 'logement', 'enfants', 'has_notary', 'has_life_insurance',
  'has_joint_account', 'has_vehicle', 'has_credits', 'employait_aide_domicile',
  'contrat_obseques', 'organismes_contactes',
]

describe('questions-catalog', () => {
  it('15 questions, ids uniques, tous dans le contrat', () => {
    const ids = QUESTIONS_CATALOG.map((q: { id: string }) => q.id)
    expect(ids).toHaveLength(15)
    expect(new Set(ids).size).toBe(15)
    for (const id of ids) expect(CONTRACT_KEYS).toContain(id)
  })
  it('orders uniques', () => {
    const orders = QUESTIONS_CATALOG.map((q: { order: number }) => q.order)
    expect(new Set(orders).size).toBe(orders.length)
  })
  it('select/multiselect ont ≥ 2 options { value, label } ; boolean/tristate/text/date n\'en ont pas', () => {
    for (const q of QUESTIONS_CATALOG) {
      if (q.type === 'select' || q.type === 'multiselect') {
        expect(q.options.length).toBeGreaterThanOrEqual(2)
        for (const o of q.options) {
          expect(typeof o.value).toBe('string')
          expect(o.label.length).toBeGreaterThan(0)
        }
      } else {
        expect(q.options).toBeUndefined()
      }
    }
  })
  it('chaque question a un fallback_text.question non vide', () => {
    for (const q of QUESTIONS_CATALOG) {
      expect(q.fallback_text.question.trim().length).toBeGreaterThan(10)
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
})

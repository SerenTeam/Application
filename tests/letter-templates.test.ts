import { describe, it, expect } from 'vitest'
import { LETTER_TEMPLATES, editableVariableKeys, type LetterVariable } from '../src/data/letter-templates'
// @ts-expect-error — module JS serveur
import { LETTER_CHANNELS } from '../server/lib/letter-channels.js'

const CHANNELS = ['email', 'lre', 'papier', 'portail'] as const

describe('letter templates — canal d\'envoi', () => {
  it('chaque template a un canal valide', () => {
    for (const t of LETTER_TEMPLATES) {
      expect(CHANNELS, `${t.id}: channel manquant/invalide`).toContain(t.channel)
    }
  })
  it('portail ⇒ portal_url en https ; autres canaux ⇒ pas de portal_url', () => {
    for (const t of LETTER_TEMPLATES) {
      if (t.channel === 'portail') expect(t.portal_url, t.id).toMatch(/^https:\/\//)
      else expect(t.portal_url, t.id).toBeUndefined()
    }
  })
  it('v1 : employeur et mutuelle sont en email', () => {
    const emails = LETTER_TEMPLATES.filter((t) => t.channel === 'email').map((t) => t.id)
    expect(emails).toContain('employeur-notification')
    expect(emails).toContain('mutuelle-resiliation')
  })
})

// Bug : un champ auto_filled resté vide (échec de l'auto-remplissage) doit rester éditable
// pendant toute la saisie. Recalculer "faut-il l'afficher" à partir de la valeur COURANTE
// (au lieu de la valeur au moment où le champ a été jugé nécessaire) fait disparaître le
// champ du DOM dès la première lettre tapée — perte de focus, lettres suivantes perdues.
describe('editableVariableKeys — champs auto_filled vides', () => {
  const deceasedFirstname: LetterVariable = {
    key: 'deceased_firstname',
    label: 'Prénom du défunt',
    type: 'text',
    auto_filled: true,
    required: true,
  }
  const city: LetterVariable = {
    key: 'city',
    label: 'Votre ville',
    type: 'text',
    auto_filled: false,
    required: true,
  }
  const variables = [deceasedFirstname, city]

  it('un champ auto_filled vide reste éditable après la 1ʳᵉ lettre tapée', () => {
    const initialValues = { deceased_firstname: '', city: '' }
    const keys = editableVariableKeys(variables, initialValues)

    // Simule la saisie lettre par lettre : le SET de clés éditables ne doit jamais changer
    // une fois calculé — sinon le champ sort du rendu en cours de frappe.
    for (const partial of ['M', 'Ma', 'Mar', 'Mari', 'Marie']) {
      expect(keys.has('deceased_firstname'), `après "${partial}"`).toBe(true)
    }
  })

  it('un champ auto_filled déjà rempli au départ reste absent (pas besoin de saisie)', () => {
    const initialValues = { deceased_firstname: 'Marie', city: '' }
    const keys = editableVariableKeys(variables, initialValues)
    expect(keys.has('deceased_firstname')).toBe(false)
  })

  it('un champ manuel (non auto_filled) reste toujours éditable', () => {
    const initialValues = { deceased_firstname: '', city: 'Paris' }
    const keys = editableVariableKeys(variables, initialValues)
    expect(keys.has('city')).toBe(true)
  })
})

// Le serveur Express (JS) ne peut pas importer src/data/letter-templates.ts : il maintient sa
// propre carte { id → channel } à la main (server/lib/letter-channels.js) pour valider
// POST /api/letters/send. Ce test garantit qu'elle ne dérive jamais de la source de vérité
// TS — même mécanique que la parité des catalogues FR/EN (tests/invariants.test.ts).
describe('parité server/lib/letter-channels.js ↔ LETTER_TEMPLATES', () => {
  it('mêmes ids, mêmes canaux, aucune entrée en trop ou manquante', () => {
    const fromTemplates = Object.fromEntries(LETTER_TEMPLATES.map((t) => [t.id, t.channel]))
    expect(LETTER_CHANNELS).toEqual(fromTemplates)
  })
})

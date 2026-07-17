import { describe, it, expect } from 'vitest'
import { LETTER_TEMPLATES } from '../src/data/letter-templates'
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

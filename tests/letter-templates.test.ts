import { describe, it, expect } from 'vitest'
import { LETTER_TEMPLATES } from '../src/data/letter-templates'

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

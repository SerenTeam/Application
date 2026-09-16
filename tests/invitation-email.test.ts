import { describe, it, expect, vi } from 'vitest'
// @ts-expect-error — module JS serveur
import { renderInvitationEmail, createInvitationSender } from '../server/lib/invitation-email.js'

const TOKEN = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'
const OPTS = {
  to: 'claire.martin@exemple.fr', lang: 'fr', partnerName: 'Pompes Funèbres Démo', familyFirstName: 'Claire',
  activationUrl: `https://preprod-app.seren-app.fr/activation#t=${TOKEN}`, expiresAt: '2026-09-23T08:00:00Z',
  supportEmail: 'support@seren-app.fr',
}

describe('renderInvitationEmail', () => {
  it('FR : sujet contractuel', () => {
    expect(renderInvitationEmail(OPTS).subject).toBe('Pompes Funèbres Démo vous ouvre votre accompagnement Seren')
  })
  it('FR : mentions art. 14 (émetteur, finalité, catégories reçues, base, droits, contact, confidentialité, validité)', () => {
    const { text } = renderInvitationEmail(OPTS)
    expect(text).toContain('Bonjour Claire,')
    expect(text).toContain('Pompes Funèbres Démo vous ouvre un accompagnement Seren')
    expect(text).toContain(OPTS.activationUrl)
    expect(text).toContain('valable 7 jours')
    expect(text).toContain('23 septembre 2026')
    expect(text).toContain('Pourquoi recevez-vous ce message ?')
    expect(text).toMatch(/prénom, votre nom, votre adresse e-mail/)
    expect(text).toMatch(/prénom, le nom et la date de décès de votre proche/)
    expect(text).toMatch(/base : exécution du service proposé par Pompes Funèbres Démo/)
    for (const right of ['accès', 'rectification', 'effacement', 'vous opposer']) expect(text).toContain(right)
    expect(text).toContain('support@seren-app.fr')
    expect(text).toContain('https://preprod-app.seren-app.fr/security')
    expect(text).toContain('cnil.fr')
  })
  it('EN : sujet et mentions équivalentes', () => {
    const { subject, text } = renderInvitationEmail({ ...OPTS, lang: 'en' })
    expect(subject).toBe('Pompes Funèbres Démo opens your Seren support')
    expect(text).toContain('Why are you receiving this message?')
    expect(text).toContain('valid for 7 days')
    for (const right of ['access', 'rectification', 'erasure', 'object']) expect(text).toContain(right)
    expect(text).toContain('https://preprod-app.seren-app.fr/security')
  })
  it('aucune valeur relative au défunt, même si un appelant en passait', () => {
    const { text } = renderInvitationEmail({ ...OPTS, deceased_last_name: 'Dupont', deceased_death_date: '2026-09-10', deceasedFirstName: 'Jean' })
    expect(text).not.toContain('Dupont')
    expect(text).not.toContain('2026-09-10')
    expect(text).not.toContain('Jean')
  })
  it('PF absente : libellé générique ; prénom absent : « Bonjour, »', () => {
    const { subject, text } = renderInvitationEmail({ ...OPTS, partnerName: null, familyFirstName: null })
    expect(subject).toBe('Votre pompe funèbre vous ouvre votre accompagnement Seren')
    expect(text.startsWith('Bonjour,')).toBe(true)
  })
})

describe('createInvitationSender', () => {
  it('Resend appelé avec { from, to, subject, text } — aucune pièce jointe', async () => {
    // Paramètre typé (et non `vi.fn(async () => …)`) : sans lui, `send.mock.calls` est un tuple vide
    // pour TypeScript et `calls[0][0]` ne compile pas (écart au plan, noté en revue).
    const send = vi.fn(async (_payload: Record<string, unknown>) => ({ data: { id: 'em_1' }, error: null }))
    const sender = createInvitationSender({ resendClient: { emails: { send } }, from: 'Seren <noreply@seren-app.fr>' })
    await expect(sender.send(OPTS)).resolves.toEqual({ providerRef: 'em_1' })
    const payload = send.mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual(['from', 'subject', 'text', 'to'])
    expect(payload.to).toBe('claire.martin@exemple.fr')
  })
  it('non configuré (client ou expéditeur absent) : lève email_not_configured', async () => {
    await expect(createInvitationSender({ resendClient: null, from: 'x' }).send(OPTS)).rejects.toThrow('email_not_configured')
    await expect(createInvitationSender({ resendClient: { emails: { send: vi.fn() } }, from: undefined }).send(OPTS)).rejects.toThrow('email_not_configured')
  })
  it('erreur Resend : lève invitation_provider_error, jamais le message du fournisseur (il peut contenir l’adresse)', async () => {
    const send = vi.fn(async () => ({ data: null, error: { message: 'invalid recipient claire.martin@exemple.fr' } }))
    const promise = createInvitationSender({ resendClient: { emails: { send } }, from: 'x' }).send(OPTS)
    await expect(promise).rejects.toThrow(/^invitation_provider_error$/)
  })
})

import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import express from 'express'
import request from 'supertest'
// @ts-expect-error — module JS serveur
import { FLAG_NAMES, flagOn, publicFlags, killSwitch } from '../server/lib/flags.js'

// server.js démarre le serveur à l'import : son câblage se vérifie sur le source (patron assumé,
// complété par le boot check de la Task 13).
const serverSource = () => readFileSync(path.join(process.cwd(), 'server/server.js'), 'utf8')

afterEach(() => {
  for (const name of FLAG_NAMES) delete process.env[name]
})

describe('server.js — FEATURE_LLM (chantier 5 : LLM coupé par défaut)', () => {
  it('Mistral instancié UNIQUEMENT si flagOn(FEATURE_LLM) ET clé présente', () => {
    const source = serverSource()
    expect(source).toMatch(/const llmEnabled = flagOn\('FEATURE_LLM'\) && Boolean\(process\.env\.MISTRAL_API_KEY\)/)
    expect(source).toMatch(/llmEnabled \? new Mistral\(\{ apiKey: process\.env\.MISTRAL_API_KEY \}\) : null/)
    expect(source.match(/new Mistral\(/g)).toHaveLength(1)
  })
  it('le router questionnaire reçoit le client éventuellement null (jamais le constructeur brut)', () => {
    expect(serverSource()).toMatch(/mistral: mistralClient/)
  })
})

describe('flagOn — seule la valeur exacte « true » ouvre', () => {
  it('« true » ouvre', () => {
    process.env.PAPER_SENDS_ENABLED = 'true'
    expect(flagOn('PAPER_SENDS_ENABLED')).toBe(true)
  })
  it.each(['TRUE', 'True', '1', 'yes', '', ' true', 'false'])('« %s » ferme', (value) => {
    process.env.FEATURE_LLM = value
    expect(flagOn('FEATURE_LLM')).toBe(false)
  })
  it('absent ferme', () => {
    expect(flagOn('EXTRA_SENDS_ENABLED')).toBe(false)
  })
  it('relu à chaque appel (ouvrir ou fermer sans redémarrer le module)', () => {
    expect(flagOn('EMAIL_SENDS_ENABLED')).toBe(false)
    process.env.EMAIL_SENDS_ENABLED = 'true'
    expect(flagOn('EMAIL_SENDS_ENABLED')).toBe(true)
  })
  it('liste des flags figée par le contrat', () => {
    expect(FLAG_NAMES).toEqual(['FEATURE_LLM', 'EMAIL_SENDS_ENABLED', 'EXTRA_SENDS_ENABLED', 'PAPER_SENDS_ENABLED',
      'PARTNER_ACTIVATIONS_ENABLED', 'SHOW_ACTIVATION_LINK', 'PARTNER_BILLING_PREVIEW'])
  })
})

describe('publicFlags', () => {
  it('forme exacte ; SHOW_ACTIVATION_LINK n’est JAMAIS exposé', () => {
    process.env.SHOW_ACTIVATION_LINK = 'true'
    process.env.PAPER_SENDS_ENABLED = 'true'
    process.env.PARTNER_BILLING_PREVIEW = 'true'
    expect(publicFlags()).toEqual({
      llm_enabled: false, email_sends_enabled: false, extra_sends_enabled: false,
      paper_sends_enabled: true, partner_activations_enabled: false, partner_billing_preview: true,
    })
    expect(JSON.stringify(publicFlags())).not.toMatch(/activation_link/i)
  })
})

describe('killSwitch', () => {
  function makeApp() {
    const app = express()
    app.use(express.json())
    app.post('/x', killSwitch('EMAIL_SENDS_ENABLED', { code: 'EMAIL_SENDS_DISABLED', messageKey: 'email_sends_disabled' }),
      (_req: express.Request, res: express.Response) => res.json({ success: true, reached: true }))
    return app
  }
  it('flag fermé : 503 { success:false, code, error } et handler jamais atteint', async () => {
    const res = await request(makeApp()).post('/x').send({})
    expect(res.status).toBe(503)
    expect(res.body).toEqual({ success: false, code: 'EMAIL_SENDS_DISABLED', error: expect.stringContaining('e-mail') })
    expect(res.body.reached).toBeUndefined()
  })
  it('flag ouvert : passe', async () => {
    process.env.EMAIL_SENDS_ENABLED = 'true'
    expect((await request(makeApp()).post('/x').send({})).body.reached).toBe(true)
  })
  it('lang=en (corps ou query) : message anglais', async () => {
    const res = await request(makeApp()).post('/x?lang=en').send({})
    expect(res.body.error).toMatch(/Email sending is not available yet/)
  })
})

describe('server.js — câblage v2', () => {
  it('variables obsolètes plus lues, gate forfait plus importé', () => {
    const source = serverSource()
    expect(source).not.toMatch(/PAYMENTS_ENABLED/)
    expect(source).not.toMatch(/process\.env\.STRIPE_PRICE_ID\b/)
    expect(source).not.toMatch(/FORFAIT_INCLUDED_SENDS/)
    expect(source).not.toMatch(/createRequirePurchase/)
  })
  it('trust proxy posé (limiteur par IP derrière le proxy Render)', () => {
    expect(serverSource()).toContain("app.set('trust proxy', 1)")
  })
  it('chaque router métier reçoit requireActiveDossier ; me et transmission montés', () => {
    const source = serverSource()
    for (const factory of ['createQuestionnaireRouter', 'createPaymentsRouter', 'createLettersRouter', 'createAttachmentsRouter']) {
      expect(source).toMatch(new RegExp(`${factory}\\(\\{[\\s\\S]*?requireActiveDossier`))
    }
    expect(source).toContain("app.use('/api/me', createMeRouter({ requireAuth }))")
    expect(source).toContain("app.use('/api', createTransmissionRouter({ requireAuth }))")
    expect(source).not.toMatch(/app\.get\('\/api\/transmission\/:code'/)
  })
  it('ancres v2 conservées après le montage du coffre', () => {
    const source = serverSource()
    expect(source.indexOf("app.use('/api/attachments'")).toBeLessThan(source.indexOf('// v2:mount-partner'))
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@sentry/node', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import express from 'express'
import request from 'supertest'
import * as Sentry from '@sentry/node'
// @ts-expect-error — module JS serveur
import { createPartnerRouter } from '../server/routes/partner.js'
// @ts-expect-error — module JS serveur
import { hashInviteToken } from '../server/lib/invite-token.js'
// @ts-expect-error — module JS serveur
import { MESSAGES } from '../server/lib/messages.js'

const TOKEN = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'
const HASH = 'ea866a757e4c38babfa8127cbe9a409d3e1f93a00ff1488ff735fcf917afffd0'
// Secret partagé webhook_config (contrat §3.4, §4.4) : le serveur l'ajoute en p_secret aux 2 RPC où
// l'appelant choisit le hash du jeton. Jamais journalisé, jamais renvoyé au client.
const RPC_SECRET = 'test-rpc-secret'
const DOSSIER_ID = '0b4e8d2a-6a1f-4c1e-9d3b-2f5a7c9e1b3d'
const DOSSIER = {
  id: DOSSIER_ID, status: 'invited', created_at: '2026-09-16T08:00:00Z', invite_expires_at: '2026-09-23T08:00:00Z',
  family_first_name: 'Claire', family_last_name: 'Martin', family_email: 'claire.martin@exemple.fr',
  deceased_first_name: 'Jean', deceased_last_name: 'Dupont', deceased_death_date: '2026-09-10',
}
const BODY = {
  family_first_name: 'Claire', family_last_name: 'Martin', family_email: 'claire.martin@exemple.fr', family_phone: '06 12 34 56 78',
  deceased_first_name: 'Jean', deceased_last_name: 'Dupont', deceased_death_date: '2026-09-10',
}

type RpcResult = { data?: unknown; error?: { message: string; code?: string } | null }
function makeClient(handlers: Record<string, (args: Record<string, unknown>) => RpcResult>) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  return {
    calls,
    rpc: vi.fn(async (name: string, args: Record<string, unknown> = {}) => {
      calls.push({ name, args })
      const handler = handlers[name]
      if (!handler) throw new Error(`rpc inattendue : ${name}`)
      return handler(args)
    }),
  }
}
function makeSender(behavior: 'ok' | 'not_configured' | 'fail' = 'ok') {
  const sent: Record<string, unknown>[] = []
  return {
    sent,
    async send(opts: Record<string, unknown>) {
      if (behavior === 'not_configured') throw new Error('email_not_configured')
      if (behavior === 'fail') throw new Error('Resend: invalid recipient claire.martin@exemple.fr')
      sent.push(opts)
      return { providerRef: 'em_1' }
    },
  }
}
function makeApp(client: ReturnType<typeof makeClient>, sender = makeSender()) {
  const app = express()
  app.use(express.json())
  app.use('/api/partner', createPartnerRouter({
    requireAuth: (req: express.Request & { user?: unknown; supabaseClient?: unknown }, _res: express.Response, next: express.NextFunction) => {
      req.user = { id: 'pf-user-1' }
      req.supabaseClient = client
      next()
    },
    invitationSender: sender,
    appUrl: 'https://preprod-app.seren-app.fr',
    supportEmail: 'support@seren-app.fr',
    rpcSecret: RPC_SECRET,
    generateInviteToken: () => TOKEN,
    hashInviteToken,
  }))
  return app
}
const created = () => ({ data: { created: true, duplicate_warning: false, partner_name: 'Pompes Funèbres Démo', dossier: DOSSIER }, error: null })
const sqlError = (message: string) => () => ({ data: null, error: { message, code: 'P0001' } })

afterEach(() => {
  for (const name of ['PARTNER_ACTIVATIONS_ENABLED', 'SHOW_ACTIVATION_LINK', 'PARTNER_BILLING_PREVIEW']) delete process.env[name]
  vi.mocked(Sentry.captureException).mockClear()
  vi.restoreAllMocks()
})

describe('POST /api/partner/dossiers', () => {
  it('flag fermé : 503 PARTNER_ACTIVATIONS_DISABLED, aucun appel base, aucun e-mail', async () => {
    const client = makeClient({ partner_create_dossier: created })
    const sender = makeSender()
    const res = await request(makeApp(client, sender)).post('/api/partner/dossiers').send(BODY)
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('PARTNER_ACTIVATIONS_DISABLED')
    expect(client.calls).toHaveLength(0)
    expect(sender.sent).toHaveLength(0)
  })
  it('création : la RPC reçoit le HASH (jamais le jeton) ; 201 ; e-mail avec #t=<jeton> ; pas d’activation_url par défaut', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const client = makeClient({ partner_create_dossier: created })
    const sender = makeSender()
    const res = await request(makeApp(client, sender)).post('/api/partner/dossiers').send(BODY)
    expect(res.status).toBe(201)
    expect(client.calls[0]).toEqual({ name: 'partner_create_dossier', args: {
      p_secret: RPC_SECRET,
      p_family_first_name: 'Claire', p_family_last_name: 'Martin', p_family_email: 'claire.martin@exemple.fr', p_family_phone: '06 12 34 56 78',
      p_deceased_first_name: 'Jean', p_deceased_last_name: 'Dupont', p_deceased_death_date: '2026-09-10',
      p_token_hash: HASH, p_confirm_duplicate: false,
    } })
    expect(JSON.stringify(client.calls)).not.toContain(TOKEN)
    expect(JSON.stringify(res.body)).not.toContain(RPC_SECRET)
    expect(res.body).toEqual({ success: true, dossier: DOSSIER, partner_name: 'Pompes Funèbres Démo', email_sent: true })
    expect(JSON.stringify(res.body)).not.toContain(TOKEN)
    expect(sender.sent[0]).toEqual({
      to: 'claire.martin@exemple.fr', lang: 'fr', partnerName: 'Pompes Funèbres Démo', familyFirstName: 'Claire',
      activationUrl: `https://preprod-app.seren-app.fr/activation#t=${TOKEN}`, expiresAt: '2026-09-23T08:00:00Z',
      supportEmail: 'support@seren-app.fr',
    })
  })
  it('les valeurs du défunt ne sont jamais transmises à l’e-mail', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const sender = makeSender()
    await request(makeApp(makeClient({ partner_create_dossier: created }), sender)).post('/api/partner/dossiers').send(BODY)
    const sent = JSON.stringify(sender.sent)
    expect(sent).not.toContain('Dupont')
    expect(sent).not.toContain('2026-09-10')
  })
  it('SHOW_ACTIVATION_LINK=true : activation_url présent ; « TRUE » : absent', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    process.env.SHOW_ACTIVATION_LINK = 'true'
    const res = await request(makeApp(makeClient({ partner_create_dossier: created }))).post('/api/partner/dossiers').send(BODY)
    expect(res.body.activation_url).toBe(`https://preprod-app.seren-app.fr/activation#t=${TOKEN}`)
    process.env.SHOW_ACTIVATION_LINK = 'TRUE'
    const res2 = await request(makeApp(makeClient({ partner_create_dossier: created }))).post('/api/partner/dossiers').send(BODY)
    expect(res2.body.activation_url).toBeUndefined()
  })
  it('doublon de défunt : 409 DUPLICATE_DECEASED + duplicate_count, aucun e-mail', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const sender = makeSender()
    const client = makeClient({ partner_create_dossier: () => ({ data: { created: false, duplicate_warning: true, duplicate_count: 2 }, error: null }) })
    const res = await request(makeApp(client, sender)).post('/api/partner/dossiers').send(BODY)
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ success: false, code: 'DUPLICATE_DECEASED', duplicate_count: 2 })
    expect(sender.sent).toHaveLength(0)
  })
  it('confirm_duplicate: true est transmis (p_confirm_duplicate) ; toute autre valeur vaut false', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const client = makeClient({ partner_create_dossier: created })
    await request(makeApp(client)).post('/api/partner/dossiers').send({ ...BODY, confirm_duplicate: true })
    await request(makeApp(client)).post('/api/partner/dossiers').send({ ...BODY, confirm_duplicate: 'true' })
    expect(client.calls[0].args.p_confirm_duplicate).toBe(true)
    expect(client.calls[1].args.p_confirm_duplicate).toBe(false)
  })
  it.each([
    ['invalid_family_name', 400, 'INVALID_INPUT', 'family_name'],
    ['invalid_email', 400, 'INVALID_INPUT', 'email'],
    ['invalid_phone', 400, 'INVALID_INPUT', 'phone'],
    ['invalid_deceased_name', 400, 'INVALID_INPUT', 'deceased_name'],
    ['invalid_death_date', 400, 'INVALID_INPUT', 'death_date'],
    ['not_a_partner', 403, 'NOT_A_PARTNER', undefined],
    ['partner_inactive', 403, 'PARTNER_INACTIVE', undefined],
    ['email_unavailable', 409, 'EMAIL_UNAVAILABLE', undefined],
    ['partner_daily_limit', 429, 'PARTNER_DAILY_LIMIT', undefined],
  ])('erreur SQL %s → %i %s', async (sqlCode, status, code, field) => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const sender = makeSender()
    const res = await request(makeApp(makeClient({ partner_create_dossier: sqlError(sqlCode as string) }), sender)).post('/api/partner/dossiers').send(BODY)
    expect(res.status).toBe(status)
    expect(res.body.code).toBe(code)
    expect(res.body.field).toBe(field)
    expect(sender.sent).toHaveLength(0)
  })
  it('code SQL inconnu (ex. invalid_token_hash) : 500 PARTNER_ERROR + Sentry, message brut ni renvoyé ni journalisé', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    // Un message Postgres imprévu peut porter une valeur saisie (adresse, nom) : il ne doit sortir
    // NI dans la réponse, NI dans les journaux, NI dans Sentry — seuls `reason` et le code SQL.
    const logs: string[] = []
    for (const level of ['log', 'info', 'warn', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { logs.push(args.map((a) => (a instanceof Error ? a.message : JSON.stringify(a))).join(' ')) })
    }
    const res = await request(makeApp(makeClient({ partner_create_dossier: sqlError('invalid_token_hash') }))).post('/api/partner/dossiers').send(BODY)
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('PARTNER_ERROR')
    expect(JSON.stringify(res.body)).not.toContain('invalid_token_hash')
    expect(logs.join('\n')).not.toContain('invalid_token_hash')
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    const captured = JSON.stringify(vi.mocked(Sentry.captureException).mock.calls.map(([err, ctx]) => [(err as Error).message, ctx]))
    expect(captured).not.toContain('invalid_token_hash')
  })
  it('date de décès mal formée : 400 INVALID_INPUT death_date, SANS appel base', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const client = makeClient({ partner_create_dossier: created })
    const res = await request(makeApp(client)).post('/api/partner/dossiers').send({ ...BODY, deceased_death_date: '10/09/2026' })
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'INVALID_INPUT', field: 'death_date' })
    expect(client.calls).toHaveLength(0)
  })
  it('Resend non configuré : dossier créé, 201 email_sent false', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const res = await request(makeApp(makeClient({ partner_create_dossier: created }), makeSender('not_configured'))).post('/api/partner/dossiers').send(BODY)
    expect(res.status).toBe(201)
    expect(res.body.email_sent).toBe(false)
  })
  it('échec Resend : 201 email_sent false ; Sentry et journaux sans jeton, URL ni adresse', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const logs: string[] = []
    for (const level of ['log', 'info', 'warn', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { logs.push(args.map((a) => (a instanceof Error ? a.message : JSON.stringify(a))).join(' ')) })
    }
    const res = await request(makeApp(makeClient({ partner_create_dossier: created }), makeSender('fail'))).post('/api/partner/dossiers').send(BODY)
    expect(res.body.email_sent).toBe(false)
    const captured = JSON.stringify(vi.mocked(Sentry.captureException).mock.calls.map(([err, ctx]) => [(err as Error).message, ctx]))
    for (const secret of [TOKEN, HASH, 'activation#t', 'claire.martin']) {
      expect(captured).not.toContain(secret)
      expect(logs.join('\n')).not.toContain(secret)
    }
  })
  it('secret absent : 500 PARTNER_ERROR, AUCUN appel base, aucun e-mail (fail-closed)', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const client = makeClient({ partner_create_dossier: created })
    const sender = makeSender()
    const app = express()
    app.use(express.json())
    app.use('/api/partner', createPartnerRouter({
      requireAuth: (req: express.Request & { user?: unknown; supabaseClient?: unknown }, _res: express.Response, next: express.NextFunction) => {
        req.user = { id: 'pf-user-1' }; req.supabaseClient = client; next()
      },
      invitationSender: sender, appUrl: 'https://preprod-app.seren-app.fr', supportEmail: 'support@seren-app.fr',
      rpcSecret: '', generateInviteToken: () => TOKEN, hashInviteToken,
    }))
    const res = await request(app).post('/api/partner/dossiers').send(BODY)
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('PARTNER_ERROR')
    expect(client.calls).toHaveLength(0)
    expect(sender.sent).toHaveLength(0)
    const resend = await request(app).post(`/api/partner/dossiers/${DOSSIER_ID}/resend`).send({})
    expect(resend.status).toBe(500)
    expect(client.calls).toHaveLength(0)
    // Contrat §4.4 : l'alerte n'est émise qu'AU PREMIER APPEL — la réponse 500, elle, reste due à
    // chaque requête. Sans ce verrou, un secret manquant en production émettrait un événement Sentry
    // par tentative de création de dossier.
    expect((await request(app).post('/api/partner/dossiers').send(BODY)).status).toBe(500)
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    expect(vi.mocked(Sentry.captureException).mock.calls[0][0]).toMatchObject({ message: 'partner_rpc_secret_missing' })
  })
  it('code SQL invalid_secret (serveur et base désaccordés) : 500 PARTNER_ERROR, jamais exposé', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const sender = makeSender()
    const res = await request(makeApp(makeClient({ partner_create_dossier: sqlError('invalid_secret') }), sender)).post('/api/partner/dossiers').send(BODY)
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('PARTNER_ERROR')
    expect(JSON.stringify(res.body)).not.toContain('invalid_secret')
    expect(JSON.stringify(res.body)).not.toContain(RPC_SECRET)
    expect(sender.sent).toHaveLength(0)
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
  })
  it('le secret n’apparaît ni dans les journaux ni dans Sentry', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const logs: string[] = []
    for (const level of ['log', 'info', 'warn', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { logs.push(args.map((a) => (a instanceof Error ? a.message : JSON.stringify(a))).join(' ')) })
    }
    await request(makeApp(makeClient({ partner_create_dossier: sqlError('invalid_secret') }))).post('/api/partner/dossiers').send(BODY)
    const captured = JSON.stringify(vi.mocked(Sentry.captureException).mock.calls.map(([err, ctx]) => [(err as Error).message, ctx]))
    expect(captured).not.toContain(RPC_SECRET)
    expect(logs.join('\n')).not.toContain(RPC_SECRET)
  })
  it('limiteur : la 31e création de l’heure pour ce compte → 429', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const app = makeApp(makeClient({ partner_create_dossier: created }))
    for (let i = 0; i < 30; i++) expect((await request(app).post('/api/partner/dossiers').send(BODY)).status).toBe(201)
    expect((await request(app).post('/api/partner/dossiers').send(BODY)).status).toBe(429)
  })
})

describe('POST /api/partner/dossiers/:id/resend', () => {
  const rotated = () => ({ data: { rotated: true, partner_name: 'Pompes Funèbres Démo', dossier: DOSSIER }, error: null })
  it('flag fermé : 503', async () => {
    const client = makeClient({ partner_rotate_invitation: rotated })
    expect((await request(makeApp(client)).post(`/api/partner/dossiers/${DOSSIER_ID}/resend`).send({})).status).toBe(503)
    expect(client.calls).toHaveLength(0)
  })
  it('id non UUID : 404 DOSSIER_NOT_FOUND sans appel base', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const client = makeClient({ partner_rotate_invitation: rotated })
    const res = await request(makeApp(client)).post('/api/partner/dossiers/pas-un-uuid/resend').send({})
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('DOSSIER_NOT_FOUND')
    expect(client.calls).toHaveLength(0)
  })
  it('renvoi : RPC { p_dossier_id, p_token_hash }, nouvel e-mail, 200', async () => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const client = makeClient({ partner_rotate_invitation: rotated })
    const sender = makeSender()
    const res = await request(makeApp(client, sender)).post(`/api/partner/dossiers/${DOSSIER_ID}/resend`).send({ lang: 'en' })
    expect(res.status).toBe(200)
    expect(client.calls[0]).toEqual({ name: 'partner_rotate_invitation', args: { p_secret: RPC_SECRET, p_dossier_id: DOSSIER_ID, p_token_hash: HASH } })
    expect(res.body).toEqual({ success: true, dossier: DOSSIER, partner_name: 'Pompes Funèbres Démo', email_sent: true })
    expect(sender.sent[0]).toMatchObject({ lang: 'en', to: 'claire.martin@exemple.fr' })
  })
  it.each([
    ['dossier_not_found', 404, 'DOSSIER_NOT_FOUND'],
    ['dossier_not_invitable', 409, 'DOSSIER_NOT_INVITABLE'],
    ['rotation_too_soon', 429, 'ROTATION_TOO_SOON'],
    ['rotation_limit', 429, 'ROTATION_LIMIT'],
    ['not_a_partner', 403, 'NOT_A_PARTNER'],
  ])('erreur SQL %s → %i %s', async (sqlCode, status, code) => {
    process.env.PARTNER_ACTIVATIONS_ENABLED = 'true'
    const res = await request(makeApp(makeClient({ partner_rotate_invitation: sqlError(sqlCode as string) }))).post(`/api/partner/dossiers/${DOSSIER_ID}/resend`).send({})
    expect(res.status).toBe(status)
    expect(res.body.code).toBe(code)
  })
})

describe('POST /api/partner/dossiers/:id/cancel', () => {
  it('annulation : 200 { dossier, already_cancelled:false } — disponible même flag fermé', async () => {
    const cancelled = { id: DOSSIER_ID, status: 'cancelled', cancelled_at: '2026-09-16T09:00:00Z' }
    const client = makeClient({ partner_cancel_dossier: () => ({ data: { cancelled: true, already_cancelled: false, dossier: cancelled }, error: null }) })
    const res = await request(makeApp(client)).post(`/api/partner/dossiers/${DOSSIER_ID}/cancel`).send({})
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, dossier: cancelled, already_cancelled: false })
    expect(client.calls[0]).toEqual({ name: 'partner_cancel_dossier', args: { p_dossier_id: DOSSIER_ID } })
  })
  it('déjà annulé : 200 already_cancelled true', async () => {
    const client = makeClient({ partner_cancel_dossier: () => ({ data: { cancelled: false, already_cancelled: true, dossier: { id: DOSSIER_ID, status: 'cancelled', cancelled_at: 'x' } }, error: null }) })
    expect((await request(makeApp(client)).post(`/api/partner/dossiers/${DOSSIER_ID}/cancel`).send({})).body.already_cancelled).toBe(true)
  })
  it('id non UUID : 404 sans appel base', async () => {
    const client = makeClient({})
    expect((await request(makeApp(client)).post('/api/partner/dossiers/42/cancel').send({})).status).toBe(404)
    expect(client.calls).toHaveLength(0)
  })
  it.each([
    ['dossier_already_active', 409, 'DOSSIER_ALREADY_ACTIVE'],
    ['cancel_window_elapsed', 409, 'CANCEL_WINDOW_ELAPSED'],
    ['dossier_not_found', 404, 'DOSSIER_NOT_FOUND'],
    ['not_a_partner', 403, 'NOT_A_PARTNER'],
  ])('erreur SQL %s → %i %s', async (sqlCode, status, code) => {
    const res = await request(makeApp(makeClient({ partner_cancel_dossier: sqlError(sqlCode as string) }))).post(`/api/partner/dossiers/${DOSSIER_ID}/cancel`).send({})
    expect(res.status).toBe(status)
    expect(res.body.code).toBe(code)
  })
})

describe('GET /api/partner/dossiers et /counters', () => {
  it('liste : RPC null → 403 NOT_A_PARTNER', async () => {
    const res = await request(makeApp(makeClient({ partner_list_dossiers: () => ({ data: null, error: null }) }))).get('/api/partner/dossiers')
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('NOT_A_PARTNER')
  })
  it('liste : 200 { partner, dossiers } (flag fermé compris)', async () => {
    const payload = { partner: { id: 'p-1', name: 'PF', status: 'active', user_role: 'manager' }, dossiers: [DOSSIER] }
    const res = await request(makeApp(makeClient({ partner_list_dossiers: () => ({ data: payload, error: null }) }))).get('/api/partner/dossiers')
    expect(res.body).toEqual({ success: true, ...payload })
  })
  const COUNTERS = { month: '2026-09', created_this_month: 3, created_total: 7, activated_total: 4, pending_activation: 2,
    expired_invitations: 1, cancelled_total: 1, activated_this_month: 2,
    billing_preview: { billable_count: 2, seren_due_ttc_cents: 44000, unit_due_ttc_cents: 22000, currency: 'EUR' } }
  it('compteurs : billing_preview forcé à null sans PARTNER_BILLING_PREVIEW', async () => {
    const res = await request(makeApp(makeClient({ partner_month_counters: () => ({ data: COUNTERS, error: null }) }))).get('/api/partner/counters')
    expect(res.body).toEqual({ success: true, counters: { ...COUNTERS, billing_preview: null } })
  })
  it('compteurs : PARTNER_BILLING_PREVIEW=true transmet billing_preview', async () => {
    process.env.PARTNER_BILLING_PREVIEW = 'true'
    const res = await request(makeApp(makeClient({ partner_month_counters: () => ({ data: COUNTERS, error: null }) }))).get('/api/partner/counters')
    expect(res.body.counters.billing_preview).toEqual(COUNTERS.billing_preview)
  })
  it('compteurs : RPC null → 403', async () => {
    expect((await request(makeApp(makeClient({ partner_month_counters: () => ({ data: null, error: null }) }))).get('/api/partner/counters')).status).toBe(403)
  })
})

// Les messages serveur ne sont pas typés (module JS), contrairement à `src/i18n` où tsc garantit la
// parité des dictionnaires : rien n'empêchait jusqu'ici de supprimer une clé du bloc `en`, et `msg()`
// retombe alors silencieusement sur le français. Ce contrôle couvre TOUT le fichier, donc aussi les
// blocs ajoutés par les autres lots aux ancres `v2:messages-*`. Il vit dans un fichier de test du lot
// L2b (périmètre §8.2) plutôt que dans un fichier neuf, pour ne rien ajouter à la liste des fichiers.
describe('server/lib/messages.js — parité FR/EN', () => {
  const fr = Object.keys(MESSAGES.fr)
  const en = Object.keys(MESSAGES.en)
  it('aucune clé absente d’un des deux blocs', () => {
    expect(fr.filter((k) => !en.includes(k))).toEqual([])
    expect(en.filter((k) => !fr.includes(k))).toEqual([])
  })
  it('mêmes clés dans le même ordre, sans doublon (relecture en revue facilitée)', () => {
    expect(en).toEqual(fr)
    expect(new Set(fr).size).toBe(fr.length)
  })
  it('aucune valeur vide', () => {
    for (const lang of ['fr', 'en'] as const) {
      const vides = Object.entries(MESSAGES[lang] as Record<string, unknown>).filter(([, v]) => typeof v !== 'string' || v.trim() === '')
      expect(vides.map(([k]) => `${lang}.${k}`)).toEqual([])
    }
  })
})

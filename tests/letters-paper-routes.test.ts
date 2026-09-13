import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Sentry mocké pour TOUT le graphe de ce fichier (letters.js et require-purchase.js l'importent) :
// la capture d'un dépassement de plafond fait partie du contrat de la route (spec §5), elle se
// vérifie donc comme le reste.
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))

import express from 'express'
import request from 'supertest'
import * as Sentry from '@sentry/node'
// @ts-expect-error — module JS serveur
import { createLettersRouter } from '../server/routes/letters.js'
// @ts-expect-error — module JS serveur
import { LETTER_CHANNELS } from '../server/lib/letter-channels.js'
// @ts-expect-error — module JS serveur
import { createRequirePurchase } from '../server/lib/require-purchase.js'
import { makePurchasesStore } from './helpers/purchases-fake'

// ── Branche papier de POST /api/letters/send (chantier 2a, Task 9) ────────────────────────────
// L'ORDRE DES GARDES EST LE CONTRAT (de l'argent réel part au bout de la chaîne) — un test par
// garde, dans l'ordre :
//   1. requireAuth + gate forfait (requirePurchase)      → 402
//   2. kill switch PAPER_SENDS_ENABLED ≠ 'true'          → 503 paper_disabled
//   3. profil expéditeur absent/inexploitable            → 400 sender_profile_required
//   4. adresse destinataire invalide (≤45/ligne, CP)     → 400
//   5. corps regénéré serveur, variables manquantes      → 400 + liste
//   6. pièces jointes (lignes de l'utilisateur, RLS)     → 404 si l'id n'est pas à lui
//   7. plafonds 24 h (check_send_limits ET create)       → 429 + Sentry ; duplicate → 409
//   8. consume_send (débit AVANT la soumission)          → 402 + offre d'achat à l'acte
//   9. paperSender.send() échoué                          → débit libéré + failed + 502/503
//  10. mark_letter_result submitted                       → 202
//
// Les fakes reproduisent FIDÈLEMENT les contrats réels : RPC du store (retours et exceptions
// nommées de supabase/migrations/20260914120000_letter_sends_papier.sql), RLS des tables lues
// avec le token utilisateur (sender_profiles, attachments, purchases, send_debits), policies
// Storage par préfixe `user_id/`. Aucun appel réseau : le fetch des URLs signées est injecté.

// Le canal réel de ce template est encore 'lre' — sa requalification en 'papier' est la Task 11
// (le test de parité des jumeaux la verrouille). La carte des canaux étant une DÉPENDANCE
// INJECTÉE du router, on la surcharge ici : la route est ainsi prête et testée AVANT la
// requalification, exactement comme le demande le plan.
const PAPER_CHANNELS = { ...LETTER_CHANNELS, 'banque-declaration-deces': 'papier' }
const TEMPLATE_ID = 'banque-declaration-deces'

// Les 11 variables réellement dérivées du template (subject + recipient_label + body) — une seule
// manquante suffit à faire refuser l'envoi (garde 5).
const VALID_VARIABLES = {
  deceased_firstname: 'Marie',
  deceased_lastname: 'Durand',
  deceased_dob: '12/03/1948',
  deceased_dod: '02/09/2026',
  organisme_name: 'Crédit Mutuel',
  user_firstname: 'Jean',
  user_lastname: 'Durand',
  user_relation: 'fils',
  user_address: '10 rue de la Paix, 75002 Paris',
  city: 'Paris',
  today_date: '13/09/2026',
}

const VALID_RECIPIENT = {
  name: 'Crédit Mutuel — Service Succession',
  address_line1: '12 rue du Marché',
  address_line2: 'BP 4021',
  postal_code: '75002',
  city: 'Paris',
}

const SENDER_PROFILE = {
  user_id: 'user-1',
  full_name: 'Jean Durand',
  address_line1: '10 rue de la Paix',
  address_line2: null,
  postal_code: '75002',
  city: 'Paris',
  relationship: 'fils',
}

const PDF_BYTES = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(32, 0)])
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

function basePayload(over: Record<string, unknown> = {}) {
  return {
    template_id: TEMPLATE_ID,
    step_id: 'administratif-banque',
    variables: VALID_VARIABLES,
    recipient: VALID_RECIPIENT,
    ...over,
  }
}

// ── Backend simulé (base + Storage) ───────────────────────────────────────────────────────────
type Row = Record<string, unknown>

function makeBackend() {
  return {
    sender_profiles: [] as Row[],
    attachments: [] as Row[],
    purchases: [] as Row[],
    send_debits: [] as Row[],
    organisations: [] as Row[],
    objects: new Map<string, Buffer>(), // storage_path → octets
    signedUrls: [] as Array<{ bucket: string; path: string; expiresIn: number }>,
    signedUrlError: false,
    downloadError: false,
    readError: null as string | null, // nom de table dont la lecture doit échouer
  }
}
type Backend = ReturnType<typeof makeBackend>

/** Client Supabase au token de l'utilisateur : la RLS est simulée ICI (jamais une ligne d'un
 * tiers), comme le feraient les policies owner des migrations 2a. `organisations` est la seule
 * table sans colonne user_id : lecture ouverte à tout authentifié (données publiques). */
function makeSupabaseClient(userId: string, backend: Backend) {
  return {
    storage: {
      from(bucket: string) {
        return {
          async createSignedUrl(path: string, expiresIn: number) {
            backend.signedUrls.push({ bucket, path, expiresIn })
            if (backend.signedUrlError) return { data: null, error: { message: 'storage indisponible' } }
            // Policy storage par préfixe : un chemin d'un tiers n'est pas signable.
            if (!path.startsWith(`${userId}/`)) return { data: null, error: { message: 'object not found' } }
            return { data: { signedUrl: `https://storage.test/${bucket}/${path}?token=signed` }, error: null }
          },
        }
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from(table: string): any {
      const state = { filters: [] as Array<[string, unknown]>, inFilter: null as [string, unknown[]] | null }

      function rows(): Row[] {
        const all = (backend as unknown as Record<string, Row[]>)[table]
        if (!all) throw new Error(`table inattendue dans ce fake : ${table}`)
        // RLS owner pour tout ce qui porte un user_id ; organisations est public authentifié.
        let filtered = table === 'organisations' ? [...all] : all.filter((r) => r.user_id === userId)
        for (const [col, val] of state.filters) filtered = filtered.filter((r) => r[col] === val)
        if (state.inFilter) {
          const [col, values] = state.inFilter
          filtered = filtered.filter((r) => values.includes(r[col]))
        }
        return filtered
      }

      function result(mode: 'list' | 'maybeSingle') {
        if (backend.readError === table) {
          return Promise.resolve({ data: null, error: { message: `lecture ${table} impossible (incident simulé)` } })
        }
        return Promise.resolve(mode === 'list' ? { data: rows(), error: null } : { data: rows()[0] ?? null, error: null })
      }

      const builder = {
        select() {
          return builder
        },
        eq(col: string, val: unknown) {
          state.filters.push([col, val])
          return builder
        },
        in(col: string, values: unknown[]) {
          state.inFilter = [col, values]
          return builder
        },
        order() {
          return builder
        },
        maybeSingle() {
          return result('maybeSingle')
        },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          return result('list').then(resolve, reject)
        },
      }
      return builder
    },
  }
}

/** fetch injecté : sert les octets du « Storage » depuis l'URL signée. Aucun accès réseau. */
function makeFetch(backend: Backend) {
  const calls: string[] = []
  const impl = async (url: string) => {
    calls.push(url)
    if (backend.downloadError) throw new Error('réseau indisponible')
    const path = decodeURIComponent(new URL(url).pathname.replace(/^\/documents\//, ''))
    const buffer = backend.objects.get(path)
    if (!buffer) return { ok: false, status: 404, async arrayBuffer() { return new ArrayBuffer(0) } }
    return {
      ok: true,
      status: 200,
      async arrayBuffer() {
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
      },
    }
  }
  return Object.assign(impl, { calls })
}

// ── Store letters simulé (contrats RPC de la migration Task 4) ────────────────────────────────
function storeError(code: string) {
  const err = new Error(code) as Error & { code: string }
  err.name = 'LetterStoreError'
  err.code = code
  return err
}

function makeLettersStore() {
  const rows: Row[] = []
  let seq = 0
  const store = {
    rows,
    // Leviers de scénario (chacun reproduit un retour/une exception de la migration).
    limits: 'ok' as string,
    limitFromCreate: null as string | null,
    createError: null as string | null,
    consumeError: null as string | null,
    consumeResult: { debited: true, already_debited: false, source: 'included', free_resend: false, balance_after: 4 },
    releaseResult: true,
    consumed: [] as Array<{ sendId: string; userId: string }>,
    released: [] as Array<{ sendId: string; userId: string }>,
    marks: [] as Array<{ id: string; patch: Row }>,

    async checkSendLimits(_c: unknown, _userId: string) {
      return store.limits
    },
    async createSend(_c: unknown, fields: Row) {
      if (store.limitFromCreate) throw storeError(store.limitFromCreate)
      if (store.createError) throw storeError(store.createError)
      const existing = rows.find((r) => r.dedup_key === fields.dedup_key)
      if (existing) return { duplicate: true, send: existing }
      const row: Row = {
        id: `send-${++seq}`,
        provider_ref: null,
        error: null,
        sent_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...fields,
      }
      rows.push(row)
      return { duplicate: false, send: row }
    },
    async consumeSend(_c: unknown, sendId: string, userId: string) {
      if (store.consumeError) throw storeError(store.consumeError)
      store.consumed.push({ sendId, userId })
      return store.consumeResult
    },
    // Garde d'appartenance du vrai store (letters-store.js) : `user_id` obligatoire, sans quoi la
    // RPC libérerait potentiellement le débit d'un tiers. Reproduite telle quelle ici.
    async releaseDebit(_c: unknown, sendId: string, userId: string) {
      if (!userId) throw new Error('releaseDebit : user_id obligatoire (garde d’appartenance)')
      store.released.push({ sendId, userId })
      return store.releaseResult
    },
    async markSendResult(_c: unknown, id: string, patch: Row) {
      store.marks.push({ id, patch })
      const row = rows.find((r) => r.id === id)
      if (!row) throw new Error(`send ${id} introuvable`)
      Object.assign(row, patch)
      return row
    },
    async claimRetry() {
      return null
    },
    async listSends(_c: unknown, userId: string) {
      return rows.filter((r) => r.user_id === userId)
    },
  }
  return store
}

// ── Adaptateur papier simulé ──────────────────────────────────────────────────────────────────
type PaperBehavior = 'ok' | 'not_configured' | 'unavailable' | 'rejected'

function paperError(code: string) {
  const err = new Error(code) as Error & { code: string }
  err.name = 'PaperSenderError'
  err.code = code
  return err
}

function makePaperSender(behavior: PaperBehavior = 'ok') {
  const calls: Row[] = []
  const sender = {
    behavior,
    calls,
    async send(args: Row) {
      calls.push(args)
      if (sender.behavior === 'not_configured') throw new Error('paper_not_configured')
      if (sender.behavior === 'unavailable') throw paperError('provider_unavailable')
      if (sender.behavior === 'rejected') throw paperError('provider_rejected')
      return { providerRef: `msb-${calls.length}`, status: 'submitted' as const }
    },
    async getLetter() {
      return {}
    },
  }
  return sender
}

// ── Application de test ───────────────────────────────────────────────────────────────────────
function makeApp(
  opts: {
    backend?: Backend
    store?: ReturnType<typeof makeLettersStore>
    sender?: ReturnType<typeof makePaperSender>
    purchases?: ReturnType<typeof makePurchasesStore>
    paymentsEnabled?: boolean
    extraSendAvailable?: boolean
  } = {},
) {
  const backend = opts.backend ?? makeBackend()
  const store = opts.store ?? makeLettersStore()
  const sender = opts.sender ?? makePaperSender()
  const fetchImpl = makeFetch(backend)
  const requireAuth = (
    req: express.Request & { user?: unknown; supabaseClient?: unknown },
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    const userId = (req.headers.authorization ?? '').replace('Bearer ', '') || 'user-1'
    req.user = { id: userId }
    req.supabaseClient = makeSupabaseClient(userId, backend)
    next()
  }
  const app = express()
  app.use(express.json())
  app.use(
    '/api/letters',
    createLettersRouter({
      requireAuth,
      requirePurchase: opts.purchases
        ? createRequirePurchase({ store: opts.purchases, paymentsEnabled: opts.paymentsEnabled ?? false })
        : undefined,
      store,
      emailSender: {
        async send() {
          throw new Error('le sender EMAIL ne doit jamais être appelé sur la branche papier')
        },
      },
      channels: PAPER_CHANNELS,
      paperSender: sender,
      fetchImpl,
      ...(opts.extraSendAvailable === undefined ? {} : { extraSendAvailable: opts.extraSendAvailable }),
    }),
  )
  return { app, backend, store, sender, fetchImpl }
}

/** Backend prêt pour un envoi nominal : profil expéditeur en base. */
function readyBackend() {
  const backend = makeBackend()
  backend.sender_profiles.push({ ...SENDER_PROFILE })
  return backend
}

function addAttachment(backend: Backend, { id, userId = 'user-1', mime = 'application/pdf', bytes = PDF_BYTES, filename = 'acte.pdf' }: { id: string; userId?: string; mime?: string; bytes?: Buffer; filename?: string }) {
  const storagePath = `${userId}/${id}.${mime === 'application/pdf' ? 'pdf' : 'png'}`
  backend.attachments.push({ id, user_id: userId, kind: 'acte_deces', storage_path: storagePath, filename, mime, size_bytes: bytes.length })
  backend.objects.set(storagePath, bytes)
  return id
}

const ATT_1 = '11111111-1111-4111-8111-111111111111'
const ATT_2 = '22222222-2222-4222-8222-222222222222'
const ATT_OTHER = '33333333-3333-4333-8333-333333333333'

beforeEach(() => {
  // Kill switch ARMÉ par défaut dans la plupart des tests : son test dédié, lui, le retire.
  vi.stubEnv('PAPER_SENDS_ENABLED', 'true')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.mocked(Sentry.captureException).mockClear()
})

// ── Garde 1 : gate du forfait ─────────────────────────────────────────────────────────────────
describe('POST /api/letters/send (papier) — garde 1 : gate du forfait', () => {
  it('vente ouverte sans forfait payé : 402 PURCHASE_REQUIRED, AUCUN envoi créé', async () => {
    const { app, store } = makeApp({ backend: readyBackend(), purchases: makePurchasesStore(), paymentsEnabled: true })
    const res = await request(app).post('/api/letters/send').send(basePayload())
    expect(res.status).toBe(402)
    expect(res.body.code).toBe('PURCHASE_REQUIRED')
    expect(store.rows).toHaveLength(0)
  })

  it('vente ouverte avec forfait payé : le gate laisse passer (l’envoi aboutit)', async () => {
    const purchases = makePurchasesStore([{ status: 'paid', kind: 'forfait', included_sends: 5, paid_at: '2026-09-01T10:00:00.000Z' }])
    const { app } = makeApp({ backend: readyBackend(), purchases, paymentsEnabled: true })
    const res = await request(app).post('/api/letters/send').send(basePayload())
    expect(res.status).toBe(202)
  })
})

// ── Garde 2 : kill switch ─────────────────────────────────────────────────────────────────────
describe('POST /api/letters/send (papier) — garde 2 : kill switch', () => {
  it('PAPER_SENDS_ENABLED absent (défaut) : 503 paper_disabled, rien créé, aucun appel provider', async () => {
    vi.stubEnv('PAPER_SENDS_ENABLED', '')
    const { app, store, sender } = makeApp({ backend: readyBackend() })
    const res = await request(app).post('/api/letters/send').send(basePayload())
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('PAPER_DISABLED')
    expect(store.rows).toHaveLength(0)
    expect(sender.calls).toHaveLength(0)
  })

  it('PAPER_SENDS_ENABLED à une valeur autre que "true" : 503 (seule la valeur exacte ouvre)', async () => {
    vi.stubEnv('PAPER_SENDS_ENABLED', '1')
    const { app } = makeApp({ backend: readyBackend() })
    expect((await request(app).post('/api/letters/send').send(basePayload())).status).toBe(503)
  })

  it('le kill switch passe AVANT le profil expéditeur (aucun profil, kill switch fermé → 503)', async () => {
    vi.stubEnv('PAPER_SENDS_ENABLED', '')
    const { app } = makeApp() // backend vide : pas de profil expéditeur
    const res = await request(app).post('/api/letters/send').send(basePayload())
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('PAPER_DISABLED')
  })
})

// ── Garde 3 : profil expéditeur ───────────────────────────────────────────────────────────────
describe('POST /api/letters/send (papier) — garde 3 : profil expéditeur', () => {
  it('profil absent : 400 SENDER_PROFILE_REQUIRED, rien créé', async () => {
    const { app, store } = makeApp()
    const res = await request(app).post('/api/letters/send').send(basePayload())
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('SENDER_PROFILE_REQUIRED')
    expect(store.rows).toHaveLength(0)
  })

  it('profil d’un AUTRE utilisateur : 400 (la RLS ne le rend pas visible)', async () => {
    const backend = readyBackend() // profil de user-1
    const { app } = makeApp({ backend })
    const res = await request(app).post('/api/letters/send').set('Authorization', 'Bearer user-2').send(basePayload())
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('SENDER_PROFILE_REQUIRED')
  })

  it('profil inexploitable en postal (nom > 45 caractères) : 400 SENDER_PROFILE_INVALID AVANT tout débit', async () => {
    const backend = makeBackend()
    backend.sender_profiles.push({ ...SENDER_PROFILE, full_name: 'J'.repeat(46) })
    const { app, store } = makeApp({ backend })
    const res = await request(app).post('/api/letters/send').send(basePayload())
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('SENDER_PROFILE_INVALID')
    expect(store.consumed).toHaveLength(0)
  })

  it('le profil passe AVANT la validation du destinataire (profil absent + adresse invalide → 400 profil)', async () => {
    const { app } = makeApp()
    const res = await request(app)
      .post('/api/letters/send')
      .send(basePayload({ recipient: { ...VALID_RECIPIENT, postal_code: 'ABC' } }))
    expect(res.body.code).toBe('SENDER_PROFILE_REQUIRED')
  })
})

// ── Garde 4 : adresse destinataire ────────────────────────────────────────────────────────────
describe('POST /api/letters/send (papier) — garde 4 : adresse destinataire', () => {
  it('ligne > 45 caractères : 400 INVALID_RECIPIENT_ADDRESS (jamais tronquée), rien créé', async () => {
    const { app, store } = makeApp({ backend: readyBackend() })
    const res = await request(app)
      .post('/api/letters/send')
      .send(basePayload({ recipient: { ...VALID_RECIPIENT, address_line1: 'A'.repeat(46) } }))
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_RECIPIENT_ADDRESS')
    expect(res.body.field).toBe('recipient.address_line1')
    expect(store.rows).toHaveLength(0)
  })

  it('code postal non conforme : 400', async () => {
    const { app } = makeApp({ backend: readyBackend() })
    const res = await request(app)
      .post('/api/letters/send')
      .send(basePayload({ recipient: { ...VALID_RECIPIENT, postal_code: '7500' } }))
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_RECIPIENT_ADDRESS')
  })

  it('adresse absente : 400', async () => {
    const { app } = makeApp({ backend: readyBackend() })
    const res = await request(app).post('/api/letters/send').send(basePayload({ recipient: undefined }))
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_RECIPIENT_ADDRESS')
  })

  it('l’adresse passe AVANT la regénération du corps (adresse invalide + variables manquantes → 400 adresse)', async () => {
    const { app } = makeApp({ backend: readyBackend() })
    const res = await request(app)
      .post('/api/letters/send')
      .send(basePayload({ recipient: { ...VALID_RECIPIENT, postal_code: 'X' }, variables: {} }))
    expect(res.body.code).toBe('INVALID_RECIPIENT_ADDRESS')
  })
})

// ── Garde 5 : corps regénéré côté serveur ─────────────────────────────────────────────────────
describe('POST /api/letters/send (papier) — garde 5 : corps regénéré', () => {
  it('variable manquante : 400 MISSING_VARIABLES avec la liste, rien créé', async () => {
    const { app, store } = makeApp({ backend: readyBackend() })
    const { deceased_dob: _omit, ...incomplete } = VALID_VARIABLES
    const res = await request(app).post('/api/letters/send').send(basePayload({ variables: incomplete }))
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_VARIABLES')
    expect(res.body.missing_variables).toContain('deceased_dob')
    expect(store.rows).toHaveLength(0)
  })

  it('aucune variable : 400 avec la liste complète', async () => {
    const { app } = makeApp({ backend: readyBackend() })
    const res = await request(app).post('/api/letters/send').send(basePayload({ variables: {} }))
    expect(res.status).toBe(400)
    expect(res.body.missing_variables).toHaveLength(Object.keys(VALID_VARIABLES).length)
  })

  it('le corps envoyé au provider vient du TEMPLATE serveur, jamais du client', async () => {
    const { app, sender } = makeApp({ backend: readyBackend() })
    await request(app)
      .post('/api/letters/send')
      .send(basePayload({ resolved_body: 'CORPS LIBRE INJECTÉ PAR LE CLIENT', subject: 'Sujet forgé' }))
    expect(sender.calls).toHaveLength(1)
    const pdf = sender.calls[0].pdfBuffer as Buffer
    expect(Buffer.isBuffer(pdf)).toBe(true)
    expect(pdf.length).toBeGreaterThan(0)
    // Le PDF est binaire : la preuve que le corps libre n'a pas servi est qu'aucun champ du
    // payload client ne l'atteint — la route ne lit ni resolved_body ni subject (voir route).
    expect(JSON.stringify(sender.calls[0])).not.toContain('CORPS LIBRE')
  })
})

// ── Garde 6 : pièces jointes ──────────────────────────────────────────────────────────────────
describe('POST /api/letters/send (papier) — garde 6 : pièces jointes', () => {
  it('pièce jointe d’AUTRUI : 404, rien créé, aucun appel provider (RLS)', async () => {
    const backend = readyBackend()
    addAttachment(backend, { id: ATT_OTHER, userId: 'user-2' })
    const { app, store, sender } = makeApp({ backend })
    const res = await request(app).post('/api/letters/send').send(basePayload({ attachment_ids: [ATT_OTHER] }))
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('ATTACHMENT_NOT_FOUND')
    expect(store.rows).toHaveLength(0)
    expect(sender.calls).toHaveLength(0)
  })

  it('pièce jointe inexistante : 404', async () => {
    const { app } = makeApp({ backend: readyBackend() })
    const res = await request(app).post('/api/letters/send').send(basePayload({ attachment_ids: [ATT_1] }))
    expect(res.status).toBe(404)
  })

  it('plus de 4 pièces jointes : 400 (limite MySendingBox, 5 fichiers avec le corps)', async () => {
    const { app } = makeApp({ backend: readyBackend() })
    const res = await request(app)
      .post('/api/letters/send')
      .send(basePayload({ attachment_ids: [ATT_1, ATT_2, ATT_OTHER, ATT_1, ATT_2] }))
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('TOO_MANY_ATTACHMENTS')
  })

  it('pièces jointes valides : buffers transmis au provider, dans l’ordre demandé, via URL signée courte', async () => {
    const backend = readyBackend()
    addAttachment(backend, { id: ATT_1 })
    addAttachment(backend, { id: ATT_2, mime: 'image/png', bytes: PNG_1PX, filename: 'acte.png' })
    const { app, sender, store } = makeApp({ backend })
    const res = await request(app).post('/api/letters/send').send(basePayload({ attachment_ids: [ATT_2, ATT_1] }))

    expect(res.status).toBe(202)
    const attachments = sender.calls[0].attachments as Array<{ buffer: Buffer; mime: string }>
    expect(attachments).toHaveLength(2)
    expect(attachments[0].mime).toBe('image/png') // ordre du client préservé
    expect(attachments[0].buffer.equals(PNG_1PX)).toBe(true)
    expect(attachments[1].mime).toBe('application/pdf')
    // URLs signées générées SERVEUR, de courte durée, jamais renvoyées au client.
    expect(backend.signedUrls).toHaveLength(2)
    expect(backend.signedUrls[0].bucket).toBe('documents')
    expect(backend.signedUrls[0].expiresIn).toBeLessThanOrEqual(300)
    expect(JSON.stringify(res.body)).not.toContain('token=signed')
    // Les ids sont persistés sur la ligne d'envoi (colonne attachment_ids jsonb).
    expect(store.rows[0].attachment_ids).toEqual([ATT_2, ATT_1])
  })

  it('échec de téléchargement Storage : 500, rien créé (l’incident précède toute écriture)', async () => {
    const backend = readyBackend()
    addAttachment(backend, { id: ATT_1 })
    backend.downloadError = true
    const { app, store } = makeApp({ backend })
    const res = await request(app).post('/api/letters/send').send(basePayload({ attachment_ids: [ATT_1] }))
    expect(res.status).toBe(500)
    expect(store.rows).toHaveLength(0)
  })
})

// ── Garde 7 : plafonds 24 h, puis création ────────────────────────────────────────────────────
describe('POST /api/letters/send (papier) — garde 7 : plafonds et création', () => {
  it('plafond utilisateur atteint (check_send_limits) : 429 + Sentry, rien créé', async () => {
    const store = makeLettersStore()
    store.limits = 'user_daily_exceeded'
    const { app, sender } = makeApp({ backend: readyBackend(), store })
    const res = await request(app).post('/api/letters/send').send(basePayload())
    expect(res.status).toBe(429)
    expect(res.body.code).toBe('SEND_LIMIT_REACHED')
    expect(store.rows).toHaveLength(0)
    expect(sender.calls).toHaveLength(0)
    expect(Sentry.captureException).toHaveBeenCalled()
  })

  it('plafond global atteint : 429 + Sentry', async () => {
    const store = makeLettersStore()
    store.limits = 'global_daily_exceeded'
    const { app } = makeApp({ backend: readyBackend(), store })
    expect((await request(app).post('/api/letters/send').send(basePayload())).status).toBe(429)
    expect(Sentry.captureException).toHaveBeenCalled()
  })

  it('plafond remonté par create_letter_send (dernier ressort) : 429 + Sentry aussi', async () => {
    const store = makeLettersStore()
    store.limitFromCreate = 'global_daily_exceeded'
    const { app } = makeApp({ backend: readyBackend(), store })
    const res = await request(app).post('/api/letters/send').send(basePayload())
    expect(res.status).toBe(429)
    expect(res.body.code).toBe('SEND_LIMIT_REACHED')
    expect(Sentry.captureException).toHaveBeenCalled()
  })

  it('duplicata (même dedup_key) : 409, aucun second débit ni second pli', async () => {
    const { app, store, sender } = makeApp({ backend: readyBackend() })
    expect((await request(app).post('/api/letters/send').send(basePayload())).status).toBe(202)
    const res = await request(app).post('/api/letters/send').send(basePayload())
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('SEND_ALREADY_EXISTS')
    expect(store.rows).toHaveLength(1)
    expect(store.consumed).toHaveLength(1)
    expect(sender.calls).toHaveLength(1)
  })

  it('dedup_key papier : sha256 déterministe de user|template|adresse normalisée|resend_of', async () => {
    const { app: app1, store: store1 } = makeApp({ backend: readyBackend() })
    const { app: app2, store: store2 } = makeApp({ backend: readyBackend() })
    await request(app1).post('/api/letters/send').send(basePayload())
    await request(app2).post('/api/letters/send').send(basePayload())
    expect(store1.rows[0].dedup_key).toMatch(/^[a-f0-9]{64}$/)
    expect(store1.rows[0].dedup_key).toBe(store2.rows[0].dedup_key)

    // Une adresse différente = un autre courrier.
    const { app: app3, store: store3 } = makeApp({ backend: readyBackend() })
    await request(app3).post('/api/letters/send').send(basePayload())
    await request(app3)
      .post('/api/letters/send')
      .send(basePayload({ recipient: { ...VALID_RECIPIENT, address_line1: '9 rue des Lilas' } }))
    expect(store3.rows).toHaveLength(2)
    expect(store3.rows[0].dedup_key).not.toBe(store3.rows[1].dedup_key)
  })

  it('resend_of pointant l’envoi d’un tiers (invalid_resend_of) : 400', async () => {
    const store = makeLettersStore()
    store.createError = 'invalid_resend_of'
    const { app } = makeApp({ backend: readyBackend(), store })
    const res = await request(app).post('/api/letters/send').send(basePayload({ resend_of: ATT_1 }))
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_RESEND_OF')
  })

  it('deuxième re-envoi du même original (resend_already_exists) : 409', async () => {
    const store = makeLettersStore()
    store.createError = 'resend_already_exists'
    const { app } = makeApp({ backend: readyBackend(), store })
    const res = await request(app).post('/api/letters/send').send(basePayload({ resend_of: ATT_1 }))
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('RESEND_ALREADY_EXISTS')
  })
})

// ── Garde 8 : débit du quota ──────────────────────────────────────────────────────────────────
describe('POST /api/letters/send (papier) — garde 8 : débit du quota', () => {
  it('quota épuisé : 402 + extra_send_available, AUCUN appel provider', async () => {
    const store = makeLettersStore()
    store.consumeError = 'quota_exhausted'
    const { app, sender } = makeApp({ backend: readyBackend(), store })
    const res = await request(app).post('/api/letters/send').send(basePayload())
    expect(res.status).toBe(402)
    expect(res.body.code).toBe('QUOTA_EXHAUSTED')
    expect(res.body.extra_send_available).toBe(true)
    expect(sender.calls).toHaveLength(0)
    // La ligne reste 'prepared' sans provider_ref : elle n'a rien engagé (et ne compte pas dans
    // les plafonds, cf. send_limits_status).
    expect(store.rows[0].status).toBe('prepared')
    expect(store.rows[0].provider_ref).toBeNull()
  })

  it('vente à l’acte indisponible (tarif non configuré) : 402 avec extra_send_available = false', async () => {
    const store = makeLettersStore()
    store.consumeError = 'quota_exhausted'
    const { app } = makeApp({ backend: readyBackend(), store, extraSendAvailable: false })
    const res = await request(app).post('/api/letters/send').send(basePayload())
    expect(res.status).toBe(402)
    expect(res.body.extra_send_available).toBe(false)
  })

  it('le débit intervient AVANT la soumission au provider, avec le user_id de la requête', async () => {
    const { app, store, sender } = makeApp({ backend: readyBackend() })
    await request(app).post('/api/letters/send').send(basePayload())
    expect(store.consumed).toEqual([{ sendId: store.rows[0].id, userId: 'user-1' }])
    expect(sender.calls).toHaveLength(1)
  })

  it('re-envoi NPAI : consume_send renvoie free_resend → 202 sans crédit consommé', async () => {
    const store = makeLettersStore()
    store.consumeResult = { debited: true, already_debited: false, source: 'offert', free_resend: true, balance_after: 3 }
    const { app } = makeApp({ backend: readyBackend(), store })
    const res = await request(app).post('/api/letters/send').send(basePayload({ resend_of: ATT_1 }))
    expect(res.status).toBe(202)
    expect(store.rows[0].resend_of).toBe(ATT_1)
    expect(store.consumed).toHaveLength(1)
    expect(res.body.send.status).toBe('submitted')
  })
})

// ── Garde 9 : soumission au provider ──────────────────────────────────────────────────────────
describe('POST /api/letters/send (papier) — garde 9 : soumission au provider', () => {
  it('refus provider (4xx) : 502, débit LIBÉRÉ avec le user_id, ligne marquée failed', async () => {
    const { app, store } = makeApp({ backend: readyBackend(), sender: makePaperSender('rejected') })
    const res = await request(app).post('/api/letters/send').send(basePayload())
    expect(res.status).toBe(502)
    expect(store.released).toEqual([{ sendId: store.rows[0].id, userId: 'user-1' }])
    expect(store.rows[0].status).toBe('failed')
    expect(store.rows[0].error).toBeTruthy()
  })

  it('provider injoignable (5xx/réseau) : 503, débit libéré, ligne failed', async () => {
    const { app, store } = makeApp({ backend: readyBackend(), sender: makePaperSender('unavailable') })
    const res = await request(app).post('/api/letters/send').send(basePayload())
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('PROVIDER_UNAVAILABLE')
    expect(store.released).toHaveLength(1)
    expect(store.rows[0].status).toBe('failed')
  })

  it('service non configuré (pas de clé MySendingBox) : 503, débit libéré, ligne laissée prepared', async () => {
    const { app, store } = makeApp({ backend: readyBackend(), sender: makePaperSender('not_configured') })
    const res = await request(app).post('/api/letters/send').send(basePayload())
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('PAPER_NOT_CONFIGURED')
    expect(store.released).toEqual([{ sendId: store.rows[0].id, userId: 'user-1' }])
    // Rien n'a été tenté : pas de statut d'échec définitif (symétrique du canal email v1).
    expect(store.rows[0].status).toBe('prepared')
  })

  it('un échec de libération du débit ne masque pas l’erreur d’envoi (502 quand même)', async () => {
    const store = makeLettersStore()
    store.releaseDebit = async () => {
      throw new Error('RPC indisponible')
    }
    const { app } = makeApp({ backend: readyBackend(), store, sender: makePaperSender('rejected') })
    expect((await request(app).post('/api/letters/send').send(basePayload())).status).toBe(502)
  })
})

// ── Garde 10 : nominal ────────────────────────────────────────────────────────────────────────
describe('POST /api/letters/send (papier) — garde 10 : envoi nominal', () => {
  it('202 avec l’envoi en submitted + provider_ref ; payload provider conforme au contrat §M', async () => {
    const { app, store, sender } = makeApp({ backend: readyBackend() })
    const res = await request(app).post('/api/letters/send').send(basePayload())

    expect(res.status).toBe(202)
    expect(res.body.success).toBe(true)
    expect(res.body.send.status).toBe('submitted')
    expect(res.body.send.provider_ref).toBe('msb-1')

    const call = sender.calls[0] as Record<string, any>
    expect(call.recipient).toMatchObject({ name: VALID_RECIPIENT.name, postal_code: '75002', city: 'Paris' })
    expect(call.sender).toMatchObject({ name: 'Jean Durand', address_line1: '10 rue de la Paix', postal_code: '75002' })
    // metadata.seren_send_id : c'est par lui que le webhook provider retrouve la ligne (§M).
    expect(call.metadata.seren_send_id).toBe(store.rows[0].id)
    // Idempotency-Key stable pour une même tentative logique (dérivée de l'id d'envoi).
    expect(call.idempotencyKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)

    expect(store.rows[0]).toMatchObject({
      user_id: 'user-1',
      template_id: TEMPLATE_ID,
      channel: 'papier',
      provider: 'mysendingbox',
      status: 'submitted',
      step_id: 'administratif-banque',
    })
    expect(store.rows[0].recipient).toMatchObject({ postal_code: '75002' })
  })

  it('deux tentatives logiques distinctes → deux Idempotency-Key distinctes', async () => {
    const { app, sender } = makeApp({ backend: readyBackend() })
    await request(app).post('/api/letters/send').send(basePayload())
    await request(app)
      .post('/api/letters/send')
      .send(basePayload({ recipient: { ...VALID_RECIPIENT, address_line1: '9 rue des Lilas' } }))
    expect(sender.calls).toHaveLength(2)
    expect((sender.calls[0] as Row).idempotencyKey).not.toBe((sender.calls[1] as Row).idempotencyKey)
  })

  it('canal portail (CAF) : 400 channel_not_available — jamais d’envoi papier concurrent d’un portail', async () => {
    const { app, store } = makeApp({ backend: readyBackend() })
    const res = await request(app).post('/api/letters/send').send(basePayload({ template_id: 'caf-notification' }))
    expect(res.status).toBe(400)
    expect(store.rows).toHaveLength(0)
  })

  it('template inconnu : 404', async () => {
    const { app } = makeApp({ backend: readyBackend() })
    expect((await request(app).post('/api/letters/send').send(basePayload({ template_id: 'inexistant' }))).status).toBe(404)
  })
})

// ── Compteur de quota ─────────────────────────────────────────────────────────────────────────
describe('GET /api/letters/quota', () => {
  it('solde = Σ inclus des achats payés − débits comptés ; les re-envois offerts ne comptent pas', async () => {
    const backend = readyBackend()
    backend.purchases.push(
      { user_id: 'user-1', status: 'paid', kind: 'forfait', included_sends: 5 },
      { user_id: 'user-1', status: 'paid', kind: 'envoi_sup', included_sends: 1 },
      { user_id: 'user-1', status: 'refunded', kind: 'forfait', included_sends: 5 },
    )
    backend.send_debits.push(
      { user_id: 'user-1', send_id: 's1', source: 'included', created_at: '2026-09-10T10:00:00.000Z' },
      { user_id: 'user-1', send_id: 's2', source: 'offert', created_at: '2026-09-11T10:00:00.000Z' },
    )
    const { app } = makeApp({ backend })
    const res = await request(app).get('/api/letters/quota')
    expect(res.status).toBe(200)
    expect(res.body.included_total).toBe(6) // 5 + 1, le remboursé exclu
    expect(res.body.balance).toBe(5) // un seul débit compté (l'offert ne consomme rien)
    expect(res.body.debits).toHaveLength(2)
  })

  it('aucun achat : solde 0 (jamais de négatif, jamais d’envoi papier gratuit)', async () => {
    const { app } = makeApp({ backend: readyBackend() })
    const res = await request(app).get('/api/letters/quota')
    expect(res.body).toMatchObject({ balance: 0, included_total: 0, debits: [] })
  })

  it('solde jamais négatif après remboursement (crédits < débits)', async () => {
    const backend = readyBackend()
    backend.purchases.push({ user_id: 'user-1', status: 'paid', kind: 'forfait', included_sends: 1 })
    backend.send_debits.push(
      { user_id: 'user-1', send_id: 's1', source: 'included' },
      { user_id: 'user-1', send_id: 's2', source: 'extra' },
    )
    const { app } = makeApp({ backend })
    expect((await request(app).get('/api/letters/quota')).body.balance).toBe(0)
  })

  it('incident de lecture : 500', async () => {
    const backend = readyBackend()
    backend.readError = 'purchases'
    const { app } = makeApp({ backend })
    expect((await request(app).get('/api/letters/quota')).status).toBe(500)
  })
})

// ── Annuaire (pré-remplissage d'adresse) ──────────────────────────────────────────────────────
describe('GET /api/letters/organisations', () => {
  it('résolution network + department', async () => {
    const backend = readyBackend()
    backend.organisations.push(
      { id: 'cpam-75', name: 'CPAM de Paris', network: 'cpam', department: '75', address_line1: '21 rue Georges Auric', address_line2: null, postal_code: '75019', city: 'Paris' },
      { id: 'cpam-33', name: 'CPAM de la Gironde', network: 'cpam', department: '33', address_line1: 'Place de l’Europe', address_line2: null, postal_code: '33085', city: 'Bordeaux' },
    )
    const { app } = makeApp({ backend })
    const res = await request(app).get('/api/letters/organisations?network=cpam&department=75')
    expect(res.status).toBe(200)
    expect(res.body.organisations).toHaveLength(1)
    expect(res.body.organisations[0].id).toBe('cpam-75')
  })

  it('CARSAT sans département : la liste des caisses régionales (choix par nom, note Task 2)', async () => {
    const backend = readyBackend()
    backend.organisations.push(
      { id: 'carsat-bretagne', name: 'CARSAT Bretagne', network: 'carsat', department: null, address_line1: '236 rue de Châteaugiron', address_line2: null, postal_code: '35030', city: 'Rennes' },
      { id: 'carsat-nord-picardie', name: 'CARSAT Nord-Picardie', network: 'carsat', department: null, address_line1: '11 allée Vauban', address_line2: null, postal_code: '59662', city: 'Villeneuve-d’Ascq' },
    )
    const { app } = makeApp({ backend })
    const res = await request(app).get('/api/letters/organisations?network=carsat')
    expect(res.status).toBe(200)
    expect(res.body.organisations).toHaveLength(2)
  })

  it('réseau inconnu : 400', async () => {
    const { app } = makeApp({ backend: readyBackend() })
    expect((await request(app).get('/api/letters/organisations?network=edf')).status).toBe(400)
  })

  it('incident de lecture : 500', async () => {
    const backend = readyBackend()
    backend.readError = 'organisations'
    const { app } = makeApp({ backend })
    expect((await request(app).get('/api/letters/organisations?network=cpam')).status).toBe(500)
  })
})

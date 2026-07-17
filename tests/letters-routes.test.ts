import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
// @ts-expect-error — module JS serveur
import { createLettersRouter } from '../server/routes/letters.js'
// @ts-expect-error — module JS serveur
import { LETTER_CHANNELS } from '../server/lib/letter-channels.js'

// ── Fakes ────────────────────────────────────────────────────────────────
// Store en mémoire qui reproduit le contrat de server/lib/letters-store.js (voir
// tests/letters-store.test.ts pour l'implémentation réelle testée séparément) : createSend
// applique la même règle d'unicité que la contrainte BDD dedup_key (conflit → duplicate).
type Send = {
  id: string
  user_id: string
  step_id: string | null
  template_id: string
  channel: string
  status: string
  provider: string | null
  provider_ref: string | null
  recipient: unknown
  dedup_key: string
  error: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
}

function makeStore() {
  const rows: Send[] = []
  let seq = 0
  const store = {
    rows,
    async createSend(_c: unknown, fields: Record<string, unknown>) {
      const existing = rows.find((r) => r.dedup_key === fields.dedup_key)
      if (existing) return { duplicate: true, send: existing }
      const row = {
        id: `send-${++seq}`,
        provider_ref: null,
        error: null,
        sent_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...fields,
      } as Send
      rows.push(row)
      return { send: row }
    },
    async markSendResult(_c: unknown, id: string, patch: Partial<Send>) {
      const row = rows.find((r) => r.id === id)
      if (!row) throw new Error(`send ${id} introuvable`)
      Object.assign(row, patch)
      return row
    },
    // Reproduit la sémantique du claim conditionnel du vrai store (UPDATE ... WHERE status=…,
    // + garde de fraîcheur 60 s pour les lignes 'sending') : 1 ligne modifiée = claim gagné,
    // 0 = une autre requête possède l'envoi → null.
    async claimRetry(_c: unknown, id: string, { allowStaleSending = false }: { allowStaleSending?: boolean } = {}) {
      const row = rows.find((r) => r.id === id)
      if (!row) return null
      if (allowStaleSending) {
        const staleBefore = new Date(Date.now() - 60_000).toISOString()
        if (row.status !== 'sending' || row.updated_at >= staleBefore) return null
      } else if (row.status !== 'failed') {
        return null
      }
      row.status = 'sending'
      row.updated_at = new Date().toISOString()
      return row
    },
    async listSends(_c: unknown, userId: string) {
      return rows.filter((r) => r.user_id === userId)
    },
  }
  return store
}

type SenderBehavior = 'ok' | 'fail' | 'not_configured'

// `behavior` est mutable entre deux requêtes : indispensable pour tester les retries
// (provider en panne puis rétabli, clé Resend absente puis configurée).
function makeSender(behavior: SenderBehavior = 'ok') {
  const calls: Array<{ pdf: Buffer; subject: string; recipientEmail: string; filename: string }> = []
  const sender = {
    behavior,
    calls,
    async send(args: { pdf: Buffer; subject: string; recipientEmail: string; filename: string }) {
      calls.push(args)
      if (sender.behavior === 'not_configured') throw new Error('email_not_configured')
      if (sender.behavior === 'fail') throw new Error('resend: adresse rejetée')
      return { providerRef: `prov-${calls.length}`, status: 'sent' as const }
    },
  }
  return sender
}

function makeApp(opts: { store?: ReturnType<typeof makeStore>; sender?: ReturnType<typeof makeSender> } = {}) {
  const store = opts.store ?? makeStore()
  const sender = opts.sender ?? makeSender()
  const requireAuth = (req: express.Request & { user?: unknown; supabaseClient?: unknown }, _res: express.Response, next: express.NextFunction) => {
    req.user = { id: 'user-1' }
    req.supabaseClient = {}
    next()
  }
  const app = express()
  app.use(express.json())
  app.use('/api/letters', createLettersRouter({ requireAuth, store, emailSender: sender, channels: LETTER_CHANNELS }))
  return { app, store, sender }
}

const VALID_PAYLOAD = {
  template_id: 'mutuelle-resiliation',
  step_id: 'administratif-mutuelle',
  subject: 'Résiliation pour décès',
  resolved_body: 'Madame, Monsieur, je vous informe du décès de mon proche. Cordialement.',
  recipient_email: 'contact@mutuelle-exemple.fr',
}

// ── Tests ────────────────────────────────────────────────────────────────
describe('POST /api/letters/send', () => {
  it('canal email : 200, PDF non vide envoyé au sender, envoi persisté status sent + provider_ref', async () => {
    const { app, store, sender } = makeApp()
    const res = await request(app).post('/api/letters/send').send(VALID_PAYLOAD)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ success: true, already_sent: false })
    expect(res.body.send.status).toBe('sent')
    expect(res.body.send.provider_ref).toBe('prov-1')

    expect(sender.calls).toHaveLength(1)
    expect(sender.calls[0].subject).toBe(VALID_PAYLOAD.subject)
    expect(sender.calls[0].recipientEmail).toBe(VALID_PAYLOAD.recipient_email)
    expect(Buffer.isBuffer(sender.calls[0].pdf)).toBe(true)
    expect(sender.calls[0].pdf.length).toBeGreaterThan(0)

    expect(store.rows).toHaveLength(1)
    expect(store.rows[0]).toMatchObject({ user_id: 'user-1', template_id: 'mutuelle-resiliation', channel: 'email', status: 'sent' })
  })

  it('template_id inconnu → 404', async () => {
    const { app } = makeApp()
    const res = await request(app).post('/api/letters/send').send({ ...VALID_PAYLOAD, template_id: 'inexistant' })
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
  })

  it('canal non disponible (lre) → 400', async () => {
    const { app } = makeApp()
    const res = await request(app).post('/api/letters/send').send({ ...VALID_PAYLOAD, template_id: 'banque-declaration-deces' })
    expect(res.status).toBe(400)
  })

  it('canal non disponible (portail) → 400', async () => {
    const { app } = makeApp()
    const res = await request(app).post('/api/letters/send').send({ ...VALID_PAYLOAD, template_id: 'caf-notification' })
    expect(res.status).toBe(400)
  })

  it('email destinataire invalide → 400', async () => {
    const { app } = makeApp()
    const res = await request(app).post('/api/letters/send').send({ ...VALID_PAYLOAD, recipient_email: 'pas-un-email' })
    expect(res.status).toBe(400)
  })

  it('corps résolu incomplet ({{variables}} restantes) → 400', async () => {
    const { app } = makeApp()
    const res = await request(app).post('/api/letters/send').send({ ...VALID_PAYLOAD, resolved_body: 'Bonjour {{deceased_firstname}}, ...' })
    expect(res.status).toBe(400)
  })

  it('champs requis manquants → 400', async () => {
    const { app } = makeApp()
    const res = await request(app).post('/api/letters/send').send({ template_id: 'mutuelle-resiliation' })
    expect(res.status).toBe(400)
  })

  it('idempotence : deuxième envoi identique → already_sent, sender appelé UNE seule fois au total', async () => {
    const { app, sender } = makeApp()
    const first = await request(app).post('/api/letters/send').send(VALID_PAYLOAD)
    expect(first.status).toBe(200)
    expect(first.body.already_sent).toBe(false)

    const second = await request(app).post('/api/letters/send').send(VALID_PAYLOAD)
    expect(second.status).toBe(200)
    expect(second.body.already_sent).toBe(true)
    expect(second.body.send.id).toBe(first.body.send.id)

    expect(sender.calls).toHaveLength(1)
  })

  it('dedup_key déterministe : mêmes user/template/corps/destinataire → même clé, sur des requêtes indépendantes', async () => {
    const { app: app1, store: store1 } = makeApp()
    const { app: app2, store: store2 } = makeApp()
    await request(app1).post('/api/letters/send').send(VALID_PAYLOAD)
    await request(app2).post('/api/letters/send').send(VALID_PAYLOAD)
    expect(store1.rows[0].dedup_key).toBe(store2.rows[0].dedup_key)
    expect(store1.rows[0].dedup_key).toMatch(/^[a-f0-9]{64}$/)
  })

  it('dedup_key varie si le destinataire change (même corps par ailleurs)', async () => {
    const { app, store } = makeApp()
    await request(app).post('/api/letters/send').send(VALID_PAYLOAD)
    await request(app).post('/api/letters/send').send({ ...VALID_PAYLOAD, recipient_email: 'autre@mutuelle-exemple.fr' })
    expect(store.rows).toHaveLength(2)
    expect(store.rows[0].dedup_key).not.toBe(store.rows[1].dedup_key)
  })

  it('échec provider → 502, status failed + error persistés', async () => {
    const { app, store } = makeApp({ sender: makeSender('fail') })
    const res = await request(app).post('/api/letters/send').send(VALID_PAYLOAD)
    expect(res.status).toBe(502)
    expect(res.body.success).toBe(false)
    expect(store.rows).toHaveLength(1)
    expect(store.rows[0].status).toBe('failed')
    expect(store.rows[0].error).toBeTruthy()
  })

  it('service email non configuré → 503, la ligne reste en sending (jamais tentée)', async () => {
    const { app, store } = makeApp({ sender: makeSender('not_configured') })
    const res = await request(app).post('/api/letters/send').send(VALID_PAYLOAD)
    expect(res.status).toBe(503)
    expect(res.body.success).toBe(false)
    expect(store.rows).toHaveLength(1)
    expect(store.rows[0].status).toBe('sending')
  })
})

// L'idempotence par dedup_key ne doit protéger que les envois RÉUSSIS : une ligne 'failed'
// (502 provider) ou restée 'sending' (503 avant configuration, ou crash serveur en plein vol)
// doit rester RETENTABLE — sinon le courrier ne pourrait plus jamais partir.
describe('POST /api/letters/send — retry sur envoi non abouti', () => {
  it('retry après échec provider : le 2e envoi identique retente, réussit et réutilise la MÊME ligne', async () => {
    const sender = makeSender('fail')
    const { app, store } = makeApp({ sender })
    const first = await request(app).post('/api/letters/send').send(VALID_PAYLOAD)
    expect(first.status).toBe(502)
    expect(store.rows[0].status).toBe('failed')

    sender.behavior = 'ok' // provider rétabli
    const second = await request(app).post('/api/letters/send').send(VALID_PAYLOAD)
    expect(second.status).toBe(200)
    expect(second.body.success).toBe(true)
    expect(second.body.already_sent).toBe(false) // envoi frais, pas un duplicata protégé
    expect(second.body.send.status).toBe('sent')

    expect(sender.calls).toHaveLength(2) // une tentative par requête
    expect(store.rows).toHaveLength(1) // pas de seconde ligne : même dedup_key
    expect(store.rows[0].status).toBe('sent')
    expect(store.rows[0].provider_ref).toBeTruthy()
    expect(store.rows[0].error).toBeNull() // l'erreur de la 1re tentative est purgée
  })

  it('retry après 503 non configuré : la ligne sending devenue STALE (>60 s) part une fois le service configuré', async () => {
    const sender = makeSender('not_configured')
    const { app, store } = makeApp({ sender })
    const first = await request(app).post('/api/letters/send').send(VALID_PAYLOAD)
    expect(first.status).toBe(503)
    expect(store.rows[0].status).toBe('sending')

    // Simule le temps qui passe : la ligne sort de la fenêtre de fraîcheur du claim (60 s)
    store.rows[0].updated_at = new Date(Date.now() - 5 * 60_000).toISOString()
    sender.behavior = 'ok' // clé Resend configurée entre-temps
    const second = await request(app).post('/api/letters/send').send(VALID_PAYLOAD)
    expect(second.status).toBe(200)
    expect(second.body.already_sent).toBe(false)
    expect(second.body.send.status).toBe('sent')
    expect(store.rows).toHaveLength(1)
    expect(store.rows[0].status).toBe('sent')
  })

  it('duplicata pendant qu’une ligne sending est FRAÎCHE → 409, aucun renvoi (course concurrente)', async () => {
    // Scénario TOCTOU : une requête identique arrive pendant que la première « possède »
    // encore la ligne (status sending, updated_at récent). Elle ne doit PAS renvoyer l'email.
    const sender = makeSender('not_configured')
    const { app, store } = makeApp({ sender })
    await request(app).post('/api/letters/send').send(VALID_PAYLOAD) // 503 → ligne sending fraîche
    sender.behavior = 'ok'
    const res = await request(app).post('/api/letters/send').send(VALID_PAYLOAD)
    expect(res.status).toBe(409)
    expect(res.body.success).toBe(false)
    expect(sender.calls).toHaveLength(1) // pas de second envoi
    expect(store.rows[0].status).toBe('sending')
  })

  it('claim perdu sur une ligne failed (une requête concurrente retente déjà) → 409, sender non rappelé', async () => {
    const sender = makeSender('fail')
    const { app, store } = makeApp({ sender })
    await request(app).post('/api/letters/send').send(VALID_PAYLOAD) // 502 → ligne failed, 1 appel
    sender.behavior = 'ok'
    // Simule le perdant de la course : l'UPDATE conditionnel ne rapporte aucune ligne
    store.claimRetry = async () => null
    const res = await request(app).post('/api/letters/send').send(VALID_PAYLOAD)
    expect(res.status).toBe(409)
    expect(res.body.success).toBe(false)
    expect(sender.calls).toHaveLength(1)
  })

  it('retry après échec qui échoue encore → 502 à nouveau, ligne toujours failed', async () => {
    const sender = makeSender('fail')
    const { app, store } = makeApp({ sender })
    await request(app).post('/api/letters/send').send(VALID_PAYLOAD)
    const second = await request(app).post('/api/letters/send').send(VALID_PAYLOAD)
    expect(second.status).toBe(502)
    expect(sender.calls).toHaveLength(2)
    expect(store.rows).toHaveLength(1)
    expect(store.rows[0].status).toBe('failed')
  })

  it('protection des envois réussis inchangée : après un succès, retry identique → already_sent, sender appelé UNE fois', async () => {
    const sender = makeSender('ok')
    const { app, store } = makeApp({ sender })
    const first = await request(app).post('/api/letters/send').send(VALID_PAYLOAD)
    expect(first.status).toBe(200)

    const second = await request(app).post('/api/letters/send').send(VALID_PAYLOAD)
    expect(second.status).toBe(200)
    expect(second.body.already_sent).toBe(true)
    expect(sender.calls).toHaveLength(1) // jamais de renvoi d'un courrier déjà parti
    expect(store.rows).toHaveLength(1)
  })
})

describe('GET /api/letters', () => {
  it('retourne les envois de l’utilisateur authentifié', async () => {
    const { app } = makeApp()
    await request(app).post('/api/letters/send').send(VALID_PAYLOAD)
    const res = await request(app).get('/api/letters')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.sends).toHaveLength(1)
    expect(res.body.sends[0].template_id).toBe('mutuelle-resiliation')
  })

  it('liste vide si aucun envoi', async () => {
    const { app } = makeApp()
    const res = await request(app).get('/api/letters')
    expect(res.status).toBe(200)
    expect(res.body.sends).toEqual([])
  })
})

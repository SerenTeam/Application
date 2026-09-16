import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import crypto from 'crypto'
// @ts-expect-error — module JS serveur
import { createAttachmentsRouter } from '../server/routes/attachments.js'

// Gate passe-plat EXPLICITE (A5 : le défaut des factories est fail-closed).
const PASS = (_req: express.Request, _res: express.Response, next: express.NextFunction) => next()

// ── Fakes ────────────────────────────────────────────────────────────────
// Reproduit le contrat réel : req.supabaseClient est un client Supabase authentifié au token de
// l'utilisateur (posé par requireAuth, cf. server/server.js) — la RLS s'applique donc CÔTÉ BASE,
// pas côté route. Le fake simule cette RLS : toute lecture/écriture est bornée à `userId`, comme
// le feraient les policies "own attachments select/insert/delete" de la migration
// 20260914160000_attachments.sql. Storage est simulé de la même façon (bucket privé, préfixe
// user_id/ — les policies storage.objects de la même migration).

type AttachmentRow = {
  id: string
  user_id: string
  kind: string
  storage_path: string
  filename: string
  mime: string
  size_bytes: number
  created_at: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function makeBackend() {
  return {
    rows: [] as AttachmentRow[],
    objects: new Map<string, Buffer>(),
    // Un vrai format uuid : le router (M5) refuse désormais tout :id qui n'en a pas la forme
    // avant même d'interroger la base — un id de fake du genre "att-1" ferait échouer les DELETE
    // légitimes des autres tests avec un faux-négatif 404.
    nextId: () => crypto.randomUUID(),
  }
}

type Backend = ReturnType<typeof makeBackend>

function makeClientFor(userId: string, backend: Backend, opts: { uploadError?: unknown; removeError?: unknown } = {}) {
  const { rows, objects } = backend

  return {
    storage: {
      from(bucket: string) {
        return {
          async upload(path: string, buffer: Buffer) {
            if (opts.uploadError) return { data: null, error: opts.uploadError }
            objects.set(`${bucket}/${path}`, buffer)
            return { data: { path }, error: null }
          },
          async remove(paths: string[]) {
            if (opts.removeError) return { data: null, error: opts.removeError }
            for (const p of paths) objects.delete(`${bucket}/${p}`)
            return { data: paths, error: null }
          },
        }
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from(table: string): any {
      if (table !== 'attachments') throw new Error(`table inattendue dans ce fake : ${table}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const state: any = { op: null, payload: null, filters: [] as Array<[string, unknown]>, countOpts: null }

      function execSelect(mode: 'list' | 'single' | 'maybeSingle') {
        // Reproduit le typage strict de Postgres : `id` est une colonne uuid, une valeur qui n'a
        // pas cette forme échoue AVANT tout filtrage RLS (`invalid input syntax for type uuid`) —
        // exactement le piège que corrige le garde-fou M5 du router (format vérifié avant requête).
        const idFilter = state.filters.find(([col]: [string, unknown]) => col === 'id')
        if (idFilter && typeof idFilter[1] === 'string' && !UUID_RE.test(idFilter[1])) {
          return Promise.resolve({
            data: null,
            error: { message: `invalid input syntax for type uuid: "${idFilter[1]}"`, code: '22P02' },
          })
        }

        // RLS : jamais une ligne d'un autre utilisateur, quels que soient les filtres demandés.
        let filtered = rows.filter((r) => r.user_id === userId)
        for (const [col, val] of state.filters) {
          filtered = filtered.filter((r) => (r as unknown as Record<string, unknown>)[col] === val)
        }
        filtered = [...filtered].sort((a, b) => b.created_at.localeCompare(a.created_at))

        // `.select(cols, { count: 'exact', head: true })` — patron du comptage de quota (I2) :
        // pas de lignes renvoyées, seulement le compte.
        if (state.countOpts?.count === 'exact') {
          return Promise.resolve({ data: state.countOpts.head ? null : filtered, count: filtered.length, error: null })
        }
        if (mode === 'list') return Promise.resolve({ data: filtered, error: null })
        if (mode === 'maybeSingle') return Promise.resolve({ data: filtered[0] ?? null, error: null })
        if (filtered.length === 0) return Promise.resolve({ data: null, error: { message: 'no rows' } })
        return Promise.resolve({ data: filtered[0], error: null })
      }

      function execInsert(mode: 'single' | 'list') {
        const payload = state.payload as Partial<AttachmentRow>
        if (payload.user_id !== userId) {
          // Reproduit un refus RLS réel (policy "own attachments insert").
          return Promise.resolve({ data: null, error: { message: 'new row violates row-level security policy' } })
        }
        const row: AttachmentRow = {
          id: backend.nextId(),
          created_at: new Date().toISOString(),
          kind: payload.kind!,
          storage_path: payload.storage_path!,
          filename: payload.filename!,
          mime: payload.mime!,
          size_bytes: payload.size_bytes!,
          user_id: payload.user_id!,
        }
        rows.push(row)
        return Promise.resolve({ data: mode === 'single' ? row : [row], error: null })
      }

      function execDelete() {
        const idFilter = state.filters.find(([col]: [string, unknown]) => col === 'id')?.[1]
        // RLS : seule une ligne À SOI peut être supprimée — sinon 0 ligne affectée, pas une erreur.
        const idx = rows.findIndex((r) => r.id === idFilter && r.user_id === userId)
        if (idx !== -1) rows.splice(idx, 1)
        return Promise.resolve({ data: null, error: null })
      }

      const builder = {
        insert(payload: Partial<AttachmentRow>) {
          state.op = 'insert'
          state.payload = payload
          return builder
        },
        select(_cols?: string, opts?: { count?: 'exact'; head?: boolean }) {
          state.op = state.op ?? 'select'
          state.countOpts = opts ?? null
          return builder
        },
        delete() {
          state.op = 'delete'
          return builder
        },
        eq(col: string, val: unknown) {
          state.filters.push([col, val])
          return builder
        },
        order() {
          return builder
        },
        maybeSingle() {
          return execSelect('maybeSingle')
        },
        single() {
          return state.op === 'insert' ? execInsert('single') : execSelect('single')
        },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          const exec = state.op === 'insert' ? execInsert('list') : state.op === 'delete' ? execDelete() : execSelect('list')
          return exec.then(resolve, reject)
        },
      }
      return builder
    },
  }
}

function makeApp(opts: { backend?: Backend; storageOpts?: { uploadError?: unknown; removeError?: unknown } } = {}) {
  const backend = opts.backend ?? makeBackend()
  const requireAuth = (
    req: express.Request & { user?: unknown; supabaseClient?: unknown },
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const header = req.headers.authorization
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'auth_required' })
    }
    const userId = header.slice('Bearer '.length) || 'user-1'
    req.user = { id: userId }
    req.supabaseClient = makeClientFor(userId, backend, opts.storageOpts)
    next()
  }
  const app = express()
  app.use(express.json())
  app.use('/api/attachments', createAttachmentsRouter({ requireAuth, requireActiveDossier: PASS }))
  return { app, backend }
}

// ── Fixtures : octets réels des 3 signatures acceptées ─────────────────────
const PDF_BYTES = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(20, 0)])
const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20, 0)])
const PNG_BYTES = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20, 0)])
const EXE_BYTES = Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.alloc(20, 0)]) // "MZ..." — exécutable Windows

// Le coffre n'ouvre qu'avec le canal papier (contrat §5, D3) : les tests de flux nominal arment
// le flag, son test dédié le retire.
beforeEach(() => {
  process.env.PAPER_SENDS_ENABLED = 'true'
})
afterEach(() => {
  delete process.env.PAPER_SENDS_ENABLED
})

describe('POST /api/attachments', () => {
  it('PDF valide (magic bytes) → 201, {id, kind, filename, size}, aucune URL renvoyée', async () => {
    const { app, backend } = makeApp()
    const res = await request(app)
      .post('/api/attachments')
      .set('Authorization', 'Bearer user-1')
      .field('kind', 'acte_deces')
      .attach('file', PDF_BYTES, 'acte.pdf')

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.attachment).toMatchObject({ kind: 'acte_deces', filename: 'acte.pdf' })
    expect(res.body.attachment.id).toBeTruthy()
    expect(res.body.attachment.size).toBe(PDF_BYTES.length)
    expect(JSON.stringify(res.body)).not.toMatch(/signed|token|https?:\/\//i)

    expect(backend.rows).toHaveLength(1)
    expect(backend.rows[0]).toMatchObject({ user_id: 'user-1', kind: 'acte_deces', mime: 'application/pdf' })
    // Chemin de stockage : userId/uuid.ext — jamais le nom d'origine.
    expect(backend.rows[0].storage_path).toMatch(/^user-1\/[0-9a-f-]{36}\.pdf$/)
  })

  it('JPEG valide (magic bytes) → 201, mime canonique image/jpeg', async () => {
    const { app, backend } = makeApp()
    const res = await request(app)
      .post('/api/attachments')
      .set('Authorization', 'Bearer user-1')
      .field('kind', 'justificatif')
      .attach('file', JPEG_BYTES, 'photo.jpeg')

    expect(res.status).toBe(201)
    expect(backend.rows[0].mime).toBe('image/jpeg')
    expect(backend.rows[0].storage_path).toMatch(/\.jpg$/)
  })

  it('PNG valide (magic bytes) → 201, mime canonique image/png', async () => {
    const { app, backend } = makeApp()
    const res = await request(app)
      .post('/api/attachments')
      .set('Authorization', 'Bearer user-1')
      .field('kind', 'justificatif')
      .attach('file', PNG_BYTES, 'scan.png')

    expect(res.status).toBe(201)
    expect(backend.rows[0].mime).toBe('image/png')
    expect(backend.rows[0].storage_path).toMatch(/\.png$/)
  })

  it('.exe renommé .pdf : magic bytes ne correspondent pas → 415, rien persisté', async () => {
    const { app, backend } = makeApp()
    const res = await request(app)
      .post('/api/attachments')
      .set('Authorization', 'Bearer user-1')
      .field('kind', 'acte_deces')
      .attach('file', EXE_BYTES, 'acte.pdf')

    expect(res.status).toBe(415)
    expect(res.body.success).toBe(false)
    expect(backend.rows).toHaveLength(0)
  })

  it('fichier > 5 Mo → 413, rien persisté', async () => {
    const { app, backend } = makeApp()
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(5 * 1024 * 1024 + 1024, 0)])
    const res = await request(app)
      .post('/api/attachments')
      .set('Authorization', 'Bearer user-1')
      .field('kind', 'acte_deces')
      .attach('file', big, 'gros.pdf')

    expect(res.status).toBe(413)
    expect(backend.rows).toHaveLength(0)
  })

  it('kind invalide → 400, rien persisté', async () => {
    const { app, backend } = makeApp()
    const res = await request(app)
      .post('/api/attachments')
      .set('Authorization', 'Bearer user-1')
      .field('kind', 'autre_chose')
      .attach('file', PDF_BYTES, 'acte.pdf')

    expect(res.status).toBe(400)
    expect(backend.rows).toHaveLength(0)
  })

  it('aucun fichier → 400', async () => {
    const { app } = makeApp()
    const res = await request(app).post('/api/attachments').set('Authorization', 'Bearer user-1').field('kind', 'acte_deces')
    expect(res.status).toBe(400)
  })

  it('sans auth → 401', async () => {
    const { app } = makeApp()
    const res = await request(app).post('/api/attachments').field('kind', 'acte_deces').attach('file', PDF_BYTES, 'acte.pdf')
    expect(res.status).toBe(401)
  })

  it("échec de l'upload Storage → 500, AUCUNE ligne insérée ni objet Storage conservé (revue 5+6, I5)", async () => {
    const { app, backend } = makeApp({ storageOpts: { uploadError: { message: 'storage indisponible' } } })
    const res = await request(app)
      .post('/api/attachments')
      .set('Authorization', 'Bearer user-1')
      .field('kind', 'acte_deces')
      .attach('file', PDF_BYTES, 'acte.pdf')

    expect(res.status).toBe(500)
    expect(res.body.success).toBe(false)
    expect(backend.rows).toHaveLength(0)
    expect(backend.objects.size).toBe(0)
  })

  it('plafond de 20 pièces atteint → 409, rien persisté (revue 5+6, I2)', async () => {
    const backend = makeBackend()
    const { app } = makeApp({ backend })
    for (let i = 0; i < 20; i++) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app)
        .post('/api/attachments')
        .set('Authorization', 'Bearer user-1')
        .field('kind', 'acte_deces')
        .attach('file', PDF_BYTES, `piece-${i}.pdf`)
      expect(res.status).toBe(201)
    }
    expect(backend.rows).toHaveLength(20)

    const res = await request(app)
      .post('/api/attachments')
      .set('Authorization', 'Bearer user-1')
      .field('kind', 'acte_deces')
      .attach('file', PDF_BYTES, 'piece-21.pdf')

    expect(res.status).toBe(409)
    expect(backend.rows).toHaveLength(20)
  })

  it("sanitizeFilename : neutralise un traversal, ne garde que le basename (revue 5+6, M8)", async () => {
    const { app } = makeApp()
    const res = await request(app)
      .post('/api/attachments')
      .set('Authorization', 'Bearer user-1')
      .field('kind', 'acte_deces')
      .attach('file', PDF_BYTES, '../../etc/passwd')

    expect(res.status).toBe(201)
    expect(res.body.attachment.filename).not.toMatch(/\.\.|\//)
    expect(res.body.attachment.filename).toBe('passwd')
  })

  it('sanitizeFilename : tronque un nom trop long à 150 caractères (revue 5+6, M8)', async () => {
    const { app } = makeApp()
    const longName = `${'a'.repeat(200)}.pdf`
    const res = await request(app)
      .post('/api/attachments')
      .set('Authorization', 'Bearer user-1')
      .field('kind', 'acte_deces')
      .attach('file', PDF_BYTES, longName)

    expect(res.status).toBe(201)
    expect(res.body.attachment.filename.length).toBeLessThanOrEqual(150)
  })
})

describe('GET /api/attachments', () => {
  it("ne liste que les pièces jointes de l'utilisateur authentifié", async () => {
    const backend = makeBackend()
    const { app } = makeApp({ backend })
    await request(app).post('/api/attachments').set('Authorization', 'Bearer user-1').field('kind', 'acte_deces').attach('file', PDF_BYTES, 'a.pdf')
    await request(app).post('/api/attachments').set('Authorization', 'Bearer user-2').field('kind', 'justificatif').attach('file', PNG_BYTES, 'b.png')

    const res = await request(app).get('/api/attachments').set('Authorization', 'Bearer user-1')
    expect(res.status).toBe(200)
    expect(res.body.attachments).toHaveLength(1)
    expect(res.body.attachments[0].filename).toBe('a.pdf')
  })

  it('sans auth → 401', async () => {
    const { app } = makeApp()
    const res = await request(app).get('/api/attachments')
    expect(res.status).toBe(401)
  })
})

describe('DELETE /api/attachments/:id', () => {
  it('supprime le Storage puis la ligne, dans cet ordre', async () => {
    const backend = makeBackend()
    const { app } = makeApp({ backend })
    const created = await request(app)
      .post('/api/attachments')
      .set('Authorization', 'Bearer user-1')
      .field('kind', 'acte_deces')
      .attach('file', PDF_BYTES, 'a.pdf')
    const id = created.body.attachment.id
    const storagePath = backend.rows[0].storage_path

    expect(backend.objects.has(`documents/${storagePath}`)).toBe(true)

    const res = await request(app).delete(`/api/attachments/${id}`).set('Authorization', 'Bearer user-1')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(backend.objects.has(`documents/${storagePath}`)).toBe(false)
    expect(backend.rows).toHaveLength(0)
  })

  it("id d'autrui → 404, rien supprimé", async () => {
    const backend = makeBackend()
    const { app } = makeApp({ backend })
    const created = await request(app)
      .post('/api/attachments')
      .set('Authorization', 'Bearer user-1')
      .field('kind', 'acte_deces')
      .attach('file', PDF_BYTES, 'a.pdf')
    const id = created.body.attachment.id

    const res = await request(app).delete(`/api/attachments/${id}`).set('Authorization', 'Bearer user-2')
    expect(res.status).toBe(404)
    expect(backend.rows).toHaveLength(1)
  })

  it('id inexistant → 404', async () => {
    const { app } = makeApp()
    const res = await request(app).delete('/api/attachments/00000000-0000-0000-0000-000000000000').set('Authorization', 'Bearer user-1')
    expect(res.status).toBe(404)
  })

  it('id au format invalide (pas un uuid) → 404, jamais un 500 (revue 5+6, M5)', async () => {
    const { app } = makeApp()
    const res = await request(app).delete('/api/attachments/pas-un-uuid').set('Authorization', 'Bearer user-1')
    expect(res.status).toBe(404)
  })

  it("échec de la suppression Storage → 500 ET la ligne est CONSERVÉE (ordre Storage puis BDD, revue 5+6, I5)", async () => {
    const backend = makeBackend()
    const { app: writerApp } = makeApp({ backend })
    const created = await request(writerApp)
      .post('/api/attachments')
      .set('Authorization', 'Bearer user-1')
      .field('kind', 'acte_deces')
      .attach('file', PDF_BYTES, 'a.pdf')
    const id = created.body.attachment.id

    const { app: failingApp } = makeApp({ backend, storageOpts: { removeError: { message: 'storage indisponible' } } })
    const res = await request(failingApp).delete(`/api/attachments/${id}`).set('Authorization', 'Bearer user-1')

    expect(res.status).toBe(500)
    expect(backend.rows).toHaveLength(1)
  })

  it('sans auth → 401', async () => {
    const { app } = makeApp()
    const res = await request(app).delete('/api/attachments/whatever')
    expect(res.status).toBe(401)
  })
})

describe('kill switch du coffre (PAPER_SENDS_ENABLED)', () => {
  it('flag absent : POST 503 ATTACHMENTS_DISABLED, rien stocké (avant multer : aucun fichier bufferisé)', async () => {
    delete process.env.PAPER_SENDS_ENABLED
    const { app, backend } = makeApp()
    const res = await request(app)
      .post('/api/attachments')
      .set('Authorization', 'Bearer user-1')
      .field('kind', 'acte_deces')
      .attach('file', PDF_BYTES, 'acte.pdf')
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('ATTACHMENTS_DISABLED')
    expect(backend.rows).toHaveLength(0)
    expect(backend.objects.size).toBe(0)
  })

  // Pendant exact du test des courriers papier : verrouille l'ORDRE des gardes, que les seules
  // assertions « rien stocké » ne prouvent pas (multer bufferise en mémoire, il ne touche jamais
  // le faux backend — un kill switch monté APRÈS le limiteur laisserait donc le test ci-dessus
  // vert). Le limiteur du coffre est à 30/h : 35 refus de coupure restent 35 fois 503, jamais un
  // 429, ce qui n'est vrai que si le kill switch s'exécute AVANT lui (contrat §4.2).
  it('un 503 de coupure ne consomme pas le quota horaire (35 refus, jamais 429)', async () => {
    delete process.env.PAPER_SENDS_ENABLED
    const { app } = makeApp()
    for (let i = 0; i < 35; i++) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app)
        .post('/api/attachments')
        .set('Authorization', 'Bearer user-1')
        .field('kind', 'acte_deces')
        .attach('file', PDF_BYTES, 'acte.pdf')
      expect(res.status).toBe(503)
    }
  })

  it('flag absent : lister et supprimer restent possibles (GET 200)', async () => {
    delete process.env.PAPER_SENDS_ENABLED
    const { app } = makeApp()
    expect((await request(app).get('/api/attachments').set('Authorization', 'Bearer user-1')).status).toBe(200)
  })
})

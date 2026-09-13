import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
// @ts-expect-error — module JS serveur
import { createAttachmentsRouter } from '../server/routes/attachments.js'

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

function makeBackend() {
  let seq = 0
  return {
    rows: [] as AttachmentRow[],
    objects: new Map<string, Buffer>(),
    nextId: () => `att-${++seq}`,
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
      const state: any = { op: null, payload: null, filters: [] as Array<[string, unknown]> }

      function execSelect(mode: 'list' | 'single' | 'maybeSingle') {
        // RLS : jamais une ligne d'un autre utilisateur, quels que soient les filtres demandés.
        let filtered = rows.filter((r) => r.user_id === userId)
        for (const [col, val] of state.filters) {
          filtered = filtered.filter((r) => (r as unknown as Record<string, unknown>)[col] === val)
        }
        filtered = [...filtered].sort((a, b) => b.created_at.localeCompare(a.created_at))
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
        select() {
          state.op = state.op ?? 'select'
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
  app.use('/api/attachments', createAttachmentsRouter({ requireAuth }))
  return { app, backend }
}

// ── Fixtures : octets réels des 3 signatures acceptées ─────────────────────
const PDF_BYTES = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(20, 0)])
const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20, 0)])
const PNG_BYTES = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20, 0)])
const EXE_BYTES = Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.alloc(20, 0)]) // "MZ..." — exécutable Windows

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

  it('sans auth → 401', async () => {
    const { app } = makeApp()
    const res = await request(app).delete('/api/attachments/whatever')
    expect(res.status).toBe(401)
  })
})

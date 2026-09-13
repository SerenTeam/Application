import { describe, it, expect, vi } from 'vitest'
// @ts-expect-error — module JS serveur
import { createPaperSender, imageToPdf, PaperSenderError } from '../server/lib/paper-sender.js'

// Adaptateur MySendingBox (REST direct, PAS le SDK) — contrat symétrique à
// server/lib/email-sender.js. `fetchImpl` est TOUJOURS injecté ici : aucun test ne fait
// d'appel réseau réel. Décisions de transport prises faute de doc publique consultable en
// session (marquées « à confirmer au test réel » dans server/lib/paper-sender.js) : corps JSON
// (pas multipart), fichiers en base64 sous `source_file`/`source_file_2..5`, noms de champs
// adresse `recipient_/sender_ address_line1/2, postal_code, city, country`.

const VALID_RECIPIENT = {
  name: 'CPAM de Paris',
  address_line1: '21 rue Georges Auric',
  address_line2: 'Service Succession',
  postal_code: '75019',
  city: 'Paris',
}

const VALID_SENDER = {
  name: 'Jean Dupont',
  address_line1: '10 rue de la Paix',
  postal_code: '75002',
  city: 'Paris',
}

const PDF_MAGIC = Buffer.from('%PDF-1.4 fake body')

// 1x1 PNG et JPEG valides (magic bytes + décodage réel par jsPDF/fast-png) — repris tels quels
// des sondes manuelles faites pendant l'implémentation (voir rapport de tâche).
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)
const JPEG_1PX = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
  'base64'
)

function fakeFetch(responses: Array<{ status: number; ok?: boolean; body?: unknown }>) {
  const calls: Array<{ url: string; init: Record<string, unknown> }> = []
  let i = 0
  const fn = vi.fn(async (url: string, init: Record<string, unknown> = {}) => {
    calls.push({ url, init })
    const r = responses[Math.min(i, responses.length - 1)]
    i += 1
    return {
      ok: r.ok ?? (r.status >= 200 && r.status < 300),
      status: r.status,
      json: async () => r.body ?? {},
    }
  })
  return { fn, calls }
}

describe('createPaperSender', () => {
  describe('non configuré (pas de clé)', () => {
    it('send() lève paper_not_configured sans apiKey', async () => {
      const sender = createPaperSender({ fetchImpl: vi.fn() })
      await expect(
        sender.send({
          pdfBuffer: PDF_MAGIC,
          recipient: VALID_RECIPIENT,
          sender: VALID_SENDER,
          metadata: {},
          idempotencyKey: 'idem-1',
        })
      ).rejects.toThrow('paper_not_configured')
    })

    it('getLetter() lève paper_not_configured sans apiKey', async () => {
      const sender = createPaperSender({ fetchImpl: vi.fn() })
      await expect(sender.getLetter('msb-123')).rejects.toThrow('paper_not_configured')
    })

    it('ne fait AUCUN appel réseau quand la clé est absente', async () => {
      const { fn } = fakeFetch([{ status: 200, body: {} }])
      const sender = createPaperSender({ fetchImpl: fn })
      await sender
        .send({ pdfBuffer: PDF_MAGIC, recipient: VALID_RECIPIENT, sender: VALID_SENDER, idempotencyKey: 'i' })
        .catch(() => {})
      expect(fn).not.toHaveBeenCalled()
    })
  })

  describe('validation adresse — AVANT tout appel réseau', () => {
    it('refuse une address_line1 destinataire > 45 caractères (invalid_address)', async () => {
      const { fn } = fakeFetch([{ status: 201, body: { _id: 'x' } }])
      const sender = createPaperSender({ apiKey: 'key', fetchImpl: fn })
      const recipient = { ...VALID_RECIPIENT, address_line1: 'x'.repeat(46) }
      const err = await sender
        .send({ pdfBuffer: PDF_MAGIC, recipient, sender: VALID_SENDER, idempotencyKey: 'i' })
        .catch((e: unknown) => e)
      expect(err).toBeInstanceOf(PaperSenderError)
      expect((err as InstanceType<typeof PaperSenderError>).code).toBe('invalid_address')
      expect(fn).not.toHaveBeenCalled()
    })

    it('refuse une address_line1 EXPÉDITEUR > 45 caractères, désigne le champ fautif', async () => {
      const sender = createPaperSender({ apiKey: 'key', fetchImpl: vi.fn() })
      const badSender = { ...VALID_SENDER, address_line1: 'y'.repeat(50) }
      const err = await sender
        .send({ pdfBuffer: PDF_MAGIC, recipient: VALID_RECIPIENT, sender: badSender, idempotencyKey: 'i' })
        .catch((e: unknown) => e)
      expect((err as InstanceType<typeof PaperSenderError>).code).toBe('invalid_address')
      expect((err as InstanceType<typeof PaperSenderError>).field).toBe('sender.address_line1')
    })

    it('accepte exactement 45 caractères (limite non stricte)', async () => {
      const { fn } = fakeFetch([{ status: 201, body: { _id: 'ok' } }])
      const sender = createPaperSender({ apiKey: 'key', fetchImpl: fn })
      const recipient = { ...VALID_RECIPIENT, address_line1: 'x'.repeat(45) }
      const result = await sender.send({
        pdfBuffer: PDF_MAGIC,
        recipient,
        sender: VALID_SENDER,
        idempotencyKey: 'i',
      })
      expect(result.providerRef).toBe('ok')
    })

    it('refuse un code postal qui n’est pas 5 chiffres', async () => {
      const sender = createPaperSender({ apiKey: 'key', fetchImpl: vi.fn() })
      const recipient = { ...VALID_RECIPIENT, postal_code: '7501' }
      const err = await sender
        .send({ pdfBuffer: PDF_MAGIC, recipient, sender: VALID_SENDER, idempotencyKey: 'i' })
        .catch((e: unknown) => e)
      expect((err as InstanceType<typeof PaperSenderError>).code).toBe('invalid_address')
      expect((err as InstanceType<typeof PaperSenderError>).field).toBe('recipient.postal_code')
    })

    it('refuse un code postal non numérique', async () => {
      const sender = createPaperSender({ apiKey: 'key', fetchImpl: vi.fn() })
      const recipient = { ...VALID_RECIPIENT, postal_code: 'ABCDE' }
      const err = await sender
        .send({ pdfBuffer: PDF_MAGIC, recipient, sender: VALID_SENDER, idempotencyKey: 'i' })
        .catch((e: unknown) => e)
      expect((err as InstanceType<typeof PaperSenderError>).code).toBe('invalid_address')
    })

    it('accepte une address_line2 absente (optionnelle)', async () => {
      const { fn } = fakeFetch([{ status: 201, body: { _id: 'ok2' } }])
      const sender = createPaperSender({ apiKey: 'key', fetchImpl: fn })
      const result = await sender.send({
        pdfBuffer: PDF_MAGIC,
        recipient: VALID_RECIPIENT,
        sender: VALID_SENDER,
        idempotencyKey: 'i',
      })
      expect(result.providerRef).toBe('ok2')
    })
  })

  describe('trop de pièces jointes', () => {
    it('refuse plus de 4 pièces jointes (5 fichiers au total avec le PDF principal)', async () => {
      const sender = createPaperSender({ apiKey: 'key', fetchImpl: vi.fn() })
      const attachments = Array.from({ length: 5 }, () => ({ buffer: PDF_MAGIC, mime: 'application/pdf' }))
      const err = await sender
        .send({
          pdfBuffer: PDF_MAGIC,
          attachments,
          recipient: VALID_RECIPIENT,
          sender: VALID_SENDER,
          idempotencyKey: 'i',
        })
        .catch((e: unknown) => e)
      expect((err as InstanceType<typeof PaperSenderError>).code).toBe('too_many_attachments')
    })

    it('accepte exactement 4 pièces jointes (5 fichiers au total)', async () => {
      const { fn } = fakeFetch([{ status: 201, body: { _id: 'ok3' } }])
      const sender = createPaperSender({ apiKey: 'key', fetchImpl: fn })
      const attachments = Array.from({ length: 4 }, () => ({ buffer: PDF_MAGIC, mime: 'application/pdf' }))
      const result = await sender.send({
        pdfBuffer: PDF_MAGIC,
        attachments,
        recipient: VALID_RECIPIENT,
        sender: VALID_SENDER,
        idempotencyKey: 'i',
      })
      expect(result.providerRef).toBe('ok3')
    })
  })

  describe('payload POST /letters — assertions complètes', () => {
    it('envoie insert_blank_page + manage_returned_mail TOUJOURS présents, en Basic Auth, avec Idempotency-Key', async () => {
      const { fn, calls } = fakeFetch([{ status: 201, body: { _id: 'abc' } }])
      const sender = createPaperSender({ apiKey: 'ma-cle-secrete', fetchImpl: fn })
      await sender.send({
        pdfBuffer: PDF_MAGIC,
        recipient: VALID_RECIPIENT,
        sender: VALID_SENDER,
        metadata: { seren_send_id: 'send-42' },
        idempotencyKey: 'idem-abc-123',
      })

      expect(calls).toHaveLength(1)
      const { url, init } = calls[0]
      expect(url).toBe('https://api.mysendingbox.fr/letters')
      expect(init.method).toBe('POST')

      const headers = init.headers as Record<string, string>
      expect(headers['Idempotency-Key']).toBe('idem-abc-123')
      // Basic Auth : clé API en username, mot de passe vide.
      const expectedAuth = 'Basic ' + Buffer.from('ma-cle-secrete:').toString('base64')
      expect(headers.Authorization).toBe(expectedAuth)
      // La clé API elle-même n'apparaît JAMAIS en clair ailleurs que dans l'en-tête Authorization.
      expect(JSON.stringify(init)).not.toContain('ma-cle-secrete')

      const body = JSON.parse(init.body as string)
      expect(body.address_placement).toBe('insert_blank_page')
      expect(body.manage_returned_mail).toBe(true)
      expect(body.postage_type).toBe('ecopli')
      expect(body.color).toBe('bw')
      expect(body.metadata).toEqual({ seren_send_id: 'send-42' })
      expect(body.source_file).toBe(PDF_MAGIC.toString('base64'))
      expect(body.recipient_address_line1).toBe(VALID_RECIPIENT.address_line1)
      expect(body.sender_address_line1).toBe(VALID_SENDER.address_line1)
    })

    it('place les pièces jointes PDF en source_file_2..N (jamais dans source_file, réservé au corps)', async () => {
      const { fn, calls } = fakeFetch([{ status: 201, body: { _id: 'abc' } }])
      const sender = createPaperSender({ apiKey: 'key', fetchImpl: fn })
      const attachment1 = Buffer.from('%PDF-1.4 piece jointe 1')
      const attachment2 = Buffer.from('%PDF-1.4 piece jointe 2')
      await sender.send({
        pdfBuffer: PDF_MAGIC,
        attachments: [
          { buffer: attachment1, mime: 'application/pdf' },
          { buffer: attachment2, mime: 'application/pdf' },
        ],
        recipient: VALID_RECIPIENT,
        sender: VALID_SENDER,
        idempotencyKey: 'i',
      })
      const body = JSON.parse(calls[0].init.body as string)
      expect(body.source_file).toBe(PDF_MAGIC.toString('base64'))
      expect(body.source_file_2).toBe(attachment1.toString('base64'))
      expect(body.source_file_3).toBe(attachment2.toString('base64'))
      expect(body.source_file_4).toBeUndefined()
    })

    it('convertit une pièce jointe JPEG/PNG en PDF avant l’envoi (magic bytes %PDF sur le résultat décodé)', async () => {
      const { fn, calls } = fakeFetch([{ status: 201, body: { _id: 'abc' } }])
      const sender = createPaperSender({ apiKey: 'key', fetchImpl: fn })
      await sender.send({
        pdfBuffer: PDF_MAGIC,
        attachments: [
          { buffer: PNG_1PX, mime: 'image/png' },
          { buffer: JPEG_1PX, mime: 'image/jpeg' },
        ],
        recipient: VALID_RECIPIENT,
        sender: VALID_SENDER,
        idempotencyKey: 'i',
      })
      const body = JSON.parse(calls[0].init.body as string)
      const decodedPng = Buffer.from(body.source_file_2, 'base64')
      const decodedJpeg = Buffer.from(body.source_file_3, 'base64')
      expect(decodedPng.subarray(0, 5).toString('latin1')).toBe('%PDF-')
      expect(decodedJpeg.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    })

    it('laisse une pièce jointe déjà PDF inchangée (aucune conversion)', async () => {
      const { fn, calls } = fakeFetch([{ status: 201, body: { _id: 'abc' } }])
      const sender = createPaperSender({ apiKey: 'key', fetchImpl: fn })
      const pdfAttachment = Buffer.from('%PDF-1.4 deja un pdf')
      await sender.send({
        pdfBuffer: PDF_MAGIC,
        attachments: [{ buffer: pdfAttachment, mime: 'application/pdf' }],
        recipient: VALID_RECIPIENT,
        sender: VALID_SENDER,
        idempotencyKey: 'i',
      })
      const body = JSON.parse(calls[0].init.body as string)
      expect(body.source_file_2).toBe(pdfAttachment.toString('base64'))
    })
  })

  describe('Idempotency-Key obligatoire', () => {
    it('lève une erreur si idempotencyKey est absent — jamais d’appel réseau sans lui', async () => {
      const { fn } = fakeFetch([{ status: 201, body: { _id: 'x' } }])
      const sender = createPaperSender({ apiKey: 'key', fetchImpl: fn })
      await expect(
        sender.send({ pdfBuffer: PDF_MAGIC, recipient: VALID_RECIPIENT, sender: VALID_SENDER })
      ).rejects.toThrow()
      expect(fn).not.toHaveBeenCalled()
    })
  })

  describe('erreurs HTTP', () => {
    it('4xx → provider_rejected, avec le détail du body (jamais la clé API)', async () => {
      const { fn } = fakeFetch([{ status: 422, ok: false, body: { message: 'adresse invalide côté MSB' } }])
      const sender = createPaperSender({ apiKey: 'secret-key', fetchImpl: fn })
      const err = await sender
        .send({ pdfBuffer: PDF_MAGIC, recipient: VALID_RECIPIENT, sender: VALID_SENDER, idempotencyKey: 'i' })
        .catch((e: unknown) => e)
      expect((err as InstanceType<typeof PaperSenderError>).code).toBe('provider_rejected')
      expect(JSON.stringify(err)).not.toContain('secret-key')
      expect((err as Error).message).not.toContain('secret-key')
    })

    it('5xx → provider_unavailable', async () => {
      const { fn } = fakeFetch([{ status: 500, ok: false, body: {} }])
      const sender = createPaperSender({ apiKey: 'key', fetchImpl: fn })
      const err = await sender
        .send({ pdfBuffer: PDF_MAGIC, recipient: VALID_RECIPIENT, sender: VALID_SENDER, idempotencyKey: 'i' })
        .catch((e: unknown) => e)
      expect((err as InstanceType<typeof PaperSenderError>).code).toBe('provider_unavailable')
    })

    it('erreur réseau (fetch qui rejette) → provider_unavailable', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('ECONNRESET'))
      const sender = createPaperSender({ apiKey: 'key', fetchImpl: fn })
      const err = await sender
        .send({ pdfBuffer: PDF_MAGIC, recipient: VALID_RECIPIENT, sender: VALID_SENDER, idempotencyKey: 'i' })
        .catch((e: unknown) => e)
      expect((err as InstanceType<typeof PaperSenderError>).code).toBe('provider_unavailable')
    })

    it('201 → { providerRef, status: "submitted" } (providerRef = _id de la réponse)', async () => {
      const { fn } = fakeFetch([{ status: 201, body: { _id: 'msb-999' } }])
      const sender = createPaperSender({ apiKey: 'key', fetchImpl: fn })
      const result = await sender.send({
        pdfBuffer: PDF_MAGIC,
        recipient: VALID_RECIPIENT,
        sender: VALID_SENDER,
        idempotencyKey: 'i',
      })
      expect(result).toEqual({ providerRef: 'msb-999', status: 'submitted' })
    })
  })

  describe('getLetter', () => {
    it('GET authentifié, renvoie le JSON brut (le fold est fait ailleurs, par msb-status)', async () => {
      const rawBody = { _id: 'msb-1', events: [{ _id: 'e1', type: 'letter.sent' }] }
      const { fn, calls } = fakeFetch([{ status: 200, body: rawBody }])
      const sender = createPaperSender({ apiKey: 'ma-cle', fetchImpl: fn })
      const result = await sender.getLetter('msb-1')
      expect(result).toEqual(rawBody)
      expect(calls[0].url).toBe('https://api.mysendingbox.fr/letters/msb-1')
      const headers = calls[0].init.headers as Record<string, string>
      expect(headers.Authorization).toBe('Basic ' + Buffer.from('ma-cle:').toString('base64'))
    })

    it('getLetter 5xx → provider_unavailable', async () => {
      const { fn } = fakeFetch([{ status: 503, ok: false, body: {} }])
      const sender = createPaperSender({ apiKey: 'key', fetchImpl: fn })
      const err = await sender.getLetter('msb-1').catch((e: unknown) => e)
      expect((err as InstanceType<typeof PaperSenderError>).code).toBe('provider_unavailable')
    })

    it('getLetter 404 → provider_rejected', async () => {
      const { fn } = fakeFetch([{ status: 404, ok: false, body: { message: 'not found' } }])
      const sender = createPaperSender({ apiKey: 'key', fetchImpl: fn })
      const err = await sender.getLetter('msb-inconnu').catch((e: unknown) => e)
      expect((err as InstanceType<typeof PaperSenderError>).code).toBe('provider_rejected')
    })
  })
})

describe('imageToPdf', () => {
  it('convertit un PNG en PDF valide (magic bytes %PDF)', () => {
    const pdf = imageToPdf(PNG_1PX, 'image/png')
    expect(Buffer.isBuffer(pdf)).toBe(true)
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })

  it('convertit un JPEG en PDF valide (magic bytes %PDF)', () => {
    const pdf = imageToPdf(JPEG_1PX, 'image/jpeg')
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })
})

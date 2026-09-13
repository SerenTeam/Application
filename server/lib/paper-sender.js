// Adaptateur d'envoi papier (MySendingBox, REST direct — le SDK Node est quasi mort, spec §2).
// Contrat symétrique à server/lib/email-sender.js : le sender ne connaît ni la BDD ni les
// statuts métier, il ne fait que parler au provider et remonter { providerRef, status } ou lever
// une exception que la route (Task 9) traduit en réponse HTTP. `fetchImpl` est TOUJOURS injecté
// par l'appelant (fetch global en production, fake dans les tests — jamais d'appel réseau réel
// en test). Le fold statut (`events[] → statut Seren`) vit dans msb-status.js, pas ici :
// `getLetter` renvoie le JSON brut de la réponse provider.
//
// ⚠️ DÉCISIONS PRISES FAUTE D'ACCÈS À LA DOC MYSENDINGBOX AUTHENTIFIÉE PENDANT CETTE SESSION —
// marquées « à confirmer au test réel » (E2E préprod, clé test, USER STEP) :
//   - Transport : corps JSON (Content-Type: application/json), PAS multipart/form-data. Le plan
//     énumère les champs du payload comme un objet unique ("body avec address_placement: …,
//     manage_returned_mail: true, …") plutôt que comme des parts de formulaire — lecture retenue
//     ici. Si l'API réelle attend du multipart, seule cette couche transport change (le contrat
//     `send()` et les tests de forme du payload restent valables).
//   - Fichiers : `source_file` (corps du courrier) et `source_file_2`..`source_file_5` (pièces
//     jointes, max 4) transmis en base64 dans le JSON, pas en upload binaire.
//   - Noms de champs adresse : `recipient_name`, `recipient_address_line1/2`,
//     `recipient_postal_code`, `recipient_city`, `recipient_country` (miroir `sender_*`).
//   - Réponse POST : `_id` à la racine du JSON (identique à la clé de dédup des événements,
//     msb-status.js) → `providerRef`.
import { jsPDF } from 'jspdf'

const MSB_BASE_URL = 'https://api.mysendingbox.fr'
const LETTERS_PATH = '/letters'
const LINE_MAX = 45
const POSTAL_CODE_RE = /^[0-9]{5}$/
const MAX_ATTACHMENTS = 4 // + 1 PDF principal = 5 fichiers au total (§M)
const IMAGE_MARGIN_MM = 10

/** Erreur applicative distinguable par `.code` — même patron que LetterStoreError
 * (server/lib/letters-store.js). `.field` (invalid_address) ou `.status`/`.detail`
 * (provider_rejected) sont ajoutés selon le cas, jamais la clé API. */
export class PaperSenderError extends Error {
  constructor(code, extra) {
    super(code)
    this.name = 'PaperSenderError'
    this.code = code
    if (extra) Object.assign(this, extra)
  }
}

function checkLine(value, field, side) {
  if (typeof value !== 'string' || value.length === 0 || value.length > LINE_MAX) {
    throw new PaperSenderError('invalid_address', { field: `${side}.${field}` })
  }
}

// Validation stricte AVANT tout appel réseau (spec Task 7) : une adresse ne respectant pas les
// contraintes physiques du courrier (lignes ≤ 45 caractères, CP à 5 chiffres — mêmes bornes que
// les CHECK SQL de sender_profiles/organisations, Task 1) est refusée ici, jamais tronquée.
function validateAddress(addr, side) {
  if (!addr || typeof addr !== 'object') {
    throw new PaperSenderError('invalid_address', { field: side })
  }
  checkLine(addr.name, 'name', side)
  checkLine(addr.address_line1, 'address_line1', side)
  if (addr.address_line2 != null && addr.address_line2 !== '') {
    checkLine(addr.address_line2, 'address_line2', side)
  }
  checkLine(addr.city, 'city', side)
  if (!POSTAL_CODE_RE.test(String(addr.postal_code ?? ''))) {
    throw new PaperSenderError('invalid_address', { field: `${side}.postal_code` })
  }
}

/**
 * Convertit une image (JPEG/PNG) en PDF une page, ajustée A4 portrait, marges 10 mm, ratio
 * préservé. Exportée pour les tests (Task 7) — aussi utilisée en interne par `send()` pour les
 * pièces jointes non-PDF (photo de l'acte de décès prise au téléphone, choix acté spec §3.4).
 * @param {Buffer} buffer
 * @param {'image/jpeg' | 'image/png'} mime
 * @returns {Buffer}
 */
export function imageToPdf(buffer, mime) {
  const format = mime === 'image/png' ? 'PNG' : 'JPEG'
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const maxWidth = doc.internal.pageSize.getWidth() - IMAGE_MARGIN_MM * 2
  const maxHeight = doc.internal.pageSize.getHeight() - IMAGE_MARGIN_MM * 2

  const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`
  const { width, height } = doc.getImageProperties(dataUrl)
  const ratio = Math.min(maxWidth / width, maxHeight / height)
  const w = width * ratio
  const h = height * ratio
  const x = IMAGE_MARGIN_MM + (maxWidth - w) / 2
  const y = IMAGE_MARGIN_MM + (maxHeight - h) / 2

  doc.addImage(dataUrl, format, x, y, w, h)
  return Buffer.from(doc.output('arraybuffer'))
}

// Une PJ déjà PDF passe telle quelle (fusion multi-PDF supportée nativement par MySendingBox) ;
// JPEG/PNG sont converties (vigilance de revue Task 5+6) ; tout autre type est un bug appelant
// (le coffre — server/routes/attachments.js — n'accepte déjà que PDF/JPEG/PNG par magic bytes).
function toPdfBytes({ buffer, mime }) {
  if (mime === 'application/pdf') return buffer
  if (mime === 'image/jpeg' || mime === 'image/png') return imageToPdf(buffer, mime)
  throw new PaperSenderError('unsupported_attachment_type', { mime })
}

function addressPayload(addr, prefix) {
  const payload = {
    [`${prefix}_name`]: addr.name,
    [`${prefix}_address_line1`]: addr.address_line1,
    [`${prefix}_postal_code`]: addr.postal_code,
    [`${prefix}_city`]: addr.city,
    [`${prefix}_country`]: addr.country || 'FR',
  }
  if (addr.address_line2) payload[`${prefix}_address_line2`] = addr.address_line2
  return payload
}

function basicAuthHeader(apiKey) {
  // Basic Auth : clé API en username, mot de passe VIDE (spec §M) — jamais la clé en clair
  // ailleurs qu'ici (pas de log, pas de message d'erreur).
  return `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`
}

async function safeReadJson(res) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

/** Traduit une Response HTTP en résultat ou en PaperSenderError. 4xx → provider_rejected (détail
 * du body, jamais la clé API — elle ne transite que dans l'en-tête de la REQUÊTE, jamais recopiée
 * ici) ; 5xx → provider_unavailable (la route décide du retry, spec Task 7). */
async function translateErrorResponse(res) {
  if (res.status >= 500) {
    throw new PaperSenderError('provider_unavailable', { status: res.status })
  }
  const detail = await safeReadJson(res)
  throw new PaperSenderError('provider_rejected', { status: res.status, detail })
}

/**
 * @param {{ apiKey?: string, fetchImpl?: typeof fetch }} deps
 */
export function createPaperSender({ apiKey, fetchImpl = fetch } = {}) {
  function ensureConfigured() {
    // Service non configuré (dev local avant le USER STEP, kill switch de clé) : 503 propre côté
    // route, pas un échec d'envoi — même pattern que email-sender.js / stripe-client.js.
    if (!apiKey) throw new Error('paper_not_configured')
  }

  async function callProvider(url, init) {
    let res
    try {
      res = await fetchImpl(url, init)
    } catch {
      // Erreur réseau (fetch qui rejette) — jamais distinguée d'un 5xx provider, même verdict :
      // la route décide du retry (spec Task 7).
      throw new PaperSenderError('provider_unavailable')
    }
    if (!res.ok) await translateErrorResponse(res)
    return res
  }

  return {
    /**
     * @param {{ pdfBuffer: Buffer, attachments?: Array<{buffer: Buffer, mime: string}>,
     *   recipient: object, sender: object, metadata?: object, idempotencyKey: string }} params
     * @returns {Promise<{ providerRef: string, status: 'submitted' }>}
     */
    async send({ pdfBuffer, attachments = [], recipient, sender, metadata, idempotencyKey }) {
      ensureConfigured()
      // Idempotency-Key est FOURNI PAR L'APPELANT (spec §M) — sans lui, deux tentatives
      // logiques distinctes pourraient partir deux fois chez le provider ; on refuse plutôt que
      // d'envoyer une clé absente/instable.
      if (!idempotencyKey) throw new PaperSenderError('idempotency_key_required')

      // Validation stricte AVANT tout appel réseau (adresses, puis nombre de pièces jointes).
      validateAddress(recipient, 'recipient')
      validateAddress(sender, 'sender')
      if (attachments.length > MAX_ATTACHMENTS) {
        throw new PaperSenderError('too_many_attachments')
      }

      const preparedAttachments = attachments.map(toPdfBytes)

      const body = {
        // Prémisses d'appel §M — TOUJOURS présents, quel que soit le contenu du courrier.
        address_placement: 'insert_blank_page',
        manage_returned_mail: true,
        postage_type: 'ecopli',
        color: 'bw',
        metadata: metadata ?? {},
        source_file: pdfBuffer.toString('base64'),
        ...addressPayload(recipient, 'recipient'),
        ...addressPayload(sender, 'sender'),
      }
      preparedAttachments.forEach((buf, i) => {
        body[`source_file_${i + 2}`] = buf.toString('base64')
      })

      const res = await callProvider(`${MSB_BASE_URL}${LETTERS_PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: basicAuthHeader(apiKey),
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      return { providerRef: data._id, status: 'submitted' }
    },

    /** GET authentifié — renvoie le JSON brut, le fold est fait par msb-status.js (Task 7). */
    async getLetter(providerRef) {
      ensureConfigured()
      const res = await callProvider(`${MSB_BASE_URL}${LETTERS_PATH}/${providerRef}`, {
        method: 'GET',
        headers: { Authorization: basicAuthHeader(apiKey) },
      })
      return res.json()
    },
  }
}

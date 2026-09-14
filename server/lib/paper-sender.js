// Adaptateur d'envoi papier (MySendingBox, REST direct — le SDK Node est quasi mort, spec §2).
// Contrat symétrique à server/lib/email-sender.js : le sender ne connaît ni la BDD ni les
// statuts métier, il ne fait que parler au provider et remonter { providerRef, status } ou lever
// une exception que la route (Task 9) traduit en réponse HTTP. `fetchImpl` est TOUJOURS injecté
// par l'appelant (fetch global en production, fake dans les tests — jamais d'appel réseau réel
// en test). Le fold statut (`events[] → statut Seren`) vit dans msb-status.js, pas ici :
// `getLetter` renvoie le JSON brut de la réponse provider.
//
// ── Structure du POST /letters (doc officielle docs.mysendingbox.fr, pré-vol 13/09 — CORRECTIF
// post-implémentation : la première version de ce fichier avait des champs plats et un corps
// JSON+base64 inventés faute d'accès à la doc ; voici la structure vérifiée) ──
//   - Destinataire = objet imbriqué `to` (name et/ou company, address_line1/2/3, address_city,
//     address_postalcode, address_country ISO 3166) ; expéditeur = objet `from` (même forme).
//     `from` n'est OBLIGATOIRE que pour lr/lrar selon la doc, mais on l'envoie TOUJOURS : c'est
//     l'adresse de retour dont `manage_returned_mail` a besoin, et elle est imprimée en tête de
//     lettre via `print_sender_address: true`.
//   - Fichiers : `source_file` + `source_file_type` ∈ {html, file, template_id, remote} ;
//     multi-fichiers `source_file_2..5` + leur propre `source_file_X_type`, fusionnés dans
//     l'ordre par MySendingBox. Le base64-en-JSON n'est PAS dans l'enum documenté.
//   - DÉCISION DE TRANSPORT (retenue) : `source_file_type: 'file'` en **multipart/form-data**
//     (l'« upload local » canonique) — les buffers (PDF principal + PJ déjà converties en PDF)
//     partent en parts binaires, pas en base64. PLAN B si le multipart s'avère refusé par l'API
//     réelle (constaté à l'E2E préprod, USER STEP) : basculer `source_file_type` sur `'remote'`
//     et transmettre des URLs signées Storage courte durée au lieu des buffers — seule
//     `buildMultipart` (et l'appel HTTP dans `send()`) changerait, `buildLetterPayload` et le
//     contrat public `send({...}) → { providerRef, status }` restent valables tels quels.
//   - Options TOUJOURS présentes : `address_placement: 'insert_blank_page'`,
//     `manage_returned_mail: true`, `postage_type: 'ecopli'`, `color: 'bw'`,
//     `print_sender_address: true` ; `both_sides` non fixé (défaut provider conservé) ; header
//     `Idempotency-Key` fourni par l'appelant.
//   - Réponse : `_id` (→ providerRef), `file`, `price`, `events` (initialement `letter.created`).
//
// ⚠️ À CONFIRMER AU TEST RÉEL : l'encodage exact des objets `to`/`from` en multipart. Un
// multipart/form-data standard n'a pas de notion d'objet imbriqué — deux conventions sont
// courantes pour les API construites en Rails/PHP (dont MySendingBox, plausible vu le TLD .fr) :
// (a) la notation crochets retenue ici (`to[name]`, `to[address_line1]`, …) — un champ par
// sous-clé ; (b) un unique champ `to` contenant le JSON stringifié de l'objet. `metadata`, lui,
// est un blob opaque round-trip (pas de sous-champs connus à l'avance) : envoyé en JSON
// stringifié dans un unique champ `metadata`, quelle que soit la convention retenue pour
// `to`/`from`. Si (a) est rejeté par l'API réelle, seule `buildMultipart` change.
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
// contraintes physiques du courrier (lignes ≤ 45 caractères — 38 seulement en
// `postage_speed: 'express'`, non utilisé ici — CP à 5 chiffres, mêmes bornes que les CHECK SQL
// de sender_profiles/organisations, Task 1) est refusée ici, jamais tronquée. Shape interne
// Seren (`{ name, address_line1, address_line2?, postal_code, city, country? }`), traduite en
// shape API (`to`/`from`) par `toApiAddress` seulement après validation.
//
// EXPORTÉE pour la route d'envoi (Task 9), qui doit refuser une adresse invalide AVANT de créer
// la ligne d'envoi et surtout avant de débiter le quota : sans cet export, l'unique validation
// serait celle de `send()`, déclenchée APRÈS le débit — il faudrait le libérer pour une simple
// faute de frappe. La règle des 45 caractères vit ainsi à UN SEUL endroit, celui qui connaît la
// contrainte du provider.
export function validateAddress(addr, side) {
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

// Shape interne Seren → shape API MySendingBox (`to`/`from`) : renomme `postal_code`/`city` en
// `address_postalcode`/`address_city` (noms exacts doc), `country` en `address_country` (défaut
// 'FR'), omet `address_line2` si absent plutôt que d'envoyer une clé vide.
function toApiAddress(addr) {
  const api = {
    name: addr.name,
    address_line1: addr.address_line1,
    address_city: addr.city,
    address_postalcode: addr.postal_code,
    address_country: addr.country || 'FR',
  }
  if (addr.address_line2) api.address_line2 = addr.address_line2
  return api
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

/**
 * Fonction PURE : construit les champs sémantiques du courrier (aucun encodage réseau ici — voir
 * `buildMultipart` pour la mise en forme multipart). `recipient`/`sender` sont la shape interne
 * Seren déjà validée (`validateAddress`) ; `metadata` est passthrough (opaque pour cet adaptateur).
 * @param {{ recipient: object, sender: object, metadata?: object }} params
 */
export function buildLetterPayload({ recipient, sender, metadata }) {
  return {
    to: toApiAddress(recipient),
    from: toApiAddress(sender),
    metadata: metadata ?? {},
    // Prémisses d'appel §M — TOUJOURS présentes, quel que soit le contenu du courrier.
    address_placement: 'insert_blank_page',
    manage_returned_mail: true,
    postage_type: 'ecopli',
    color: 'bw',
    // `from` est envoyé même pour un courrier simple (voir note de tête) : cette option demande
    // explicitement à MySendingBox de l'imprimer en tête de lettre.
    print_sender_address: true,
    // Upload local direct (buffers en multipart) — pas de remote URL ni de template MSB en 2a.
    source_file_type: 'file',
  }
}

// Aplatit un objet adresse (`to`/`from`) en parts multipart `prefix[clé]` — convention retenue,
// à confirmer au test réel (voir note de tête du fichier). Omet les valeurs vides/absentes
// plutôt que d'envoyer une part vide.
function appendAddressParts(form, prefix, addr) {
  for (const [key, value] of Object.entries(addr)) {
    if (value === undefined || value === null || value === '') continue
    form.append(`${prefix}[${key}]`, String(value))
  }
}

/**
 * Fonction pure côté données (aucun appel réseau) : encode `payload` (issu de
 * `buildLetterPayload`) et les fichiers en `FormData`. AUCUN `Content-Type` n'est fixé ici ni
 * dans `send()` — c'est fetch/undici qui calcule l'en-tête `multipart/form-data; boundary=…` à
 * partir du corps `FormData` ; un `Content-Type` posé à la main casserait l'encodage (boundary
 * manquant).
 * @param {ReturnType<typeof buildLetterPayload>} payload
 * @param {{ pdfBuffer: Buffer, attachments?: Buffer[] }} files pièces jointes DÉJÀ converties en PDF
 * @returns {FormData}
 */
export function buildMultipart(payload, { pdfBuffer, attachments = [] }) {
  const { to, from, metadata, ...scalars } = payload
  const form = new FormData()

  appendAddressParts(form, 'to', to)
  appendAddressParts(form, 'from', from)
  // `metadata` : blob opaque round-trip, JSON stringifié dans un unique champ (voir note de tête).
  form.append('metadata', JSON.stringify(metadata ?? {}))
  for (const [key, value] of Object.entries(scalars)) {
    if (value === undefined) continue
    form.append(key, String(value))
  }

  form.append('source_file', new Blob([pdfBuffer], { type: 'application/pdf' }), 'letter.pdf')
  attachments.forEach((buf, i) => {
    const field = `source_file_${i + 2}`
    form.append(field, new Blob([buf], { type: 'application/pdf' }), `${field}.pdf`)
    // Chaque fichier additionnel porte son propre `_type` (doc) — même valeur que le principal
    // ici puisque toutes les PJ sont, comme le corps, des buffers locaux déjà en PDF.
    form.append(`${field}_type`, 'file')
  })
  return form
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
      const payload = buildLetterPayload({ recipient, sender, metadata })
      const form = buildMultipart(payload, { pdfBuffer, attachments: preparedAttachments })

      const res = await callProvider(`${MSB_BASE_URL}${LETTERS_PATH}`, {
        method: 'POST',
        headers: {
          // PAS de Content-Type : fetch le calcule (avec boundary) à partir du corps FormData.
          Authorization: basicAuthHeader(apiKey),
          'Idempotency-Key': idempotencyKey,
        },
        body: form,
      })
      const data = await res.json()
      return { providerRef: data._id, status: 'submitted' }
    },

    /** GET authentifié — renvoie le JSON brut, le fold est fait par msb-status.js (Task 7).
     * Garde défensive (revue finale Task 10, mineur) : sans `providerRef`, l'appelant (webhook ou
     * resync) a un bug de corrélation en amont — mieux vaut un throw explicite ici qu'un GET
     * `/letters/undefined` envoyé au provider. */
    async getLetter(providerRef) {
      ensureConfigured()
      if (!providerRef) throw new PaperSenderError('invalid_provider_ref')
      const res = await callProvider(`${MSB_BASE_URL}${LETTERS_PATH}/${providerRef}`, {
        method: 'GET',
        headers: { Authorization: basicAuthHeader(apiKey) },
      })
      return res.json()
    },
  }
}

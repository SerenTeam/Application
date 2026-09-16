// Routes d'envoi de courriers — canal email v1 (Resend) ET canal papier (MySendingBox, chantier
// 2a). Factory à dépendances injectées (comme server/routes/questionnaire.js) : testable avec
// supertest sans Supabase ni appel réseau réel (emailSender/paperSender toujours fakés en test,
// `fetchImpl` injecté pour le téléchargement des pièces jointes). Contrats :
// docs/plan-envoi-courriers.md Task 3 (email) et docs/plan-chantier-2a-envoi-papier.md Task 9
// (papier) ; tables letter_sends / send_debits : supabase/migrations/20260716120000_letter_sends.sql
// puis 20260914120000_letter_sends_papier.sql.
import express, { Router } from 'express'
import crypto from 'crypto'
import * as Sentry from '@sentry/node'
import { renderLetterPdf } from '../lib/letter-pdf.js'
import { renderLetter } from '../lib/letter-render.js'
import { validateAddress } from '../lib/paper-sender.js'
import { createUserRateLimiter } from '../lib/rate-limit.js'
import { msg } from '../lib/messages.js'
import { verifySvixSignature } from '../lib/svix-verify.js'
import { flagOn } from '../lib/flags.js'
import { FAIL_CLOSED_GATE } from '../lib/require-active-dossier.js'

// Regex RFC basique — suffisante pour rejeter les fautes de frappe grossières côté serveur ;
// la vraie validation de délivrabilité vient de la réponse du provider (Resend).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ── Constantes du canal papier (chantier 2a) ─────────────────────────────────────────────────
// SEUL 'papier' est envoyable en 2a. 'lre'/'lrar' (recommandé + AR probant) sont le lot 2c :
// la matrice de transitions SQL les accepte déjà, la route non — mieux vaut un 400 explicite
// qu'un pli recommandé parti au tarif et au régime juridique d'un courrier simple. 'portail'
// (CAF/CPAM/impôts en ligne) reste une démarche guidée : jamais d'envoi papier concurrent (D6).
const PAPER_CHANNEL = 'papier'
// Canal e-mail : lui aussi sous kill switch en v2 (contrat §4.2) — fermé pendant la bêta, la
// famille télécharge le courrier et l'envoie elle-même.
const EMAIL_CHANNEL = 'email'
// Contact affiché sur un 402 (quota épuisé) : le forfait famille étant abandonné, l'envoi
// supplémentaire se règle avec le support, pas par un achat en self-service.
const DEFAULT_SUPPORT_EMAIL = 'support@seren-app.fr'
const PAPER_PROVIDER = 'mysendingbox'
const DOCUMENTS_BUCKET = 'documents'
// URL signée de très courte durée, générée à l'envoi et jamais stockée ni renvoyée au client
// (spec §3.4) : elle ne vit que le temps du téléchargement serveur.
const SIGNED_URL_TTL_SECONDS = 300
// 4 pièces jointes + le corps = 5 fichiers, le maximum fusionnable par MySendingBox (§M).
const MAX_ATTACHMENTS = 4
// Types réellement acceptés par le coffre (magic bytes, server/routes/attachments.js) ET
// convertibles en PDF par l'adaptateur. Revérifié ici AVANT le débit : une pièce inattendue
// ferait sinon échouer la soumission après avoir consommé un crédit.
const ATTACHMENT_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Réseaux de l'annuaire (colonne organisations.network, migration Task 1).
const NETWORKS = new Set(['caf', 'cpam', 'carsat', 'impots'])
// Débits comptés dans le solde : 'offert' (re-envoi NPAI) est un marqueur, pas une consommation
// — miroir exact de send_balance() dans la migration Task 4.
const BILLABLE_DEBIT_SOURCES = new Set(['included', 'extra'])
// Fenêtre de fraîcheur du claim de reprise pour une ligne papier restée `prepared` (correctif C1
// de la revue Task 9). 120 s, contre 60 s par défaut pour l'email : un POST papier porte un PDF
// et jusqu'à 4 pièces jointes, il est structurellement plus lent — déclarer « périmée » une
// soumission simplement longue la ferait reprendre pendant qu'elle aboutit. La RPC applique de
// toute façon son propre plancher de 30 s et refuse tout claim dès qu'un provider_ref existe.
const PAPER_STALE_SECONDS = 120

// Événements Resend gérés par le webhook → statut letter_sends. Les autres types (opened,
// clicked, complained, etc.) sont ignorés (200 silencieux, voir POST /webhook).
const RESEND_EVENT_STATUS = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.bounced': 'failed',
}

/** Langue de la requête : la route n'a pas de session (contrairement au questionnaire v2), le
 * corps ET la query sont donc les seules sources. Repli 'fr'. La query est lue depuis le
 * chantier 2a (correctif M2 de la revue Task 9) : les routes de LECTURE ajoutées ici (GET /quota,
 * GET /organisations) n'ont pas de corps du tout — sans elle, leurs messages d'erreur étaient
 * toujours en français, même pour un utilisateur anglophone. Aligné sur reqLang() de
 * server/routes/payments.js, qui lit déjà les deux. */
function bodyLang(req) {
  return req.body?.lang === 'en' || req.query?.lang === 'en' ? 'en' : 'fr'
}

/** Chaîne d'une valeur potentiellement non-textuelle, sans jamais lever : les champs d'adresse
 * arrivent du client et peuvent être de n'importe quel type ; `validateAddress` refusera ensuite
 * proprement tout ce qui n'est pas une chaîne non vide de ≤ 45 caractères. */
function trimmed(value) {
  return typeof value === 'string' ? value.trim() : value
}

/** Adresse destinataire reçue du client → shape interne Seren, champs CONNUS uniquement. Le
 * client n'écrit ainsi jamais de JSON arbitraire dans la colonne `recipient` (jsonb) ni dans le
 * payload provider. Le pays n'est pas accepté : le lot 2a n'envoie qu'en France (décès à
 * l'étranger explicitement hors périmètre), l'adaptateur pose 'FR'. */
function pickRecipientAddress(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const address = {
    name: trimmed(input.name),
    address_line1: trimmed(input.address_line1),
    postal_code: trimmed(input.postal_code),
    city: trimmed(input.city),
  }
  const line2 = trimmed(input.address_line2)
  if (line2) address.address_line2 = line2
  return address
}

/** Ensemble de pièces jointes comparé ORDRE-INSENSIBLE (legs R2 de la revue Task 9) : sur une
 * reprise, l'ensemble des `attachment_ids` du body doit être EXACTEMENT celui persisté sur la
 * ligne d'origine (`null`/absent traité comme un ensemble vide) — la traçabilité de « ce qui a
 * été posté » prime sur toute commodité UI. L'ordre, lui, ne compte pas ici (il ne conditionne
 * que la fusion provider, pas l'identité du dossier joint). */
function sameAttachmentIdSet(requested, persisted) {
  const a = new Set(Array.isArray(requested) ? requested : [])
  const b = new Set(Array.isArray(persisted) ? persisted : [])
  if (a.size !== b.size) return false
  for (const id of a) if (!b.has(id)) return false
  return true
}

/** Forme comparable d'une adresse pour l'idempotence : casse, espaces multiples et espaces de
 * bord neutralisés — « 12 RUE du Marché  » et « 12 rue du Marché » sont le même destinataire,
 * et ne doivent pas produire deux plis. */
function normalizeAddressForDedup(address) {
  return ['name', 'address_line1', 'address_line2', 'postal_code', 'city']
    .map((key) => String(address?.[key] ?? '').trim().toLowerCase().replace(/\s+/g, ' '))
    .join('|')
}

/** Idempotence du canal papier (§M du plan) : sha256 de
 * `user|template|adresse normalisée|resend_of`. Le corps n'entre PAS dans la formule (elle sera
 * revue au lot 2b pour autoriser la relance d'un même courrier) : un même modèle vers un même
 * destinataire est un seul et même geste administratif. `resend_of` en fait partie pour qu'un
 * rattrapage NPAI vers une adresse corrigée ne se fasse jamais absorber par l'original. */
function paperDedupKey({ userId, templateId, recipient, resendOf }) {
  return crypto
    .createHash('sha256')
    .update(`${userId}|${templateId}|${normalizeAddressForDedup(recipient)}|${resendOf ?? ''}`)
    .digest('hex')
}

/** Idempotency-Key MySendingBox (§M) : UUID v4 de forme, mais DÉRIVÉ DÉTERMINISTEMENT de l'id
 * d'envoi plutôt que tiré au hasard. Motif : une même tentative logique (la même ligne
 * letter_sends) doit toujours présenter la même clé — si le provider a déjà accepté le pli mais
 * que notre requête a expiré, une clé neuve en ferait imprimer et affranchir un SECOND. Le
 * hachage rend la clé imprévisible depuis l'extérieur, et la mise en forme respecte la version 4
 * (nibble de version + variante RFC 4122) attendue par le provider. */
function idempotencyKeyFor(sendId) {
  const h = crypto.createHash('sha256').update(`seren-paper-send|${sendId}`).digest('hex')
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`
}

/** Solde d'envois de l'utilisateur, lu AU TOKEN (policies SELECT owner de purchases et
 * send_debits). Miroir de send_balance() : Σ included_sends des achats PAYÉS − débits
 * facturables, plancher 0. Partagé avec GET /api/me (note N13) : une seule règle de calcul. */
export async function readQuota(client, userId) {
  const [purchases, debits] = await Promise.all([
    client.from('purchases').select('included_sends').eq('user_id', userId).eq('status', 'paid'),
    client
      .from('send_debits')
      .select('send_id, source, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  ])
  if (purchases.error) throw new Error(`Lecture des achats impossible : ${purchases.error.code ?? 'inconnue'}`)
  if (debits.error) throw new Error(`Lecture des débits impossible : ${debits.error.code ?? 'inconnue'}`)
  const includedTotal = (purchases.data ?? []).reduce((total, row) => total + (row.included_sends ?? 0), 0)
  const debitRows = debits.data ?? []
  const used = debitRows.filter((row) => BILLABLE_DEBIT_SOURCES.has(row.source)).length
  return { balance: Math.max(0, includedTotal - used), included_total: includedTotal, debits: debitRows }
}

export function createLettersRouter({
  requireAuth,
  store,
  emailSender,
  channels,
  publicClient,
  // Gate v2 (contrat §4.2) : défaut FAIL-CLOSED (A5) — les tests injectent un passe-plat explicite.
  requireActiveDossier = FAIL_CLOSED_GATE,
  // ── Dépendances du canal papier (chantier 2a) ──
  // `paperSender` : adaptateur MySendingBox (server/lib/paper-sender.js). Absent → la branche
  // papier répond 503 comme si la clé API manquait (le router reste utilisable seul, tests v1).
  paperSender = null,
  // `fetchImpl` : téléchargement des pièces jointes depuis les URL signées Storage. Injecté en
  // test — aucune requête réseau réelle n'est jamais faite depuis la suite.
  fetchImpl = fetch,
  // Fonction évaluée à CHAQUE 402 en production (flag relu) ; booléen accepté pour les tests (N11).
  extraSendAvailable = () => false,
}) {
  const router = Router()
  const isExtraSendAvailable = () =>
    Boolean(typeof extraSendAvailable === 'function' ? extraSendAvailable() : extraSendAvailable)

  // 20/h par utilisateur : un envoi correspond à une action volontaire après relecture,
  // jamais à un flux automatisé — large marge pour un usage légitime (plusieurs organismes
  // dans la même session) tout en coupant l'abus (fenêtre glissante, comme /start).
  const sendLimiter = createUserRateLimiter({
    max: 20,
    windowMs: 60 * 60 * 1000,
    message: (req) => msg(bodyLang(req), 'too_many_requests'),
  })

  // Kill switch PAR CANAL (contrat §4.2), en middleware AVANT le limiteur : une coupure
  // d'exploitation ne consomme jamais le quota horaire. Relu à chaque requête. Un canal inconnu
  // ou un modèle inconnu passe : il est tranché (404/400) dans le handler.
  const channelKillSwitch = (req, res, next) => {
    const channel = channels[req.body?.template_id]
    if (channel === PAPER_CHANNEL && !flagOn('PAPER_SENDS_ENABLED')) {
      return res.status(503).json({ success: false, error: msg(bodyLang(req), 'paper_disabled'), code: 'PAPER_DISABLED' })
    }
    if (channel === EMAIL_CHANNEL && !flagOn('EMAIL_SENDS_ENABLED')) {
      return res.status(503).json({ success: false, error: msg(bodyLang(req), 'email_sends_disabled'), code: 'EMAIL_SENDS_DISABLED' })
    }
    return next()
  }

  // Ordre contractuel : requireAuth → requireActiveDossier (ancien slot requirePurchase) →
  // channelKillSwitch → sendLimiter → handler. Un refus 403/500/503 ne consomme pas le quota horaire.
  router.post('/send', requireAuth, requireActiveDossier, channelKillSwitch, sendLimiter, async (req, res) => {
    const lang = bodyLang(req)
    try {
      // Aiguillage par canal AVANT toute autre lecture du corps : la branche papier n'a pas le
      // même contrat d'entrée que l'email (plus de corps libre — le serveur regénère le texte
      // depuis le template, D2). Le canal email ci-dessous reste STRICTEMENT inchangé, y compris
      // l'ordre de ses propres contrôles.
      // Un modèle ANNONCÉ mais inconnu est tranché ici, pour les deux canaux : sans cela, un
      // payload papier (qui n'a ni sujet ni corps) recevrait « champs requis manquants » au lieu
      // de la vraie raison. Un payload sans template_id du tout continue de tomber, lui, dans le
      // 400 « champs requis manquants » de la branche email.
      const requestedTemplate = req.body?.template_id
      const requestedChannel = channels[requestedTemplate]
      if (requestedTemplate && !requestedChannel) {
        return res.status(404).json({ success: false, error: msg(lang, 'unknown_template') })
      }
      if (requestedChannel === PAPER_CHANNEL) {
        return await sendPaperLetter(req, res, lang)
      }
      // Canal ni email ni papier (portail, lre/lrar du lot 2c) : tranché ICI (correctif M3 de la
      // revue Task 9). Auparavant ce refus vivait plus bas, APRÈS le contrôle des champs de la
      // branche email — un payload papier, qui n'a ni sujet ni corps libre, recevait donc
      // « champs requis manquants » au lieu de la vraie raison : ce canal ne s'envoie pas.
      if (requestedChannel && requestedChannel !== 'email') {
        return res.status(400).json({
          success: false,
          error: msg(lang, 'channel_not_available'),
          code: 'CHANNEL_NOT_AVAILABLE',
        })
      }

      const { template_id, step_id, subject, resolved_body, recipient_email } = req.body ?? {}

      if (!template_id || !subject || !resolved_body || !recipient_email) {
        return res.status(400).json({ success: false, error: msg(lang, 'letters_missing_fields') })
      }
      const channel = channels[template_id]
      if (!channel) {
        return res.status(404).json({ success: false, error: msg(lang, 'unknown_template') })
      }
      if (channel !== 'email') {
        // Défense en profondeur : le cas est déjà tranché par l'aiguillage ci-dessus (M3).
        return res.status(400).json({ success: false, error: msg(lang, 'channel_not_available'), code: 'CHANNEL_NOT_AVAILABLE' })
      }
      if (!EMAIL_RE.test(recipient_email)) {
        return res.status(400).json({ success: false, error: msg(lang, 'invalid_recipient_email') })
      }
      if (resolved_body.includes('{{')) {
        return res.status(400).json({ success: false, error: msg(lang, 'letter_incomplete') })
      }

      // Idempotence par contenu : un même courrier (même utilisateur, même modèle, même corps
      // résolu, même destinataire) ne part jamais deux fois — voir letter_sends.dedup_key.
      const dedupKey = crypto
        .createHash('sha256')
        .update(`${req.user.id}|${template_id}|${resolved_body}|${recipient_email}`)
        .digest('hex')

      const created = await store.createSend(req.supabaseClient, {
        user_id: req.user.id,
        step_id: step_id ?? null,
        template_id,
        channel,
        status: 'sending',
        provider: 'resend',
        recipient: { email: recipient_email },
        dedup_key: dedupKey,
      })

      let send = created.send
      if (created.duplicate) {
        // L'idempotence ne protège que les envois RÉUSSIS ('sent', ou 'delivered' via le
        // webhook) : eux seuls ne doivent jamais repartir. Une ligne 'failed' (échec provider)
        // ou restée 'sending' est RETENTABLE — sans retry, le dedup_key bloquerait
        // définitivement le courrier.
        const st = created.send.status
        if (st === 'sent' || st === 'delivered') {
          return res.json({ success: true, already_sent: true, send: created.send })
        }
        // Mais le retry doit être GAGNÉ atomiquement (claimRetry, correctif TOCTOU) : deux
        // POST identiques concurrents rechargent la même ligne encore 'sending' — sans verrou,
        // le second « retenterait » pendant que le premier envoie et le destinataire recevrait
        // le courrier deux fois. Ligne 'failed' → claim immédiat ; ligne 'sending' → claim
        // seulement si elle est STALE (updated_at vieux de plus de 60 s : crash serveur en
        // plein vol, ou 503 d'avant la configuration de la clé Resend), sinon un envoi est
        // vraisemblablement en cours dans une autre requête → 409, on ne renvoie rien.
        const claimed = await store.claimRetry(req.supabaseClient, created.send.id, {
          allowStaleSending: st === 'sending',
        })
        if (!claimed) {
          return res.status(409).json({ success: false, error: msg(lang, 'send_in_progress') })
        }
        send = claimed
      }

      try {
        const pdf = renderLetterPdf({ subject, body: resolved_body })
        const result = await emailSender.send({
          pdf,
          subject,
          recipientEmail: recipient_email,
          filename: `${template_id}.pdf`,
        })
        const updated = await store.markSendResult(req.supabaseClient, send.id, {
          status: 'sent',
          provider_ref: result.providerRef,
          sent_at: new Date().toISOString(),
          error: null, // purge l'erreur d'une éventuelle tentative précédente (retry réussi)
        })
        return res.json({ success: true, already_sent: false, send: updated })
      } catch (sendError) {
        // Service non configuré (pas de clé Resend) : ce n'est pas un échec d'envoi mais une
        // config manquante — la ligne reste 'sending', pas de statut 'failed' définitif tant
        // que l'envoi n'a jamais été réellement tenté.
        if (sendError?.message === 'email_not_configured') {
          return res.status(503).json({ success: false, error: msg(lang, 'email_not_configured') })
        }
        await store
          .markSendResult(req.supabaseClient, send.id, { status: 'failed', error: sendError?.message ?? 'send_failed' })
          .catch(() => {}) // ne doit pas masquer l'erreur d'envoi initiale (502 déjà décidé)
        return res.status(502).json({ success: false, error: msg(lang, 'send_failed') })
      }
    } catch (error) {
      console.error('❌ letters/send :', error)
      // Remonte aussi les 500 gérés à Sentry (no-op sans DSN) — les catch avalent l'erreur sinon.
      Sentry.captureException(error)
      res.status(500).json({ success: false, error: msg(lang, 'send_error') })
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // BRANCHE PAPIER de POST /send (chantier 2a, Task 9)
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // L'ORDRE DES GARDES EST LE CONTRAT : au bout de cette chaîne, un pli est imprimé, affranchi
  // et posté — de l'argent réel. Chaque garde est numérotée ci-dessous et testée dans cet ordre
  // (tests/letters-paper-routes.test.ts) :
  //   1. requireAuth + requireActiveDossier (middlewares de la route, déjà passés ici) → 403/500
  //   2. kill switch PAPER_SENDS_ENABLED (middleware channelKillSwitch, avant le limiteur) → 503
  //   3. profil expéditeur présent ET postalement exploitable → 400
  //   4. adresse destinataire valide (≤45/ligne, CP 5 chiffres, jamais tronquée) → 400
  //   5. corps REGÉNÉRÉ côté serveur depuis le template      → 400 si variables manquantes
  //   6. pièces jointes de l'utilisateur (RLS) téléchargées via URL signées courtes → 404/400
  //   7. plafonds 24 h puis création de la ligne             → 429 (+Sentry) / 409
  //   8. débit atomique du quota AVANT toute soumission      → 402 (+ offre à l'acte)
  //   9. soumission au provider ; échec → débit LIBÉRÉ + ligne failed → 502/503
  //  10. mark_letter_result submitted                        → 202
  //
  // Les gardes 2 à 6 s'exécutent AVANT la moindre écriture : un refus à ce stade ne laisse
  // aucune trace, ne consomme aucun crédit et n'entre pas dans le décompte des plafonds
  // (send_limits_status ignore les lignes `prepared` sans provider_ref).
  async function sendPaperLetter(req, res, lang) {
    const userId = req.user.id
    const templateId = req.body.template_id

    // ── 2. Kill switch du canal ───────────────────────────────────────────────────────────
    // Déjà appliqué par le middleware `channelKillSwitch` (monté avant le limiteur) : arriver ici
    // signifie que PAPER_SENDS_ENABLED vaut exactement 'true'.
    if (!paperSender) {
      // Router construit sans adaptateur (usage isolé) : même verdict que l'absence de clé API.
      return res.status(503).json({ success: false, error: msg(lang, 'paper_not_configured'), code: 'PAPER_NOT_CONFIGURED' })
    }

    // ── 3. Profil expéditeur ──────────────────────────────────────────────────────────────
    // Lu avec le client AU TOKEN de l'utilisateur : la policy owner de sender_profiles fait le
    // filtrage, le eq(user_id) explicite n'est qu'une défense en profondeur (convention du repo).
    const { data: profile, error: profileError } = await req.supabaseClient
      .from('sender_profiles')
      .select('full_name, address_line1, address_line2, postal_code, city')
      .eq('user_id', userId)
      .maybeSingle()
    if (profileError) {
      throw new Error(`Lecture du profil expéditeur impossible : ${profileError.message}`)
    }
    if (!profile) {
      return res.status(400).json({
        success: false,
        error: msg(lang, 'sender_profile_required'),
        code: 'SENDER_PROFILE_REQUIRED',
      })
    }
    const senderAddress = {
      name: profile.full_name,
      address_line1: profile.address_line1,
      postal_code: profile.postal_code,
      city: profile.city,
    }
    if (profile.address_line2) senderAddress.address_line2 = profile.address_line2
    try {
      // `sender_profiles` contraint déjà les lignes d'adresse à 45 caractères… SAUF `full_name`
      // (aucun CHECK de longueur en base). Sans cette vérification ICI, un nom trop long serait
      // découvert par l'adaptateur APRÈS le débit du quota, pour une raison que l'utilisateur ne
      // peut corriger que dans son profil : on la remonte avant d'engager quoi que ce soit.
      validateAddress(senderAddress, 'sender')
    } catch (error) {
      if (error?.code !== 'invalid_address') throw error
      return res.status(400).json({
        success: false,
        error: msg(lang, 'sender_profile_invalid'),
        code: 'SENDER_PROFILE_INVALID',
        field: error.field,
      })
    }

    // ── 4. Adresse du destinataire ────────────────────────────────────────────────────────
    // TOUJOURS fournie par le client, y compris pour les organismes d'un réseau : l'annuaire ne
    // sert qu'au pré-remplissage (GET /organisations), l'adresse reste éditable (spec §7) et
    // c'est celle qui part. Refusée, jamais tronquée (§M).
    const recipient = pickRecipientAddress(req.body.recipient)
    try {
      validateAddress(recipient, 'recipient')
    } catch (error) {
      if (error?.code !== 'invalid_address') throw error
      return res.status(400).json({
        success: false,
        error: msg(lang, 'invalid_recipient_address'),
        code: 'INVALID_RECIPIENT_ADDRESS',
        field: error.field,
      })
    }

    // ── 5. Corps regénéré côté serveur (D2) ───────────────────────────────────────────────
    // Le client n'envoie QUE template_id + variables : aucun corps libre n'est accepté ni même
    // lu. Un `resolved_body` présent dans le payload est purement et simplement ignoré.
    let letter
    try {
      letter = renderLetter(templateId, req.body.variables ?? {})
    } catch (error) {
      if (error?.code === 'unknown_template') {
        return res.status(404).json({ success: false, error: msg(lang, 'unknown_template') })
      }
      if (error?.code === 'unresolved_variables') {
        // Le template lui-même référence une clé jamais dérivée : bug de catalogue, pas une
        // erreur utilisateur — on le signale, sans imprimer un courrier troué.
        Sentry.captureException(error)
        return res.status(400).json({ success: false, error: msg(lang, 'letter_incomplete'), code: 'LETTER_INCOMPLETE' })
      }
      throw error
    }
    if (letter.missingVariables.length > 0) {
      return res.status(400).json({
        success: false,
        error: msg(lang, 'letter_missing_variables'),
        code: 'MISSING_VARIABLES',
        missing_variables: letter.missingVariables,
      })
    }

    // ── 6. Pièces jointes ─────────────────────────────────────────────────────────────────
    const attachmentIds = req.body.attachment_ids ?? []
    if (!Array.isArray(attachmentIds)) {
      return res.status(400).json({ success: false, error: msg(lang, 'letters_missing_fields') })
    }
    if (attachmentIds.length > MAX_ATTACHMENTS) {
      return res.status(400).json({
        success: false,
        error: msg(lang, 'attachments_too_many'),
        code: 'TOO_MANY_ATTACHMENTS',
      })
    }
    // Doublon dans la sélection (revue finale, mineur) : sans cette garde, le contrôle RLS
    // ci-dessous (byId.size !== new Set(...).size) ne le détecte PAS — un id répété reste un
    // singleton dans les deux ensembles comparés — et la même pièce partirait deux fois dans la
    // fusion provider (payload PDF gonflé, `attachment_ids` persisté avec le doublon).
    if (new Set(attachmentIds).size !== attachmentIds.length) {
      return res.status(400).json({
        success: false,
        error: msg(lang, 'attachments_duplicate'),
        code: 'DUPLICATE_ATTACHMENTS',
      })
    }
    let attachments = []
    if (attachmentIds.length > 0) {
      // Un id mal formé n'existe par construction pas : 404 sans interroger la base (un uuid
      // invalide y provoquerait une erreur de syntaxe Postgres remontée en 500).
      if (!attachmentIds.every((id) => typeof id === 'string' && UUID_RE.test(id))) {
        return res.status(404).json({ success: false, error: msg(lang, 'attachment_not_found'), code: 'ATTACHMENT_NOT_FOUND' })
      }
      const { data: rows, error: attachmentsError } = await req.supabaseClient
        .from('attachments')
        .select('id, storage_path, mime, filename')
        .eq('user_id', userId)
        .in('id', attachmentIds)
      if (attachmentsError) {
        throw new Error(`Lecture des pièces jointes impossible : ${attachmentsError.message}`)
      }
      const byId = new Map((rows ?? []).map((row) => [row.id, row]))
      // La RLS a déjà écarté les pièces d'un tiers : il en manque donc forcément à l'appel.
      // Réponse volontairement identique à celle d'un id inexistant — aucune information sur
      // l'existence du document d'autrui.
      if (byId.size !== new Set(attachmentIds).size) {
        return res.status(404).json({ success: false, error: msg(lang, 'attachment_not_found'), code: 'ATTACHMENT_NOT_FOUND' })
      }
      if ([...byId.values()].some((row) => !ATTACHMENT_MIMES.has(row.mime))) {
        return res.status(400).json({ success: false, error: msg(lang, 'attachments_invalid_type'), code: 'ATTACHMENT_INVALID_TYPE' })
      }
      try {
        // Ordre du client préservé (l'acte de décès est mis en tête par le panneau d'envoi) :
        // MySendingBox fusionne les fichiers dans l'ordre reçu.
        attachments = await Promise.all(attachmentIds.map((id) => downloadAttachment(req, byId.get(id))))
      } catch (error) {
        // Notre propre Storage est inaccessible : incident serveur, pas une faute de l'utilisateur
        // — et, à ce stade, rien n'a encore été écrit ni débité.
        console.error('❌ letters/send papier — pièces jointes :', error?.message ?? error)
        Sentry.captureException(error)
        return res.status(500).json({
          success: false,
          error: msg(lang, 'attachment_fetch_failed'),
          code: 'ATTACHMENT_FETCH_FAILED',
        })
      }
    }

    // ── 7. Plafonds de dépense puis création de la ligne ──────────────────────────────────
    // Double contrôle assumé : la façade en amont rend un 429 explicite, la RPC de création
    // refait le test en dernier ressort (aucune route ne peut la contourner). Les deux chemins
    // aboutissent au même verdict — dont la capture Sentry (spec §5).
    const limits = await store.checkSendLimits(req.supabaseClient, userId)
    if (limits && limits !== 'ok') return sendLimitReached(res, lang, limits)

    const resendOf = typeof req.body.resend_of === 'string' && UUID_RE.test(req.body.resend_of) ? req.body.resend_of : null
    let created
    try {
      created = await store.createSend(req.supabaseClient, {
        user_id: userId,
        step_id: req.body.step_id ?? null,
        template_id: templateId,
        channel: PAPER_CHANNEL,
        status: 'prepared',
        provider: PAPER_PROVIDER,
        recipient,
        dedup_key: paperDedupKey({ userId, templateId, recipient, resendOf }),
        resend_of: resendOf,
        attachment_ids: attachmentIds.length > 0 ? attachmentIds : null,
      })
    } catch (error) {
      const code = error?.code
      if (code === 'user_daily_exceeded' || code === 'global_daily_exceeded') return sendLimitReached(res, lang, code)
      if (code === 'invalid_resend_of') {
        return res.status(400).json({ success: false, error: msg(lang, 'invalid_resend_of'), code: 'INVALID_RESEND_OF' })
      }
      if (code === 'resend_already_exists') {
        // Un seul re-envoi offert par original (index unique partiel, spec §7).
        return res.status(409).json({ success: false, error: msg(lang, 'resend_already_exists'), code: 'RESEND_ALREADY_EXISTS' })
      }
      throw error
    }

    // ── 7 bis. Reprise d'un envoi bloqué (correctif C1 de la revue Task 9) ────────────────
    // Le dedup_key protège d'un second pli, mais il ne doit pas transformer un échec en cul-de-sac
    // définitif : sans reprise, un courrier refusé pour quota épuisé (402) ou par une panne du
    // provider restait bloqué POUR TOUJOURS — l'utilisateur avait payé un envoi qu'il ne pouvait
    // plus faire partir, et rien dans l'UI ne pouvait l'en sortir.
    //
    // TROIS VERROUS rendent la reprise sûre, et aucun ne dépend des deux autres :
    //  (1) ROUTE : on ne reprend QUE `prepared`/`failed` SANS provider_ref. Dès qu'une référence
    //      existe, le pli EXISTE chez MySendingBox (peut-être déjà imprimé, affranchi, posté) —
    //      c'est un 409 sec, jamais une nouvelle soumission ;
    //  (2) BASE : `claim_letter_retry` refait le test (`channel = 'email' or provider_ref is
    //      null`) et rend le claim ATOMIQUE — deux reprises concurrentes, une seule gagne ;
    //  (3) PROVIDER : la reprise garde la MÊME ligne, donc le même send.id, donc la même
    //      Idempotency-Key (dérivée de l'id) — même si un POST perdu avait en fait été accepté,
    //      MySendingBox reconnaît la clé et ne crée pas de second courrier.
    // Le débit, lui, est idempotent par construction (send_debits.send_id est la PK) : une reprise
    // après libération re-débite correctement, une reprise sans libération ne débite pas deux fois.
    let send = created.send
    if (created.duplicate) {
      const status = created.send.status
      const resumable = !created.send.provider_ref && (status === 'prepared' || status === 'failed')
      if (!resumable) {
        return res.status(409).json({
          success: false,
          error: msg(lang, 'send_already_exists'),
          code: 'SEND_ALREADY_EXISTS',
          send: created.send,
        })
      }
      // ── Legs R2 (revue Task 9) : PJ figées sur une reprise ────────────────────────────────
      // Le dedup_key protège la reprise d'un envoi bloqué, mais une reprise n'est PAS une
      // occasion de changer ce qui a été (ou sera) posté : si les `attachment_ids` du body
      // diffèrent de ceux persistés sur la ligne d'origine, on refuse AVANT tout claim — la
      // traçabilité de « ce qui a été posté » prime sur une commodité UI. Comparaison en
      // ENSEMBLE (ordre insensible) : seule l'identité du dossier joint compte ici.
      if (!sameAttachmentIdSet(attachmentIds, created.send.attachment_ids)) {
        return res.status(409).json({
          success: false,
          error: msg(lang, 'attachments_mismatch'),
          code: 'ATTACHMENTS_MISMATCH',
        })
      }
      // `prepared` = statut initial du canal : la ligne n'est claimable que si elle est PÉRIMÉE
      // (une autre requête est peut-être en train de soumettre en ce moment même). `failed` =
      // tentative constatée close : claim immédiat.
      const claimed = await store.claimRetry(req.supabaseClient, created.send.id, {
        allowStaleSending: status === 'prepared',
        staleSeconds: PAPER_STALE_SECONDS,
      })
      if (!claimed) {
        // Claim perdu : un envoi de ce courrier est en cours ailleurs (ou vient de l'être) — on
        // ne soumet rien. Même verdict et même message que le canal email dans ce cas.
        return res.status(409).json({ success: false, error: msg(lang, 'send_in_progress'), code: 'SEND_IN_PROGRESS' })
      }
      send = claimed
    }

    // ── 8. Débit atomique du quota, AVANT la soumission (spec §4) ─────────────────────────
    // Deux envois concurrents avec un seul crédit ne passent jamais tous les deux ; sur échec de
    // soumission, le débit est libéré (garde 9). Un re-envoi NPAI éligible est marqué 'offert'
    // par la RPC et ne consomme aucun crédit.
    try {
      await store.consumeSend(req.supabaseClient, send.id, userId)
    } catch (error) {
      if (error?.code === 'quota_exhausted') {
        return res.status(402).json({
          success: false,
          error: msg(lang, 'quota_exhausted'),
          code: 'QUOTA_EXHAUSTED',
          extra_send_available: isExtraSendAvailable(),
          support_email: process.env.SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL,
          // Legs R1 (revue Task 9) : la fenêtre pendant laquelle un retry post-achat reprend LA
          // MÊME ligne (garde 7 bis) sans qu'elle soit jugée périmée. Le front l'utilise pour
          // patienter avant de retenter automatiquement au retour du Checkout à l'acte, plutôt
          // que d'attendre une durée arbitraire.
          retry_after_seconds: PAPER_STALE_SECONDS,
        })
      }
      throw error
    }

    // ── 9. Soumission au provider ─────────────────────────────────────────────────────────
    let result
    try {
      // Le PDF ne porte QUE le corps (+ un bloc destinataire de courtoisie) : la page d'adresse
      // normée est ajoutée par MySendingBox (`address_placement: 'insert_blank_page'`) et
      // l'expéditeur imprimé par `print_sender_address` — le nom et l'adresse de l'utilisateur
      // figurent déjà dans la signature du corps via ses variables.
      const pdfBuffer = renderLetterPdf({ subject: letter.subject, body: letter.body, recipient })
      result = await paperSender.send({
        pdfBuffer,
        attachments,
        recipient,
        sender: senderAddress,
        // Le webhook provider retrouve la ligne par cette métadonnée, sans dépendre de notre
        // provider_ref (qui peut n'être pas encore écrit — course documentée §M).
        metadata: { seren_send_id: send.id },
        idempotencyKey: idempotencyKeyFor(send.id),
      })
    } catch (error) {
      return await handlePaperFailure({ req, res, lang, send, error })
    }

    // ── 10. Résultat : le pli est chez le provider ────────────────────────────────────────
    // À PARTIR D'ICI, PLUS JAMAIS DE LIBÉRATION DE DÉBIT : le pli existe, il sera imprimé et
    // affranchi même si la suite de cette requête échoue.
    try {
      const updated = await store.markSendResult(req.supabaseClient, send.id, {
        status: 'submitted',
        provider_ref: result.providerRef,
        error: null,
      })
      return res.status(202).json({ success: true, send: updated })
    } catch (error) {
      // Le pli est parti mais son résultat n'a pas pu être écrit : incident à rattraper à la
      // main (la resynchronisation de la Task 10 ne retrouve une ligne `prepared` que si elle
      // porte un provider_ref). On le signale explicitement, et on répond quand même 202 : dire
      // « échec » à l'utilisateur serait faux, et le pousserait à recommencer.
      console.error(`❌ letters/send papier — résultat non enregistré (send ${send.id}, provider_ref ${result.providerRef})`)
      Sentry.captureException(error, { tags: { stage: 'mark_letter_result', send_id: send.id, provider_ref: result.providerRef } })
      return res.status(202).json({ success: true, send: { ...send, status: 'submitted', provider_ref: result.providerRef } })
    }
  }

  /** Plafond de dépense atteint (spec §5) : 429 + capture Sentry — c'est un signal d'exploitation
   * (emballement, compte compromis, boucle côté client), pas un flux utilisateur normal. Aucun
   * identifiant personnel dans le message : seul le type de plafond est remonté. */
  function sendLimitReached(res, lang, code) {
    console.warn(`⚠️ letters/send papier : plafond atteint (${code})`)
    Sentry.captureException(new Error(`paper_send_limit_reached: ${code}`), { tags: { limit: code } })
    return res.status(429).json({ success: false, error: msg(lang, 'send_limit_reached'), code: 'SEND_LIMIT_REACHED' })
  }

  /** Télécharge une pièce jointe du coffre via une URL signée de courte durée, générée ICI et
   * jamais stockée ni exposée au client (spec §3.4 + note post-revue Tasks 5+6). La conversion
   * des images en PDF est faite par l'adaptateur (server/lib/paper-sender.js), qui connaît les
   * contraintes du provider. */
  async function downloadAttachment(req, row) {
    const { data, error } = await req.supabaseClient.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS)
    if (error || !data?.signedUrl) {
      throw new Error(`URL signée indisponible pour la pièce jointe ${row.id} : ${error?.message ?? 'réponse vide'}`)
    }
    const response = await fetchImpl(data.signedUrl)
    if (!response?.ok) {
      throw new Error(`Téléchargement de la pièce jointe ${row.id} impossible (HTTP ${response?.status ?? '?'})`)
    }
    return { buffer: Buffer.from(await response.arrayBuffer()), mime: row.mime, filename: row.filename }
  }

  /** La soumission n'a pas abouti. TROIS RÉGIMES, selon ce qu'on sait réellement du sort du pli
   * (correctif I1 de la revue Task 9 — le régime « incertain » manquait) :
   *
   *  • CERTAIN, rien n'est parti — `provider_rejected` (4xx : MySendingBox a lu la requête et l'a
   *    refusée) et `provider_unavailable` AVEC un `status` HTTP (5xx : la requête a bien atteint
   *    le provider, qui a échoué). Le débit est rendu (« pas de débit sur échec », spec §4), la
   *    ligne passe `failed` → 502 / 503.
   *  • INCERTAIN — `provider_unavailable` SANS `status` : c'est le fetch lui-même qui a rejeté
   *    (DNS, TCP coupé, timeout). Le POST a PEUT-ÊTRE été reçu et accepté : un courrier existe
   *    peut-être déjà, facturé. On ne rend donc RIEN et on ne déclare RIEN en échec — la ligne
   *    reste `prepared` avec son débit, et la reprise (garde 7 bis) la rattrapera avec la MÊME
   *    Idempotency-Key : si le pli existait, MySendingBox renvoie le même, sinon il le crée.
   *    Libérer le crédit ici reviendrait à offrir un courrier réellement affranchi ; le marquer
   *    `failed` fermerait la ligne sur un échec qui n'en est peut-être pas un.
   *  • CONFIGURATION — `paper_not_configured` (clé API absente) : rien n'a été tenté, le débit est
   *    rendu et la ligne reste `prepared`, comme le canal email laisse la sienne en `sending`.
   *
   * Aucune erreur de rattrapage ne doit masquer l'échec initial : les deux appels sont protégés. */
  async function handlePaperFailure({ req, res, lang, send, error }) {
    const code = error?.code
    const notConfigured = error?.message === 'paper_not_configured'
    // Un rejet de fetch ne porte pas de status HTTP : la requête n'a jamais reçu de réponse.
    const uncertain = code === 'provider_unavailable' && error?.status === undefined

    if (uncertain) {
      console.error(`⚠️ letters/send papier — résultat INCERTAIN (send ${send.id}) : débit conservé, ligne laissée prepared`)
      Sentry.captureException(error, { tags: { stage: 'provider_submit_uncertain', send_id: send.id } })
      return res.status(503).json({
        success: false,
        error: msg(lang, 'provider_unavailable'),
        code: 'PROVIDER_UNAVAILABLE',
        // Le front doit inviter à REPRENDRE ce courrier (même bouton, même ligne) plutôt qu'à en
        // créer un autre : la reprise est la seule manière de réconcilier un sort inconnu.
        retryable: true,
      })
    }

    // TOUJOURS avec le user_id de la requête : cette RPC rend un crédit, elle ne doit jamais
    // pouvoir toucher au débit d'un tiers (garde d'appartenance, letters-store.js).
    await store.releaseDebit(req.supabaseClient, send.id, req.user.id).catch((releaseError) => {
      console.error('❌ letters/send papier — libération du débit :', releaseError?.message ?? releaseError)
      Sentry.captureException(releaseError)
    })

    if (!notConfigured) {
      await store
        .markSendResult(req.supabaseClient, send.id, { status: 'failed', error: code ?? error?.message ?? 'paper_send_failed' })
        .catch((markError) => {
          console.error('❌ letters/send papier — marquage de l’échec :', markError?.message ?? markError)
          Sentry.captureException(markError)
        })
    }

    if (notConfigured) {
      return res.status(503).json({ success: false, error: msg(lang, 'paper_not_configured'), code: 'PAPER_NOT_CONFIGURED' })
    }
    console.error('❌ letters/send papier — soumission :', code ?? error?.message ?? error)
    Sentry.captureException(error)
    if (code === 'provider_unavailable') {
      return res.status(503).json({ success: false, error: msg(lang, 'provider_unavailable'), code: 'PROVIDER_UNAVAILABLE' })
    }
    return res.status(502).json({ success: false, error: msg(lang, 'send_failed'), code: 'SEND_FAILED' })
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // Compteur de quota (chantier 2a) — alimente « X envois restants » et l'offre à l'acte
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // Lectures directes avec le token de l'utilisateur : purchases et send_debits ont toutes deux
  // une policy SELECT owner, la RPC send_balance() est au contraire interne (révoquée) — elle
  // lirait le solde de n'importe qui à paramètre libre. Le calcul reproduit celui de la base :
  // solde = Σ included_sends des achats PAYÉS − débits comptés, jamais négatif (spec §4).
  router.get('/quota', requireAuth, requireActiveDossier, async (req, res) => {
    const lang = bodyLang(req)
    try {
      const quota = await readQuota(req.supabaseClient, req.user.id)
      return res.json({ success: true, ...quota })
    } catch (error) {
      console.error('❌ letters/quota :', error?.message ?? error)
      Sentry.captureException(error)
      return res.status(500).json({ success: false, error: msg(lang, 'letters_quota_error') })
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // Annuaire des organismes (chantier 2a) — pré-remplissage de l'adresse destinataire
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // Simple SELECT sur une table publique en lecture authentifiée. Deux usages :
  //  • `network` + `department` → la caisse locale du défunt (CAF, CPAM, centre des finances) ;
  //  • `network` seul → la liste complète, indispensable à la CARSAT : ses 20 caisses sont
  //    RÉGIONALES (department null, note post-revue Task 2) et l'utilisateur choisit la sienne
  //    par son nom de région — aucun mapping région↔départements n'est inventé ici.
  // L'adresse renvoyée n'est qu'une proposition : celle qui part est celle du corps de POST /send.
  router.get('/organisations', requireAuth, requireActiveDossier, async (req, res) => {
    const lang = bodyLang(req)
    try {
      const network = String(req.query.network ?? '')
      if (!NETWORKS.has(network)) {
        return res.status(400).json({ success: false, error: msg(lang, 'invalid_network'), code: 'INVALID_NETWORK' })
      }
      let query = req.supabaseClient
        .from('organisations')
        .select('id, name, network, department, address_line1, address_line2, postal_code, city, verified_at')
        .eq('network', network)
      if (req.query.department) query = query.eq('department', String(req.query.department))

      const { data, error } = await query.order('name', { ascending: true })
      if (error) throw new Error(`Lecture de l'annuaire impossible : ${error.message}`)
      return res.json({ success: true, organisations: data ?? [] })
    } catch (error) {
      console.error('❌ letters/organisations :', error?.message ?? error)
      Sentry.captureException(error)
      return res.status(500).json({ success: false, error: msg(lang, 'organisations_error') })
    }
  })

  router.get('/', requireAuth, requireActiveDossier, async (req, res) => {
    try {
      const sends = await store.listSends(req.supabaseClient, req.user.id)
      res.json({ success: true, sends })
    } catch (error) {
      console.error('❌ letters/list :', error)
      Sentry.captureException(error)
      res.status(500).json({ success: false, error: msg(bodyLang(req), 'letters_list_error') })
    }
  })

  // Webhook Resend — statuts delivered/bounced. PUBLIC (pas de requireAuth : Resend n'a pas de
  // session utilisateur) ; la véracité vient UNIQUEMENT de la signature Svix vérifiée
  // ci-dessous. express.raw() en middleware DE ROUTE : la vérification exige le corps BRUT
  // (octet pour octet), pas le JSON reparsé. Suffisant quand le router est utilisé seul (tests) ;
  // en production, server.js monte le même express.raw() sur ce chemin AVANT le express.json()
  // global, sinon body-parser aurait déjà consommé le flux avant d'atteindre cette route (le
  // second parseur voit req._body déjà à true et laisse req.body inchangé — un objet JS, plus
  // le Buffer attendu ici).
  // Pas de rate limiter sur cette route — délibéré : la vérification svix échoue à coût
  // quasi nul (un HMAC), et un plafond global pénaliserait les retries légitimes de Resend.
  router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET
    if (!secret) {
      return res.status(503).json({ success: false, error: 'webhook_not_configured' })
    }

    const valid = verifySvixSignature({
      secret,
      svixId: req.headers['svix-id'],
      svixTimestamp: req.headers['svix-timestamp'],
      svixSignature: req.headers['svix-signature'],
      rawBody: req.body,
    })
    if (!valid) {
      return res.status(401).json({ success: false, error: 'invalid_signature' })
    }

    let payload
    try {
      payload = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body)
    } catch {
      // Signature valide mais JSON malformé : ne devrait jamais arriver côté Resend — jamais de
      // 500 sur un webhook signé (Resend réessaierait indéfiniment).
      console.warn('⚠️ letters/webhook : payload JSON invalide malgré signature valide')
      return res.status(200).json({ success: true })
    }

    const status = RESEND_EVENT_STATUS[payload?.type]
    const providerRef = payload?.data?.email_id
    if (!status || !providerRef) {
      // Jamais le corps du payload dans les logs (PII potentielles côté destinataire) — juste
      // le type d'événement.
      console.warn(`⚠️ letters/webhook : événement ignoré (${payload?.type ?? 'type inconnu'})`)
      return res.status(200).json({ success: true })
    }

    try {
      await store.updateSendByProviderRef(publicClient, providerRef, {
        status,
        delivered_at: status === 'delivered' ? new Date().toISOString() : null,
        error: status === 'failed' ? (payload?.data?.reason ?? payload?.data?.error ?? 'bounced') : null,
      })
    } catch (error) {
      // Idem : jamais de 500 sur un webhook signé valide, même si la mise à jour échoue
      // (BDD indisponible…) — on logue côté serveur et on acquitte quand même.
      console.error('❌ letters/webhook — mise à jour du statut :', error)
      Sentry.captureException(error)
    }

    return res.status(200).json({ success: true })
  })

  return router
}

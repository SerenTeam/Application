// Coffre minimal — pièces jointes des envois papier (chantier 2a). Router injecté (comme
// server/routes/letters.js) : testable avec supertest sans Supabase ni Storage réel. Contrat :
// docs/design-chantier-2a-envoi-papier.md §3.4 ; docs/plan-chantier-2a-envoi-papier.md, Task 6 ;
// table `attachments` + bucket privé `documents` : supabase/migrations/20260914160000_attachments.sql.
//
// Aucun store dédié (contrairement à letters-store.js) : `attachments` garde de vraies policies
// RLS owner (SELECT/INSERT/DELETE), donc le client au token utilisateur (req.supabaseClient,
// posé par requireAuth) suffit — pas de RPC `security definer` nécessaire ici, une pièce jointe
// n'étant pas une pièce probante financière comme letter_sends/purchases.
//
// JAMAIS d'URL signée renvoyée par ce router : elles seront générées à l'envoi (Task 9), à durée
// courte, jamais stockées ni exposées en clair au front en dehors de ce moment précis.
import { Router } from 'express'
import crypto from 'crypto'
import multer from 'multer'
import * as Sentry from '@sentry/node'
import { sniffMime } from '../lib/mime-sniff.js'
import { msg } from '../lib/messages.js'
import { createUserRateLimiter } from '../lib/rate-limit.js'
import { FAIL_CLOSED_GATE } from '../lib/require-active-dossier.js'
import { killSwitch } from '../lib/flags.js'

const BUCKET = 'documents'
// Miroir du CHECK size_bytes <= 5242880 de la migration : on veut un 413 propre AVANT toute
// écriture Storage/BDD, pas une exception SQL tardive.
const MAX_SIZE_BYTES = 5 * 1024 * 1024
const KINDS = new Set(['acte_deces', 'justificatif'])
// Plafond de pièces jointes par utilisateur (revue Task 5+6, I2) : un coffre n'est pas illimité,
// même borné en taille unitaire — 20 couvre largement acte de décès + justificatifs d'un dossier.
const MAX_ATTACHMENTS_PER_USER = 20
// Format uuid v4 (et plus largement RFC 4122) attendu pour :id — vérifié AVANT toute requête
// (revue Task 5+6, M5) : un id mal formé ferait sinon échouer la requête Postgres avec
// `invalid input syntax for type uuid`, remontée en 500 alors que c'est un 404 tout simple
// (l'id n'existe pas, quelle que soit sa forme).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Extension dérivée du mime CANONIQUE (détecté par magic bytes), jamais du nom de fichier fourni
// par le client — ceinture et bretelles avec le sniff lui-même.
const EXT_BY_MIME = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

/** Langue de la requête : ce router n'a pas de session, seul le corps peut la porter (patron
 * bodyLang() de server/routes/letters.js). Repli 'fr'. */
function bodyLang(req) {
  return req.body?.lang === 'en' ? 'en' : 'fr'
}

/** Nom de fichier assaini : basename seul (ni chemin ni traversal — un client pourrait envoyer
 * "../../etc/passwd" comme originalname), caractères sûrs uniquement. Ce nom n'est JAMAIS utilisé
 * comme storage_path (voir plus bas, uuid généré serveur) — il ne sert qu'à l'affichage/au
 * téléchargement final, mais doit rester inoffensif en toute circonstance (logs, en-têtes HTTP). */
function sanitizeFilename(name) {
  const base = String(name ?? '').split(/[\\/]/).pop() ?? ''
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 150)
  return cleaned || 'fichier'
}

const uploadSingle = multer({
  storage: multer.memoryStorage(),
  // files/fields : un seul fichier, une poignée de champs (kind, lang…) — ferme la porte à un
  // client qui tenterait de faire bufferiser plusieurs fichiers ou un déluge de champs avant
  // même que le handler applicatif ne s'exécute (revue Task 5+6, I2).
  limits: { fileSize: MAX_SIZE_BYTES, files: 1, fields: 5 },
}).single('file')

/** Multer lève ses erreurs (taille, champ inattendu…) de façon synchrone dans son callback,
 * jamais via next(err) automatiquement — on les traduit nous-mêmes en réponse HTTP propre plutôt
 * que de laisser passer une erreur non gérée. */
function handleUpload(req, res, next) {
  uploadSingle(req, res, (err) => {
    if (!err) return next()
    const lang = bodyLang(req)
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, error: msg(lang, 'attachments_too_large') })
    }
    if (typeof err.code === 'string' && err.code.startsWith('LIMIT_')) {
      // Autres limites multer (trop de fichiers/champs, champ inattendu…) : erreur CLIENT
      // (requête mal formée), jamais un incident serveur — pas de bruit Sentry pour ça
      // (revue Task 5+6, M4).
      return res.status(400).json({ success: false, error: msg(lang, 'attachments_upload_error') })
    }
    console.error('❌ attachments/upload — multer :', err)
    Sentry.captureException(err)
    return res.status(400).json({ success: false, error: msg(lang, 'attachments_upload_error') })
  })
}

export function createAttachmentsRouter({
  requireAuth,
  // Gate v2 (contrat §4.2) : défaut FAIL-CLOSED (A5) — les tests injectent un passe-plat explicite.
  requireActiveDossier = FAIL_CLOSED_GATE,
}) {
  const router = Router()

  // Coffre ouvert seulement avec le canal papier (contrat §5, D3) : sans antivirus ni rétention
  // (chantier 3), aucun dépôt tant que PAPER_SENDS_ENABLED n'est pas 'true'. Monté AVANT le
  // limiteur et AVANT multer : un refus ne bufferise aucun fichier et ne consomme aucun quota.
  const attachmentsKillSwitch = killSwitch('PAPER_SENDS_ENABLED', { code: 'ATTACHMENTS_DISABLED', messageKey: 'attachments_disabled' })

  // 30/h par utilisateur : un dépôt de pièce jointe est un geste ponctuel (acte de décès,
  // justificatif), jamais un flux automatisé — large marge pour un dossier complet en une
  // session, coupe court à un abus (bufferisation répétée en mémoire). Monté APRÈS requireAuth
  // (dépend de req.user.id) et AVANT handleUpload : une requête qu'on va refuser ne doit jamais
  // faire bufferiser son fichier en mémoire au préalable (revue Task 5+6, I2).
  const uploadLimiter = createUserRateLimiter({
    max: 30,
    windowMs: 60 * 60 * 1000,
    message: (req) => msg(bodyLang(req), 'too_many_requests'),
  })

  router.post('/', requireAuth, requireActiveDossier, attachmentsKillSwitch, uploadLimiter, handleUpload, async (req, res) => {
    const lang = bodyLang(req)
    try {
      const file = req.file
      const kind = req.body?.kind
      if (!file) {
        return res.status(400).json({ success: false, error: msg(lang, 'attachments_missing_file') })
      }
      if (!KINDS.has(kind)) {
        return res.status(400).json({ success: false, error: msg(lang, 'attachments_invalid_kind') })
      }

      // Aucune confiance dans file.mimetype (déclaré par le client) ni dans l'extension du nom
      // d'origine : seuls les octets font foi.
      const mime = sniffMime(file.buffer)
      if (!mime) {
        return res.status(415).json({ success: false, error: msg(lang, 'attachments_invalid_type') })
      }

      // Plafond de pièces jointes (revue Task 5+6, I2) : vérifié APRÈS la validation du fichier
      // (pas la peine de compter pour un fichier de toute façon refusé) mais AVANT tout upload
      // Storage — un compte au-delà du plafond ne doit jamais atteindre le bucket.
      const { count, error: countError } = await req.supabaseClient
        .from('attachments')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', req.user.id)
      if (countError) {
        console.error('❌ attachments/upload — comptage :', countError)
        Sentry.captureException(countError)
        return res.status(500).json({ success: false, error: msg(lang, 'attachments_upload_error') })
      }
      if ((count ?? 0) >= MAX_ATTACHMENTS_PER_USER) {
        return res.status(409).json({ success: false, error: msg(lang, 'attachments_quota_reached') })
      }

      const safeFilename = sanitizeFilename(file.originalname)
      const ext = EXT_BY_MIME[mime]
      const storagePath = `${req.user.id}/${crypto.randomUUID()}.${ext}`

      const { error: uploadError } = await req.supabaseClient.storage
        .from(BUCKET)
        .upload(storagePath, file.buffer, { contentType: mime, upsert: false })
      if (uploadError) {
        console.error('❌ attachments/upload — storage :', uploadError)
        Sentry.captureException(uploadError)
        return res.status(500).json({ success: false, error: msg(lang, 'attachments_upload_error') })
      }

      const { data: row, error: insertError } = await req.supabaseClient
        .from('attachments')
        .insert({
          user_id: req.user.id,
          kind,
          storage_path: storagePath,
          filename: safeFilename,
          mime,
          size_bytes: file.size,
        })
        .select()
        .single()

      if (insertError) {
        // La ligne BDD n'a pas pu être créée : purge le fichier orphelin plutôt que de laisser un
        // objet Storage sans trace applicative (best-effort — une erreur ici ne doit pas masquer
        // le 500 déjà décidé sur l'échec d'insert).
        await req.supabaseClient.storage.from(BUCKET).remove([storagePath]).catch(() => {})
        console.error('❌ attachments/upload — insert :', insertError)
        Sentry.captureException(insertError)
        return res.status(500).json({ success: false, error: msg(lang, 'attachments_upload_error') })
      }

      return res.status(201).json({
        success: true,
        attachment: { id: row.id, kind: row.kind, filename: row.filename, size: row.size_bytes },
      })
    } catch (error) {
      console.error('❌ attachments/upload :', error)
      Sentry.captureException(error)
      return res.status(500).json({ success: false, error: msg(lang, 'attachments_upload_error') })
    }
  })

  router.get('/', requireAuth, requireActiveDossier, async (req, res) => {
    try {
      const { data, error } = await req.supabaseClient
        .from('attachments')
        .select('id, kind, filename, mime, size_bytes, created_at')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return res.json({ success: true, attachments: data ?? [] })
    } catch (error) {
      console.error('❌ attachments/list :', error)
      Sentry.captureException(error)
      return res.status(500).json({ success: false, error: msg(bodyLang(req), 'attachments_list_error') })
    }
  })

  router.delete('/:id', requireAuth, requireActiveDossier, async (req, res) => {
    const lang = bodyLang(req)
    try {
      if (!UUID_RE.test(req.params.id)) {
        // Jamais interrogé en base : un id mal formé n'existe par construction pas — 404
        // directement plutôt qu'une erreur Postgres `invalid input syntax for type uuid`
        // remontée en 500 (revue Task 5+6, M5).
        return res.status(404).json({ success: false, error: msg(lang, 'attachments_not_found') })
      }
      const { data: row, error: fetchError } = await req.supabaseClient
        .from('attachments')
        .select('id, storage_path, user_id')
        .eq('id', req.params.id)
        .maybeSingle()
      if (fetchError) throw fetchError
      // La RLS (policy "own attachments select") a déjà filtré une ligne d'un tiers en amont —
      // cette vérification explicite est une deuxième garde, pas la seule.
      if (!row || row.user_id !== req.user.id) {
        return res.status(404).json({ success: false, error: msg(lang, 'attachments_not_found') })
      }

      // Storage D'ABORD, ligne ENSUITE : si l'ordre était inversé et que la suppression Storage
      // échouait après coup, l'utilisateur croirait le document supprimé alors qu'il resterait
      // dans le bucket, orphelin et indétectable depuis l'app.
      const { error: removeError } = await req.supabaseClient.storage.from(BUCKET).remove([row.storage_path])
      if (removeError) {
        console.error('❌ attachments/delete — storage :', removeError)
        Sentry.captureException(removeError)
        return res.status(500).json({ success: false, error: msg(lang, 'attachments_delete_error') })
      }

      const { error: deleteError } = await req.supabaseClient.from('attachments').delete().eq('id', row.id)
      if (deleteError) throw deleteError

      return res.json({ success: true })
    } catch (error) {
      console.error('❌ attachments/delete :', error)
      Sentry.captureException(error)
      return res.status(500).json({ success: false, error: msg(lang, 'attachments_delete_error') })
    }
  })

  return router
}

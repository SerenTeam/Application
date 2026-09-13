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

const BUCKET = 'documents'
// Miroir du CHECK size_bytes <= 5242880 de la migration : on veut un 413 propre AVANT toute
// écriture Storage/BDD, pas une exception SQL tardive.
const MAX_SIZE_BYTES = 5 * 1024 * 1024
const KINDS = new Set(['acte_deces', 'justificatif'])
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
  limits: { fileSize: MAX_SIZE_BYTES },
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
    console.error('❌ attachments/upload — multer :', err)
    Sentry.captureException(err)
    return res.status(400).json({ success: false, error: msg(lang, 'attachments_upload_error') })
  })
}

export function createAttachmentsRouter({ requireAuth }) {
  const router = Router()

  router.post('/', requireAuth, handleUpload, async (req, res) => {
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

  router.get('/', requireAuth, async (req, res) => {
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

  router.delete('/:id', requireAuth, async (req, res) => {
    const lang = bodyLang(req)
    try {
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

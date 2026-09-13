// Persistance des envois de courriers (table letter_sends) — cycle papier (chantier 2a).
// Depuis la migration 20260914120000_letter_sends_papier.sql (bloc 3), letter_sends est une
// table LECTURE SEULE pour son owner : plus aucune écriture directe n'est possible, même avec
// le token utilisateur (RLS : SELECT owner uniquement). createSend/claimRetry/markSendResult
// passent donc par les RPC `security definer` de cette migration (même patron que
// purchases-store.js : secret partagé WEBHOOK_RPC_SECRET ↔ table webhook_config, vérifié PAR LA
// BASE — PostgREST expose sinon toute fonction du schéma public à quiconque détient la clé
// publishable). listSends reste une lecture directe (SELECT owner conservé) ;
// updateSendByProviderRef (webhook Resend v1) était déjà sur ce patron et ne change pas.
//
// Les 8 exceptions nommées levées par les RPC neuves (cf. migration, section CODES D'ERREUR)
// sont traduites ici en LetterStoreError (`.code`) : les routes (Task 9) les distinguent ainsi
// sans reparser un message Postgres. Une transition refusée n'est PAS une exception — c'est le
// chemin forward-only silencieux documenté dans la migration : mark_letter_result renvoie
// `transition_applied: false` (métadonnées écrites quand même), update_letter_send_status
// renvoie simplement `false`.

import * as Sentry from '@sentry/node'

const TABLE = 'letter_sends'

// Secret partagé RPC (env WEBHOOK_RPC_SECRET ↔ ligne webhook_config). Absent côté serveur → on
// lève AVANT tout appel réseau (mieux vaut un échec franc qu'un no-op silencieux sur une écriture
// qui peut débiter de l'argent réel) ; le message ne contient jamais les paramètres de l'appel
// (adresse, contenu du courrier…), seulement le nom de l'action tentée.
function requireSecret(actionLabel) {
  const rpcSecret = process.env.WEBHOOK_RPC_SECRET
  if (!rpcSecret) {
    console.error(`❌ letters-store : WEBHOOK_RPC_SECRET manquant — ${actionLabel} impossible (configurer la variable d'environnement et la ligne webhook_config)`)
    throw new Error('WEBHOOK_RPC_SECRET manquant')
  }
  return rpcSecret
}

// Les 8 exceptions nommées de la migration. invalid_secret peut survenir même quand le serveur
// PENSE avoir un secret valide (désynchronisation avec la valeur en base, rotation en cours) :
// c'est pourquoi elle est traduite ici comme les 7 autres, en plus de la garde requireSecret().
const NAMED_RPC_ERRORS = new Set([
  'invalid_secret',
  'send_not_found',
  'invalid_initial_status',
  'invalid_resend_of',
  'resend_already_exists',
  'quota_exhausted',
  'user_daily_exceeded',
  'global_daily_exceeded',
])

/** Erreur applicative distinguable par `.code` (une des 8 valeurs de NAMED_RPC_ERRORS). */
export class LetterStoreError extends Error {
  constructor(code) {
    super(code)
    this.name = 'LetterStoreError'
    this.code = code
  }
}

// Traduit une erreur Supabase (RPC) : LetterStoreError si le message est une des 8 exceptions
// nommées, sinon Error générique préfixée (patron des messages déjà en place : "<action
// impossible> : <détail>"). invalid_secret déclenche systématiquement une capture Sentry — un
// secret invalide présenté à une RPC security definer qui débite de l'argent réel (consume_send)
// ou écrit un statut probant est un signal fort à lui seul, pas besoin d'un compteur de rafale
// ici : le dashboard Sentry montre la rafale telle quelle. `rpcName` est posé en tag (jamais dans
// le message) pour distinguer les issues Sentry par RPC plutôt que de tout regrouper sous un seul
// groupe « invalid_secret ». Les autres exceptions nommées (ex. quota_exhausted) sont des flux
// utilisateur normaux, pas des incidents — aucune capture.
function translateRpcError(error, fallbackMessage, rpcName) {
  const code = typeof error?.message === 'string' ? error.message.trim() : null
  if (code && NAMED_RPC_ERRORS.has(code)) {
    const appError = new LetterStoreError(code)
    if (code === 'invalid_secret') {
      Sentry.captureException(appError, { tags: { rpc: rpcName } })
    }
    return appError
  }
  return new Error(`${fallbackMessage} : ${error?.message ?? 'réponse vide'}`)
}

// ─── create_letter_send ──────────────────────────────────────────────────────────────────────
// Remplace l'INSERT direct (impossible depuis le durcissement RLS). La RPC reproduit à
// l'identique le contrat historique de createSend : { duplicate, send } dans les deux cas
// (création ou dedup_key déjà présent) — les routes ne testent que la vérité de `duplicate`, la
// présence explicite de `duplicate: false` sur le chemin de création est un ajout sans effet
// observable pour elles.
export async function createSend(client, fields) {
  const { data, error } = await client.rpc('create_letter_send', {
    p_secret: requireSecret('création de l’envoi'),
    p_user_id: fields.user_id,
    p_template_id: fields.template_id,
    p_channel: fields.channel,
    p_dedup_key: fields.dedup_key,
    p_step_id: fields.step_id ?? null,
    p_status: fields.status ?? null,
    p_provider: fields.provider ?? null,
    p_recipient: fields.recipient ?? null,
    p_resend_of: fields.resend_of ?? null,
    p_attachment_ids: fields.attachment_ids ?? null,
    p_cost_cents: fields.cost_cents ?? null,
  })
  if (error) throw translateRpcError(error, 'Création de l’envoi impossible', 'create_letter_send')
  // Garde défensive (revue 5+6, M1) : sans elle, un `data` malformé (RPC muette, réponse vide
  // sans erreur) se propagerait tel quel jusqu'à un `.send.id` en aval, avec un TypeError opaque
  // loin de sa cause réelle — l'anomalie est signalée ICI, à la frontière du store.
  if (!data?.send) throw new Error('Création de l’envoi impossible : réponse RPC invalide (send manquant)')
  return data
}

// ─── claim_letter_retry ──────────────────────────────────────────────────────────────────────
// Claim atomique d'une nouvelle tentative (route POST /send, branche duplicata) — l'UPDATE
// conditionnel vit maintenant en base (correctif TOCTOU porté par la RPC). `staleSeconds`
// (optionnel) permet aux canaux plus lents que l'email (papier : PDF + pièces jointes) d'élargir
// la fenêtre de fraîcheur ; omis, la RPC applique son propre défaut (60 s).
export async function claimRetry(client, id, { allowStaleSending = false, staleSeconds } = {}) {
  const params = {
    p_secret: requireSecret('claim du retry'),
    p_id: id,
    p_allow_stale: allowStaleSending,
  }
  if (staleSeconds !== undefined) params.p_stale_seconds = staleSeconds
  const { data, error } = await client.rpc('claim_letter_retry', params)
  if (error) throw translateRpcError(error, 'Claim du retry impossible', 'claim_letter_retry')
  return data ?? null
}

// ─── mark_letter_result ──────────────────────────────────────────────────────────────────────
// Résultat immédiat d'une tentative d'envoi. La RPC renvoie { send, transition_applied} :
// déballée ici pour que l'appelant retrouve le contrat historique (la ligne à plat — .status,
// .provider_ref, etc. utilisables directement, comme avant le chantier 2a) tout en gagnant
// `transition_applied` (false = course avec le webhook provider, le statut le plus avancé a été
// conservé et les métadonnées écrites quand même — pas une erreur, cf. migration).
export async function markSendResult(client, id, patch) {
  const { data, error } = await client.rpc('mark_letter_result', {
    p_secret: requireSecret('mise à jour du résultat d’envoi'),
    p_id: id,
    p_status: patch.status,
    p_provider_ref: patch.provider_ref ?? null,
    p_sent_at: patch.sent_at ?? null,
    p_error: patch.error ?? null,
    p_cost_cents: patch.cost_cents ?? null,
  })
  if (error) throw translateRpcError(error, 'Mise à jour du résultat d’envoi impossible', 'mark_letter_result')
  // Garde défensive (revue 5+6, M1) : `data.send` était déréférencé sans garde — une réponse RPC
  // malformée (sans erreur mais sans `send`) levait un TypeError opaque au lieu d'un message
  // exploitable. L'anomalie est signalée ICI, à la frontière du store.
  if (!data?.send) throw new Error('Mise à jour du résultat d’envoi impossible : réponse RPC invalide (send manquant)')
  return { ...data.send, transition_applied: data.transition_applied }
}

export async function listSends(client, userId) {
  const { data, error } = await client
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Lecture des envois impossible : ${error.message}`)
  return data ?? []
}

// Appelée par la route webhook (canal email v1), sans session utilisateur — inchangée par le
// chantier 2a (même RPC réécrite à l'identique côté paramètres, même contrat : le store ignore
// la valeur booléenne de retour, la route webhook Resend n'en a jamais eu besoin).
export async function updateSendByProviderRef(client, providerRef, { status, delivered_at = null, error: sendError = null }) {
  const { error } = await client.rpc('update_letter_send_status', {
    p_secret: requireSecret('mise à jour du statut'),
    p_provider_ref: providerRef,
    p_status: status,
    p_delivered_at: delivered_at,
    p_error: sendError,
  })
  if (error) throw new Error(`Mise à jour du statut d'envoi impossible : ${error.message}`)
}

// ─── consume_send ────────────────────────────────────────────────────────────────────────────
// Débit atomique (spec §4) : vérifie le solde ET insère le débit dans la même transaction, AVANT
// toute soumission au provider. Retour passthrough — { debited, already_debited, source,
// free_resend, balance_after } — c'est à l'appelant (route Task 9) de décider de la suite (402
// sur quota_exhausted, offre de re-achat…), rien n'est interprété ici.
export async function consumeSend(client, sendId, userId) {
  const { data, error } = await client.rpc('consume_send', {
    p_secret: requireSecret('débit du quota'),
    p_send_id: sendId,
    p_user_id: userId,
  })
  if (error) throw translateRpcError(error, 'Débit du quota impossible', 'consume_send')
  return data
}

// ─── release_debit ───────────────────────────────────────────────────────────────────────────
// DELETE compensatoire, appelé quand la soumission au provider échoue APRÈS un débit réussi.
// `userId` est OBLIGATOIRE (garde d'appartenance) : cette fonction rend de l'argent, elle ne doit
// jamais pouvoir libérer le débit d'un tiers — TOUJOURS l'appeler avec le user_id de la requête
// en cours. `false` = rien à libérer (débit inexistant, ou envoi déjà engagé chez le provider) :
// ce n'est PAS une erreur, l'appelant n'a rien à rattraper.
// ⚠️ Revue 5+6 (I3) : la garde d'appartenance ne peut PAS reposer sur le seul `default null` côté
// SQL — un `userId` JS `undefined` disparaît silencieusement de l'objet envoyé à `client.rpc`
// (JSON ne sait pas sérialiser `undefined`), PostgREST retombe alors sur le défaut de la RPC et
// la clause d'appartenance devient vraie pour N'IMPORTE QUEL appelant. La garde est donc imposée
// ICI, en JS, avant tout appel réseau — pas seulement documentée en commentaire.
export async function releaseDebit(client, sendId, userId) {
  if (!userId) throw new Error('releaseDebit : user_id obligatoire (garde d’appartenance)')
  const { data, error } = await client.rpc('release_debit', {
    p_secret: requireSecret('libération du débit'),
    p_send_id: sendId,
    p_user_id: userId,
  })
  if (error) throw translateRpcError(error, 'Libération du débit impossible', 'release_debit')
  return Boolean(data)
}

// ─── record_provider_event / mark_provider_event_processed ─────────────────────────────────
// Le webhook MySendingBox est un ping non fiable (pas de signature documentée, spec §6) : on
// persiste l'événement brut avant tout traitement, PUIS on vérifie l'état par un GET provider.
// `recordProviderEvent` renvoie true pour un événement NOUVEAU (à traiter), false pour un rejeu
// déjà connu (idempotent par id provider) — ni l'un ni l'autre n'est une erreur.
export async function recordProviderEvent(client, { id, sendId = null, eventType = null, payload = null }) {
  const { data, error } = await client.rpc('record_provider_event', {
    p_secret: requireSecret('enregistrement de l’événement provider'),
    p_id: id,
    p_send_id: sendId,
    p_event_type: eventType,
    p_payload: payload,
  })
  if (error) throw translateRpcError(error, 'Enregistrement de l’événement provider impossible', 'record_provider_event')
  return Boolean(data)
}

export async function markProviderEventProcessed(client, id) {
  const { data, error } = await client.rpc('mark_provider_event_processed', {
    p_secret: requireSecret('marquage de l’événement provider comme traité'),
    p_id: id,
  })
  if (error) throw translateRpcError(error, 'Marquage de l’événement provider impossible', 'mark_provider_event_processed')
  return Boolean(data)
}

// ─── list_sends_for_resync ───────────────────────────────────────────────────────────────────
// Voie de lecture serveur pour la resynchronisation périodique (chantier 2a, Task 10,
// server/lib/paper-resync.js) : le durcissement RLS du bloc 3 (migration 20260914120000) a
// retiré tout SELECT sans token utilisateur sur letter_sends, un job serveur (rôle `anon`, pas de
// session) ne peut donc plus lire les lignes à revérifier chez le provider par ce chemin — d'où
// cette RPC à secret, calquée sur le patron des autres lectures internes (check_send_limits).
// Passthrough intégral : id/provider_ref/status/channel des lignes du périmètre (submitted > 24h,
// sent ≤ J+30, prepared avec provider_ref non nul — migration 20260914170000_resync_reader.sql),
// zéro PII, zéro interprétation ici.
export async function listSendsForResync(client) {
  const { data, error } = await client.rpc('list_sends_for_resync', {
    p_secret: requireSecret('lecture du périmètre de resynchronisation'),
  })
  if (error) throw translateRpcError(error, 'Lecture du périmètre de resynchronisation impossible', 'list_sends_for_resync')
  return data ?? []
}

// ─── check_send_limits ───────────────────────────────────────────────────────────────────────
// Façade du plafond (spec §5) : 'ok' | 'user_daily_exceeded' | 'global_daily_exceeded' — ce n'est
// PAS une exception (create_letter_send, lui, lève ces mêmes noms en dernier ressort). La route
// appelle cette fonction EN AMONT pour rendre un 429 explicite avant même de tenter la création.
export async function checkSendLimits(client, userId) {
  const { data, error } = await client.rpc('check_send_limits', {
    p_secret: requireSecret('vérification des plafonds'),
    p_user_id: userId,
  })
  if (error) throw translateRpcError(error, 'Vérification des plafonds impossible', 'check_send_limits')
  return data
}

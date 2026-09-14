// Webhook MySendingBox (chantier 2a, Task 10) — statuts du cycle papier (courrier simple).
// Contrat : docs/plan-chantier-2a-envoi-papier.md Task 10, docs/design-chantier-2a-envoi-papier.md
// §6. Factory à dépendances injectées (patron de server/routes/questionnaire.js et
// server/routes/letters.js) : testable avec supertest sans Supabase ni appel réseau réel
// (`store`/`paperSender` toujours fakés en test — voir tests/provider-webhook.test.ts).
//
// ⚠️ CE WEBHOOK EST UN PING NON FIABLE. La signature des webhooks MySendingBox n'est pas
// documentée publiquement (spec §6, même constat que l'adaptateur — server/lib/paper-sender.js) :
// la route ne fait donc AUCUNE confiance au corps du payload pour écrire un statut. Trois règles,
// dans cet ordre, jamais contournées :
//   1. secret ALÉATOIRE dans l'URL (déclaré au dashboard MySendingBox, jamais dans le corps ni
//      dans un header) — comparé en temps constant (patron server/lib/basic-auth.js : hash avant
//      `crypto.timingSafeEqual`, pour ne jamais lever sur une différence de longueur ET pour que
//      le temps de réponse ne fuite rien sur le préfixe correct). Secret faux OU absent →
//      **404 muet** : jamais 401/403, qui confirmeraient à un tiers que cette route existe.
//   2. persistance de l'événement BRUT dans `provider_events` AVANT tout acquittement HTTP
//      (idempotence par PK — `record_provider_event`, security definer, cf.
//      server/lib/letters-store.js) — l'ACK 200 part JUSTE APRÈS, jamais avant.
//   3. traitement post-ack, dans le MÊME PROCESS mais SANS être awaité par la requête HTTP : un
//      `GET /letters/{id}` authentifié (`paperSender.getLetter`, server/lib/paper-sender.js) puis
//      le fold `events[] → statut` (`foldMsbStatus`, server/lib/msb-status.js — le MÊME fold que
//      la resynchronisation, server/lib/paper-resync.js) — JAMAIS d'écriture de statut dérivée du
//      payload lui-même. Un GET en échec laisse l'événement NON marqué traité : la
//      resynchronisation périodique (Task 10, toutes les 6 h) le rattrape d'elle-même, aucune
//      relance ad hoc n'est nécessaire ici.
//
// CORRÉLATION. Le payload MySendingBox porte l'événement ET l'objet `letter` complet (à
// confirmer au test réel — aucun accès à la doc authentifiée pendant cette session, même réserve
// que paper-sender.js/msb-status.js) : `letter._id` est LA clé de corrélation, c'est elle qui sert
// au GET et à l'écriture du statut (`updateSendByProviderRef`, qui matche par `provider_ref`
// exactement comme le webhook Resend v1). `letter.metadata.seren_send_id` (echo de la métadonnée
// posée au POST, cf. paper-sender.js `buildLetterPayload`) n'est qu'un FALLBACK DE CORRÉLATION :
// il alimente uniquement la colonne `provider_events.send_id` (jointure de confort pour le
// débogage), jamais requis pour la transition elle-même.
//
// ⚠️ REVUE FINALE (C1, critique) : `seren_send_id` vient du provider — un tiers qui n'offre AUCUNE
// garantie sur ce champ (echo fidèle, mais rien n'empêche une valeur corrompue ou une ligne
// entretemps supprimée côté Seren). `provider_events.send_id` est une colonne `uuid` avec une
// contrainte de clé étrangère vers `letter_sends(id)` : une chaîne non-uuid ferait échouer le CAST
// au moment même de l'appel RPC (SQLSTATE 22P02) et un uuid syntaxiquement valide mais orphelin
// ferait échouer l'INSERT (23503 — violation de clé étrangère) — dans les deux cas, SANS cette
// garde, `record_provider_event` lèverait, la route répondrait 500 AVANT tout ack, et MySendingBox
// relivrerait indéfiniment un événement qui ne serait JAMAIS persisté. Double filet :
//   1. validation de FORME ici (UUID_RE) — élimine 22P02 avant même l'appel ;
//   2. `persistEvent()` retente SANS corrélation si l'appel échoue malgré tout avec le code
//      Postgres 23503 (send_id syntaxiquement valide mais introuvable) — élimine le 500 résiduel.
import express, { Router } from 'express'
import crypto from 'crypto'
import * as Sentry from '@sentry/node'
import { foldMsbStatus } from '../lib/msb-status.js'

// Dupliqué de server/routes/letters.js (ligne ~39) plutôt qu'importé : ce fichier ne doit pas
// dépendre d'un autre router en cours d'évolution parallèle (revue finale, périmètre de la
// Task 10 strictement limité à ce fichier + paper-sender.js + paper-resync.js + letters-store.js).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// SQLSTATE Postgres d'une violation de clé étrangère (cf. server/lib/letters-store.js
// `translateRpcError`, qui préserve `error.code` sous `.pgCode` sur toute erreur RPC générique).
const FOREIGN_KEY_VIOLATION = '23503'

/** Comparaison en temps constant, insensible à la longueur (hash avant comparaison) — même
 * technique que server/lib/basic-auth.js (dupliquée ici plutôt qu'importée : il s'agit d'un
 * secret d'URL, pas d'un couple utilisateur/mot de passe, les deux gardes n'ont pas vocation à
 * partager une signature de fonction). */
function safeEqualSecret(candidate, expected) {
  if (typeof candidate !== 'string' || candidate.length === 0) return false
  const a = crypto.createHash('sha256').update(candidate).digest()
  const b = crypto.createHash('sha256').update(expected).digest()
  return crypto.timingSafeEqual(a, b)
}

export function createProviderWebhookRouter({ store, paperSender, publicClient }) {
  const router = Router()

  // express.raw() en middleware DE ROUTE : le corps n'a pas besoin d'être octet-exact ici (pas de
  // signature à vérifier, contrairement à Resend/Stripe) mais doit rester un Buffer non reparsé
  // par un éventuel express.json() antérieur — patron des deux webhooks existants (voir
  // server/server.js, qui remonte le même express.raw() AVANT le express.json() global pour la
  // production ; ce montage-ci suffit à faire fonctionner le router seul, comme en test).
  router.post('/:secret', express.raw({ type: 'application/json' }), async (req, res) => {
    // ── 1. Secret d'URL ────────────────────────────────────────────────────────────────────
    // Absent côté serveur → feature inerte (même discipline que Resend/Stripe/MySendingBox
    // ailleurs dans ce fichier) : 404, PAS 503 — un 503 confirmerait l'existence de la route à
    // qui la sonde sans connaître le secret.
    const configuredSecret = process.env.MSB_WEBHOOK_URL_SECRET
    if (!configuredSecret || !safeEqualSecret(req.params.secret, configuredSecret)) {
      return res.status(404).end()
    }

    // ── 2. Corps brut → JSON défensif ──────────────────────────────────────────────────────
    // express.raw() est monté par l'appelant sur ce chemin (server.js, AVANT le express.json()
    // global — patron des webhooks Resend/Stripe) ; en usage isolé (tests), req.body peut déjà
    // être un Buffer, une chaîne, ou — à défaut de tout middleware de corps — rester vide.
    let payload
    try {
      const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body
      payload = JSON.parse(raw && raw.length > 0 ? raw : 'null')
    } catch {
      return res.status(400).json({ success: false, error: 'invalid_payload' })
    }

    const eventId = payload?.event?._id
    if (typeof eventId !== 'string' || eventId.length === 0) {
      // Sans identifiant d'événement exploitable, `record_provider_event` (PK = id d'événement)
      // ne peut pas persister idempotemment — même verdict qu'un JSON structurellement invalide.
      return res.status(400).json({ success: false, error: 'invalid_payload' })
    }

    const letter = payload?.letter && typeof payload.letter === 'object' ? payload.letter : null
    // Validation de FORME (C1, 1er filet) : une chaîne qui n'a pas la forme d'un uuid n'est même
    // pas tentée — `null` transmis directement, jamais de risque de 22P02 côté RPC.
    const rawSendIdHint = letter?.metadata?.seren_send_id
    const sendIdHint = typeof rawSendIdHint === 'string' && UUID_RE.test(rawSendIdHint) ? rawSendIdHint : null
    const eventType = typeof payload?.event?.name === 'string' ? payload.event.name : null

    // ── 3. Persist AVANT ack ───────────────────────────────────────────────────────────────
    // Une erreur ICI (BDD indisponible…) empêche l'acquittement : contrairement au webhook
    // Resend (signature déjà vérifiée, donc authentique), un ping MySendingBox non acquitté sera
    // relivré par le provider — c'est le comportement voulu, pas un incident à masquer par un
    // faux 200.
    //
    // `shouldProcess` : renvoyé par `recordProviderEvent` — true pour un événement NOUVEAU **ou**
    // pour un rejeu d'un événement déjà persisté mais JAMAIS marqué traité (I2, revue finale —
    // `processed_at is null`, ex. un GET précédent en échec) ; false seulement pour un rejeu d'un
    // événement déjà traité avec succès, rien à refaire.
    let shouldProcess
    try {
      shouldProcess = await store.recordProviderEvent(publicClient, {
        id: eventId,
        sendId: sendIdHint,
        eventType,
        payload,
      })
    } catch (error) {
      // C1 (2e filet) : send_id syntaxiquement valide mais introuvable en base (ligne supprimée
      // entretemps, désynchronisation quelconque) → violation de clé étrangère sur l'INSERT. On
      // retente IMMÉDIATEMENT sans corrélation plutôt que de renvoyer 500 : sans ce filet, cet
      // événement ne serait JAMAIS persisté (MySendingBox relivrerait indéfiniment un ping qui
      // échouerait de la même façon à chaque tentative).
      if (error?.pgCode === FOREIGN_KEY_VIOLATION && sendIdHint) {
        console.warn(`⚠️ provider-webhook — send_id orphelin pour l'événement ${eventId}, retenté sans corrélation`)
        try {
          shouldProcess = await store.recordProviderEvent(publicClient, { id: eventId, sendId: null, eventType, payload })
        } catch (retryError) {
          console.error('❌ provider-webhook — persistance impossible (retry sans send_id) :', retryError?.message ?? retryError)
          Sentry.captureException(retryError, { tags: { stage: 'provider_webhook_persist' } })
          return res.status(500).json({ success: false, error: 'persist_failed' })
        }
      } else {
        console.error('❌ provider-webhook — persistance impossible :', error?.message ?? error)
        Sentry.captureException(error, { tags: { stage: 'provider_webhook_persist' } })
        return res.status(500).json({ success: false, error: 'persist_failed' })
      }
    }

    // ── 4. ACK 200 IMMÉDIAT ────────────────────────────────────────────────────────────────
    res.status(200).json({ success: true })

    // Doublon déjà traité (idempotence par PK, I2) : ack sans retraitement, rien de plus à faire.
    if (!shouldProcess) return

    // ── 5. Traitement post-ack, asynchrone, MÊME PROCESS — jamais awaité par la requête ────
    // Ne doit JAMAIS rejeter au niveau de l'appelant : chaque étape interne est déjà protégée,
    // le .catch() n'est qu'une ceinture en plus des bretelles (patron des autres webhooks : une
    // erreur de rattrapage ne doit jamais faire planter le process).
    processEvent({ eventId, letter }).catch((error) => {
      console.error('❌ provider-webhook — traitement post-ack :', error?.message ?? error)
      Sentry.captureException(error, { tags: { stage: 'provider_webhook_process', event_id: eventId } })
    })
  })

  /** GET provider authentifié → fold → transition. Ne lève jamais : toute erreur y est traitée en
   * conservant l'événement NON marqué traité — la resynchronisation périodique (Task 10) le
   * reprendra à son prochain passage. Jamais le payload complet (adresse postale…) dans les logs,
   * seulement l'identifiant technique. */
  async function processEvent({ eventId, letter }) {
    const providerRef = typeof letter?._id === 'string' ? letter._id : null
    if (!providerRef) {
      // Événement ABANDONNÉ (revue finale, mineur) : rien à corréler, aucune resynchronisation ne
      // le rattrapera jamais par elle-même (elle opère par ligne letter_sends, pas par événement)
      // — signal Sentry dédié pour que ce cas reste VISIBLE plutôt que noyé dans les logs.
      const error = new Error(`provider-webhook — événement ${eventId} sans letter._id exploitable, abandonné`)
      console.error(`⚠️ ${error.message}`)
      Sentry.captureException(error, { tags: { stage: 'provider_webhook_process', reason: 'provider_event_abandoned', event_id: eventId } })
      return
    }
    if (!paperSender) {
      const error = new Error(`provider-webhook — événement ${eventId} : adaptateur MySendingBox absent, abandonné`)
      console.error(`⚠️ ${error.message}`)
      Sentry.captureException(error, { tags: { stage: 'provider_webhook_process', reason: 'provider_event_abandoned', event_id: eventId } })
      return
    }

    let remote
    try {
      remote = await paperSender.getLetter(providerRef)
    } catch (error) {
      // Échec du GET (réseau, clé absente, 5xx provider…) : l'événement reste NON-PROCESSED, la
      // resynchronisation périodique le rattrapera — jamais de statut écrit depuis le payload.
      console.error(`⚠️ provider-webhook — GET provider en échec (event ${eventId}) : ${error?.message ?? error}`)
      Sentry.captureException(error, { tags: { stage: 'provider_webhook_get', event_id: eventId } })
      return
    }

    const { status } = foldMsbStatus(remote?.events)
    // Alignement avec la resync (revue finale, mineur) : le webhook ne connaît pas le statut
    // COURANT de la ligne (pas de lecture ici, seulement une écriture par provider_ref), mais
    // `foldMsbStatus` renvoie 'prepared' précisément quand `remote.events` ne contient AUCUN
    // événement actionnable — dans ce cas `update_letter_send_status` ferait de toute façon un
    // no-op forward-only (aucune transition ne mène VERS 'prepared'), autant s'épargner l'aller-
    // retour RPC.
    if (status !== 'prepared') {
      try {
        // `updateSendByProviderRef` applique elle-même la matrice forward-only (RPC
        // `update_letter_send_status`) : un statut inchangé ou une transition non autorisée est un
        // no-op silencieux côté base, jamais une erreur.
        await store.updateSendByProviderRef(publicClient, providerRef, { status })
      } catch (error) {
        console.error(`❌ provider-webhook — écriture du statut en échec (event ${eventId}) : ${error?.message ?? error}`)
        Sentry.captureException(error, { tags: { stage: 'provider_webhook_update', event_id: eventId } })
        return
      }
    }

    await store.markProviderEventProcessed(publicClient, eventId).catch((error) => {
      console.error(`❌ provider-webhook — marquage traité en échec (event ${eventId}) : ${error?.message ?? error}`)
      Sentry.captureException(error, { tags: { stage: 'provider_webhook_mark_processed', event_id: eventId } })
    })
  }

  return router
}

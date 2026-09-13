// Resynchronisation périodique du cycle papier (chantier 2a, Task 10). Contrat :
// docs/plan-chantier-2a-envoi-papier.md Task 10 (⚠️ décision actée le 13/09 : TIMER SERVEUR
// `setInterval`, PAS de job pg_cron ni de pg_net — le fetch HTTP vers MySendingBox vit ici, côté
// process Node, zéro migration supplémentaire pour le déclenchement) ; spec
// docs/design-chantier-2a-envoi-papier.md §6.
//
// POURQUOI. Le webhook (server/routes/provider-webhook.js) est un ping non fiable — MySendingBox
// n'a pas de signature documentée, et un webhook peut tout simplement se perdre (réseau, panne
// temporaire). Cette resynchronisation est le filet de sécurité : toutes les `intervalMs` (6 h en
// production), elle relit le périmètre des envois « non clos » et revérifie CHACUN d'eux par le
// MÊME chemin que le webhook — `paperSender.getLetter` (GET authentifié) puis `foldMsbStatus`
// (server/lib/msb-status.js) — jamais depuis un payload, jamais d'raccourci.
//
// PÉRIMÈTRE (voir server/lib/letters-store.js `listSendsForResync` et la migration
// supabase/migrations/20260914170000_resync_reader.sql, qui en sont la source de vérité) :
//   • `submitted` depuis plus de 24 h, sans limite d'âge haute ;
//   • `sent` depuis moins de 30 jours (couverture NPAI 5-10 j avec marge) ;
//   • `prepared` porteur d'un `provider_ref` non nul (serveur mort entre le POST accepté par
//     MySendingBox et l'écriture du résultat, revue Task 4).
// Le filtrage lui-même est fait EN BASE (RPC à secret, letter_sends reste illisible sans elle) :
// ce module fait confiance aux lignes reçues, il ne refiltre rien.
//
// DÉSARMEMENT. Sans `MYSENDINGBOX_API_KEY`, `paperSender.getLetter` lèverait `paper_not_configured`
// à chaque ligne — inutile de programmer un timer qui échouerait en boucle toutes les 6 h. `start()`
// vérifie la variable et, si elle est absente, se contente de logger UNE ligne (feature inerte,
// même discipline que Resend/Stripe/MySendingBox ailleurs dans ce dépôt) sans armer de timer.
import * as Sentry from '@sentry/node'
import { foldMsbStatus } from './msb-status.js'

const SIX_HOURS_MS = 6 * 60 * 60 * 1000

/**
 * @param {{ store: typeof import('./letters-store.js'), paperSender: ReturnType<typeof import('./paper-sender.js').createPaperSender> | null, publicClient: unknown, intervalMs?: number }} deps
 */
export function createPaperResync({ store, paperSender, publicClient, intervalMs = SIX_HOURS_MS }) {
  let timer = null

  /** Revérifie une ligne du périmètre. Ne lève JAMAIS : une erreur ne doit pas interrompre le
   * traitement des lignes suivantes (l'échéance de 6 h suivante rattrapera celle-ci de toute
   * façon). Jamais de payload sensible dans les logs — seuls l'id interne et le provider_ref
   * (déjà connu du provider lui-même, pas une donnée personnelle) apparaissent. */
  async function resyncOne(row) {
    let remote
    try {
      remote = await paperSender.getLetter(row.provider_ref)
    } catch (error) {
      console.error(`⚠️ paper-resync — GET provider en échec (send ${row.id}) : ${error?.message ?? error}`)
      Sentry.captureException(error, { tags: { stage: 'paper_resync_get', send_id: row.id } })
      return
    }

    const { status } = foldMsbStatus(remote?.events)
    // Optimisation ET clarté d'intention (spec Task 10) : le statut courant est déjà connu (il
    // vient du périmètre lu à l'instant), inutile d'appeler la RPC d'écriture quand rien n'a
    // bougé. `updateSendByProviderRef` referait de toute façon un no-op forward-only sans erreur
    // si on l'appelait ici, mais s'en dispenser évite un aller-retour réseau pour la majorité des
    // lignes d'un passage de resynchronisation (un envoi `sent` sans incident, par exemple).
    if (status === row.status) return

    try {
      await store.updateSendByProviderRef(publicClient, row.provider_ref, { status })
    } catch (error) {
      console.error(`❌ paper-resync — écriture du statut en échec (send ${row.id}) : ${error?.message ?? error}`)
      Sentry.captureException(error, { tags: { stage: 'paper_resync_update', send_id: row.id } })
    }
  }

  /** Un passage complet. Exportée (via l'objet retourné) pour être appelée directement par les
   * tests, indépendamment du timer. Ne lève jamais — une erreur de lecture du périmètre est
   * loguée + capturée, le passage suivant réessaiera. */
  async function runOnce() {
    let rows
    try {
      rows = await store.listSendsForResync(publicClient)
    } catch (error) {
      console.error('❌ paper-resync — lecture du périmètre impossible :', error?.message ?? error)
      Sentry.captureException(error, { tags: { stage: 'paper_resync_list' } })
      return
    }
    // Séquentiel, volontairement : le volume attendu (envois papier non clos) est faible, et un
    // traitement séquentiel évite de bombarder l'API MySendingBox de requêtes concurrentes à
    // chaque échéance de 6 h.
    for (const row of rows) {
      await resyncOne(row)
    }
  }

  function start() {
    if (!process.env.MYSENDINGBOX_API_KEY) {
      console.log('⏸️  Resynchronisation papier désarmée (MYSENDINGBOX_API_KEY absente)')
      return
    }
    if (timer) return // déjà démarré — idempotent
    timer = setInterval(() => {
      runOnce().catch((error) => {
        // Filet de sécurité : runOnce() ne devrait jamais rejeter (chaque étape interne est déjà
        // protégée), mais un setInterval dont le callback lève ferait planter le process Node.
        console.error('❌ paper-resync — passage en échec inattendu :', error?.message ?? error)
        Sentry.captureException(error, { tags: { stage: 'paper_resync_tick' } })
      })
    }, intervalMs)
    // unref() : ce timer ne doit jamais empêcher le process de s'arrêter proprement (tests,
    // redéploiement) — même réflexe que tout timer de fond côté serveur Node.
    timer.unref()
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  return { start, stop, runOnce }
}

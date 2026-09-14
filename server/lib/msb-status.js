// Fold `events[] → statut Seren` pour le cycle papier (chantier 2a, courrier simple).
// MySendingBox n'expose aucun champ `status` : l'état se DÉRIVE d'un fold sur `events[]` — la
// réponse de `GET /letters/{id}` (paper-sender.js) — table de référence :
// docs/plan-chantier-2a-envoi-papier.md §M.
//
// Contraintes dures (règles §M + vigilance de revue Task 4/5+6, reprises ici à la lettre) :
//   - les événements arrivent NON ORDONNÉS et potentiellement DUPLIQUÉS (webhook-ping ET
//     resynchronisation périodique peuvent livrer le même événement plusieurs fois) → dédup par
//     `_id` AVANT tout calcul, et le résultat ne doit JAMAIS dépendre de l'ordre du tableau ;
//   - le statut résultant est le PLUS AVANCÉ atteignable par la matrice — jamais de retour
//     arrière — SAUF les deux transitions `sent → failed*` explicitement autorisées par §M
//     (NPAI, et retour à l'expéditeur sans NPAI) ;
//   - `failed` depuis `sent` UNIQUEMENT via `letter.returned_to_sender` SANS `wrong_address:
//     true` — un `letter.error` (ou `letter.canceled`) tardif après `sent` NE DOIT JAMAIS
//     écraser un envoi expédié : ce n'est pas un tri par rang brut, c'est une garde explicite ;
//   - `letter.returned_to_sender` avec `wrong_address: true` → `failed_address` ;
//   - les événements du lot 2c (`filing_proof`, `in_transit`, `distributed`, `delivery_proof`,
//     `lost`) sont reconnus mais IGNORÉS PROPREMENT (pas d'erreur, pas d'entrée dans `ignored` —
//     à la différence d'un type vraiment inconnu, voir plus bas) ;
//   - un type d'événement totalement inconnu est ignoré (n'influence pas le statut) MAIS listé
//     dans `ignored` — signal utile (schéma provider qui dérive) sans jamais faire planter le
//     traitement d'un webhook.
//
// ⚠️ Nom du champ discriminant l'événement (`type`) ET forme exacte du flag `wrong_address` sur
// le payload de `letter.returned_to_sender` : à confirmer au test réel (aucun accès à la doc
// MySendingBox authentifiée pendant cette session ; convention alignée sur le webhook Resend
// existant, `payload.type`, voir server/routes/letters.js).

// Mapping direct type → statut candidat. `letter.returned_to_sender` est traité à part (son
// statut dépend du payload, pas seulement du type) — volontairement absent d'ici.
const DIRECT_STATUS_BY_TYPE = {
  'letter.created': 'submitted', // 201 du POST /letters porte le même sens, mais n'est jamais un élément de events[]
  'letter.accepted': 'submitted', // chaîne d'impression — no-op vis-à-vis du statut Seren
  'letter.sent': 'sent', // état final nominal du courrier simple
  'letter.wrong_address': 'failed_address', // NPAI — peut survenir 5-10 j APRÈS sent
  'letter.error': 'failed',
  'letter.canceled': 'failed', // suite à DELETE Seren uniquement
}

// Lot 2c (hors périmètre 2a) : persistés tels quels dans provider_events par l'appelant, mais ce
// fold n'en fait rien — reconnus explicitement pour ne JAMAIS finir dans `ignored` comme un type
// vraiment inconnu le ferait.
const LOT_2C_TYPES = new Set(['filing_proof', 'in_transit', 'distributed', 'delivery_proof', 'lost'])

// Rang de priorité pour départager plusieurs candidats simultanés une fois les gardes
// appliquées. Ce n'est PAS un ordre chronologique : `failed`/`failed_address` sont haut placés
// pour pouvoir l'emporter même après `sent`, mais seuls des candidats déjà validés par les
// gardes ci-dessus (voir buildCandidates) atteignent cette étape.
const RANK = { prepared: 0, submitted: 1, sent: 2, failed: 3, failed_address: 4 }

/**
 * @param {Array<{ _id?: string, type?: string, wrong_address?: boolean }>} events
 * @returns {{ status: string, ignored: string[] }}
 */
export function foldMsbStatus(events) {
  const list = Array.isArray(events) ? events : []

  // Dédup par _id — un doublon exact (même id) est supposé porter le même contenu (webhook-ping
  // ET resync livrant le même événement) ; en cas de contenu divergent pour un même id (anomalie
  // provider), le dernier vu dans le tableau gagne — cas non attendu en pratique, non testé au
  //-delà de la dédup elle-même.
  const byId = new Map()
  let anonymousIndex = 0
  for (const event of list) {
    if (!event || typeof event.type !== 'string') continue
    const key = event._id != null ? event._id : `__no_id_${anonymousIndex++}`
    byId.set(key, event)
  }

  // Passe 1 : `sent` a-t-il été atteint ? Nécessaire pour appliquer la garde anti-régression
  // avant même de savoir dans quel ordre les événements seront traités (le fold est
  // order-independent par construction, pas un reduce séquentiel).
  let reachedSent = false
  for (const event of byId.values()) {
    if (event.type === 'letter.sent') {
      reachedSent = true
      break
    }
  }

  const ignored = []
  const candidates = []

  for (const event of byId.values()) {
    const { type } = event

    if (LOT_2C_TYPES.has(type)) continue // reconnu, ignoré proprement — jamais dans `ignored`

    if (type === 'letter.returned_to_sender') {
      // Seul chemin autorisé à ramener `sent` vers `failed` (garde volontairement absente ici) —
      // `wrong_address: true` prime sur le cas générique (NPAI, plus spécifique).
      candidates.push(event.wrong_address === true ? 'failed_address' : 'failed')
      continue
    }

    const direct = DIRECT_STATUS_BY_TYPE[type]
    if (!direct) {
      ignored.push(type)
      continue
    }

    if (direct === 'failed' && reachedSent) {
      // `letter.error` / `letter.canceled` tardif après `sent` : jamais de retour arrière par ce
      // chemin (vigilance de revue explicite, Task 4 + Task 7). Le seul retour vers `failed`
      // depuis `sent` passe par la branche `returned_to_sender` ci-dessus.
      continue
    }
    candidates.push(direct)
  }

  if (candidates.length === 0) return { status: 'prepared', ignored }

  const status = candidates.reduce((best, candidate) => (RANK[candidate] > RANK[best] ? candidate : best), candidates[0])
  return { status, ignored }
}

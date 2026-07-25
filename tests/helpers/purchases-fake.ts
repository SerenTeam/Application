// Faux store `purchases` partagé par les tests de paiement (routes, webhook, gating).
// Miroir FIDÈLE de server/lib/purchases-store.js + des gardes SQL de la migration
// 20260725120000_purchases.sql — c'est là que se joue l'idempotence, donc le fake doit
// reproduire les clauses exactement, sans quoi les tests valideraient une sémantique
// inexistante en base :
//   1. env WEBHOOK_RPC_SECRET absent → throw AVANT tout appel (comportement du vrai store) ;
//   2. create_pending_purchase : `on conflict (stripe_session_id) do nothing` ;
//   3. mark_purchase_paid : UPSERT, mais DO UPDATE gardé par `where status = 'pending'` —
//      donc rejeu = 0 ligne, et un `completed` relivré après remboursement ne ressuscite rien ;
//   4. mark_purchase_refunded : gardé par `status = 'paid'` ;
//   5. expire_purchase : gardé par `status = 'pending'`.
// Ce fichier n'est pas une suite de tests (include: tests/**/*.test.ts) — il n'est jamais
// collecté par Vitest.

export type PurchaseRow = {
  id: string
  user_id: string
  status: 'pending' | 'paid' | 'refunded' | 'expired'
  amount_total: number | null
  currency: string | null
  stripe_session_id: string
  stripe_payment_intent: string | null
  included_sends: number
  paid_at: string | null
  refunded_at: string | null
  created_at: string
}

function requireSecret() {
  if (!process.env.WEBHOOK_RPC_SECRET) throw new Error('WEBHOOK_RPC_SECRET manquant')
}

export function makePurchasesStore(initial: Partial<PurchaseRow>[] = []) {
  const rows: PurchaseRow[] = []
  let seq = 0

  function insert(fields: Partial<PurchaseRow>): PurchaseRow {
    const row: PurchaseRow = {
      id: `purchase-${++seq}`,
      user_id: 'user-1',
      status: 'pending',
      amount_total: null,
      currency: null,
      stripe_session_id: `cs_${seq}`,
      stripe_payment_intent: null,
      included_sends: 0,
      paid_at: null,
      refunded_at: null,
      // Horodatage monotone : `new Date()` seul rendrait l'ordre de deux insertions de la même
      // milliseconde indéterminé, et donc « le dernier achat » instable d'un run à l'autre.
      created_at: new Date(Date.UTC(2026, 6, 25, 0, 0, seq)).toISOString(),
      ...fields,
    }
    rows.push(row)
    return row
  }

  initial.forEach(insert)

  // `failReads` simule un incident base : le gate doit répondre 500, JAMAIS laisser passer.
  const store = {
    rows,
    failReads: false,

    async getPaidPurchase(_c: unknown, userId: string) {
      if (store.failReads) throw new Error('lecture impossible (incident simulé)')
      return (
        rows
          .filter((r) => r.user_id === userId && r.status === 'paid')
          .sort((a, b) => (b.paid_at ?? '').localeCompare(a.paid_at ?? ''))[0] ?? null
      )
    },

    async getLatestPurchase(_c: unknown, userId: string) {
      if (store.failReads) throw new Error('lecture impossible (incident simulé)')
      return (
        rows
          .filter((r) => r.user_id === userId)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
      )
    },

    async createPending(_c: unknown, { userId, sessionId, includedSends }: { userId: string; sessionId: string; includedSends: number }) {
      requireSecret()
      if (rows.some((r) => r.stripe_session_id === sessionId)) return // on conflict do nothing
      insert({ user_id: userId, status: 'pending', stripe_session_id: sessionId, included_sends: includedSends })
    },

    async markPaid(
      _c: unknown,
      { sessionId, userId, paymentIntent, amountTotal, currency, includedSends }:
        { sessionId: string; userId: string; paymentIntent: string | null; amountTotal: number | null; currency: string | null; includedSends: number },
    ) {
      requireSecret()
      const existing = rows.find((r) => r.stripe_session_id === sessionId)
      if (!existing) {
        insert({
          user_id: userId,
          status: 'paid',
          stripe_session_id: sessionId,
          stripe_payment_intent: paymentIntent,
          amount_total: amountTotal,
          currency,
          included_sends: includedSends,
          paid_at: new Date().toISOString(),
        })
        return
      }
      if (existing.status !== 'pending') return // garde du DO UPDATE : rejeu = 0 ligne
      existing.status = 'paid'
      existing.stripe_payment_intent = paymentIntent ?? existing.stripe_payment_intent
      existing.amount_total = amountTotal ?? existing.amount_total
      existing.currency = currency ?? existing.currency
      existing.paid_at = existing.paid_at ?? new Date().toISOString()
    },

    async markRefunded(_c: unknown, paymentIntent: string) {
      requireSecret()
      const row = rows.find((r) => r.stripe_payment_intent === paymentIntent && r.status === 'paid')
      if (!row) return
      row.status = 'refunded'
      row.refunded_at = new Date().toISOString()
    },

    async expire(_c: unknown, sessionId: string) {
      requireSecret()
      const row = rows.find((r) => r.stripe_session_id === sessionId && r.status === 'pending')
      if (!row) return
      row.status = 'expired'
    },
  }

  return store
}

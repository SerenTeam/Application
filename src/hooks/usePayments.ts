import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import type { Lang } from '@/i18n'

// État du forfait côté client (chantier 1). La source de vérité est TOUJOURS le serveur, qui
// lit la table purchases : aucun paramètre d'URL, aucun état local ne débloque quoi que ce soit
// — c'était précisément la faille du paiement précédent (?payment=success).

export interface PaymentsPrice {
  amount_total: number // centimes, tels que facturés par Stripe
  currency: string
}

export interface PaymentsPurchase {
  status: 'pending' | 'paid' | 'refunded' | 'expired'
  paid_at: string | null
  included_sends: number
}

interface PaymentsState {
  loading: boolean
  paymentsEnabled: boolean
  purchase: PaymentsPurchase | null
  price: PaymentsPrice | null
}

const INITIAL: PaymentsState = { loading: true, paymentsEnabled: false, purchase: null, price: null }

// Cache au niveau du module : LetterSendPanel est monté UNE FOIS PAR COURRIER, et sans cache
// chaque courrier affiché déclencherait sa propre requête de statut. Le premier montage paie la
// latence, les suivants partent de l'état connu (donc sans clignotement du bloc d'envoi) tout en
// revalidant en arrière-plan. `inflight` évite en plus que plusieurs panneaux montés au même
// instant lancent la même requête en parallèle.
let cache: PaymentsState | null = null
let inflight: Promise<PaymentsState> | null = null

/** Vide le cache — à appeler à la déconnexion pour ne jamais montrer l'état d'un compte à un autre. */
export function resetPaymentsCache() {
  cache = null
  inflight = null
}

async function fetchStatus(): Promise<PaymentsState> {
  try {
    const res = await apiFetch('/api/payments/status')
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.success) {
      // Statut indisponible → on se comporte comme vente fermée : jamais de paywall affiché par
      // erreur à quelqu'un qui a payé. Le serveur, lui, reste seul juge de l'accès réel.
      return { ...INITIAL, loading: false }
    }
    return {
      loading: false,
      paymentsEnabled: Boolean(data.payments_enabled),
      purchase: data.purchase ?? null,
      price: data.price ?? null,
    }
  } catch {
    return { ...INITIAL, loading: false }
  }
}

/** Formate un montant Stripe dans la langue active. Seule façon d'afficher un prix dans l'app :
 * il n'existe aucun montant écrit en dur (décision D3 — le tarif se pilote depuis Stripe). */
export function formatPrice(price: PaymentsPrice | null, lang: Lang): string | null {
  if (!price) return null
  return new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'fr-FR', {
    style: 'currency',
    currency: price.currency.toUpperCase(),
    maximumFractionDigits: price.amount_total % 100 === 0 ? 0 : 2,
  }).format(price.amount_total / 100)
}

export function usePayments() {
  const [state, setState] = useState<PaymentsState>(() => cache ?? INITIAL)

  const refresh = useCallback(async () => {
    inflight = inflight ?? fetchStatus()
    const next = await inflight
    inflight = null
    cache = next
    setState(next)
    return next
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const next = await (inflight ?? (inflight = fetchStatus()))
      inflight = null
      cache = next
      if (!cancelled) setState(next)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /** Ouvre la page de paiement Stripe. Renvoie false si la vente n'est pas ouverte ou si la
   * session n'a pas pu être créée — l'appelant affiche alors un message, sans jamais rediriger. */
  const startCheckout = useCallback(async (lang: Lang): Promise<boolean> => {
    try {
      const res = await apiFetch('/api/payments/checkout', {
        method: 'POST',
        body: JSON.stringify({ lang }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.url) {
        window.location.href = data.url
        return true
      }
      // Achat déjà encaissé (double onglet, retour arrière) : on resynchronise plutôt que
      // d'envoyer l'utilisateur payer une seconde fois.
      if (res.ok && data?.already_purchased) {
        await refresh()
        return true
      }
      return false
    } catch {
      return false
    }
  }, [refresh])

  return {
    ...state,
    hasPaid: state.purchase?.status === 'paid',
    refresh,
    startCheckout,
  }
}

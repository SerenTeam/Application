import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import type { Lang } from '@/i18n'

// État du mini-paiement « envoi supplémentaire » (chantier 2a) ; le forfait famille est abandonné
// en v2 (le dossier est ouvert et payé par la pompe funèbre). La source de vérité est TOUJOURS le
// serveur, qui lit la table purchases : aucun paramètre d'URL, aucun état local ne débloque quoi
// que ce soit — c'était précisément la faille du paiement précédent (?payment=success).

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
  // Forfait payé et non remboursé — dérivé CÔTÉ SERVEUR de `getPaidPurchase`, filtré
  // `kind='forfait'` (chantier 2a, vigilance I4). Ne jamais le recalculer depuis `purchase` :
  // celui-ci est le DERNIER achat, qui peut être un envoi supplémentaire à l'acte — le paywall
  // se lèverait alors pour quelqu'un qui n'a acheté qu'un timbre, alors que le gate serveur,
  // lui, resterait fermé (402 à la première action).
  hasPaid: boolean
  purchase: PaymentsPurchase | null
  price: PaymentsPrice | null
  // Prix de l'envoi supplémentaire (chantier 2a, facturation à l'acte) — même provenance que
  // `price` (Stripe, jamais un montant en dur) : `null` si le tarif n'est pas configuré, le
  // bouton d'achat s'affiche alors sans montant plutôt que d'inventer un chiffre.
  extraPrice: PaymentsPrice | null
}

const INITIAL: PaymentsState = {
  loading: true,
  paymentsEnabled: false,
  hasPaid: false,
  purchase: null,
  price: null,
  extraPrice: null,
}

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
      hasPaid: Boolean(data.has_paid),
      purchase: data.purchase ?? null,
      price: data.price ?? null,
      extraPrice: data.extra_price ?? null,
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

  /** Ouvre la page de paiement Stripe pour UN envoi supplémentaire (chantier 2a, facturation à
   * l'acte — 402 QUOTA_EXHAUSTED du panneau papier). Seul checkout restant en v2 : cette route
   * est répétable (on peut acheter plusieurs envois à l'acte) et exige un forfait payé
   * (403 FORFAIT_REQUIRED) — l'appelant distingue ce cas via le code retourné plutôt qu'un
   * simple booléen. */
  const startExtraSendCheckout = useCallback(async (lang: Lang): Promise<{ ok: boolean; code?: string }> => {
    try {
      const res = await apiFetch('/api/payments/checkout-extra-send', {
        method: 'POST',
        body: JSON.stringify({ lang }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.url) {
        window.location.href = data.url
        return { ok: true }
      }
      return { ok: false, code: data?.code }
    } catch {
      return { ok: false }
    }
  }, [])

  return {
    ...state, // `hasPaid` compris — il vient du serveur, jamais d'un calcul local (voir PaymentsState)
    refresh,
    startExtraSendCheckout,
  }
}

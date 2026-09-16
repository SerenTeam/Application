import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { clearPendingPaperSend } from '@/lib/paper-send-resume'

// Retour de Stripe Checkout (v2) : le forfait famille est abandonné, il ne reste que le retour du
// mini-paiement `extra_success`, consommé par PaperSendPanel. Ce composant toujours monté ne fait
// plus que nettoyer l'URL (et purger une reprise papier devenue stale hors `extra_success`).
export function CheckoutReturnBanner() {
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    const checkoutParam = searchParams.get('checkout')
    if (!checkoutParam) return
    if (checkoutParam !== 'extra_success') clearPendingPaperSend()
    const next = new URLSearchParams(searchParams)
    next.delete('checkout')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  return null
}

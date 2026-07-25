import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { usePayments } from '@/hooks/usePayments'
import { useT } from '@/i18n/useT'

// Retour de Stripe Checkout. Point de conception essentiel : le paramètre `?checkout=success`
// NE DÉBLOQUE RIEN — c'était exactement la faille du paiement précédent (?payment=success
// suffisait à se déclarer payant). Ici il ne fait qu'afficher un état d'attente ; la vérité
// vient de /api/payments/status, qui lit la table purchases, elle-même écrite par le seul
// webhook à signature Stripe vérifiée.

const POLL_MS = 2000
const MAX_ATTEMPTS = 10 // ~20 s, puis message rassurant — jamais de boucle infinie

type Phase = 'idle' | 'confirming' | 'slow' | 'confirmed'

export function CheckoutReturnBanner() {
  const t = useT()
  const [searchParams, setSearchParams] = useSearchParams()
  // Capturé au premier rendu : le paramètre est retiré de l'URL juste après, mais le bandeau
  // doit rester affiché (et un rechargement de page ne doit pas le rejouer).
  const [outcome] = useState<string | null>(() => searchParams.get('checkout'))
  const [phase, setPhase] = useState<Phase>('idle')
  const { refresh } = usePayments()

  // Nettoyage de l'URL — sans quoi un partage de lien ou un retour arrière rejouerait l'écran.
  useEffect(() => {
    if (!searchParams.get('checkout')) return
    const next = new URLSearchParams(searchParams)
    next.delete('checkout')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    // `cancel` : retour parfaitement silencieux. Aucun message culpabilisant, aucune relance —
    // l'achat se fait dans les deux semaines d'un deuil (P11 de la roadmap produit).
    if (outcome !== 'success') return

    let cancelled = false
    let attempts = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    setPhase('confirming')

    const tick = async () => {
      const next = await refresh()
      if (cancelled) return
      if (next.purchase?.status === 'paid') {
        setPhase('confirmed')
        return
      }
      attempts += 1
      if (attempts >= MAX_ATTEMPTS) {
        setPhase('slow')
        return
      }
      timer = setTimeout(tick, POLL_MS)
    }

    void tick() // première vérification immédiate : le webhook arrive souvent en moins d'une seconde
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [outcome, refresh])

  if (phase === 'idle') return null

  return (
    <div className="mb-6 flex items-start gap-3 rounded-2xl border border-border-card bg-white p-4">
      {phase === 'confirmed' ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      ) : (
        <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-text-muted" />
      )}
      <p className="text-sm text-text-primary">
        {phase === 'confirmed' && t.payments.confirmed}
        {phase === 'confirming' && t.payments.confirming}
        {phase === 'slow' && t.payments.confirmingSlow}
      </p>
    </div>
  )
}

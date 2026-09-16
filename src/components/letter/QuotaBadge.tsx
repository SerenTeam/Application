import { useEffect, useState } from 'react'
import { PillBadge } from '@/components/ui/pill-badge'
import { apiFetch } from '@/lib/api'
import { useT } from '@/i18n/useT'
import { fmt } from '@/i18n'

interface QuotaBadgeProps {
  // Incrémenté par le parent après un envoi réussi, un 402 quota épuisé, ou un retour de
  // Checkout : force une relecture du solde. Chaque panneau papier interroge son propre solde
  // (pas de cache partagé entre lettres, contrairement à usePayments) — peu coûteux, les
  // panneaux papier sont rarement plusieurs à être ouverts en même temps.
  refreshKey: number
}

// Compteur de quota (chantier 2a, spec §4) — lecture seule, purement présentationnel. Le bouton
// d'achat à l'acte vit dans le parent (PaperSendPanel, revue finale I3) : lui seul connaît le
// contrat exact de son affichage (uniquement sur confirmation SERVEUR explicite via un 402
// `extra_send_available`, jamais depuis ce solde local) et la requête à rejouer au retour de
// Checkout (legs R1) — ce badge ne fait qu'informer, il n'empêche jamais un envoi (le serveur
// reste seul juge du solde réel, garde 8 de POST /send).
export function QuotaBadge({ refreshKey }: QuotaBadgeProps) {
  const t = useT()
  const [balance, setBalance] = useState<number | null>(null)
  // v2 (contrat §7.6) : le total inclus du dossier, pour un compteur « N sur M » explicite.
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiFetch('/api/letters/quota')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { balance?: number; included_total?: number } | null) => {
        if (cancelled) return
        setBalance(typeof data?.balance === 'number' ? data.balance : null)
        setTotal(typeof data?.included_total === 'number' ? data.included_total : null)
      })
      .catch(() => {
        // Lecture non bloquante — le badge reste simplement absent, l'envoi n'en dépend pas.
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  if (loading) return <p className="text-xs text-text-muted">{t.paperSend.quotaLoading}</p>
  if (balance === null) return null

  return balance > 0 ? (
    <PillBadge tone="neutral">
      {fmt(t.paperSend.quotaRemaining, { count: balance, s: balance > 1 ? 's' : '', total: total ?? balance })}
    </PillBadge>
  ) : (
    <PillBadge tone="warning">{t.paperSend.quotaExhausted}</PillBadge>
  )
}

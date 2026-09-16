import { useT } from '@/i18n/useT'
import { fmt } from '@/i18n'
import type { PartnerCountersData } from '@/lib/partner-dossier'

// Compteurs explicites de l'espace PF (contrat §3.3.13, décision D9). Chaque tuile dit
// exactement ce qu'elle compte : « créés ce mois » n'est pas « activés par la famille ».
// AUCUN montant ici — l'estimation de facturation (L4b) se pose à l'ancre de la page, pas
// dans ce composant.
interface PartnerCountersProps {
  counters: PartnerCountersData
}

export function PartnerCounters({ counters }: PartnerCountersProps) {
  const t = useT()

  const tiles = [
    { key: 'createdThisMonth', label: t.partner.counters.createdThisMonth, value: counters.created_this_month },
    { key: 'createdTotal', label: t.partner.counters.createdTotal, value: counters.created_total },
    { key: 'activatedTotal', label: t.partner.counters.activatedTotal, value: counters.activated_total },
    { key: 'pendingActivation', label: t.partner.counters.pendingActivation, value: counters.pending_activation },
  ]

  // Marque du pluriel français/anglais : « 1 invitation expirée », « 2 invitations expirées ».
  const plural = (n: number) => (n > 1 ? 's' : '')
  const showFootnote = counters.expired_invitations > 0 || counters.cancelled_total > 0

  return (
    <section>
      <h2 className="mb-4 font-display text-2xl font-normal text-text">{t.partner.counters.title}</h2>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div
            key={tile.key}
            className="flex h-full flex-col justify-between rounded-card border border-border-card bg-white p-5 shadow-card-border"
          >
            <p className="mb-2 text-sm font-medium text-text-secondary">{tile.label}</p>
            <p className="font-display text-[28px] font-normal text-text">{tile.value}</p>
          </div>
        ))}
      </div>

      {showFootnote && (
        <p className="mt-4 text-sm text-text-muted">
          {[
            counters.expired_invitations > 0
              ? fmt(t.partner.counters.expiredInvitations, {
                  count: counters.expired_invitations,
                  s: plural(counters.expired_invitations),
                })
              : null,
            counters.cancelled_total > 0
              ? fmt(t.partner.counters.cancelledTotal, {
                  count: counters.cancelled_total,
                  s: plural(counters.cancelled_total),
                })
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
    </section>
  )
}

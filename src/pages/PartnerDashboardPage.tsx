import { Navigate } from 'react-router-dom'
import { usePartnerDashboard } from '@/hooks/usePartnerDashboard'
import { useAccount } from '@/hooks/useAccount'
import { useT } from '@/i18n/useT'
import { AppHeader } from '@/components/layout/AppHeader'
import { SectionHeading } from '@/components/ui/section-heading'
import { PillBadge } from '@/components/ui/pill-badge'
import { Button } from '@/components/ui/button'
import { PartnerCounters } from '@/components/partner/PartnerCounters'
import { DossierForm } from '@/components/partner/DossierForm'
import { DossierCard } from '@/components/partner/DossierCard'

// Espace partenaire v2 (contrat §2.2, §4.4). Règle rouge : identité de la famille et du défunt
// seulement, JAMAIS le contenu. Gardé par RequireAccess area="partner" + RPC côté serveur.
export function PartnerDashboardPage() {
  const t = useT()
  const { me } = useAccount()
  const { loading, error, notPartner, partner, dossiers, counters, refresh, createDossier, resendInvitation, cancelDossier } = usePartnerDashboard()
  const activationsEnabled = me?.flags.partner_activations_enabled !== false

  if (notPartner) return <Navigate to="/" replace />

  return (
    <div className="min-h-screen bg-bg">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        {loading && (
          <div className="flex min-h-[40vh] items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-border border-t-primary" />
          </div>
        )}
        {!loading && error && (
          <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
            <p className="mb-4 text-text-secondary">{t.partner.loadError}</p>
            <Button onClick={() => void refresh()}>{t.partner.retry}</Button>
          </div>
        )}
        {!loading && !error && partner && counters && (
          <>
            <SectionHeading as="h1" className="mb-3 max-w-none" title={t.partner.title} lead={partner.name} />
            <PillBadge tone="neutral" className="mb-8">
              {partner.user_role === 'manager' ? t.partner.roleManager : t.partner.roleAdvisor}
            </PillBadge>
            <PartnerCounters counters={counters} />
            {/* v2:billing-preview */}
            <section className="mt-10">
              <DossierForm onCreate={createDossier} activationsEnabled={activationsEnabled} />
            </section>
            <section className="mt-10">
              <h2 className="mb-4 font-display text-2xl font-normal text-text">{t.partner.list.title}</h2>
              {dossiers.length === 0 ? (
                <p className="text-text-muted">{t.partner.list.empty}</p>
              ) : (
                <div className="space-y-4">
                  {dossiers.map((dossier) => (
                    <DossierCard key={dossier.id} dossier={dossier} onResend={resendInvitation} onCancel={cancelDossier} activationsEnabled={activationsEnabled} />
                  ))}
                </div>
              )}
            </section>
            <p className="mt-10 text-center text-sm italic text-text-muted">{t.partner.privacyNotice}</p>
          </>
        )}
      </main>
    </div>
  )
}

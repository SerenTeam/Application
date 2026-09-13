import { Navigate } from 'react-router-dom'
import { usePartnerDashboard, formatEuroCents } from '@/hooks/usePartnerDashboard'
import { useT } from '@/i18n/useT'
import { useLang } from '@/i18n/LanguageContext'
import { fmt } from '@/i18n'
import { AppHeader, HeaderNavLink } from '@/components/layout/AppHeader'
import { SectionHeading } from '@/components/ui/section-heading'
import { PillBadge } from '@/components/ui/pill-badge'

// Espace partenaire (v0-démo, docs/design-pf-dashboard-demo.md). Accès par URL uniquement —
// AUCUN lien n'existe vers /partenaire dans la navigation partagée (Sidebar/AppHeader) : c'est
// une décision de spec, pas un oubli, le risque pour l'app famille doit rester nul.
export function PartnerDashboardPage() {
  const { loading, data, error } = usePartnerDashboard()
  const t = useT()
  const { lang } = useLang()

  if (loading) {
    return (
      <div className="min-h-screen bg-bg">
        <AppHeader>
          <HeaderNavLink to="/dashboard">{t.layout.dashboard}</HeaderNavLink>
        </AppHeader>
        <div className="flex min-h-[calc(100vh-82px)] items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-border border-t-primary" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-bg">
        <AppHeader>
          <HeaderNavLink to="/dashboard">{t.layout.dashboard}</HeaderNavLink>
        </AppHeader>
        <div className="flex min-h-[calc(100vh-82px)] flex-col items-center justify-center px-6 text-center">
          <h1 className="mb-3 font-display text-2xl font-normal text-text">
            {t.errors.somethingWrongTitle}
          </h1>
          <p className="max-w-md text-text-secondary">{t.errors.somethingWrongDescription}</p>
        </div>
      </div>
    )
  }

  // Compte non rattaché à une PF (`partner_users` vide pour cet utilisateur) : pas d'espace
  // partenaire pour ce compte, retour au dashboard famille.
  if (data === null) {
    return <Navigate to="/dashboard" replace />
  }

  const formattedRate = new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'fr-FR', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(data.commission_rate)

  const tiles: { key: string; label: string; value: string }[] = [
    { key: 'attributed', label: t.partner.tiles.attributed, value: String(data.attributed_count) },
    { key: 'paid', label: t.partner.tiles.paid, value: String(data.paid_count) },
    { key: 'revenue', label: t.partner.tiles.revenue, value: formatEuroCents(data.revenue_cents, lang) },
    { key: 'commission', label: t.partner.tiles.commission, value: formatEuroCents(data.commission_cents, lang) },
  ]

  return (
    <div className="min-h-screen bg-bg">
      <AppHeader>
        <HeaderNavLink to="/dashboard">{t.layout.dashboard}</HeaderNavLink>
      </AppHeader>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
        <SectionHeading as="h1" className="mb-3 max-w-none" title={t.partner.title} lead={data.partner_name} />
        <PillBadge tone="primary" className="mb-10">
          {fmt(t.partner.rateLabel, { rate: formattedRate })}
        </PillBadge>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((tile) => (
            <div
              key={tile.key}
              className="rounded-card border border-border-card bg-white p-6 shadow-card-border"
            >
              <p className="mb-2 text-sm font-medium text-text-secondary">{tile.label}</p>
              <p className="font-display text-[28px] font-normal text-text">{tile.value}</p>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm italic text-text-muted">{t.partner.previewNotice}</p>
      </main>
    </div>
  )
}

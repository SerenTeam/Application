import { AppHeader } from '@/components/layout/AppHeader'
import { SectionHeading } from '@/components/ui/section-heading'
import { PillBadge } from '@/components/ui/pill-badge'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/useT'
import { useLang } from '@/i18n/LanguageContext'
import { fmt } from '@/i18n'
import { useAdminOverview, type AdminPartnerRow } from '@/hooks/useAdminOverview'

// Vue admin Seren (contrat §3.3.14, §4.6, décision D9). Règle rouge : des COMPTEURS par
// partenaire, jamais une donnée de famille — aucune colonne famille, défunt ou e-mail n'est
// affichable ici, la RPC n'en renvoie aucune. La garde est côté serveur (403 NOT_ADMIN → état
// `forbidden`) ; l'enveloppe `RequireAccess area="admin"` est ajoutée au merge de L3 (note N6).
const TONE_BY_STATUS: Record<AdminPartnerRow['status'], 'success' | 'warning' | 'neutral'> = {
  prospect: 'neutral',
  active: 'success',
  suspended: 'warning',
  terminated: 'neutral',
}

const NUMERIC_COLUMNS = ['dossiers_total', 'dossiers_this_month', 'invited_pending', 'activated', 'cancelled'] as const

export function AdminPage() {
  const t = useT()
  const { lang } = useLang()
  const { loading, forbidden, error, overview, refresh } = useAdminOverview()

  const locale = lang === 'en' ? 'en-GB' : 'fr-FR'
  const formatDate = (iso: string | null, withTime = false) => {
    if (!iso) return t.admin.never
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return t.admin.never
    return new Intl.DateTimeFormat(locale, {
      // Europe/Paris, comme le mois en cours et la borne « créés ce mois » de la RPC (§3.3.14) :
      // sans ce fuseau, un admin hors de France lirait des dates décalées par rapport aux compteurs.
      timeZone: 'Europe/Paris',
      dateStyle: 'short',
      ...(withTime ? { timeStyle: 'short' as const } : {}),
    }).format(date)
  }

  const rows = overview?.partners ?? []
  // Spinner au tout premier chargement seulement : pendant un rafraîchissement, le tableau reste
  // affiché (grisé) au lieu de disparaître.
  const initialLoading = loading && !overview
  const totals = rows.reduce(
    (acc, row) => {
      for (const key of NUMERIC_COLUMNS) acc[key] += row[key]
      return acc
    },
    { dossiers_total: 0, dossiers_this_month: 0, invited_pending: 0, activated: 0, cancelled: 0 }
  )

  const headerCell = 'px-4 py-3 font-medium text-text-secondary'
  const numericCell = 'px-4 py-3 text-right tabular-nums text-text'

  return (
    <div className="min-h-screen bg-bg">
      <AppHeader />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <SectionHeading as="h1" className="mb-6 max-w-none" title={t.admin.title} lead={t.admin.lead} />

        {overview && (
          <div className="mb-8 flex flex-wrap items-center gap-3">
            <PillBadge tone="primary">{fmt(t.admin.month, { month: overview.month })}</PillBadge>
            <span className="text-sm text-text-secondary">
              {fmt(t.admin.generatedAt, { date: formatDate(overview.generated_at, true) })}
            </span>
            <Button variant="outline" size="sm" className="sm:ml-auto" disabled={loading} onClick={() => void refresh()}>
              {t.admin.refresh}
            </Button>
          </div>
        )}

        {initialLoading && (
          <div className="flex justify-center py-16">
            <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-border border-t-primary" />
          </div>
        )}

        {!loading && forbidden && <p className="py-8 text-text-secondary">{t.admin.forbidden}</p>}

        {!loading && !forbidden && error && (
          <div className="flex flex-col items-start gap-4 py-8">
            <p className="text-text-secondary">{t.admin.loadError}</p>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              {t.admin.refresh}
            </Button>
          </div>
        )}

        {overview && rows.length === 0 && <p className="py-8 text-text-secondary">{t.admin.empty}</p>}

        {overview && rows.length > 0 && (
          <div
            aria-busy={loading}
            className={`overflow-x-auto rounded-card border border-border-card bg-white shadow-card-border transition-opacity${
              loading ? ' opacity-60' : ''
            }`}
          >
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-card">
                  <th className={headerCell}>{t.admin.columns.partner}</th>
                  <th className={headerCell}>{t.admin.columns.status}</th>
                  <th className={`${headerCell} text-right`}>{t.admin.columns.total}</th>
                  <th className={`${headerCell} text-right`}>{t.admin.columns.thisMonth}</th>
                  <th className={`${headerCell} text-right`}>{t.admin.columns.pending}</th>
                  <th className={`${headerCell} text-right`}>{t.admin.columns.activated}</th>
                  <th className={`${headerCell} text-right`}>{t.admin.columns.cancelled}</th>
                  <th className={headerCell}>{t.admin.columns.lastDossier}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.partner_id} className="border-b border-border-card last:border-b-0">
                    <td className="px-4 py-3 font-medium text-text">{row.name}</td>
                    <td className="px-4 py-3">
                      {/* Replis : un statut hors des quatre valeurs de `partners_status_check` rendrait
                          sinon une pastille sans ton et un libellé vide. */}
                      <PillBadge tone={TONE_BY_STATUS[row.status] ?? 'neutral'}>
                        {t.admin.statusLabels[row.status] ?? row.status}
                      </PillBadge>
                    </td>
                    <td className={numericCell}>{row.dossiers_total}</td>
                    <td className={numericCell}>{row.dossiers_this_month}</td>
                    <td className={numericCell}>{row.invited_pending}</td>
                    <td className={numericCell}>{row.activated}</td>
                    <td className={numericCell}>{row.cancelled}</td>
                    <td className="px-4 py-3 text-text-secondary">{formatDate(row.last_dossier_at)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border-card bg-bg font-medium">
                  <td className="px-4 py-3 text-text">{t.admin.totals}</td>
                  <td className="px-4 py-3" />
                  <td className={numericCell}>{totals.dossiers_total}</td>
                  <td className={numericCell}>{totals.dossiers_this_month}</td>
                  <td className={numericCell}>{totals.invited_pending}</td>
                  <td className={numericCell}>{totals.activated}</td>
                  <td className={numericCell}>{totals.cancelled}</td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}

import { Clock } from 'lucide-react'
import { useT } from '@/i18n/useT'

/**
 * SER-65 — Page de maintenance planifiée.
 * Ton apaisant, pas de CTA car l'app est indisponible.
 */
export function MaintenancePage() {
  const t = useT()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-page-bg px-6">
      <div className="w-full max-w-md rounded-card bg-white p-10 text-center shadow-card max-sm:p-7">
        <div
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary-light"
          aria-hidden="true"
        >
          <Clock className="h-7 w-7 text-primary" />
        </div>

        <h1 className="mb-3 font-display text-[28px] font-normal leading-[1.3] text-text">
          {t.errors.maintenanceTitle}
        </h1>

        <p className="mb-2 font-body text-[16px] text-text-secondary">
          {t.errors.maintenanceDescription}
        </p>

        <p className="text-sm text-text-muted">
          {t.errors.maintenanceDataSafe}
        </p>
      </div>
    </div>
  )
}

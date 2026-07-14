import { Clock } from 'lucide-react'
import { useT } from '@/i18n/useT'

/**
 * SER-65 — Page de maintenance planifiée.
 * Ton apaisant, pas de CTA car l'app est indisponible.
 */
export function MaintenancePage() {
  const t = useT()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6">
      <div className="w-full max-w-md rounded-[20px] bg-bg-card p-8 text-center shadow-md">
        <Clock
          className="mx-auto mb-6 h-14 w-14 text-accent/60"
          aria-hidden="true"
        />

        <h1 className="mb-3 font-display text-[2rem] font-medium text-text">
          {t.errors.maintenanceTitle}
        </h1>

        <p className="mb-2 text-[1.05rem] text-text-soft">
          {t.errors.maintenanceDescription}
        </p>

        <p className="text-sm text-text-muted">
          {t.errors.maintenanceDataSafe}
        </p>
      </div>
    </div>
  )
}

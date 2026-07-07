import { Clock } from 'lucide-react'

/**
 * SER-65 — Page de maintenance planifiée.
 * Ton apaisant, pas de CTA car l'app est indisponible.
 */
export function MaintenancePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6">
      <div className="w-full max-w-md rounded-[20px] bg-bg-card p-8 text-center shadow-md">
        <Clock
          className="mx-auto mb-6 h-14 w-14 text-accent/60"
          aria-hidden="true"
        />

        <h1 className="mb-3 font-display text-[2rem] font-medium text-text">
          Seren est en maintenance
        </h1>

        <p className="mb-2 text-[1.05rem] text-text-soft">
          Nous améliorons le service pour mieux vous accompagner.
          Revenez dans quelques minutes.
        </p>

        <p className="text-sm text-text-muted">
          Vos données restent en sécurité pendant cette opération.
        </p>
      </div>
    </div>
  )
}

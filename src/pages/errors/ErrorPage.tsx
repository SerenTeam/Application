import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ArrowRight, RefreshCw, AlertTriangle } from 'lucide-react'
import { useT } from '@/i18n/useT'

/**
 * SER-65 — Page d'erreur serveur (500).
 * Utilisée par l'ErrorBoundary et accessible via /erreur.
 * Ton rassurant : « Vos données sont en sécurité. »
 */
export function ErrorPage() {
  const t = useT()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-page-bg px-6">
      <div className="w-full max-w-md rounded-card bg-white p-10 text-center shadow-card max-sm:p-7">
        <div
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-warning-light"
          aria-hidden="true"
        >
          <AlertTriangle className="h-7 w-7 text-warning" />
        </div>

        <h1 className="mb-3 font-display text-[28px] font-normal leading-[1.3] text-text">
          {t.errors.somethingWrongTitle}
        </h1>

        <p className="mb-8 font-body text-[16px] text-text-secondary">
          {t.errors.somethingWrongDescription}
        </p>

        <div className="flex flex-col gap-3">
          <Button
            onClick={() => window.location.reload()}
            className="w-full gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            {t.errors.retry}
          </Button>

          <Button asChild variant="outline" className="w-full gap-2">
            <Link to="/">
              {t.errors.backToHome}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

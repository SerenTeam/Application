import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ArrowRight, RefreshCw } from 'lucide-react'
import { useT } from '@/i18n/useT'

/**
 * SER-65 — Page d'erreur serveur (500).
 * Utilisée par l'ErrorBoundary et accessible via /erreur.
 * Ton rassurant : « Vos données sont en sécurité. »
 */
export function ErrorPage() {
  const t = useT()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6">
      <div className="w-full max-w-md rounded-[20px] bg-bg-card p-8 text-center shadow-md">
        <div
          className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-warning/10"
          aria-hidden="true"
        >
          <span className="text-3xl">⚙️</span>
        </div>

        <h1 className="mb-3 font-display text-[2rem] font-medium text-text">
          {t.errors.somethingWrongTitle}
        </h1>

        <p className="mb-8 text-[1.05rem] text-text-soft">
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

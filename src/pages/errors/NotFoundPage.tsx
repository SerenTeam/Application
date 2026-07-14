import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { ArrowRight, Search } from 'lucide-react'
import { useT } from '@/i18n/useT'

/**
 * SER-65 — Page 404
 * Ton apaisant, CTA adapté selon l'état de connexion.
 */
export function NotFoundPage() {
  const { user } = useAuth()
  const t = useT()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6">
      <div className="w-full max-w-md rounded-[20px] bg-bg-card p-8 text-center shadow-md">
        <Search
          className="mx-auto mb-6 h-14 w-14 text-accent/60"
          aria-hidden="true"
        />

        <h1 className="mb-3 font-display text-[2rem] font-medium text-text">
          {t.errors.notFoundTitle}
        </h1>

        <p className="mb-8 text-[1.05rem] text-text-soft">
          {t.errors.notFoundDescription}
        </p>

        <Button asChild className="w-full gap-2">
          <Link to={user ? '/dashboard' : '/'}>
            {user ? t.errors.resumeSteps : t.errors.backToHome}
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
      </div>
    </div>
  )
}

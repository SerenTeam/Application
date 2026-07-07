import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { ArrowRight, Search } from 'lucide-react'

/**
 * SER-65 — Page 404
 * Ton apaisant, CTA adapté selon l'état de connexion.
 */
export function NotFoundPage() {
  const { user } = useAuth()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6">
      <div className="w-full max-w-md rounded-[20px] bg-bg-card p-8 text-center shadow-md">
        <Search
          className="mx-auto mb-6 h-14 w-14 text-accent/60"
          aria-hidden="true"
        />

        <h1 className="mb-3 font-display text-[2rem] font-medium text-text">
          Cette page n'existe pas
        </h1>

        <p className="mb-8 text-[1.05rem] text-text-soft">
          Il se peut que ce lien soit obsolète ou que l'adresse ait changé.
          Pas d'inquiétude, vos données sont en sécurité.
        </p>

        <Button asChild className="w-full gap-2">
          <Link to={user ? '/dashboard' : '/'}>
            {user ? 'Reprendre mes démarches' : 'Retour à l\u2019accueil'}
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
      </div>
    </div>
  )
}

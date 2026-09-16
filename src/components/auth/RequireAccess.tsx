import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAccount } from '@/hooks/useAccount'
import { resolveAccessRedirect, type AccessArea } from '@/lib/access-redirect'
import { AccessNotActivatedScreen } from '@/components/auth/AccessNotActivatedScreen'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/useT'

const DEFAULT_SUPPORT_EMAIL = 'support@seren-app.fr'

// Garde d'accès (contrat §7.2), à placer DANS ProtectedRoute. Erreur de lecture de /api/me :
// écran d'erreur générique, JAMAIS les routes protégées.
export function RequireAccess({ area, children }: { area: AccessArea; children: ReactNode }) {
  const t = useT()
  const { loading, error, me, refresh } = useAccount()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-border border-t-accent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center">
        <h1 className="mb-3 font-display text-2xl font-normal text-text">{t.errors.somethingWrongTitle}</h1>
        <p className="mb-6 max-w-md text-text-secondary">{t.errors.somethingWrongDescription}</p>
        <Button onClick={() => void refresh()}>{t.errors.retry}</Button>
      </div>
    )
  }

  const decision = resolveAccessRedirect(me?.account ?? null, area)
  if (decision.kind === 'redirect') return <Navigate to={decision.to} replace />
  if (decision.kind === 'screen') return <AccessNotActivatedScreen supportEmail={me?.support_email ?? DEFAULT_SUPPORT_EMAIL} />
  return <>{children}</>
}

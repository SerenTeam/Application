import { useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'
import { Check, ArrowRight } from 'lucide-react'
import { useT } from '@/i18n/useT'

/**
 * SER-59 — Page affichée après une réinitialisation de mot de passe réussie.
 *
 * Guard : si l'utilisateur accède directement à cette URL sans avoir
 * effectué le reset (pas de referrer interne), on redirige vers /login.
 */
export function ResetPasswordSuccessPage() {
  const t = useT()
  const navigate = useNavigate()

  useEffect(() => {
    // Protection contre l'accès direct :
    // Le flag est posé par la navigation interne (replace: true depuis ResetPasswordConfirmPage).
    // Si on arrive ici par URL directe, window.history.state sera null.
    const navState = window.history.state
    if (!navState || !navState.usr) {
      // Pas de state React Router → accès direct, rediriger
      navigate('/login', { replace: true })
    }
  }, [navigate])

  return (
    <AuthLayout>
      <div className="rounded-card border border-border-card bg-white p-10 shadow-card-border max-sm:p-7">
        <div className="flex flex-col items-center gap-5 text-center">
          <IconBadge size="md" tone="primary">
            <Check strokeWidth={2} />
          </IconBadge>

          <h1 className="font-display text-[28px] font-normal leading-[1.3] text-text">
            {t.auth.resetSuccess.title}
          </h1>

          <p className="font-body text-[16px] text-text-secondary">
            {t.auth.resetSuccess.description}
          </p>

          <Button asChild className="mt-4 w-full gap-2">
            <Link to="/login">
              {t.auth.resetSuccess.signIn}
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
        </div>
      </div>
    </AuthLayout>
  )
}

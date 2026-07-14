import { useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/button'
import { CheckCircle, ArrowRight } from 'lucide-react'
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
      <div className="rounded-[20px] bg-bg-card p-8 shadow-md">
        <div className="flex flex-col items-center gap-5 text-center">
          <CheckCircle
            className="h-14 w-14 text-accent"
            aria-hidden="true"
          />

          <h1 className="font-display text-[2rem] font-medium text-accent">
            {t.auth.resetSuccess.title}
          </h1>

          <p className="text-[1.05rem] text-text-soft">
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

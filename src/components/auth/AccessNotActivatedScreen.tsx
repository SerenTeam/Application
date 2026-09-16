import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { useT } from '@/i18n/useT'
import { fmt } from '@/i18n'

// Écran rendu par RequireAccess (pas une route) : compte sans dossier actif ni rôle interne.
export function AccessNotActivatedScreen({ supportEmail }: { supportEmail: string }) {
  const t = useT()
  const { signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <AuthLayout>
      <div className="rounded-card border border-border-card bg-white p-10 text-center shadow-card-border max-sm:p-7">
        <h1 className="mb-3 font-display text-[28px] font-normal leading-[1.3] text-text">{t.access.notActivatedTitle}</h1>
        <p className="mb-6 text-text-secondary">{t.access.notActivatedBody}</p>
        <p className="mb-8 text-sm text-text-muted">
          {fmt(t.access.supportLine, { email: supportEmail })}
        </p>
        <div className="flex flex-col items-center gap-3">
          <Button onClick={() => void handleSignOut()}>{t.access.signOut}</Button>
          <Link to="/login" className="text-sm font-medium text-primary underline hover:text-primary-hover">
            {t.access.backToLogin}
          </Link>
        </div>
      </div>
    </AuthLayout>
  )
}

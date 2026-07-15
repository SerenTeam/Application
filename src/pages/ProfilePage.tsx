import { useAuth } from '@/hooks/useAuth'
import { ChangePasswordForm } from '@/components/profile/ChangePasswordForm'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AppHeader, HeaderNavLink } from '@/components/layout/AppHeader'
import { SectionHeading } from '@/components/ui/section-heading'
import { useT } from '@/i18n/useT'

export function ProfilePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const t = useT()

  return (
    <div className="min-h-screen bg-bg">
      {/* showEmail=false : l'email est déjà affiché plus bas dans la carte "Informations du compte" */}
      <AppHeader showEmail={false}>
        <HeaderNavLink onClick={() => navigate('/')}>{t.profile.backToQuestionnaire}</HeaderNavLink>
      </AppHeader>

      <main className="mx-auto max-w-[600px] px-6 py-8 sm:py-12">
        <button
          onClick={() => navigate(-1)}
          className="mb-8 flex items-center gap-2 text-sm text-text-secondary hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t.profile.back}
        </button>

        <SectionHeading
          as="h1"
          className="mb-8 max-w-none"
          title={t.profile.title}
          lead={t.profile.subtitle}
        />

        {/* User info card */}
        <div className="mb-8 rounded-card border border-border-card bg-white p-10 shadow-card-border max-sm:p-7">
          <h2 className="mb-4 font-display text-[1.5rem] font-normal text-text">
            {t.profile.infoTitle}
          </h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-text-secondary">Email</p>
              <p className="text-[1.05rem] text-text">{user?.email}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-text-secondary">{t.profile.firstNameLabel}</p>
              <p className="text-[1.05rem] text-text">
                {user?.user_metadata?.first_name || t.profile.notProvided}
              </p>
            </div>
          </div>
        </div>

        {/* SER-22: Change password form */}
        <ChangePasswordForm />
      </main>
    </div>
  )
}

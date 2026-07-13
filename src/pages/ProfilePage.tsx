import { useAuth } from '@/hooks/useAuth'
import { ChangePasswordForm } from '@/components/profile/ChangePasswordForm'
import { ArrowLeft } from 'lucide-react'
import { useNavigate, Link } from 'react-router-dom'
import { LanguageSwitch } from '@/components/layout/LanguageSwitch'

export function ProfilePage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-bg">
      <header className="flex items-center justify-between border-b border-border-soft bg-bg-card px-6 py-5 sm:px-8 sm:py-6">
        <Link to="/" className="font-display text-[1.5rem] font-medium text-accent">
          Seren<span className="italic font-normal">.</span>
        </Link>
        <nav className="flex items-center gap-4 sm:gap-6">
          <button onClick={() => navigate('/')} className="text-text-soft text-sm hover:text-accent transition-colors">
            Questionnaire
          </button>
          <button onClick={signOut} className="text-text-soft text-sm hover:text-accent transition-colors">
            Déconnexion
          </button>
          <LanguageSwitch />
        </nav>
      </header>

      <main className="mx-auto max-w-[600px] px-6 py-8 sm:py-12">
        <button
          onClick={() => navigate(-1)}
          className="mb-8 flex items-center gap-2 text-sm text-text-soft hover:text-accent transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </button>

        <h1 className="mb-2 font-display text-[2rem] sm:text-[2.25rem] font-medium text-accent">
          Mon profil
        </h1>
        <p className="mb-8 text-[1.05rem] text-text-soft">
          Consultez et modifiez vos informations personnelles.
        </p>

        {/* User info card */}
        <div className="mb-8 rounded-[20px] bg-bg-card p-6 sm:p-8 shadow-md">
          <h2 className="mb-4 font-display text-[1.5rem] font-medium text-text">
            Informations
          </h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-text-soft">Email</p>
              <p className="text-[1.05rem] text-text">{user?.email}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-text-soft">Prénom</p>
              <p className="text-[1.05rem] text-text">
                {user?.user_metadata?.first_name || 'Non renseigné'}
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

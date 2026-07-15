import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useT } from '@/i18n/useT'
import { LanguageSwitch } from '@/components/layout/LanguageSwitch'
import { cn } from '@/lib/utils'

interface AppHeaderProps {
  /** `minimal` = wordmark + sélecteur de langue seulement (AuthLayout, avant connexion). */
  variant?: 'default' | 'minimal'
  /**
   * Masque l'email utilisateur même en variant `default`. Utile pour ProfilePage, qui
   * l'affiche déjà (plus en évidence) dans le corps de page — pas de doublon dans le header.
   */
  showEmail?: boolean
  /** Liens/actions contextuels propres à la page, rendus avant le bouton Déconnexion — voir `HeaderNavLink`. */
  children?: ReactNode
}

const navLinkClass =
  'whitespace-nowrap font-body text-[16px] text-text-secondary transition-colors hover:text-primary'

/** Lien (ou action) de nav du header, stylé de façon cohérente — à utiliser dans les `children` d'AppHeader. */
export function HeaderNavLink({
  to,
  onClick,
  children,
}: {
  to?: string
  onClick?: () => void
  children: ReactNode
}) {
  if (to) {
    return (
      <Link to={to} className={navLinkClass}>
        {children}
      </Link>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(navLinkClass, 'cursor-pointer border-none bg-transparent p-0')}
    >
      {children}
    </button>
  )
}

/**
 * Header applicatif unifié (DESIGN.md §6, docs/design-refonte-ui.md §3) : sticky, flouté,
 * wordmark « Seren. » + nav contextuelle. Remplace les 5 headers dupliqués (Dashboard,
 * Questionnaire, Profile, Documents, AuthLayout).
 *
 * NE PAS utiliser sur AccessPage/DemoPage : produit transmission gelé, header inline conservé.
 */
export function AppHeader({ variant = 'default', showEmail = true, children }: AppHeaderProps) {
  const { user, signOut } = useAuth()
  const t = useT()

  return (
    <header className="sticky top-0 z-50 flex h-[82px] items-center bg-white/80 shadow-card-border backdrop-blur-[16px]">
      <div className="flex w-full items-center justify-between gap-3 px-4 sm:px-6 md:px-8">
        <Link
          to="/"
          className="shrink-0 font-display text-2xl font-medium tracking-wide text-primary"
        >
          Seren<span className="italic font-normal">.</span>
        </Link>

        {variant === 'minimal' ? (
          <LanguageSwitch />
        ) : (
          <nav className="flex items-center gap-3 sm:gap-5 md:gap-6">
            {showEmail && user?.email && (
              <span className="hidden text-sm text-text-secondary md:inline">{user.email}</span>
            )}
            {children}
            <button
              type="button"
              onClick={signOut}
              className={cn(navLinkClass, 'cursor-pointer border-none bg-transparent p-0')}
            >
              {t.layout.signOut}
            </button>
            <LanguageSwitch />
          </nav>
        )}
      </div>
    </header>
  )
}

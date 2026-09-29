import { useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useT } from '@/i18n/useT'
import { LanguageSwitch } from '@/components/layout/LanguageSwitch'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface AppHeaderProps {
  /** `minimal` = wordmark + sélecteur de langue seulement (AuthLayout, avant connexion). */
  variant?: 'default' | 'minimal'
  /**
   * Masque l'email utilisateur même en variant `default`. Utile pour ProfilePage, qui
   * l'affiche déjà (plus en évidence) dans le corps de page — pas de doublon dans le header.
   */
  showEmail?: boolean
  /**
   * Liens/actions contextuels propres à la page, rendus avant le bouton Déconnexion — voir `HeaderNavLink`.
   * Rendus deux fois (nav en ligne ≥ `sm`, panneau du menu < `sm`) : liens sans état ni `id`.
   */
  children?: ReactNode
}

// Sous `sm`, ces liens ne s'affichent que dans le panneau du menu mobile : lignes pleine
// largeur de 48 px (cibles tactiles ≥ 44 px, DESIGN.md §7).
const navLinkClass =
  'whitespace-nowrap font-body text-[16px] text-text-secondary transition-colors hover:text-primary max-sm:flex max-sm:min-h-12 max-sm:w-full max-sm:items-center'

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
 * Sous `sm` (640 px) : liens de la page et Déconnexion passent dans un panneau ouvert par un
 * bouton ☰, le sélecteur FR/EN reste dans la barre — la nav en ligne demande jusqu'à 406 px en
 * FR et débordait sur téléphone. Seuil `sm` décidé par Arnaud (2026-09-29), et non le `lg` du
 * menu burger de la landing (DESIGN.md §6) : à partir de 640 px, rendu inchangé.
 *
 * NE PAS utiliser sur AccessPage : produit transmission gelé (lecture seule), header inline conservé.
 */
export function AppHeader({ variant = 'default', showEmail = true, children }: AppHeaderProps) {
  const { user, signOut } = useAuth()
  const t = useT()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const headerRef = useRef<HTMLElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  // Menu ouvert : Échap le referme (focus rendu au bouton) ; un appui ou un focus hors du header
  // aussi (WCAG 2.4.11 : le panneau ne doit pas masquer l'élément atteint au clavier) ; de même
  // au passage à ≥ 640 px (rotation), où le panneau n'est plus affiché.
  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      close()
      toggleRef.current?.focus()
    }
    const onOutside = (event: Event) => {
      if (!headerRef.current?.contains(event.target as Node)) close()
    }
    const wide = window.matchMedia('(width >= 40rem)')
    const onWide = (event: MediaQueryListEvent) => {
      if (event.matches) close()
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onOutside)
    document.addEventListener('focusin', onOutside)
    wide.addEventListener('change', onWide)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onOutside)
      document.removeEventListener('focusin', onOutside)
      wide.removeEventListener('change', onWide)
    }
  }, [menuOpen])

  // Un choix dans le panneau (lien de la page ou Déconnexion) referme le menu.
  const closeOnItemClick = (event: ReactMouseEvent<HTMLElement>) => {
    if ((event.target as Element).closest('a, button')) setMenuOpen(false)
  }

  // Filet sous `sm` : sépare l'action de compte des liens de la page, quand il y en a (sans lien,
  // Déconnexion est le premier élément du panneau : pas de double filet sous la bordure du panneau).
  const signOutButton = (
    <button
      type="button"
      onClick={signOut}
      className={cn(navLinkClass, 'cursor-pointer bg-transparent p-0 max-sm:border-border-soft max-sm:not-first:border-t')}
    >
      {t.layout.signOut}
    </button>
  )

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 flex h-[82px] items-center bg-white/80 shadow-card-border backdrop-blur-[16px]"
    >
      <div className="flex w-full items-center justify-between gap-3 px-4 sm:px-6 md:px-8">
        <Link to="/" className="shrink-0" onClick={() => setMenuOpen(false)}>
          <img src="/seren-logo.svg" alt="Seren" className="h-8 w-auto" />
        </Link>

        {variant === 'minimal' ? (
          <LanguageSwitch />
        ) : (
          <div className="flex items-center gap-3 sm:gap-5 md:gap-6">
            <nav className="hidden items-center gap-5 sm:flex md:gap-6">
              {showEmail && user?.email && (
                <span className="hidden text-sm text-text-secondary md:inline">{user.email}</span>
              )}
              {children}
              {signOutButton}
            </nav>
            <LanguageSwitch />
            <Button
              ref={toggleRef}
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? menuId : undefined}
              aria-label={t.layout.menu}
              className="sm:hidden [&_svg]:size-5"
            >
              {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            </Button>
          </div>
        )}
      </div>

      {variant !== 'minimal' && menuOpen && (
        <nav
          id={menuId}
          aria-label={t.layout.menu}
          onClick={closeOnItemClick}
          className="absolute inset-x-0 top-full flex flex-col border-t border-border-soft bg-white px-4 py-1 shadow-card-border sm:hidden"
        >
          {children}
          {signOutButton}
        </nav>
      )}
    </header>
  )
}

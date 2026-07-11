import { useState } from 'react'
import { Cookie, Shield, BarChart3, Settings2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  useCookieConsent,
  DEFAULT_CONSENT,
  type CookieConsent,
} from '@/hooks/useCookieConsent'

// ─── Toggle switch ──────────────────────────────────────────────────────────

interface ToggleProps {
  id: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
  label: string
}

function Toggle({ id, checked, disabled, onChange, label }: ToggleProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`
        relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center
        rounded-full border-2 border-transparent transition-colors
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
        ${disabled ? 'cursor-not-allowed opacity-60' : ''}
        ${checked ? 'bg-accent' : 'bg-border'}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm
          transition-transform
          ${checked ? 'translate-x-5' : 'translate-x-0.5'}
        `}
      />
    </button>
  )
}

// ─── Category card ──────────────────────────────────────────────────────────

interface CategoryProps {
  icon: React.ReactNode
  title: string
  description: string
  toggleId: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}

function CategoryCard({
  icon,
  title,
  description,
  toggleId,
  checked,
  disabled,
  onChange,
}: CategoryProps) {
  return (
    <div className="flex items-start gap-4 rounded-[var(--radius-md)] border border-border-soft bg-bg p-4">
      <div className="mt-0.5 shrink-0 text-accent">{icon}</div>
      <div className="flex-1 space-y-1">
        <div className="flex items-center justify-between">
          <label
            htmlFor={toggleId}
            className="text-sm font-medium text-text cursor-pointer"
          >
            {title}
          </label>
          <Toggle
            id={toggleId}
            checked={checked}
            disabled={disabled}
            onChange={onChange}
            label={title}
          />
        </div>
        <p className="text-xs text-text-muted leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

// ─── Modal de personnalisation ──────────────────────────────────────────────

interface ModalProps {
  onSave: (consent: CookieConsent) => void
  onClose: () => void
}

function CookieModal({ onSave, onClose }: ModalProps) {
  const [analytics, setAnalytics] = useState(false)
  const [functional, setFunctional] = useState(false)

  const handleSave = () => {
    onSave({ necessary: true, analytics, functional })
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Gestion des cookies"
    >
      <div className="relative w-full max-w-lg rounded-[var(--radius-lg)] bg-bg-card p-6 shadow-lg animate-[fade-in_0.2s_ease-out]">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-xl font-medium text-text">
            Gestion des cookies
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-5 text-sm text-text-soft leading-relaxed">
          Choisissez les cookies que vous souhaitez autoriser. Les cookies
          nécessaires assurent le bon fonctionnement du site et ne peuvent pas
          être désactivés.
        </p>

        {/* Categories */}
        <div className="space-y-3">
          <CategoryCard
            icon={<Shield className="h-5 w-5" />}
            title="Nécessaires"
            description="Authentification, sécurité et fonctionnement de base. Ces cookies sont indispensables."
            toggleId="cookie-necessary"
            checked={true}
            disabled={true}
            onChange={() => {}}
          />

          <CategoryCard
            icon={<BarChart3 className="h-5 w-5" />}
            title="Analytics"
            description="Nous aident à comprendre comment vous utilisez Seren pour améliorer votre expérience (PostHog)."
            toggleId="cookie-analytics"
            checked={analytics}
            onChange={setAnalytics}
          />

          <CategoryCard
            icon={<Settings2 className="h-5 w-5" />}
            title="Fonctionnels"
            description="Mémorisent vos préférences (thème, langue) pour personnaliser votre expérience."
            toggleId="cookie-functional"
            checked={functional}
            onChange={setFunctional}
          />
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button onClick={handleSave} className="flex-1">
            Enregistrer mes choix
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Banniere principale ────────────────────────────────────────────────────

/**
 * SER-63 -- Banniere de consentement cookies RGPD.
 *
 * Apparait en bas de l'ecran si l'utilisateur n'a pas encore fait de choix.
 * Trois options : Accepter tout, Refuser tout, Personnaliser.
 *
 * Le composant gere aussi la modale de personnalisation.
 */
export function CookieBanner() {
  const { consent, update } = useCookieConsent()
  const [showModal, setShowModal] = useState(false)

  // Ne pas afficher si consentement deja donne
  if (consent) return null

  const handleAcceptAll = () => {
    update({ necessary: true, analytics: true, functional: true })
  }

  const handleRefuseAll = () => {
    update({ ...DEFAULT_CONSENT })
  }

  const handleSaveCustom = (custom: CookieConsent) => {
    update(custom)
    setShowModal(false)
  }

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-50 animate-[fade-in_0.3s_ease-out] border-t border-border bg-bg-card px-4 py-5 shadow-lg sm:px-6"
        role="region"
        aria-label="Bannière de consentement cookies"
      >
        <div className="mx-auto flex max-w-4xl flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          {/* Texte */}
          <div className="flex items-start gap-3 sm:flex-1">
            <Cookie
              className="mt-0.5 h-5 w-5 shrink-0 text-accent"
              aria-hidden="true"
            />
            <p className="text-sm text-text-soft leading-relaxed">
              Nous utilisons des cookies pour améliorer votre expérience sur
              Seren. Vous pouvez personnaliser vos choix à tout moment.{' '}
              <a
                href="/security"
                className="font-medium text-accent underline hover:text-accent-hover"
              >
                En savoir plus
              </a>
            </p>
          </div>

          {/* Boutons */}
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefuseAll}
              className="text-xs"
            >
              Refuser tout
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowModal(true)}
              className="text-xs"
            >
              Personnaliser
            </Button>
            <Button size="sm" onClick={handleAcceptAll} className="text-xs">
              Accepter tout
            </Button>
          </div>
        </div>
      </div>

      {/* Modale de personnalisation */}
      {showModal && (
        <CookieModal
          onSave={handleSaveCustom}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}

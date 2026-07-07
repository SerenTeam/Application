import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePasswordVisibility } from '@/hooks/usePasswordVisibility'

interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Identifiant unique pour les attributs aria */
  id: string
}

/**
 * Champ mot de passe avec toggle œil (SER-15).
 * Compatible avec react-hook-form via forwardRef.
 */
const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, id, ...props }, ref) => {
    const { isVisible, inputType, toggle } = usePasswordVisibility()

    return (
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={inputType}
          className={cn(
            'flex h-10 w-full rounded-[var(--radius-sm)] border border-border bg-bg-card px-3 py-2 pr-10 text-sm text-text ring-offset-bg-card file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
          {...props}
        />
        <button
          type="button"
          onClick={toggle}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={isVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          tabIndex={0}
        >
          {isVisible ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    )
  },
)

PasswordInput.displayName = 'PasswordInput'

export { PasswordInput }

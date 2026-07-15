import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePasswordVisibility } from '@/hooks/usePasswordVisibility'
import { useT } from '@/i18n/useT'

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
    const t = useT()

    return (
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={inputType}
          className={cn(
            'flex h-[52px] w-full rounded-2xl border border-border bg-white px-4 pr-12 text-[16px] text-text outline-none transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-text-muted focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
          {...props}
        />
        <button
          type="button"
          onClick={toggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label={isVisible ? t.auth.passwordInput.hide : t.auth.passwordInput.show}
          tabIndex={0}
        >
          {isVisible ? (
            <EyeOff className="h-[18px] w-[18px]" aria-hidden="true" />
          ) : (
            <Eye className="h-[18px] w-[18px]" aria-hidden="true" />
          )}
        </button>
      </div>
    )
  },
)

PasswordInput.displayName = 'PasswordInput'

export { PasswordInput }

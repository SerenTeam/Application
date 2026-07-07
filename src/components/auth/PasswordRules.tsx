import { Check, X } from 'lucide-react'
import { PASSWORD_RULES } from '@/hooks/usePasswordValidation'
import type { PasswordValidation } from '@/types/auth'

interface PasswordRulesProps {
  validation: PasswordValidation
  show: boolean
}

export function PasswordRules({ validation, show }: PasswordRulesProps) {
  if (!show) return null

  return (
    <ul className="mt-3 space-y-1.5" role="list" aria-label="Règles du mot de passe">
      {PASSWORD_RULES.map(({ id, label }) => {
        const passed = validation[id]
        return (
          <li
            key={id}
            className="flex items-center gap-2 text-sm"
            aria-label={`${label}: ${passed ? 'validé' : 'non respecté'}`}
          >
            {passed ? (
              <Check className="h-4 w-4 text-success" aria-hidden="true" />
            ) : (
              <X className="h-4 w-4 text-error" aria-hidden="true" />
            )}
            <span className={passed ? 'text-text-soft' : 'text-error'}>
              {label}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

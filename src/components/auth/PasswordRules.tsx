import { Check, X } from 'lucide-react'
import { PASSWORD_RULES } from '@/hooks/usePasswordValidation'
import { useT } from '@/i18n/useT'
import { fmt } from '@/i18n'
import type { PasswordValidation } from '@/types/auth'

interface PasswordRulesProps {
  validation: PasswordValidation
  show: boolean
}

export function PasswordRules({ validation, show }: PasswordRulesProps) {
  const t = useT()
  if (!show) return null

  return (
    <ul className="mt-3 space-y-1.5" role="list" aria-label={t.auth.passwordRulesAriaLabel}>
      {PASSWORD_RULES.map(({ id }) => {
        const passed = validation[id]
        const label = t.validation.rules[id]
        return (
          <li
            key={id}
            className="flex items-center gap-2 text-sm"
            aria-label={fmt(t.auth.passwordRuleStatusTemplate, {
              label,
              status: passed ? t.auth.ruleMet : t.auth.ruleNotMet,
            })}
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

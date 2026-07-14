import { useMemo } from 'react'
import type { PasswordValidation, PasswordStrength } from '@/types/auth'

// Les libellés ne sont plus portés ici : ils dépendent de la langue active et sont
// résolus par le composant `PasswordRules` via `useT().validation.rules[id]`.
export const PASSWORD_RULES = [
  { id: 'minLength' as const, test: (p: string) => p.length >= 8 },
  { id: 'hasUppercase' as const, test: (p: string) => /[A-Z]/.test(p) },
  { id: 'hasDigit' as const, test: (p: string) => /\d/.test(p) },
  { id: 'hasSpecialChar' as const, test: (p: string) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p) },
]

export function usePasswordValidation(password: string) {
  const validation: PasswordValidation = useMemo(() => ({
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasDigit: /\d/.test(password),
    hasSpecialChar: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
  }), [password])

  const score = useMemo(() => {
    return Object.values(validation).filter(Boolean).length
  }, [validation])

  const strength: PasswordStrength = useMemo(() => {
    if (score <= 1) return 'faible'
    if (score <= 3) return 'moyen'
    return 'fort'
  }, [score])

  const isValid = useMemo(() => {
    return Object.values(validation).every(Boolean)
  }, [validation])

  return { validation, strength, score, isValid }
}

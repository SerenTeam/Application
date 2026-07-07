export interface PasswordValidation {
  minLength: boolean
  hasUppercase: boolean
  hasDigit: boolean
  hasSpecialChar: boolean
}

export type PasswordStrength = 'faible' | 'moyen' | 'fort'

import { PasswordInput } from '@/components/auth/PasswordInput'
import { Label } from '@/components/ui/label'
import { Check, X } from 'lucide-react'
import { useT } from '@/i18n/useT'

interface PasswordConfirmFieldProps {
  password: string
  confirmPassword: string
  onChange: (value: string) => void
  error?: string
}

export function PasswordConfirmField({
  password,
  confirmPassword,
  onChange,
  error,
}: PasswordConfirmFieldProps) {
  const t = useT()
  const hasTyped = confirmPassword.length > 0
  const matches = hasTyped && password === confirmPassword
  const showMismatch = hasTyped && password !== confirmPassword

  return (
    <div className="space-y-2">
      <Label htmlFor="confirmPassword" className="font-medium text-text">
        {t.auth.passwordConfirm.label}
      </Label>
      <PasswordInput
        id="confirmPassword"
        placeholder="........"
        value={confirmPassword}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="new-password"
        aria-describedby={showMismatch ? 'confirm-error' : matches ? 'confirm-success' : undefined}
        aria-invalid={showMismatch}
        className={showMismatch ? 'border-error focus-visible:ring-error' : matches ? 'border-success focus-visible:ring-success' : ''}
      />
      {showMismatch && (
        <p id="confirm-error" className="flex items-center gap-1.5 text-sm text-error" role="alert">
          <X className="h-4 w-4" aria-hidden="true" />
          {t.auth.passwordConfirm.mismatch}
        </p>
      )}
      {matches && (
        <p id="confirm-success" className="flex items-center gap-1.5 text-sm text-success">
          <Check className="h-4 w-4" aria-hidden="true" />
          {t.auth.passwordConfirm.match}
        </p>
      )}
      {error && !showMismatch && (
        <p className="text-sm text-error" role="alert">{error}</p>
      )}
    </div>
  )
}

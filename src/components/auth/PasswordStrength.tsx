import { useT } from '@/i18n/useT'
import { fmt } from '@/i18n'
import type { PasswordStrength as PasswordStrengthType } from '@/types/auth'

interface PasswordStrengthProps {
  strength: PasswordStrengthType
  score: number
  show: boolean
}

// Codes internes ('faible' | 'moyen' | 'fort') indépendants de la langue —
// seuls les libellés affichés (t.auth.strengthWeak/Medium/Strong) varient.
const strengthStyles = {
  faible: { colorClass: 'bg-error', textClass: 'text-error' },
  moyen: { colorClass: 'bg-warning', textClass: 'text-warning' },
  fort: { colorClass: 'bg-success', textClass: 'text-success' },
}

export function PasswordStrengthIndicator({ strength, score, show }: PasswordStrengthProps) {
  const t = useT()
  if (!show) return null

  const style = strengthStyles[strength]
  const label = { faible: t.auth.strengthWeak, moyen: t.auth.strengthMedium, fort: t.auth.strengthStrong }[strength]
  const percentage = (score / 4) * 100

  return (
    <div className="mt-3" role="status" aria-live="polite">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-text-soft">{t.auth.passwordStrengthTitle}</span>
        <span className={`text-sm font-medium ${style.textClass}`}>
          {label}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-border overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${style.colorClass}`}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={4}
          aria-label={fmt(t.auth.passwordStrengthAriaTemplate, { label })}
        />
      </div>
    </div>
  )
}

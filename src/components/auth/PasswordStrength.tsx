import type { PasswordStrength as PasswordStrengthType } from '@/types/auth'

interface PasswordStrengthProps {
  strength: PasswordStrengthType
  score: number
  show: boolean
}

const strengthConfig = {
  faible: { label: 'Faible', colorClass: 'bg-error', textClass: 'text-error' },
  moyen: { label: 'Moyen', colorClass: 'bg-warning', textClass: 'text-warning' },
  fort: { label: 'Fort', colorClass: 'bg-success', textClass: 'text-success' },
}

export function PasswordStrengthIndicator({ strength, score, show }: PasswordStrengthProps) {
  if (!show) return null

  const config = strengthConfig[strength]
  const percentage = (score / 4) * 100

  return (
    <div className="mt-3" role="status" aria-live="polite">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-text-soft">Force du mot de passe</span>
        <span className={`text-sm font-medium ${config.textClass}`}>
          {config.label}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-border overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${config.colorClass}`}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={4}
          aria-label={`Force du mot de passe: ${config.label}`}
        />
      </div>
    </div>
  )
}

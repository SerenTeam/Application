import { Copy, Download, Send } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface StepAction {
  id: string
  action_type: 'copied' | 'downloaded' | 'sent'
  created_at: string
  action_date?: string | null
  note?: string | null
}

interface ActionConfig {
  icon: LucideIcon
  label: string
  className?: string
}

const ACTION_CONFIG: Record<string, ActionConfig> = {
  copied: { icon: Copy, label: 'Courrier copié' },
  downloaded: { icon: Download, label: 'PDF téléchargé' },
  sent: { icon: Send, label: 'Marqué comme envoyé', className: 'text-success' },
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

interface StepActionHistoryProps {
  actions: StepAction[]
}

export function StepActionHistory({ actions }: StepActionHistoryProps) {
  if (actions.length === 0) {
    return (
      <p className="text-sm text-text-muted italic py-4">
        Aucune action enregistrée pour cette démarche.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-text-primary">Historique</h4>
      <div className="space-y-2">
        {actions.map((action) => {
          const config = ACTION_CONFIG[action.action_type]
          if (!config) return null

          const Icon = config.icon

          return (
            <div
              key={action.id}
              className="flex items-start gap-3 rounded-lg border border-border bg-bg-card p-3"
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${config.className ?? 'text-text-muted'}`} />
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${config.className ?? 'text-text-primary'}`}>
                  {config.label}
                </p>
                <p className="text-xs text-text-muted">
                  {action.action_type === 'sent' && action.action_date
                    ? `Envoyé le ${formatShortDate(action.action_date)}`
                    : formatDate(action.created_at)}
                </p>
                {action.note && (
                  <p className="mt-1 text-xs text-text-muted italic">{action.note}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

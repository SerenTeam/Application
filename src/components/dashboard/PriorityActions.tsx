import { cn } from '@/lib/utils'
import { useT } from '@/i18n/useT'
import { PillBadge } from '@/components/ui/pill-badge'
import type { RoadmapStep, DashboardView } from './types'

interface PriorityActionsProps {
  steps: RoadmapStep[]
  onNavigate: (view: DashboardView) => void
  onScrollToStep: (stepId: number) => void
}

export function PriorityActions({
  steps,
  onNavigate,
  onScrollToStep,
}: PriorityActionsProps) {
  const t = useT()

  if (steps.length === 0) {
    return (
      <p className="text-text-muted">
        {t.dashboardPage.allPriorityDone}
      </p>
    )
  }

  return (
    <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
      {steps.map((step) => (
        <button
          key={step.id}
          onClick={() => {
            onNavigate('roadmap')
            onScrollToStep(step.id)
          }}
          className={cn(
            'rounded-lg border border-border-card bg-white p-5 text-left shadow-card-border',
            'transition-all duration-200 cursor-pointer',
            'hover:border-primary-border hover:shadow-card',
            step.urgent && 'border-warning/40 bg-warning-light/30',
          )}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="font-body text-[1.05rem] font-medium text-text">
              {step.title}
            </div>
            <PillBadge tone={step.urgent ? 'warning' : 'neutral'} className="shrink-0">
              {step.urgent ? t.dashboardPage.urgentBadge : t.dashboardPage.importantBadge}
            </PillBadge>
          </div>

          <p className="mb-3 whitespace-pre-line text-[0.95rem] text-text-secondary">
            {step.description}
          </p>

          <div className="flex items-center gap-2 text-sm text-text-muted">
            {step.timeline}
          </div>
        </button>
      ))}
    </div>
  )
}

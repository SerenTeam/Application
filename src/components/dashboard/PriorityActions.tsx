import { cn } from '@/lib/utils'
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
  if (steps.length === 0) {
    return (
      <p className="text-text-soft">
        Toutes les etapes prioritaires sont completes !
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-5 mb-8">
      {steps.map((step) => (
        <button
          key={step.id}
          onClick={() => {
            onNavigate('roadmap')
            onScrollToStep(step.id)
          }}
          className={cn(
            'bg-bg-card border-2 border-border rounded-[12px] p-6 text-left',
            'transition-all duration-200 cursor-pointer',
            'hover:border-accent hover:shadow-md',
            step.urgent && 'border-error bg-error/[0.03]',
          )}
        >
          <div className="flex justify-between items-start mb-4">
            <div className="font-semibold text-[1.1rem] text-text">
              {step.title}
            </div>
            <span
              className={cn(
                'text-xs px-3 py-1 rounded-full font-semibold uppercase tracking-wide',
                step.urgent
                  ? 'bg-error/15 text-error'
                  : 'bg-warning/15 text-warning',
              )}
            >
              {step.urgent ? 'Urgent' : 'Important'}
            </span>
          </div>

          <p className="text-text-soft text-[0.95rem] mb-4 whitespace-pre-line">
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

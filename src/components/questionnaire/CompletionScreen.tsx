import { Link } from 'react-router-dom'
import { Check, ArrowRight } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { fmt } from '@/i18n'
import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'

interface CompletionScreenProps {
  stepsCount: number
  doneCount: number
}

export function CompletionScreen({ stepsCount, doneCount }: CompletionScreenProps) {
  const t = useT()
  return (
    <section className="animate-[fadeIn_0.8s_ease-out] px-4 py-8 sm:py-16">
      <div className="mx-auto max-w-[560px] rounded-card bg-white p-10 text-center shadow-card max-sm:p-7">
        <IconBadge size="md" tone="primary" className="mx-auto mb-8">
          <Check strokeWidth={2} />
        </IconBadge>

        <h2 className="font-display text-[28px] font-normal leading-[1.3] text-text sm:text-[32px] lg:text-[36.5px]">
          {t.completion.title}
        </h2>

        <p className="mx-auto mt-4 max-w-[440px] font-body text-[17px] italic leading-[1.6] text-text-muted">
          {t.completion.introPrefix}{' '}
          <strong className="font-medium not-italic text-text">{fmt(t.completion.stepsUnit, { count: stepsCount })}</strong>{' '}
          {t.completion.situationSuffix}
          {doneCount > 0 && (
            <>
              {t.completion.donePrefix} <strong className="font-medium not-italic text-text">{fmt(t.completion.doneUnit, { count: doneCount })}</strong>
            </>
          )}
          .
        </p>
        <p className="mx-auto mt-2 max-w-[440px] font-body text-[17px] italic leading-[1.6] text-text-muted">
          {t.completion.dashboardHint}
        </p>

        <Button asChild className="group mt-10 gap-2">
          <Link to="/dashboard">
            {t.completion.viewRoadmap}
            <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
        </Button>
      </div>
    </section>
  )
}

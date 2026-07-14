import { Link } from 'react-router-dom'
import { useT } from '@/i18n/useT'
import { fmt } from '@/i18n'

interface CompletionScreenProps {
  stepsCount: number
  doneCount: number
}

export function CompletionScreen({ stepsCount, doneCount }: CompletionScreenProps) {
  const t = useT()
  return (
    <section className="text-center py-16 px-8 animate-[fadeIn_0.8s_ease-out]">
      {/* Success icon */}
      <div className="w-[100px] h-[100px] mx-auto mb-8 bg-accent-soft rounded-full flex items-center justify-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-12 h-12 text-accent"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
      </div>

      {/* Title */}
      <h2 className="font-display text-[2rem] font-medium mb-4">
        {t.completion.title}
      </h2>

      {/* Description */}
      <p className="text-text-soft max-w-[440px] mx-auto mb-2">
        {t.completion.introPrefix}{' '}
        <strong className="text-text">{fmt(t.completion.stepsUnit, { count: stepsCount })}</strong>{' '}
        {t.completion.situationSuffix}
        {doneCount > 0 && (
          <>
            {t.completion.donePrefix} <strong className="text-text">{fmt(t.completion.doneUnit, { count: doneCount })}</strong>
          </>
        )}
        .
      </p>
      <p className="text-text-soft max-w-[440px] mx-auto mb-10">
        {t.completion.dashboardHint}
      </p>

      {/* CTA */}
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-3 bg-accent text-white border-none py-4 px-8 text-base font-body font-medium rounded-radius-md cursor-pointer transition-all duration-300 shadow-md hover:bg-accent-hover hover:-translate-y-0.5 hover:shadow-lg no-underline group"
      >
        {t.completion.viewRoadmap}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
          />
        </svg>
      </Link>
    </section>
  )
}

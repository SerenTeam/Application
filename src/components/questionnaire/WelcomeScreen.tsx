import { useT } from '@/i18n/useT'

interface WelcomeScreenProps {
  onStart: () => void
}

export function WelcomeScreen({ onStart }: WelcomeScreenProps) {
  const t = useT()
  return (
    <section className="text-center py-16 px-8 animate-[fadeIn_0.8s_ease-out]">
      {/* Icon */}
      <div className="w-20 h-20 mx-auto mb-8 bg-accent-soft rounded-full flex items-center justify-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-9 h-9 text-accent"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
          />
        </svg>
      </div>

      {/* Title */}
      <h1 className="font-display text-[2.5rem] leading-tight font-medium text-text mb-4 max-sm:text-[2rem]">
        {t.welcome.title}
      </h1>

      {/* Description */}
      <p className="text-lg text-text-soft max-w-[480px] mx-auto mb-10">
        {t.welcome.description}
      </p>

      {/* Start button */}
      <button
        onClick={onStart}
        className="inline-flex items-center gap-3 bg-accent text-white border-none py-4 px-8 text-base font-body font-medium rounded-radius-md cursor-pointer transition-all duration-300 shadow-md hover:bg-accent-hover hover:-translate-y-0.5 hover:shadow-lg group"
      >
        {t.welcome.cta}
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
      </button>
    </section>
  )
}

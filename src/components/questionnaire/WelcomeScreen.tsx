import { Heart, ArrowRight } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'

interface WelcomeScreenProps {
  onStart: () => void
}

export function WelcomeScreen({ onStart }: WelcomeScreenProps) {
  const t = useT()
  return (
    <section className="animate-[fadeIn_0.8s_ease-out] px-4 py-8 sm:py-16">
      <div className="mx-auto max-w-[560px] rounded-card bg-white p-10 text-center shadow-card max-sm:p-7">
        <IconBadge size="md" tone="primary" className="mx-auto mb-8">
          <Heart strokeWidth={1.75} />
        </IconBadge>

        <h1 className="font-display text-[28px] font-normal leading-[1.3] text-text sm:text-[32px] lg:text-[36.5px]">
          {t.welcome.title}
        </h1>

        <p className="mx-auto mt-4 max-w-[440px] font-body text-[17px] italic leading-[1.6] text-text-muted">
          {t.welcome.description}
        </p>

        <Button onClick={onStart} className="group mt-10 gap-2">
          {t.welcome.cta}
          <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
        </Button>
      </div>
    </section>
  )
}

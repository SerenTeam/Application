import { useT } from '@/i18n/useT'

interface ProgressHeroProps {
  completed: number
  total: number
}

export function ProgressHero({ completed, total }: ProgressHeroProps) {
  const t = useT()
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div className="rounded-card bg-ink p-8 text-center md:p-12">
      <h2 className="font-display text-2xl font-normal text-white md:text-[2rem]">
        {t.dashboardPage.progressTitle}
      </h2>

      {/* Progress bar */}
      <div className="mx-auto my-6 h-2 max-w-[500px] overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Stats */}
      <div className="mt-6 flex flex-col justify-center gap-4 md:flex-row md:gap-12">
        <StatBlock value={completed} label={t.dashboardPage.completedStat} />
        <StatBlock value={total} label={t.dashboardPage.totalStat} />
        <StatBlock value={`${percentage}%`} label={t.dashboardPage.completeStat} />
      </div>
    </div>
  )
}

function StatBlock({
  value,
  label,
}: {
  value: number | string
  label: string
}) {
  return (
    <div className="text-center">
      <div className="font-display text-3xl font-medium text-white/80">{value}</div>
      <div className="text-sm text-white/60">{label}</div>
    </div>
  )
}

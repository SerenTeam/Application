import { useT } from '@/i18n/useT'

interface ProgressHeroProps {
  completed: number
  total: number
}

export function ProgressHero({ completed, total }: ProgressHeroProps) {
  const t = useT()
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div className="rounded-[20px] bg-gradient-to-br from-accent to-accent-hover p-8 md:p-12 text-white text-center mb-8">
      <h2 className="font-display text-2xl md:text-[2rem] mb-4 opacity-95">
        {t.dashboardPage.progressTitle}
      </h2>

      {/* Progress bar */}
      <div className="mx-auto max-w-[500px] h-3 rounded-full bg-white/20 overflow-hidden my-6">
        <div
          className="h-full rounded-full bg-white transition-[width] duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Stats */}
      <div className="flex flex-col md:flex-row justify-center gap-4 md:gap-12 mt-6">
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
      <div className="text-3xl font-semibold mb-1">{value}</div>
      <div className="text-sm opacity-90">{label}</div>
    </div>
  )
}

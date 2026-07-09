interface QuestionnaireProgressProps {
  categoryName: string
  percent: number
}

export function QuestionnaireProgress({ categoryName, percent }: QuestionnaireProgressProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 bg-accent rounded-full animate-pulse" />
          <span className="text-sm font-medium text-accent uppercase tracking-widest">
            {categoryName}
          </span>
        </div>
        <span className="text-sm text-text-muted">{percent} %</span>
      </div>
      <div className="h-[3px] bg-border rounded-sm overflow-hidden">
        <div
          className="h-full bg-accent rounded-sm transition-all duration-500 ease-in-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

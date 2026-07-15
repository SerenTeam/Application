interface QuestionnaireProgressProps {
  categoryName: string
  percent: number
}

export function QuestionnaireProgress({ categoryName, percent }: QuestionnaireProgressProps) {
  return (
    <div className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-body text-[11px] font-medium uppercase tracking-[1.5px] text-primary">
          {categoryName}
        </span>
        <span className="font-body text-[13px] text-text-muted">{percent} %</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary-light">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

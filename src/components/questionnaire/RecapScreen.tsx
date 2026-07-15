import { Pencil } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { Button } from '@/components/ui/button'
import { SectionHeading } from '@/components/ui/section-heading'

export interface RecapEntry {
  question_id: string
  question: string
  display: string
}

interface RecapScreenProps {
  entries: RecapEntry[]
  onEdit: (questionId: string) => void
  onConfirm: () => void
  isSubmitting: boolean
  error: string | null
}

export function RecapScreen({ entries, onEdit, onConfirm, isSubmitting, error }: RecapScreenProps) {
  const t = useT()
  return (
    <section className="animate-[slideUp_0.5s_ease-out]">
      <div className="rounded-card border border-border-card bg-white p-10 shadow-card-border max-sm:p-7">
        <SectionHeading
          className="mb-8 max-w-none"
          title={t.recap.title}
          lead={t.recap.description}
        />

        {error && (
          <div className="mb-6 rounded-2xl border border-error/20 bg-error-light px-5 py-4 text-[14px] text-error">
            {error}
          </div>
        )}

        <ul className="mb-8 divide-y divide-border-soft">
          {entries.map((entry) => (
            <li key={entry.question_id} className="flex items-start justify-between gap-4 py-5">
              <div>
                <div className="font-body text-[13px] text-text-muted">{entry.question}</div>
                <div className="mt-1 font-body text-[16px] font-medium text-text">{entry.display}</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(entry.question_id)}
                disabled={isSubmitting}
                className="shrink-0 gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5" />
                {t.recap.edit}
              </Button>
            </li>
          ))}
        </ul>

        <div className="flex justify-end border-t border-border-soft pt-6">
          <Button onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? t.recap.generating : t.recap.confirm}
          </Button>
        </div>
      </div>
    </section>
  )
}

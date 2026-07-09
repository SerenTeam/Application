import { Pencil } from 'lucide-react'

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
  return (
    <section className="animate-[slideUp_0.5s_ease-out]">
      <div className="bg-bg-card rounded-radius-lg p-10 shadow-md border border-border-soft max-sm:p-7">
        <h2 className="font-display text-[1.75rem] font-medium leading-[1.35] mb-3 text-text max-sm:text-2xl">
          Vérifions ensemble vos réponses
        </h2>
        <p className="text-[0.95rem] text-text-soft mb-8">
          Votre parcours personnalisé sera construit à partir de ces informations.
          Vous pouvez modifier chaque réponse avant de confirmer.
        </p>

        {error && (
          <div className="bg-[#FEF2F0] border border-[#F5D5D0] text-error py-4 px-5 rounded-radius-sm mb-6 text-[0.95rem]">
            {error}
          </div>
        )}

        <ul className="divide-y divide-border-soft mb-8">
          {entries.map((entry) => (
            <li key={entry.question_id} className="py-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-[0.9rem] text-text-soft">{entry.question}</div>
                <div className="text-base font-medium text-text mt-1">{entry.display}</div>
              </div>
              <button
                onClick={() => onEdit(entry.question_id)}
                disabled={isSubmitting}
                className="shrink-0 inline-flex items-center gap-1.5 bg-transparent border border-border text-text-soft text-[0.85rem] py-1.5 px-3 rounded-radius-sm cursor-pointer transition-all duration-200 hover:border-accent hover:text-accent disabled:opacity-50"
              >
                <Pencil className="w-3.5 h-3.5" />
                Modifier
              </button>
            </li>
          ))}
        </ul>

        <div className="flex justify-end pt-6 border-t border-border-soft">
          <button
            onClick={onConfirm}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 bg-accent text-white border-none py-3.5 px-7 text-base font-body font-medium rounded-radius-md cursor-pointer transition-all duration-200 hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Génération...' : 'Confirmer et générer mon parcours'}
          </button>
        </div>
      </div>
    </section>
  )
}

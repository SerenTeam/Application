import { useEffect, useRef, type HTMLAttributes } from 'react'
import { Pencil } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { focusIfIdle } from '@/lib/focus'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { SectionHeading } from '@/components/ui/section-heading'

// Titre du récapitulatif, focalisable par script (tabIndex -1) : passé en `as` à SectionHeading, primitive
// partagée qu'on ne modifie pas. Le focus arrive ainsi sur le vrai <h2>, annoncé comme titre, et non sur
// le div qui l'enveloppe. Défini hors du rendu : un composant recréé à chaque rendu remonterait le <h2>
// et lui ferait perdre le focus. Sans anneau : celui du projet est un box-shadow (:focus-visible,
// index.css), que focus:outline-none seul n'efface pas.
function FocusableH2({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 tabIndex={-1} className={cn(className, 'focus:outline-none focus:ring-0 focus:ring-offset-0')} {...props} />
}

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
  // Accessibilité : à l'entrée du récapitulatif, le bouton qui avait le focus (« Continuer », « Retour au
  // récapitulatif ») vient de disparaître — le focus retomberait sur body. Même geste qu'à chaque
  // question : page remise en haut, puis focus sur le titre, jamais volé.
  const headingRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    window.scrollTo(0, 0)
    focusIfIdle(headingRef.current?.querySelector<HTMLElement>('h2'))
  }, [])
  return (
    <section className="animate-[slideUp_0.5s_ease-out]">
      <div className="rounded-card border border-border-card bg-white p-10 shadow-card-border max-sm:p-7">
        <SectionHeading
          ref={headingRef}
          as={FocusableH2}
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

        {/* Sous `sm`, le libellé (nowrap) débordait de la carte, rogné à gauche de l'écran :
            bouton pleine largeur, retour à la ligne (px-6 : 2 lignes max dès 320 px, FR comme EN). */}
        <div className="flex justify-end border-t border-border-soft pt-6 max-sm:flex-col max-sm:items-stretch">
          <Button
            onClick={onConfirm}
            disabled={isSubmitting}
            className="max-sm:h-auto max-sm:min-h-[51px] max-sm:whitespace-normal max-sm:px-6 max-sm:py-3 max-sm:text-center"
          >
            {isSubmitting ? t.recap.generating : t.recap.confirm}
          </Button>
        </div>
      </div>
    </section>
  )
}

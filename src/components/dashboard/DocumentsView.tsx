import { cn } from '@/lib/utils'
import type { TransmissionItem } from './types'

interface DocumentsViewProps {
  items: TransmissionItem[]
}

export function DocumentsView({ items }: DocumentsViewProps) {
  // Group items by categorie
  const categories: Record<string, TransmissionItem[]> = {}
  items.forEach((item) => {
    const cat = item.categorie ?? 'Autres'
    if (!categories[cat]) categories[cat] = []
    categories[cat].push(item)
  })

  const categoryEntries = Object.entries(categories)

  return (
    <div className="animate-fade-in">
      <h1 className="font-display text-[2.25rem] font-medium mb-2 text-accent">
        Documents transmis
      </h1>
      <p className="text-text-soft text-[1.05rem] mb-8">
        Informations et documents laisses par votre proche
      </p>

      {categoryEntries.length === 0 ? (
        <p className="text-text-soft">Aucun document transmis.</p>
      ) : (
        categoryEntries.map(([category, catItems]) => (
          <div key={category} className="mb-8">
            <h3 className="font-display text-[1.35rem] text-accent mb-4 pb-2 border-b-2 border-border">
              {category}
            </h3>

            {catItems.map((item, idx) => {
              const isSkipped = item.reponse === null
              let display: string
              if (isSkipped) {
                display = 'Non renseigne'
              } else if (typeof item.reponse === 'boolean') {
                display = item.reponse ? 'Oui' : 'Non'
              } else {
                display = String(item.reponse)
              }

              return (
                <div
                  key={`${category}-${idx}`}
                  className="bg-bg-card border border-border-soft rounded-[8px] p-5 mb-3"
                >
                  <div className="font-medium text-text mb-2">
                    {item.question}
                  </div>
                  <div
                    className={cn(
                      'text-[1.05rem]',
                      isSkipped
                        ? 'text-text-muted italic'
                        : 'text-accent',
                    )}
                  >
                    {display}
                  </div>
                </div>
              )
            })}
          </div>
        ))
      )}
    </div>
  )
}

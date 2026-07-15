import { useMemo } from 'react'

interface LetterPreviewProps {
  content: string
  notes?: string
}

export function LetterPreview({ content, notes }: LetterPreviewProps) {
  // Highlight missing variables: [SOMETHING] → yellow highlight
  const highlightedContent = useMemo(() => {
    return content.replace(
      /\[([A-ZÀ-Ü\s']+)\]/g,
      '<mark class="bg-warning/20 text-warning px-1 rounded">[$1]</mark>'
    )
  }, [content])

  return (
    <div className="space-y-3">
      <div
        className="max-h-[600px] overflow-y-auto rounded-2xl border border-border bg-white p-8 font-serif text-[0.95rem] leading-relaxed text-text shadow-card-border"
        dangerouslySetInnerHTML={{ __html: formatLetterHtml(highlightedContent) }}
      />
      {notes && (
        <p className="text-xs italic text-text-muted">
          {notes}
        </p>
      )}
    </div>
  )
}

function formatLetterHtml(text: string): string {
  return text
    .split('\n\n')
    .map((paragraph) => {
      const lines = paragraph.split('\n').join('<br />')
      return `<p class="mb-4">${lines}</p>`
    })
    .join('')
}

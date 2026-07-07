import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Copy, Download, Eye, Trash2, Check, Send } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

const THEME_ICONS: Record<string, string> = {
  banque: '\uD83C\uDFE6',
  assurance: '\uD83D\uDEE1\uFE0F',
  administratif: '\uD83D\uDCCB',
  logement: '\uD83C\uDFE0',
  succession: '\u2696\uFE0F',
  numerique: '\uD83D\uDCBB',
  fiscal: '\uD83D\uDCB0',
  obseques: '\uD83D\uDD4A\uFE0F',
}

export interface DocumentData {
  id: string
  title: string
  content: string
  document_type: string
  created_at: string
  step_title?: string
  step_theme?: string
  is_sent?: boolean
}

interface DocumentCardProps {
  document: DocumentData
  onView: (doc: DocumentData) => void
  onDelete: (id: string) => void
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

export function DocumentCard({ document: doc, onView, onDelete }: DocumentCardProps) {
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const themeIcon = THEME_ICONS[doc.step_theme ?? ''] ?? '\uD83D\uDCC4'

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(doc.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ title: 'Impossible de copier', description: 'Veuillez sélectionner le texte manuellement.' })
    }
  }

  const handleDownload = async () => {
    try {
      const { default: jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
      const margin = 20
      const pageWidth = pdf.internal.pageSize.getWidth() - margin * 2
      const pageHeight = pdf.internal.pageSize.getHeight() - margin * 2

      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(11)

      const lines = pdf.splitTextToSize(doc.content, pageWidth)
      let y = margin
      for (const line of lines) {
        if (y > pageHeight + margin) {
          pdf.addPage()
          y = margin
        }
        pdf.text(line, margin, y)
        y += 6
      }

      const date = new Date(doc.created_at).toISOString().slice(0, 10)
      pdf.save(`Courrier-${date}.pdf`)
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de générer le PDF.' })
    }
  }

  return (
    <div className="rounded-lg border border-border bg-bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="text-xl mt-0.5">{themeIcon}</span>
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-text-primary truncate">{doc.title}</h3>
            {doc.step_title && (
              <p className="text-xs text-text-muted truncate">{doc.step_title}</p>
            )}
            <p className="text-xs text-text-muted mt-0.5">
              Généré le {formatDate(doc.created_at)}
            </p>
          </div>
        </div>

        {doc.is_sent && (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success shrink-0">
            <Send className="h-3 w-3" />
            Envoyé
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => onView(doc)} className="gap-1.5 text-xs">
          <Eye className="h-3.5 w-3.5" />
          Voir
        </Button>
        <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 text-xs">
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copié !' : 'Copier'}
        </Button>
        <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1.5 text-xs">
          <Download className="h-3.5 w-3.5" />
          PDF
        </Button>

        {confirmDelete ? (
          <div className="flex gap-1.5 ml-auto">
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)} className="text-xs">
              Annuler
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { onDelete(doc.id); setConfirmDelete(false) }}
              className="text-xs text-error border-error/30 hover:bg-error/5"
            >
              Confirmer
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            className="gap-1.5 text-xs ml-auto text-text-muted"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}

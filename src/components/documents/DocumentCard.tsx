import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'
import { PillBadge } from '@/components/ui/pill-badge'
import {
  Copy,
  Download,
  Eye,
  Trash2,
  Check,
  Send,
  Landmark,
  ShieldCheck,
  ClipboardList,
  Home,
  Scale,
  Laptop,
  Receipt,
  FileText,
  type LucideIcon,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useT } from '@/i18n/useT'
import { useLang } from '@/i18n/LanguageContext'
import { fmt } from '@/i18n'

const THEME_ICONS: Record<string, LucideIcon> = {
  banque: Landmark,
  assurance: ShieldCheck,
  administratif: ClipboardList,
  logement: Home,
  succession: Scale,
  numerique: Laptop,
  fiscal: Receipt,
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

function formatDate(iso: string, lang: 'fr' | 'en'): string {
  try {
    return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

export function DocumentCard({ document: doc, onView, onDelete }: DocumentCardProps) {
  const t = useT()
  const { lang } = useLang()
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const ThemeIcon = THEME_ICONS[doc.step_theme ?? ''] ?? FileText

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(doc.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ title: t.errors.copyFailedTitle, description: t.errors.copyFailedDescription })
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
      pdf.save(`${t.lettersPage.pdfFilenamePrefix}-${date}.pdf`)
    } catch {
      toast({ title: t.lettersPage.pdfErrorTitle, description: t.lettersPage.pdfErrorDescription })
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border-card bg-white p-5 shadow-card-border">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <IconBadge size="sm" tone="primary" className="shrink-0">
            <ThemeIcon />
          </IconBadge>
          <div className="min-w-0">
            <h3 className="truncate font-body text-sm font-medium text-text">{doc.title}</h3>
            {doc.step_title && (
              <p className="truncate text-xs text-text-muted">{doc.step_title}</p>
            )}
            <p className="mt-0.5 text-xs text-text-muted">
              {fmt(t.lettersPage.generatedOn, { date: formatDate(doc.created_at, lang) })}
            </p>
          </div>
        </div>

        {doc.is_sent && (
          <PillBadge tone="success" className="shrink-0 gap-1">
            <Send className="h-3 w-3" />
            {t.lettersPage.sentBadge}
          </PillBadge>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => onView(doc)} className="gap-1.5 text-xs">
          <Eye className="h-3.5 w-3.5" />
          {t.lettersPage.view}
        </Button>
        <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 text-xs">
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? t.lettersPage.copied : t.lettersPage.copy}
        </Button>
        <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1.5 text-xs">
          <Download className="h-3.5 w-3.5" />
          PDF
        </Button>

        {confirmDelete ? (
          <div className="ml-auto flex gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)} className="text-xs">
              {t.lettersPage.cancel}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { onDelete(doc.id); setConfirmDelete(false) }}
              className="text-xs text-error border-error/30 hover:bg-error/5"
            >
              {t.lettersPage.confirm}
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="icon"
            onClick={() => setConfirmDelete(true)}
            className="ml-auto text-text-muted"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}

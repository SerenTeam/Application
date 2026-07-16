import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Copy, Download, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logStepAction, saveLetterDocument } from '@/lib/documents'
import { toast } from '@/hooks/use-toast'
import { useT } from '@/i18n/useT'
import type { LetterTemplate } from '@/data/letter-templates'

interface LetterActionsProps {
  resolvedLetter: string
  resolvedSubject: string
  isComplete: boolean
  template: LetterTemplate
  stepId: string
  userId: string
}

export function LetterActions({ resolvedLetter, resolvedSubject, isComplete, template, stepId, userId }: LetterActionsProps) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)

  // Journalise l'action et sauvegarde le courrier dans « Mes courriers ».
  // Non bloquant : un échec ne doit pas empêcher la copie / le téléchargement.
  const persistLetter = async (type: 'copied' | 'downloaded') => {
    try {
      await logStepAction(supabase, stepId, userId, type)
      await saveLetterDocument(supabase, {
        userId,
        stepId,
        letterTemplateId: template.id,
        title: resolvedSubject,
        content: resolvedLetter,
      })
    } catch {
      // Silent fail — non-blocking
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(resolvedLetter)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      await persistLetter('copied')
    } catch {
      toast({ title: t.errors.copyFailedTitle, description: t.errors.copyFailedDescription })
    }
  }

  const handleDownloadPdf = async () => {
    setDownloading(true)
    try {
      const { default: jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const margin = 20
      const pageWidth = doc.internal.pageSize.getWidth() - margin * 2
      const pageHeight = doc.internal.pageSize.getHeight() - margin * 2

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(11)

      const lines = doc.splitTextToSize(resolvedLetter, pageWidth)
      let y = margin

      for (const line of lines) {
        if (y > pageHeight + margin) {
          doc.addPage()
          y = margin
        }
        doc.text(line, margin, y)
        y += 6
      }

      const date = new Date().toISOString().slice(0, 10)
      const orgName = template.organisme.replace(/\s+/g, '-')
      doc.save(`${t.lettersPage.pdfFilenamePrefix}-${orgName}-${date}.pdf`)

      await persistLetter('downloaded')
    } catch {
      toast({ title: t.lettersPage.downloadErrorTitle, description: t.lettersPage.downloadErrorDescription })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Button
        variant="outline"
        size="sm"
        disabled={!isComplete}
        onClick={handleCopy}
        className="gap-2"
      >
        {copied ? (
          <>
            <Check className="h-4 w-4 text-success" />
            {t.lettersPage.copied}
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" />
            {t.lettersPage.copyText}
          </>
        )}
      </Button>

      <Button
        variant="outline"
        size="sm"
        disabled={!isComplete || downloading}
        onClick={handleDownloadPdf}
        className="gap-2"
      >
        <Download className="h-4 w-4" />
        {downloading ? t.lettersPage.downloading : t.lettersPage.downloadPdf}
      </Button>
    </div>
  )
}

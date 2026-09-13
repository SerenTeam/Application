import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { PillBadge } from '@/components/ui/pill-badge'
import { Loader2, Paperclip } from 'lucide-react'
import { apiFetch, apiUpload } from '@/lib/api'
import { useT } from '@/i18n/useT'

interface AttachmentRow {
  id: string
  kind: 'acte_deces' | 'justificatif'
  filename: string
  mime: string
  size_bytes: number
}

interface AttachmentPickerProps {
  selected: string[]
  onChange: (ids: string[]) => void
  // Legs R2 (revue Task 9) : sur une reprise d'une ligne existante, le serveur refuse tout
  // changement de PJ (409 ATTACHMENTS_MISMATCH — traçabilité de « ce qui a été posté »). L'UI
  // n'autorise donc même pas la tentative : sélection figée, avec une note explicative.
  frozen: boolean
}

const MAX_ATTACHMENTS = 4
const ACCEPT = 'application/pdf,image/jpeg,image/png'

// Coffre minimal (chantier 2a, spec §3.4) : GET /api/attachments + upload inline. L'acte de
// décès est mis en avant (trié en tête, badge dédié) — c'est la pièce jointe recommandée pour un
// courrier papier de déclaration de décès.
export function AttachmentPicker({ selected, onChange, frozen }: AttachmentPickerProps) {
  const t = useT()
  const [attachments, setAttachments] = useState<AttachmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const res = await apiFetch('/api/attachments')
      if (!res.ok) throw new Error('http')
      const data = (await res.json()) as { attachments?: AttachmentRow[] }
      const rows = data.attachments ?? []
      // Acte de décès en tête (mis en avant, spec §7) — le reste garde l'ordre du serveur
      // (plus récent d'abord).
      rows.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'acte_deces' ? -1 : 1))
      setAttachments(rows)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const toggle = (id: string) => {
    if (frozen) return
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id))
      return
    }
    if (selected.length >= MAX_ATTACHMENTS) return
    onChange([...selected, id])
  }

  const handleUpload = async (file: File) => {
    setUploading(true)
    setUploadError(false)
    try {
      const formData = new FormData()
      formData.append('file', file)
      // L'acte de décès étant la pièce recommandée pour ce lot, un upload spontané depuis ce
      // panneau est très majoritairement un acte de décès — le tri (kind) reste modifiable
      // depuis « Mes courriers » si besoin (hors périmètre 2a de renommer ici).
      formData.append('kind', 'acte_deces')
      const res = await apiUpload('/api/attachments', formData)
      if (!res.ok) throw new Error('http')
      const data = (await res.json()) as { attachment?: { id: string } }
      await refresh()
      if (!frozen && data.attachment && selected.length < MAX_ATTACHMENTS) {
        onChange([...selected, data.attachment.id])
      }
    } catch {
      setUploadError(true)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border-soft bg-surface p-3">
      <div>
        <h4 className="font-body text-sm font-medium text-text">{t.paperSend.attachmentsTitle}</h4>
        <p className="text-xs text-text-muted">{t.paperSend.attachmentsHint}</p>
      </div>

      {frozen && <p className="text-xs italic text-text-muted">{t.paperSend.attachmentsFrozenNote}</p>}

      {loading && <p className="text-xs text-text-muted">{t.paperSend.attachmentsLoading}</p>}
      {loadError && <p className="text-xs text-warning">{t.paperSend.attachmentsLoadError}</p>}

      {!loading && !loadError && attachments.length === 0 && (
        <p className="text-xs text-text-muted">{t.paperSend.attachmentsEmpty}</p>
      )}

      {!loading && !loadError && attachments.length > 0 && (
        <ul className="space-y-1.5">
          {attachments.map((att) => {
            const checked = selected.includes(att.id)
            const disabled = frozen || (!checked && selected.length >= MAX_ATTACHMENTS)
            return (
              <li key={att.id} className="flex items-center gap-2.5">
                <Checkbox
                  id={`att-${att.id}`}
                  checked={checked}
                  onCheckedChange={() => toggle(att.id)}
                  disabled={disabled}
                />
                <label htmlFor={`att-${att.id}`} className="flex flex-1 items-center gap-2 text-sm text-text-secondary">
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                  <span className="truncate">{att.filename}</span>
                  {att.kind === 'acte_deces' ? (
                    <PillBadge tone="primary" className="shrink-0">
                      {t.paperSend.attachmentsActeDeces}
                    </PillBadge>
                  ) : (
                    <PillBadge tone="neutral" className="shrink-0">
                      {t.paperSend.attachmentsJustificatif}
                    </PillBadge>
                  )}
                </label>
              </li>
            )
          })}
        </ul>
      )}

      {selected.length >= MAX_ATTACHMENTS && !frozen && (
        <p className="text-xs text-text-muted">{t.paperSend.attachmentsMaxReached}</p>
      )}

      {!frozen && (
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            id="attachment-upload-input"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleUpload(file)
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="gap-2"
          >
            {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
            {uploading ? t.paperSend.attachmentsUploading : t.paperSend.attachmentsUploadCta}
          </Button>
          {uploadError && <p className="text-xs text-warning">{t.paperSend.attachmentsUploadError}</p>}
        </div>
      )}
    </div>
  )
}

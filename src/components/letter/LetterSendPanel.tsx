import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PillBadge } from '@/components/ui/pill-badge'
import { Send, Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useT } from '@/i18n/useT'
import { useLang } from '@/i18n/LanguageContext'
import { PaperSendPanel } from './PaperSendPanel'

// Regex email basique côté client — filet de sécurité UX avant la validation serveur
// (server/routes/letters.js utilise la même règle RFC simplifiée).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface LetterSendRecord {
  template_id: string
  step_id: string | null
  status: 'sending' | 'sent' | 'delivered' | 'failed'
  error?: string | null
}

type SendStatus =
  | { kind: 'idle' }
  | { kind: 'sent' }
  | { kind: 'delivered' }
  | { kind: 'already_sent' }
  | { kind: 'in_progress' }
  | { kind: 'failed'; detail?: string }
  | { kind: 'not_configured' }

interface LetterSendPanelProps {
  templateId: string
  stepId: string
  subject: string
  body: string
  isComplete: boolean
  // Canal du template : 'email' rend le bloc historique 1 clic ci-dessous ; 'papier' délègue à
  // PaperSendPanel (profil expéditeur, adresse, PJ, quota…). Aucun paywall en v2 : l'accès est
  // vérifié côté serveur (gate dossier actif).
  channel: 'email' | 'papier'
  // ── Props consommées UNIQUEMENT par la branche papier ──
  variables?: Record<string, string>
  recipientNetwork?: 'caf' | 'cpam' | 'carsat' | 'impots' | null
  deceasedDepartment?: string
  onDeceasedDepartmentResolved?: (department: string) => void
  userId?: string
}

// Bloc d'envoi — canal email (1 clic, employeur/mutuelle) ou papier (chantier 2a, PaperSendPanel).
// Pour l'email, le texte envoyé (PDF + email) est le MÊME texte résolu que celui affiché dans
// LetterPreview (subject/body reçus en props, jamais recalculés ici).
export function LetterSendPanel({
  templateId,
  stepId,
  subject,
  body,
  isComplete,
  channel,
  variables,
  recipientNetwork,
  deceasedDepartment,
  onDeceasedDepartmentResolved,
  userId,
}: LetterSendPanelProps) {
  const t = useT()
  const { lang } = useLang()
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState<SendStatus>({ kind: 'idle' })

  // Au montage : dernier envoi existant pour ce courrier (statut sent/delivered/failed).
  // Pas de polling (hors périmètre v1) — simple snapshot. Canal papier UNIQUEMENT : c'est
  // PaperSendPanel qui fait sa propre lecture (statuts papier distincts, cf. ce composant).
  useEffect(() => {
    if (channel !== 'email') return
    let cancelled = false
    apiFetch('/api/letters')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { sends?: LetterSendRecord[] } | null) => {
        if (cancelled || !data?.sends) return
        const match = data.sends.find((s) => s.template_id === templateId && s.step_id === stepId)
        if (!match) return
        if (match.status === 'sent') setStatus({ kind: 'sent' })
        else if (match.status === 'delivered') setStatus({ kind: 'delivered' })
        else if (match.status === 'failed') setStatus({ kind: 'failed', detail: match.error ?? undefined })
      })
      .catch(() => {
        // Lecture de statut non bloquante — silencieuse en cas d'échec
      })
    return () => {
      cancelled = true
    }
  }, [channel, templateId, stepId])

  const emailValid = EMAIL_RE.test(email.trim())
  const canSend = isComplete && emailValid && !sending

  const handleSend = useCallback(async () => {
    if (!canSend) return
    setSending(true)
    try {
      const res = await apiFetch('/api/letters/send', {
        method: 'POST',
        body: JSON.stringify({
          template_id: templateId,
          step_id: stepId,
          subject,
          resolved_body: body,
          recipient_email: email.trim(),
          lang,
        }),
      })
      const data = await res.json().catch(() => null)

      if (res.ok && data?.success) {
        setStatus(data.already_sent ? { kind: 'already_sent' } : { kind: 'sent' })
        return
      }
      if (res.status === 409) {
        setStatus({ kind: 'in_progress' })
        return
      }
      if (res.status === 503) {
        setStatus({ kind: 'not_configured' })
        return
      }
      setStatus({ kind: 'failed', detail: data?.error })
    } catch {
      setStatus({ kind: 'failed' })
    } finally {
      setSending(false)
    }
  }, [canSend, templateId, stepId, subject, body, email, lang])

  // Canal papier (chantier 2a) : toute la logique (profil expéditeur, adresse, PJ, quota,
  // statuts, reprise après Checkout) vit dans PaperSendPanel — ce composant-ci ne fait que
  // dispatcher.
  if (channel === 'papier') {
    if (!userId) return null // garde de défense : jamais atteint en pratique (RoadmapView le fournit toujours)
    return (
      <PaperSendPanel
        templateId={templateId}
        stepId={stepId}
        isComplete={isComplete}
        variables={variables ?? {}}
        network={recipientNetwork ?? null}
        deceasedDepartment={deceasedDepartment}
        onDeceasedDepartmentResolved={onDeceasedDepartmentResolved}
        userId={userId}
      />
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-border-card bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor={`send-email-${templateId}-${stepId}`} className="text-sm">
            {t.lettersPage.send.recipientLabel}
          </Label>
          <Input
            id={`send-email-${templateId}-${stepId}`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.lettersPage.send.recipientPlaceholder}
          />
        </div>
        <Button size="sm" disabled={!canSend} onClick={handleSend} className="gap-2">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? t.lettersPage.send.sending : t.lettersPage.send.cta}
        </Button>
      </div>

      {status.kind === 'sent' && <PillBadge tone="primary">{t.lettersPage.send.sentBadge}</PillBadge>}
      {status.kind === 'delivered' && <PillBadge tone="success">{t.lettersPage.send.deliveredBadge}</PillBadge>}
      {status.kind === 'already_sent' && <PillBadge tone="neutral">{t.lettersPage.send.alreadySentBadge}</PillBadge>}
      {status.kind === 'in_progress' && (
        <p className="text-xs text-text-muted">{t.lettersPage.send.inProgress}</p>
      )}
      {status.kind === 'failed' && (
        <div className="space-y-1">
          <PillBadge tone="warning">{t.lettersPage.send.failedBadge}</PillBadge>
          <p className="text-xs text-text-muted">{status.detail || t.lettersPage.send.networkError}</p>
        </div>
      )}
      {status.kind === 'not_configured' && (
        <p className="text-xs italic text-text-muted">{t.lettersPage.send.notConfigured}</p>
      )}
    </div>
  )
}

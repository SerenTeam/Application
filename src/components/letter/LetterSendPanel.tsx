import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PillBadge } from '@/components/ui/pill-badge'
import { Send, Loader2, Lock } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { usePayments, formatPrice } from '@/hooks/usePayments'
import { useT } from '@/i18n/useT'
import { useLang } from '@/i18n/LanguageContext'

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
}

// Bloc d'envoi 1 clic — UNIQUEMENT pour les templates à canal email (employeur, mutuelle).
// Le texte envoyé (PDF + email) est le MÊME texte résolu que celui affiché dans LetterPreview
// (subject/body reçus en props, jamais recalculés ici).
export function LetterSendPanel({ templateId, stepId, subject, body, isComplete }: LetterSendPanelProps) {
  const t = useT()
  const { lang } = useLang()
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState<SendStatus>({ kind: 'idle' })
  // Gating du forfait (D1) : l'envoi est la seule chose que le paywall retient ici — l'aperçu,
  // les variables, la copie et le PDF du courrier restent intégralement accessibles.
  const { loading: paymentsLoading, paymentsEnabled, hasPaid, price, startCheckout } = usePayments()
  const [opening, setOpening] = useState(false)
  const [checkoutError, setCheckoutError] = useState(false)

  // Au montage : dernier envoi existant pour ce courrier (statut sent/delivered/failed).
  // Pas de polling (hors périmètre v1) — simple snapshot.
  useEffect(() => {
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
  }, [templateId, stepId])

  const emailValid = EMAIL_RE.test(email.trim())
  // Tant que le statut du forfait n'est pas connu, le bouton reste inactif plutôt que d'inviter
  // à un clic qui repartirait en 402. Ne coûte rien en pratique : le statut est mis en cache au
  // premier montage (usePayments), les courriers suivants partent d'un état déjà résolu.
  const canSend = isComplete && emailValid && !sending && !paymentsLoading

  const handleUnlock = useCallback(async () => {
    setOpening(true)
    setCheckoutError(false)
    const ok = await startCheckout(lang)
    // Succès → la page est en train de partir vers Stripe, on garde l'état « ouverture ».
    if (!ok) {
      setCheckoutError(true)
      setOpening(false)
    }
  }, [startCheckout, lang])

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

  // Paywall : vente ouverte et forfait non acquis. Placé APRÈS tous les hooks (le retour
  // anticipé ne doit jamais sauter un useCallback). Vente fermée → le composant rend
  // exactement ce qu'il rendait avant le chantier 1.
  if (paymentsEnabled && !hasPaid) {
    const formatted = formatPrice(price, lang)
    return (
      <div className="space-y-3 rounded-lg border border-border-card bg-white p-4">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-text-primary">{t.payments.paywallTitle}</p>
            <p className="text-xs text-text-muted">{t.payments.paywallDescription}</p>
          </div>
        </div>
        <Button size="sm" onClick={handleUnlock} disabled={opening} className="gap-2">
          {opening && <Loader2 className="h-4 w-4 animate-spin" />}
          {opening
            ? t.payments.opening
            : formatted
              ? t.payments.ctaWithPrice.replace('{price}', formatted)
              : t.payments.cta}
        </Button>
        {checkoutError && <p className="text-xs text-text-muted">{t.payments.checkoutFailed}</p>}
      </div>
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

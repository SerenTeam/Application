import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { PillBadge } from '@/components/ui/pill-badge'
import { Send, Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useT } from '@/i18n/useT'
import { fmt } from '@/i18n'
import { useLang } from '@/i18n/LanguageContext'
import { usePayments, formatPrice } from '@/hooks/usePayments'
import { SenderProfileForm, type SenderProfile } from './SenderProfileForm'
import { RecipientAddressForm } from './RecipientAddressForm'
import { AttachmentPicker } from './AttachmentPicker'
import { QuotaBadge } from './QuotaBadge'
import {
  savePendingPaperSend,
  takePendingPaperSend,
  clearPendingPaperSend,
  type RecipientAddress,
  type PaperSendPayload,
} from '@/lib/paper-send-resume'

type PaperStatus = 'prepared' | 'submitted' | 'sent' | 'failed' | 'failed_address'

interface ExistingPaperSend {
  id: string
  status: PaperStatus
  attachment_ids: string[] | null
  recipient: RecipientAddress | null
  error?: string | null
}

interface PaperSendPanelProps {
  templateId: string
  stepId: string
  isComplete: boolean
  variables: Record<string, string>
  // null = destinataire propre à l'utilisateur (banque, assurance, employeur…) — saisie libre.
  network: 'caf' | 'cpam' | 'carsat' | 'impots' | null
  deceasedDepartment?: string
  onDeceasedDepartmentResolved?: (department: string) => void
  userId: string
}

type Banner =
  | { kind: 'quota_exhausted'; extraSendAvailable: boolean }
  | { kind: 'in_progress' }
  | { kind: 'retryable' }
  | { kind: 'error'; message: string }

const EMPTY_RECIPIENT: RecipientAddress = { name: '', address_line1: '', address_line2: '', postal_code: '', city: '' }
const POSTAL_CODE_RE = /^[0-9]{5}$/
const LINE_MAX = 45
// Fenêtre par défaut de reprise (miroir de PAPER_STALE_SECONDS côté serveur, server/routes/letters.js)
// — utilisée tant qu'un 402 QUOTA_EXHAUSTED n'a pas fourni sa propre valeur (legs R1).
const DEFAULT_RETRY_AFTER_SECONDS = 120

function recipientValid(r: RecipientAddress): boolean {
  return (
    r.name.trim().length > 0 &&
    r.name.length <= LINE_MAX &&
    r.address_line1.trim().length > 0 &&
    r.address_line1.length <= LINE_MAX &&
    (r.address_line2 ?? '').length <= LINE_MAX &&
    POSTAL_CODE_RE.test(r.postal_code.trim()) &&
    r.city.trim().length > 0 &&
    r.city.length <= LINE_MAX
  )
}

// Panneau d'envoi papier (chantier 2a, Task 11) — branche `channel: 'papier'` de LetterSendPanel.
// Le paywall (forfait) est déjà passé par l'appelant : ce composant part du principe que
// l'utilisateur peut agir, et laisse le SERVEUR arbitrer tout le reste (quota, plafonds, kill
// switch...) — l'UI n'est ici qu'un guide, jamais une seconde source de vérité.
export function PaperSendPanel({
  templateId,
  stepId,
  isComplete,
  variables,
  network,
  deceasedDepartment,
  onDeceasedDepartmentResolved,
  userId,
}: PaperSendPanelProps) {
  const t = useT()
  const { lang } = useLang()
  const [searchParams, setSearchParams] = useSearchParams()
  const { extraPrice, startExtraSendCheckout } = usePayments()

  const [senderProfile, setSenderProfile] = useState<SenderProfile | null>(null)
  const [senderLoading, setSenderLoading] = useState(true)

  const [recipient, setRecipient] = useState<RecipientAddress>(EMPTY_RECIPIENT)
  const [attachmentIds, setAttachmentIds] = useState<string[]>([])
  const [resendOfId, setResendOfId] = useState<string | null>(null)
  const [existing, setExisting] = useState<ExistingPaperSend | null>(null)
  const [existingLoading, setExistingLoading] = useState(true)

  const [sending, setSending] = useState(false)
  const [sendingLabel, setSendingLabel] = useState<'sending' | 'autoRetrying'>('sending')
  const [banner, setBanner] = useState<Banner | null>(null)
  const [quotaRefreshKey, setQuotaRefreshKey] = useState(0)
  const [balance, setBalance] = useState<number | null>(null)
  const [buying, setBuying] = useState(false)
  const [buyError, setBuyError] = useState(false)

  const retryAfterSecondsRef = useRef(DEFAULT_RETRY_AFTER_SECONDS)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Réf toujours à jour vers `performSend` : la reprise programmée (SEND_IN_PROGRESS) et l'effet
  // de retour de Checkout l'appellent en dehors du cycle de rendu qui l'a créée.
  const performSendRef = useRef<(payload: PaperSendPayload, opts?: { auto?: boolean }) => Promise<void>>(
    async () => {}
  )

  // Profil expéditeur (chantier 2a, spec §3.1) : lecture directe RLS owner.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('sender_profiles')
        .select('full_name, address_line1, address_line2, postal_code, city, relationship')
        .eq('user_id', userId)
        .maybeSingle()
      if (cancelled) return
      if (data) setSenderProfile(data as SenderProfile)
      setSenderLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  // Snapshot du dernier envoi papier existant pour CE courrier — même patron que le canal email
  // (pas de polling, simple lecture au montage, cf. LetterSendPanel).
  useEffect(() => {
    let cancelled = false
    apiFetch('/api/letters')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { sends?: Array<Record<string, unknown>> } | null) => {
        if (cancelled || !data?.sends) return
        const match = data.sends.find(
          (s) => s.template_id === templateId && s.step_id === stepId && s.channel === 'papier'
        )
        if (!match) return
        const row: ExistingPaperSend = {
          id: match.id as string,
          status: match.status as PaperStatus,
          attachment_ids: (match.attachment_ids as string[] | null) ?? null,
          recipient: (match.recipient as RecipientAddress | null) ?? null,
          error: (match.error as string | null) ?? null,
        }
        setExisting(row)
        if (row.recipient) setRecipient(row.recipient)
        if (row.attachment_ids) setAttachmentIds(row.attachment_ids)
      })
      .catch(() => {
        // Snapshot non bloquant — l'envoi n'en dépend pas.
      })
      .finally(() => {
        if (!cancelled) setExistingLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [templateId, stepId])

  // Legs R2 (revue Task 9) : une ligne `prepared`/`failed` SANS être passée par le rattrapage
  // NPAI est une REPRISE — le serveur refuse tout changement de PJ (409 ATTACHMENTS_MISMATCH).
  // L'UI n'autorise donc même pas la tentative.
  const resumable = existing !== null && (existing.status === 'prepared' || existing.status === 'failed')
  const isFinal = existing?.status === 'submitted' || existing?.status === 'sent'
  const isResendFlow = resendOfId !== null
  const needsAddressFix = existing?.status === 'failed_address' && !isResendFlow
  const showComposeForm = !existing || resumable || isResendFlow
  const frozenAttachments = resumable && !isResendFlow

  const buildPayload = useCallback(
    (): PaperSendPayload => ({
      template_id: templateId,
      step_id: stepId,
      variables,
      recipient,
      attachment_ids: attachmentIds,
      resend_of: resendOfId ?? undefined,
    }),
    [templateId, stepId, variables, recipient, attachmentIds, resendOfId]
  )

  // Marque le courrier comme ayant désormais une ligne persistée EXACTEMENT dans l'état reçu
  // (§M, RPC create_letter_send/mark_letter_result) — sans quoi `resumable`/`frozenAttachments`
  // resteraient calés sur l'instantané du montage, et une reprise ultérieure (bouton, ou retour
  // de Checkout) pourrait renvoyer des PJ différentes de celles déjà persistées côté serveur
  // → 409 ATTACHMENTS_MISMATCH (legs R2). `payload` est la source de vérité des PJ envoyées :
  // le serveur ne renvoie pas toujours la ligne complète (402/503 n'incluent pas `send`).
  function freezeRow(status: 'prepared' | 'failed', payload: PaperSendPayload, error: string | null = null) {
    setExisting((prev) => ({
      id: prev?.id ?? '',
      status,
      attachment_ids: payload.attachment_ids,
      recipient: payload.recipient,
      error,
    }))
  }

  async function performSend(payload: PaperSendPayload, opts: { auto?: boolean } = {}) {
    setSendingLabel(opts.auto ? 'autoRetrying' : 'sending')
    setSending(true)
    setBanner(null)
    try {
      const res = await apiFetch('/api/letters/send', { method: 'POST', body: JSON.stringify({ ...payload, lang }) })
      const data = await res.json().catch(() => null as Record<string, unknown> | null)

      if (res.ok && data?.success) {
        const send = data.send as Record<string, unknown>
        setExisting({
          id: send.id as string,
          status: send.status as PaperStatus,
          attachment_ids: (send.attachment_ids as string[] | null) ?? payload.attachment_ids,
          recipient: (send.recipient as RecipientAddress | null) ?? payload.recipient,
          error: null,
        })
        setResendOfId(null)
        setBanner(null)
        setQuotaRefreshKey((k) => k + 1)
        clearPendingPaperSend()
        return
      }

      const code = data?.code as string | undefined
      const errorMessage = (data?.error as string) ?? t.lettersPage.send.networkError

      if (code === 'QUOTA_EXHAUSTED') {
        // Ligne créée AVANT le refus du débit (garde 8, §M) : PJ déjà persistées telles quelles.
        retryAfterSecondsRef.current = (data?.retry_after_seconds as number) ?? DEFAULT_RETRY_AFTER_SECONDS
        freezeRow('prepared', payload)
        setBanner({ kind: 'quota_exhausted', extraSendAvailable: Boolean(data?.extra_send_available) })
        return
      }
      if (code === 'SEND_IN_PROGRESS') {
        // JAMAIS un état d'erreur (legs R1) : la ligne finalise ailleurs (webhook, autre onglet,
        // achat encore en cours de confirmation) — on patiente puis on retente UNE fois, avec le
        // MÊME payload déjà fermé sur ces variables (jamais reconstruit depuis l'état courant).
        setBanner({ kind: 'in_progress' })
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
        retryTimerRef.current = setTimeout(() => {
          void performSendRef.current(payload, { auto: true })
        }, retryAfterSecondsRef.current * 1000)
        return
      }
      if (code === 'SEND_ALREADY_EXISTS' && data?.send) {
        // Le pli existe déjà chez le provider (garde 7 bis, verrou 1) : plus aucune reprise
        // possible depuis cette ligne — on affiche son VRAI statut plutôt qu'une erreur muette.
        const send = data.send as Record<string, unknown>
        setExisting({
          id: send.id as string,
          status: send.status as PaperStatus,
          attachment_ids: (send.attachment_ids as string[] | null) ?? null,
          recipient: (send.recipient as RecipientAddress | null) ?? null,
          error: null,
        })
        setBanner({ kind: 'error', message: errorMessage })
        return
      }
      if (code === 'PAPER_NOT_CONFIGURED') {
        // Rien n'a été tenté côté provider : la ligne reste `prepared` (miroir du canal email).
        freezeRow('prepared', payload)
        setBanner({ kind: 'error', message: errorMessage })
        return
      }
      if (res.status === 503 && data?.retryable) {
        // Résultat provider INCERTAIN (revue Task 9) : jamais une erreur définitive — la ligne
        // reste `prepared`, débit conservé, la reprise réconciliera via la MÊME Idempotency-Key.
        freezeRow('prepared', payload)
        setBanner({ kind: 'retryable' })
        return
      }
      if (code === 'SEND_FAILED' || code === 'PROVIDER_UNAVAILABLE') {
        // Échec CERTAIN (provider a répondu) : la ligne est `failed`, débit libéré côté serveur.
        freezeRow('failed', payload, errorMessage)
        setBanner({ kind: 'error', message: errorMessage })
        return
      }
      // Toute autre garde (profil expéditeur, adresse, variables manquantes, PJ invalides,
      // plafonds…) refuse AVANT la moindre création de ligne (§M) : rien à figer ici.
      setBanner({ kind: 'error', message: errorMessage })
    } catch {
      setBanner({ kind: 'error', message: t.lettersPage.send.networkError })
    } finally {
      setSending(false)
    }
  }
  performSendRef.current = performSend

  // Retour de Stripe Checkout après achat d'un envoi à l'acte (legs R1) : reprise automatique
  // UNE SEULE fois, avec EXACTEMENT la requête qui avait été refusée en 402 (mêmes PJ, sans quoi
  // le serveur répondrait 409 ATTACHMENTS_MISMATCH). L'URL est nettoyée dans tous les cas —
  // même patron que CheckoutReturnBanner (forfait), qui gère `checkout=success` séparément.
  useEffect(() => {
    const checkoutParam = searchParams.get('checkout')
    if (!checkoutParam) return
    const next = new URLSearchParams(searchParams)
    next.delete('checkout')
    setSearchParams(next, { replace: true })

    const pending = takePendingPaperSend(templateId, stepId, checkoutParam)
    if (!pending) return
    retryAfterSecondsRef.current = pending.retryAfterSeconds
    void performSendRef.current(pending.payload, { auto: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule fois, au montage
  }, [])

  useEffect(
    () => () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    },
    []
  )

  const handleSendClick = () => {
    void performSend(buildPayload())
  }

  const handleStartResend = () => {
    if (!existing) return
    setResendOfId(existing.id)
    if (existing.recipient) setRecipient(existing.recipient)
    setAttachmentIds([])
    setBanner(null)
  }

  const handleBuyExtraSend = async () => {
    setBuying(true)
    setBuyError(false)
    savePendingPaperSend(templateId, stepId, buildPayload(), retryAfterSecondsRef.current)
    const result = await startExtraSendCheckout(lang)
    if (!result.ok) {
      // La redirection n'a pas eu lieu : pas de retour de Checkout à anticiper.
      clearPendingPaperSend()
      setBuyError(true)
      setBuying(false)
    }
  }

  if (senderLoading || existingLoading) {
    return <p className="text-xs text-text-muted">{t.paperSend.panelLoading}</p>
  }

  const canSend = isComplete && !!senderProfile && recipientValid(recipient) && !sending
  const showBuyExtraSend = banner?.kind === 'quota_exhausted' || balance === 0
  const formattedExtraPrice = formatPrice(extraPrice, lang)
  const sendCtaLabel = isResendFlow ? t.paperSend.resendCta : resumable ? t.paperSend.retryCta : t.paperSend.sendCta

  return (
    <div className="space-y-4 rounded-lg border border-border-card bg-white p-4">
      <SenderProfileForm userId={userId} profile={senderProfile} onSaved={setSenderProfile} />

      {isFinal && existing && (
        <PillBadge tone={existing.status === 'sent' ? 'success' : 'primary'}>
          {existing.status === 'sent' ? t.paperSend.statusSent : t.paperSend.statusSubmitted}
        </PillBadge>
      )}

      {needsAddressFix && (
        <div className="space-y-2 rounded-xl border border-warning/40 bg-warning-light p-3">
          <p className="text-sm font-medium text-warning">{t.paperSend.statusFailedAddressTitle}</p>
          <p className="text-xs text-text-secondary">{t.paperSend.statusFailedAddressHint}</p>
          <Button size="sm" variant="outline" onClick={handleStartResend}>
            {t.paperSend.resendCta}
          </Button>
        </div>
      )}

      {existing?.status === 'failed' && !isResendFlow && (
        <div className="space-y-1">
          <PillBadge tone="warning">{t.paperSend.statusFailed}</PillBadge>
          {/* Détail affiché seulement hors tentative fraîche de cette session : le bandeau
              d'erreur ci-dessous (banner) porte alors déjà le même message, une seule fois. */}
          {!banner && existing.error && <p className="text-xs text-text-muted">{existing.error}</p>}
        </div>
      )}

      {showComposeForm && (
        <>
          <RecipientAddressForm
            network={network}
            deceasedDepartment={deceasedDepartment}
            onDeceasedDepartmentResolved={onDeceasedDepartmentResolved}
            value={recipient}
            onChange={setRecipient}
          />
          <AttachmentPicker selected={attachmentIds} onChange={setAttachmentIds} frozen={frozenAttachments} />
          <QuotaBadge refreshKey={quotaRefreshKey} onBalanceChange={setBalance} />

          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={handleSendClick} disabled={!canSend} className="gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? t.paperSend[sendingLabel] : sendCtaLabel}
            </Button>
            {showBuyExtraSend && (
              <Button size="sm" variant="outline" onClick={() => void handleBuyExtraSend()} disabled={buying} className="gap-2">
                {buying && <Loader2 className="h-4 w-4 animate-spin" />}
                {buying
                  ? t.paperSend.quotaBuyOpening
                  : formattedExtraPrice
                    ? fmt(t.paperSend.quotaBuyCtaWithPrice, { price: formattedExtraPrice })
                    : t.paperSend.quotaBuyCta}
              </Button>
            )}
          </div>

          {!isComplete && <p className="text-xs text-text-muted">{t.paperSend.missingFieldsHint}</p>}
          {buyError && <p className="text-xs text-text-muted">{t.paperSend.quotaBuyError}</p>}
          {banner?.kind === 'in_progress' && <p className="text-xs text-text-muted">{t.paperSend.finalizingPayment}</p>}
          {banner?.kind === 'retryable' && <p className="text-xs text-text-muted">{t.paperSend.retryableHint}</p>}
          {banner?.kind === 'error' && <p className="text-xs text-warning">{banner.message}</p>}
        </>
      )}
    </div>
  )
}

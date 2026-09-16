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
import { useAccount } from '@/hooks/useAccount'
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
  // `supportEmail` : v2, le 402 ne propose plus d'achat en bêta — il renvoie vers le support.
  | { kind: 'quota_exhausted'; extraSendAvailable: boolean; supportEmail: string }
  // v2 : kill switch serveur (PAPER_SENDS_ENABLED / ATTACHMENTS_ENABLED) — le canal est fermé,
  // le courrier reste téléchargeable en PDF par les actions existantes.
  | { kind: 'channel_closed' }
  | { kind: 'in_progress' }
  // Correctif C2 (revue finale) : fenêtre d'attente du webhook Stripe post-Checkout, ET le 402
  // qui la suit immédiatement si le webhook est encore en retard — jamais confondu avec
  // 'quota_exhausted' (qui, lui, propose l'achat).
  | { kind: 'confirming_payment' }
  | { kind: 'retryable' }
  | { kind: 'error'; message: string }

const EMPTY_RECIPIENT: RecipientAddress = { name: '', address_line1: '', address_line2: '', postal_code: '', city: '' }
const POSTAL_CODE_RE = /^[0-9]{5}$/
const LINE_MAX = 45
// Fenêtre par défaut de reprise (miroir de PAPER_STALE_SECONDS côté serveur, server/routes/letters.js)
// — utilisée tant qu'un 402 QUOTA_EXHAUSTED n'a pas fourni sa propre valeur (legs R1).
const DEFAULT_RETRY_AFTER_SECONDS = 120
// Correctif C2 : patron EXACT de CheckoutReturnBanner.tsx (POLL_MS/MAX_ATTEMPTS) — poll de
// GET /api/payments/status jusqu'à confirmation du webhook Stripe, avant de rejouer la requête
// refusée en 402. ~20 s au total, comme pour la confirmation du forfait.
const CONFIRM_POLL_MS = 2000
const CONFIRM_POLL_MAX_ATTEMPTS = 10

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
  const { extraPrice, startExtraSendCheckout, refresh: refreshPayments } = usePayments()
  // v2 : flags publics et adresse de support (GET /api/me). Au palier plancher `me` est null —
  // aucun rendu n'est masqué à tort, on teste toujours `=== false`, jamais `!me?.flags.x`.
  const { me } = useAccount()

  const [senderProfile, setSenderProfile] = useState<SenderProfile | null>(null)
  const [senderLoading, setSenderLoading] = useState(true)

  const [recipient, setRecipient] = useState<RecipientAddress>(EMPTY_RECIPIENT)
  const [attachmentIds, setAttachmentIds] = useState<string[]>([])
  const [resendOfId, setResendOfId] = useState<string | null>(null)
  const [existing, setExisting] = useState<ExistingPaperSend | null>(null)
  const [existingLoading, setExistingLoading] = useState(true)

  const [sending, setSending] = useState(false)
  const [sendingLabel, setSendingLabel] = useState<'sending' | 'autoRetrying'>('sending')
  // C2 : distinct de `sending` (qui ne couvre que la durée du POST lui-même) — englobe aussi la
  // fenêtre de poll AVANT le rejeu, pendant laquelle aucune action manuelle ne doit être permise.
  const [confirmingPayment, setConfirmingPayment] = useState(false)
  const [banner, setBanner] = useState<Banner | null>(null)
  const [quotaRefreshKey, setQuotaRefreshKey] = useState(0)
  const [buying, setBuying] = useState(false)
  const [buyError, setBuyError] = useState(false)

  const retryAfterSecondsRef = useRef(DEFAULT_RETRY_AFTER_SECONDS)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // I5 (revue finale) : UN SEUL retry automatique par instance de panneau — sans cette garde, un
  // rejeu auto qui retombe lui-même sur SEND_IN_PROGRESS reprogrammerait un timer indéfiniment
  // (boucle, 429 auto-infligé par le limiteur 20/h). Au-delà, seul un clic manuel retente.
  const autoRetryDoneRef = useRef(false)
  // Réf toujours à jour vers `performSend` : la reprise programmée (SEND_IN_PROGRESS) et l'effet
  // de retour de Checkout l'appellent en dehors du cycle de rendu qui l'a créée. Assignée dans un
  // effet (pas au corps du rendu, revue finale mineur) : une mutation de ref reste un effet de
  // bord, jamais un calcul de rendu.
  const performSendRef = useRef<(payload: PaperSendPayload, opts?: { auto?: boolean; postResumeConfirm?: boolean }) => Promise<void>>(
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

  // Legs R2 étendu (revue Task 9 + I4 de la revue finale) : une ligne `prepared`/`failed` SANS
  // être passée par le rattrapage NPAI est une REPRISE — le serveur refuse tout changement de PJ
  // (409 ATTACHMENTS_MISMATCH) ET l'adresse entre elle aussi dans le `dedup_key` (§M) : la
  // corriger créerait une LIGNE DIFFÉRENTE, débitée séparément, pendant que l'originale garde
  // son propre débit à jamais (aucune erreur ne survient plus jamais sur elle pour le libérer).
  // L'UI fige donc les DEUX (RecipientAddressForm ET AttachmentPicker) à l'identique.
  const resumable = existing !== null && (existing.status === 'prepared' || existing.status === 'failed')
  const isFinal = existing?.status === 'submitted' || existing?.status === 'sent'
  const isResendFlow = resendOfId !== null
  const needsAddressFix = existing?.status === 'failed_address' && !isResendFlow
  const showComposeForm = !existing || resumable || isResendFlow
  const frozenForResume = resumable && !isResendFlow

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
  // (§M, RPC create_letter_send/mark_letter_result) — sans quoi `resumable`/`frozenForResume`
  // resteraient calés sur l'instantané du montage, et une reprise ultérieure (bouton, ou retour
  // de Checkout) pourrait renvoyer des PJ/adresse différentes de celles déjà persistées côté
  // serveur → 409 (legs R2). `payload` est la source de vérité de ce qui a été envoyé : le
  // serveur ne renvoie pas toujours la ligne complète (402/503 n'incluent pas `send`).
  function freezeRow(status: 'prepared' | 'failed', payload: PaperSendPayload, error: string | null = null) {
    setExisting((prev) => ({
      id: prev?.id ?? '',
      status,
      attachment_ids: payload.attachment_ids,
      recipient: payload.recipient,
      error,
    }))
  }

  async function performSend(payload: PaperSendPayload, opts: { auto?: boolean; postResumeConfirm?: boolean } = {}) {
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
        // Ligne créée AVANT le refus du débit (garde 8, §M) : PJ/adresse déjà persistées telles
        // quelles. `quotaRefreshKey` bump (mineur) : le badge affichait sinon un solde périmé.
        retryAfterSecondsRef.current = (data?.retry_after_seconds as number) ?? DEFAULT_RETRY_AFTER_SECONDS
        freezeRow('prepared', payload)
        setQuotaRefreshKey((k) => k + 1)
        if (opts.postResumeConfirm) {
          // C2 : ce 402 suit IMMÉDIATEMENT une reprise post-Checkout — le webhook Stripe est
          // simplement encore en retard au-delà de la fenêtre de poll (rare). JAMAIS l'offre
          // d'achat ici : l'utilisateur vient potentiellement de payer à l'instant.
          setBanner({ kind: 'confirming_payment' })
        } else {
          setBanner({
            kind: 'quota_exhausted',
            extraSendAvailable: Boolean(data?.extra_send_available),
            supportEmail: (data?.support_email as string | undefined) ?? me?.support_email ?? 'support@seren-app.fr',
          })
        }
        return
      }
      if (code === 'SEND_IN_PROGRESS') {
        // JAMAIS un état d'erreur (legs R1) : la ligne finalise ailleurs (webhook, autre onglet,
        // achat encore en cours de confirmation) — ligne existante, figée comme les autres cas.
        freezeRow('prepared', payload)
        setBanner({ kind: 'in_progress' })
        if (opts.auto && autoRetryDoneRef.current) return // I5 : plus aucun retry auto au-delà du premier
        autoRetryDoneRef.current = true
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
        retryTimerRef.current = setTimeout(() => {
          void performSendRef.current(payload, { auto: true, postResumeConfirm: opts.postResumeConfirm })
        }, retryAfterSecondsRef.current * 1000)
        return
      }
      if (code === 'ATTACHMENTS_MISMATCH') {
        // Ne devrait jamais survenir depuis CE panneau (les PJ sont gelées dès que `resumable`
        // est vrai) — mais une ligne EXISTE bel et bien côté serveur. Limite connue : on ignore
        // son contenu RÉEL (ce message signale justement qu'il diffère du nôtre) — figer sur le
        // payload envoyé n'est qu'un pis-aller qui évite une répétition immédiate mal formée ;
        // un rechargement de page récupère le VRAI contenu via le snapshot initial.
        freezeRow('prepared', payload, errorMessage)
        setBanner({ kind: 'error', message: errorMessage })
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
      if (code === 'PAPER_DISABLED' || code === 'ATTACHMENTS_DISABLED') {
        // Kill switch serveur (avant toute création de ligne) : rien à figer, le panneau bascule
        // en « canal fermé ».
        setBanner({ kind: 'channel_closed' })
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

  // Ref toujours à jour — assignation en effet, jamais au corps du rendu (revue finale, mineur).
  useEffect(() => {
    performSendRef.current = performSend
  })

  // Retour de Stripe Checkout après achat d'un envoi à l'acte (legs R1 + correctif C2 de la
  // revue finale) : reprise automatique UNE SEULE fois, avec EXACTEMENT la requête qui avait été
  // refusée en 402 (mêmes PJ ET même adresse — sans quoi le serveur répondrait 409, legs R2/I4).
  // L'URL est nettoyée dans tous les cas — même patron que CheckoutReturnBanner (forfait), qui
  // gère `checkout=success` séparément.
  //
  // C2 — LA COURSE POST-CHECKOUT : Stripe redirige dès le paiement confirmé par le NAVIGATEUR,
  // mais le webhook (qui écrit purchases.status='paid', seule source de vérité du gate) peut
  // arriver quelques centaines de ms à quelques secondes plus tard. Rejouer IMMÉDIATEMENT
  // heurterait donc souvent un 402 alors que le paiement a réellement eu lieu — et réafficher
  // l'offre d'achat à quelqu'un qui VIENT de payer ouvre un risque de double paiement (P11).
  // Patron EXACT de CheckoutReturnBanner (poll GET /api/payments/status via usePayments().refresh,
  // 2 s, borné à 10 tentatives ~20 s, jusqu'à purchase.status === 'paid'), réutilisé tel quel.
  // Pendant cette fenêtre ET sur le 402 qui suit IMMÉDIATEMENT cette reprise (webhook encore en
  // retard au-delà des 20 s — rare mais réel), le banner reste 'confirming_payment' (neutre) :
  // JAMAIS l'offre d'achat (`showBuyExtraSend` exclut ce banner par construction, cf. le rendu).
  //
  // Aucun harnais de test front dans ce repo pour ce composant (CLAUDE.md, § Points d'attention :
  // « les tests front n'existent pas dans ce repo, la vérif front = tsc + build ») — comportement
  // vérifié par lecture croisée avec CheckoutReturnBanner.tsx (même mécanique, déjà éprouvée en
  // usage réel au chantier 1) + boot check manuel.
  useEffect(() => {
    const checkoutParam = searchParams.get('checkout')
    if (!checkoutParam) return
    const next = new URLSearchParams(searchParams)
    next.delete('checkout')
    setSearchParams(next, { replace: true })

    const pending = takePendingPaperSend(templateId, stepId, checkoutParam)
    if (!pending) return
    retryAfterSecondsRef.current = pending.retryAfterSeconds

    setSendingLabel('autoRetrying')
    setConfirmingPayment(true)
    setBanner({ kind: 'confirming_payment' })

    void (async () => {
      let attempts = 0
      while (attempts < CONFIRM_POLL_MAX_ATTEMPTS) {
        const state = await refreshPayments()
        if (state.purchase?.status === 'paid') break
        attempts += 1
        if (attempts >= CONFIRM_POLL_MAX_ATTEMPTS) break
        await new Promise((resolve) => setTimeout(resolve, CONFIRM_POLL_MS))
      }
      await performSendRef.current(pending.payload, { auto: true, postResumeConfirm: true })
      setConfirmingPayment(false)
    })()
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

  const busy = sending || confirmingPayment
  // v2 (contrat §7.6) : canal papier fermé — par le flag serveur, ou par un 503 déjà reçu.
  // L'envoi disparaît, les actions PDF existantes (au-dessus de ce panneau) restent.
  const channelClosed = me?.flags.paper_sends_enabled === false || banner?.kind === 'channel_closed'
  const canSend = isComplete && !!senderProfile && recipientValid(recipient) && !busy
  // I3 (revue finale) : jamais conditionné par le solde local seul — en prod par défaut
  // (PAYMENTS_ENABLED non défini), tout le monde a un solde de 0 et le bouton mènerait à un 503
  // (vente à l'acte fermée). Seule une confirmation SERVEUR explicite (le 402 lui-même porte
  // `extra_send_available`) autorise l'affichage du bouton d'achat.
  const showBuyExtraSend = banner?.kind === 'quota_exhausted' && banner.extraSendAvailable
  const formattedExtraPrice = formatPrice(extraPrice, lang)
  const sendCtaLabel = isResendFlow ? t.paperSend.resendCta : resumable ? t.paperSend.retryCta : t.paperSend.sendCta

  return (
    <div className="space-y-4 rounded-lg border border-border-card bg-white p-4">
      {!channelClosed && <SenderProfileForm userId={userId} profile={senderProfile} onSaved={setSenderProfile} />}

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

      {channelClosed ? (
        <p className="text-sm text-text-secondary">{t.paperSend.channelClosed}</p>
      ) : showComposeForm ? (
        <>
          <RecipientAddressForm
            network={network}
            deceasedDepartment={deceasedDepartment}
            onDeceasedDepartmentResolved={onDeceasedDepartmentResolved}
            value={recipient}
            onChange={setRecipient}
            frozen={frozenForResume}
          />
          <AttachmentPicker selected={attachmentIds} onChange={setAttachmentIds} frozen={frozenForResume} />
          <QuotaBadge refreshKey={quotaRefreshKey} />

          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={handleSendClick} disabled={!canSend} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {busy ? t.paperSend[sendingLabel] : sendCtaLabel}
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
          {banner?.kind === 'quota_exhausted' && !banner.extraSendAvailable && (
            <p className="text-xs text-warning">{fmt(t.paperSend.quotaExhaustedSupport, { email: banner.supportEmail })}</p>
          )}
          {(banner?.kind === 'in_progress' || banner?.kind === 'confirming_payment') && (
            <p className="text-xs text-text-muted">{t.paperSend.finalizingPayment}</p>
          )}
          {banner?.kind === 'retryable' && <p className="text-xs text-text-muted">{t.paperSend.retryableHint}</p>}
          {banner?.kind === 'error' && <p className="text-xs text-warning">{banner.message}</p>}
        </>
      ) : null}
    </div>
  )
}

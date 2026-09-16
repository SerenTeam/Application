import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PillBadge, type PillBadgeProps } from '@/components/ui/pill-badge'
import { useT } from '@/i18n/useT'
import { useLang } from '@/i18n/LanguageContext'
import { fmt, type Lang } from '@/i18n'
import { canCancel, cancelDeadline, type PartnerDossier } from '@/lib/partner-dossier'
import type { PartnerActionResult } from '@/hooks/usePartnerDashboard'

// Une ligne de la liste PF (contrat §3.3.12). Règle rouge : identité de la famille et du défunt,
// statut et dates — et STRICTEMENT rien du dossier lui-même. Ce composant ne reçoit d'ailleurs
// aucun champ de ce genre : la RPC n'en renvoie aucun.
interface DossierCardProps {
  dossier: PartnerDossier
  onResend: (id: string) => Promise<PartnerActionResult>
  onCancel: (id: string) => Promise<PartnerActionResult>
  activationsEnabled: boolean
}

const locale = (lang: Lang) => (lang === 'en' ? 'en-GB' : 'fr-FR')

/** Horodatage complet (création, activation, annulation). */
function formatTimestamp(value: string, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value))
}

/** Horodatage avec l'heure : la fenêtre d'annulation se compte en heures, pas en jours. */
function formatTimestampWithTime(value: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

/**
 * Jour calendaire « AAAA-MM-JJ » (date du décès) : construit en heure LOCALE. `new Date('2026-09-10')`
 * serait lu comme minuit UTC et pourrait s'afficher la veille dans les fuseaux négatifs.
 */
function formatDay(value: string, lang: Lang): string {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, day),
  )
}

export function DossierCard({ dossier, onResend, onCancel, activationsEnabled }: DossierCardProps) {
  const t = useT()
  const { lang } = useLang()
  const [busy, setBusy] = useState<'resend' | 'cancel' | null>(null)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const status: { label: string; tone: PillBadgeProps['tone'] } =
    dossier.status === 'invited'
      ? dossier.invite_expired
        ? { label: t.partner.status.invitedExpired, tone: 'warning' }
        : { label: t.partner.status.invited, tone: 'violet' }
      : dossier.status === 'active'
        ? { label: t.partner.status.active, tone: 'success' }
        : dossier.status === 'closed'
          ? { label: t.partner.status.closed, tone: 'neutral' }
          : { label: t.partner.status.cancelled, tone: 'neutral' }

  const familyName = [dossier.family_first_name, dossier.family_last_name].filter(Boolean).join(' ')
  const deceasedName = [dossier.deceased_first_name, dossier.deceased_last_name].filter(Boolean).join(' ')

  // Double contrôle de la fenêtre de 48 h : le drapeau du serveur (fait foi) ET le calcul local,
  // parce qu'une page laissée ouverte peut avoir dépassé l'échéance depuis le dernier chargement.
  const cancellable = dossier.can_cancel && canCancel(dossier)
  const resendable = dossier.can_resend && activationsEnabled

  const run = async (kind: 'resend' | 'cancel', action: () => Promise<PartnerActionResult>, successText: string | null) => {
    setBusy(kind)
    setFeedback(null)
    const result = await action()
    setBusy(null)
    setConfirmingCancel(false)
    if (result.ok) {
      if (successText) setFeedback({ tone: 'ok', text: successText })
      return
    }
    setFeedback({ tone: 'error', text: result.message || t.partner.actions.actionError })
  }

  return (
    <article className="rounded-card border border-border-card bg-white p-5 shadow-card-border">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-3">
          <div>
            <p className="font-body text-[11px] font-medium uppercase tracking-[1.5px] text-text-muted">
              {t.partner.list.family}
            </p>
            {familyName && <p className="font-body text-[17px] font-medium text-text">{familyName}</p>}
            <p className="break-words text-sm text-text-secondary">{dossier.family_email}</p>
            {dossier.family_phone && <p className="text-sm text-text-secondary">{dossier.family_phone}</p>}
          </div>

          <p className="text-sm text-text-secondary">
            {fmt(t.partner.list.deceased, {
              name: deceasedName || '—',
              date: dossier.deceased_death_date ? formatDay(dossier.deceased_death_date, lang) : '—',
            })}
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <PillBadge tone={status.tone}>{status.label}</PillBadge>

          <div className="space-y-0.5 text-[13px] text-text-muted sm:text-right">
            <p>{fmt(t.partner.list.createdOn, { date: formatTimestamp(dossier.created_at, lang) })}</p>
            {dossier.activated_at && (
              <p>{fmt(t.partner.list.activatedOn, { date: formatTimestamp(dossier.activated_at, lang) })}</p>
            )}
            {dossier.cancelled_at && (
              <p>{fmt(t.partner.list.cancelledOn, { date: formatTimestamp(dossier.cancelled_at, lang) })}</p>
            )}
            {dossier.status === 'invited' && !dossier.invite_expired && dossier.invite_expires_at && (
              <p>
                {fmt(t.partner.list.invitationValidUntil, {
                  date: formatTimestamp(dossier.invite_expires_at, lang),
                })}
              </p>
            )}
          </div>
        </div>
      </div>

      {(resendable || cancellable) && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border-card pt-4">
          {resendable && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void run('resend', () => onResend(dossier.id), t.partner.actions.resent)}
            >
              {busy === 'resend' ? t.partner.actions.resending : t.partner.actions.resend}
            </Button>
          )}

          {cancellable && !confirmingCancel && (
            <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => setConfirmingCancel(true)}>
              {t.partner.actions.cancel}
            </Button>
          )}

          {cancellable && confirmingCancel && (
            <>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={busy !== null}
                onClick={() => void run('cancel', () => onCancel(dossier.id), null)}
              >
                {busy === 'cancel' ? t.partner.actions.cancelling : t.partner.actions.cancelConfirm}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => setConfirmingCancel(false)}>
                {t.partner.actions.cancelKeep}
              </Button>
            </>
          )}

          {cancellable && (
            <p className="w-full text-[13px] text-text-muted sm:w-auto">
              {fmt(t.partner.actions.cancelUntil, {
                date: formatTimestampWithTime(cancelDeadline(dossier.created_at), lang),
              })}
            </p>
          )}
        </div>
      )}

      {feedback && (
        <p className={`mt-3 text-sm font-medium ${feedback.tone === 'ok' ? 'text-success' : 'text-error'}`}>
          {feedback.text}
        </p>
      )}
    </article>
  )
}

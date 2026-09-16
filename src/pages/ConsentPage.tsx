import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useAccount } from '@/hooks/useAccount'
import { supabase } from '@/lib/supabase'
import { CONSENT_VERSION } from '@/lib/consent-version'
import { useT } from '@/i18n/useT'
import { fmt } from '@/i18n'

type ConsentKind = 'terms' | 'privacy' | 'sensitive_data'
const KINDS: ConsentKind[] = ['terms', 'privacy', 'sensitive_data']

// /bienvenue (contrat §7.4) : preuve de consentement append-only (table consents via RPC
// record_consents, version figée CONSENT_VERSION). Gardée par RequireAccess area="consent".
export function ConsentPage() {
  const t = useT()
  const navigate = useNavigate()
  const { me, refresh } = useAccount()
  const [checked, setChecked] = useState<Record<ConsentKind, boolean>>({ terms: false, privacy: false, sensitive_data: false })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dossier = me?.account?.dossier ?? null
  const allChecked = KINDS.every((kind) => checked[kind])

  const handleStart = async () => {
    if (!allChecked) {
      setError(t.consent.allRequired)
      return
    }
    setSubmitting(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('record_consents', { p_version: CONSENT_VERSION, p_kinds: KINDS })
    if (rpcError) {
      // Version déployée ≠ version en base : on recharge pour récupérer le bundle à jour.
      if (rpcError.message === 'consent_version_mismatch') {
        window.location.reload()
        return
      }
      setError(t.consent.saveError)
      setSubmitting(false)
      return
    }
    await refresh()
    navigate('/', { replace: true })
  }

  // `notice` : information art. 9.2.a rendue sous la case, hors du <label> cliquable.
  const labels: Record<ConsentKind, { text: string; link?: { href: string; label: string }; notice?: string }> = {
    terms: { text: t.consent.terms, link: { href: '/legal', label: t.consent.termsLink } },
    privacy: { text: t.consent.privacy, link: { href: '/security', label: t.consent.privacyLink } },
    sensitive_data: { text: t.consent.sensitiveData, notice: t.consent.sensitiveDataNotice },
  }

  return (
    <AuthLayout>
      <div className="rounded-card border border-border-card bg-white p-10 shadow-card-border max-sm:p-7">
        <h1 className="mb-3 text-center font-display text-[28px] font-normal leading-[1.3] text-text">{t.consent.title}</h1>
        <p className="mb-2 text-center text-text-secondary">
          {dossier?.partner_name ? fmt(t.consent.providedBy, { partner: dossier.partner_name }) : t.consent.providedByGeneric}
        </p>
        {dossier?.deceased_first_name && (
          <p className="mb-6 text-center text-text-secondary">{fmt(t.consent.deceasedLine, { name: dossier.deceased_first_name })}</p>
        )}
        <p className="mb-4 text-sm text-text-muted">{t.consent.intro}</p>
        <div className="space-y-4">
          {KINDS.map((kind) => (
            <div key={kind} className="flex items-start gap-3">
              <Checkbox
                id={`consent-${kind}`}
                checked={checked[kind]}
                onCheckedChange={(value) => setChecked((prev) => ({ ...prev, [kind]: value === true }))}
                aria-required="true"
                aria-describedby={labels[kind].notice ? `consent-${kind}-notice` : undefined}
                className="mt-0.5"
              />
              <div className="min-w-0">
                <Label htmlFor={`consent-${kind}`} className="cursor-pointer text-sm font-normal leading-relaxed text-text-secondary">
                  {labels[kind].text}
                  {labels[kind].link && (
                    <>
                      {' — '}
                      <a href={labels[kind].link!.href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary-hover">
                        {labels[kind].link!.label}
                      </a>
                    </>
                  )}
                </Label>
                {labels[kind].notice && (
                  <p id={`consent-${kind}-notice`} className="mt-1.5 text-xs leading-relaxed text-text-muted">
                    {labels[kind].notice}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
        {error && <p className="mt-4 text-sm text-error" role="alert">{error}</p>}
        <Button className="mt-8 w-full" disabled={!allChecked || submitting} onClick={() => void handleStart()}>
          {submitting ? t.consent.submitting : t.consent.cta}
        </Button>
      </div>
    </AuthLayout>
  )
}

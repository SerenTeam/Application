import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PillBadge } from '@/components/ui/pill-badge'
import { useT } from '@/i18n/useT'
import { fmt } from '@/i18n'
import {
  EMPTY_DOSSIER_FORM,
  isoDay,
  validateDossierForm,
  type DossierFormErrorKey,
  type DossierFormField,
  type DossierFormValues,
} from '@/lib/partner-dossier'
import type { PartnerActionResult } from '@/hooks/usePartnerDashboard'

// Ouverture d'un dossier famille par la PF (contrat §2.2 flux 2). La PF saisit l'identité de la
// famille et du défunt, rien d'autre : elle n'a jamais accès à ce que la famille remplira ensuite.
// La validation locale MIROITE les règles SQL — elle n'autorise rien, elle évite un aller-retour.
interface DossierFormProps {
  onCreate: (values: DossierFormValues, confirmDuplicate: boolean) => Promise<PartnerActionResult>
  activationsEnabled: boolean
}

interface TextFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  error?: string
  hint?: string
  max?: string
  autoComplete?: string
  className?: string
}

function TextField({ id, label, value, onChange, type = 'text', error, hint, max, autoComplete, className }: TextFieldProps) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ')

  return (
    <div className={className}>
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        max={max}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={error ? 'mt-1.5 border-error focus:border-error' : 'mt-1.5'}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-[13px] leading-snug text-text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-[13px] font-medium text-error">
          {error}
        </p>
      )}
    </div>
  )
}

export function DossierForm({ onCreate, activationsEnabled }: DossierFormProps) {
  const t = useT()
  const [values, setValues] = useState<DossierFormValues>(EMPTY_DOSSIER_FORM)
  const [errors, setErrors] = useState<Partial<Record<DossierFormField, DossierFormErrorKey>>>({})
  const [duplicatePending, setDuplicatePending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [outcome, setOutcome] = useState<
    | { kind: 'created'; email: string; emailSent: boolean; activationUrl?: string }
    | { kind: 'error'; message: string }
    | null
  >(null)

  // Toute correction d'un champ retire l'avertissement de doublon : la PF a peut-être justement
  // corrigé le nom ou la date qui l'avait déclenché.
  const setField = (field: DossierFormField) => (value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
    setDuplicatePending(false)
  }

  const errorText = (field: DossierFormField) => {
    const key = errors[field]
    return key ? t.partner.form.errors[key] : undefined
  }

  const submit = async (confirmDuplicate: boolean) => {
    const localErrors = validateDossierForm(values)
    setErrors(localErrors)
    if (Object.keys(localErrors).length > 0) return
    setSubmitting(true)
    setOutcome(null)
    const result = await onCreate(values, confirmDuplicate)
    setSubmitting(false)
    if (result.ok) {
      setOutcome({
        kind: 'created',
        email: values.family_email.trim().toLowerCase(),
        emailSent: result.emailSent,
        activationUrl: result.activationUrl,
      })
      setValues(EMPTY_DOSSIER_FORM)
      setDuplicatePending(false)
      setCopied(false)
      return
    }
    if (result.code === 'DUPLICATE_DECEASED') {
      setDuplicatePending(true)
      return
    }
    if (result.code === 'INVALID_INPUT' && result.field) {
      const fieldMap: Record<string, DossierFormField> = {
        family_name: 'family_last_name',
        email: 'family_email',
        phone: 'family_phone',
        deceased_name: 'deceased_last_name',
        death_date: 'deceased_death_date',
      }
      const target = fieldMap[result.field]
      if (target) {
        setErrors({
          [target]: target === 'family_email' ? 'invalidEmail' : target === 'family_phone' ? 'invalidPhone' : 'required',
        })
        return
      }
    }
    setOutcome({ kind: 'error', message: result.message || t.partner.form.genericError })
  }

  const copyActivationLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // Presse-papiers refusé (permission, contexte non sécurisé) : on ne montre pas le lien en
      // clair pour autant — il reste un secret d'activation.
      setCopied(false)
    }
  }

  const fieldsetClass = 'space-y-4 rounded-2xl border border-border-card p-4 sm:p-5'
  const legendClass = 'px-2 font-body text-[13px] font-medium uppercase tracking-[1.5px] text-text-muted'

  if (!activationsEnabled) {
    return (
      <div className="rounded-card border border-border-card bg-white p-6 shadow-card-border">
        <h2 className="mb-2 font-display text-2xl font-normal text-text">{t.partner.form.title}</h2>
        <p className="text-text-secondary">{t.partner.form.activationsClosed}</p>
      </div>
    )
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void submit(false)
      }}
      className="rounded-card border border-border-card bg-white p-5 shadow-card-border sm:p-6"
    >
      <h2 className="mb-5 font-display text-2xl font-normal text-text">{t.partner.form.title}</h2>

      <div className="space-y-5">
        <fieldset className={fieldsetClass}>
          <legend className={legendClass}>{t.partner.form.familySection}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="family-first-name"
              label={t.partner.form.firstName}
              value={values.family_first_name}
              onChange={setField('family_first_name')}
              error={errorText('family_first_name')}
              autoComplete="off"
            />
            <TextField
              id="family-last-name"
              label={t.partner.form.lastName}
              value={values.family_last_name}
              onChange={setField('family_last_name')}
              error={errorText('family_last_name')}
              autoComplete="off"
            />
            <TextField
              id="family-email"
              type="email"
              label={t.partner.form.email}
              hint={t.partner.form.emailHint}
              value={values.family_email}
              onChange={setField('family_email')}
              error={errorText('family_email')}
              autoComplete="off"
              className="sm:col-span-2"
            />
            <TextField
              id="family-phone"
              type="tel"
              label={t.partner.form.phone}
              value={values.family_phone}
              onChange={setField('family_phone')}
              error={errorText('family_phone')}
              autoComplete="off"
            />
          </div>
        </fieldset>

        <fieldset className={fieldsetClass}>
          <legend className={legendClass}>{t.partner.form.deceasedSection}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="deceased-first-name"
              label={t.partner.form.firstName}
              value={values.deceased_first_name}
              onChange={setField('deceased_first_name')}
              error={errorText('deceased_first_name')}
              autoComplete="off"
            />
            <TextField
              id="deceased-last-name"
              label={t.partner.form.lastName}
              value={values.deceased_last_name}
              onChange={setField('deceased_last_name')}
              error={errorText('deceased_last_name')}
              autoComplete="off"
            />
            <TextField
              id="deceased-death-date"
              type="date"
              label={t.partner.form.deathDate}
              value={values.deceased_death_date}
              onChange={setField('deceased_death_date')}
              error={errorText('deceased_death_date')}
              max={isoDay(new Date())}
            />
          </div>
        </fieldset>
      </div>

      {duplicatePending && (
        <div className="mt-5 rounded-2xl border border-warning/40 bg-warning-light p-4">
          <p className="font-body font-medium text-text">{t.partner.form.duplicateTitle}</p>
          <p className="mt-1 text-sm text-text-secondary">{t.partner.form.duplicateBody}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={submitting} onClick={() => void submit(true)}>
              {t.partner.form.duplicateConfirm}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setDuplicatePending(false)}>
              {t.partner.form.duplicateCancel}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={submitting || duplicatePending}>
          {submitting ? t.partner.form.submitting : t.partner.form.submit}
        </Button>
      </div>

      {outcome?.kind === 'created' && (
        <div className="mt-5 space-y-3">
          <PillBadge tone="success" className="normal-case tracking-normal">
            {outcome.emailSent
              ? fmt(t.partner.form.created, { email: outcome.email })
              : t.partner.form.createdEmailFailed}
          </PillBadge>
          {outcome.activationUrl && (
            <div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void copyActivationLink(outcome.activationUrl as string)}
              >
                {copied ? t.partner.form.linkCopied : t.partner.form.copyLink}
              </Button>
            </div>
          )}
        </div>
      )}

      {outcome?.kind === 'error' && <p className="mt-5 text-sm font-medium text-error">{outcome.message}</p>}
    </form>
  )
}

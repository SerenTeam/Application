import { useId, useState } from 'react'
import * as Sentry from '@sentry/react'
import { Loader2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useT } from '@/i18n/useT'
import { useLang } from '@/i18n/LanguageContext'
import { fmt } from '@/i18n'
import {
  defaultRelationLabel,
  isFreeRelationLabel,
  normalizeRelationLabel,
  relationLabelOptions,
} from '@/lib/relation-labels'
import {
  DOB_MIN,
  LINE_MAX,
  saveLetterProfile,
  validateLetterProfile,
  type LetterProfileErrors,
  type LetterProfileField,
  type LetterProfileInput,
  type LetterProfileRow,
} from '@/lib/letter-profile'
import type { RelationV2 } from '@/types/questionnaire'

/** Champ « date de naissance du défunt » : affiché seulement quand l'appelant le fournit. */
export interface DeceasedDobField {
  value: string | null
  max: string | null // date du décès (AAAA-MM-JJ) ; la naissance doit la précéder
  save: (dob: string | null) => Promise<void>
}

interface LetterProfileFormProps {
  userId: string
  profile: LetterProfileRow | null
  // Pré-remplissage quand aucun profil n'existe encore (noms saisis par la PF).
  defaults?: { firstName?: string; lastName?: string }
  // Réponse `relation` du questionnaire : propose les formes exactes (fils / fille…).
  relation?: RelationV2
  deceasedFirstName?: string
  deceasedDob?: DeceasedDobField
  // panel : lecture puis « Modifier » (panneau d'envoi, Profil) ; screen : édition directe.
  variant?: 'panel' | 'screen'
  submitLabel?: string
  onSaved: (profile: LetterProfileRow) => void
  onSkip?: () => void
}

function initialInput(
  profile: LetterProfileRow | null,
  defaults: LetterProfileFormProps['defaults'],
  relation: RelationV2 | undefined
): LetterProfileInput {
  return {
    first_name: profile?.first_name ?? defaults?.firstName ?? '',
    last_name: profile?.last_name ?? defaults?.lastName ?? '',
    address_line1: profile?.address_line1 ?? '',
    address_line2: profile?.address_line2 ?? '',
    postal_code: profile?.postal_code ?? '',
    city: profile?.city ?? '',
    // Lien saisi librement au 2a (« Fille ») : ramené à la forme proposée équivalente.
    relationship: normalizeRelationLabel(relation, profile?.relationship ?? '') || defaultRelationLabel(relation),
  }
}

// Formulaire unique du profil courrier (personnalisation v2, spec §4.5) — remplace SenderProfileForm
// (chantier 2a). Plusieurs instances peuvent coexister (un panneau d'envoi par étape dépliée) :
// `useId()` garantit des ids DOM uniques pour les associations <label htmlFor>.
export function LetterProfileForm({
  userId,
  profile,
  defaults,
  relation,
  deceasedFirstName,
  deceasedDob,
  variant = 'panel',
  submitLabel,
  onSaved,
  onSkip,
}: LetterProfileFormProps) {
  const t = useT()
  const { lang } = useLang()
  const uid = useId()
  const relationOptions = relationLabelOptions(relation)
  // Édition explicite (« Modifier ») ; sans profil, le formulaire s'affiche d'office. Dérivé plutôt que
  // figé au montage : plusieurs étapes peuvent être dépliées à la fois, et si un autre panneau
  // enregistre le profil, celui-ci passe en lecture au lieu de rester un formulaire vide.
  const [editRequested, setEditRequested] = useState(false)
  const editing = variant === 'screen' || editRequested || !profile
  const [form, setForm] = useState<LetterProfileInput>(() => initialInput(profile, defaults, relation))
  // Lien enregistré hors des formes proposées : saisie libre, pour qu'il reste visible et modifiable.
  const [freeRelationship, setFreeRelationship] = useState(() => isFreeRelationLabel(relation, form.relationship))
  const [dob, setDob] = useState(deceasedDob?.value ?? '')
  const [errors, setErrors] = useState<LetterProfileErrors>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [saved, setSaved] = useState(false)

  // « Modifier » repart des données à jour : le profil a pu changer depuis un autre panneau.
  const startEditing = () => {
    const next = initialInput(profile, defaults, relation)
    setForm(next)
    setFreeRelationship(isFreeRelationLabel(relation, next.relationship))
    setDob(deceasedDob?.value ?? '')
    setErrors({})
    setSaved(false)
    setSaveError(false)
    setEditRequested(true)
  }

  const setField = (key: keyof LetterProfileInput, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
    setSaved(false)
  }

  const errorText = (field: LetterProfileField) => {
    const key = errors[field]
    return key ? <p className="text-xs text-warning">{t.letterProfile.errors[key]}</p> : null
  }

  const handleSave = async () => {
    const found = validateLetterProfile(form, deceasedDob ? { value: dob, max: deceasedDob.max } : undefined)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setSaving(true)
    setSaveError(false)
    try {
      const row = await saveLetterProfile(supabase, userId, form)
      if (deceasedDob) await deceasedDob.save(dob || null)
      setSaved(true)
      if (variant === 'panel') setEditRequested(false)
      onSaved(row)
    } catch (err) {
      // Message Supabase seul (jamais les `details`, qui contiennent la ligne) : pas de donnée personnelle.
      Sentry.captureException(err)
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }

  if (!editing && profile) {
    return (
      <div className="space-y-1 rounded-xl border border-border-soft bg-surface p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm text-text-secondary">
            <p className="font-medium text-text">{profile.full_name}</p>
            <p>{profile.address_line1}</p>
            {profile.address_line2 && <p>{profile.address_line2}</p>}
            <p>
              {profile.postal_code} {profile.city}
            </p>
            {profile.relationship && deceasedFirstName && (
              <p className="text-text-muted">
                {fmt(t.letterProfile.relationshipPreview, { relationship: profile.relationship, name: deceasedFirstName })}
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={startEditing} className="shrink-0 gap-1.5">
            <Pencil className="h-3.5 w-3.5" />
            {t.letterProfile.editCta}
          </Button>
        </div>
        {saved && <p className="text-xs text-success">{t.letterProfile.savedHint}</p>}
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', variant === 'panel' && 'rounded-xl border border-border-soft bg-surface p-3')}>
      {variant === 'panel' && (
        <div>
          <h4 className="font-body text-sm font-medium text-text">{t.letterProfile.title}</h4>
          <p className="text-xs text-text-muted">{t.letterProfile.hint}</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-first`} className="text-sm">{t.letterProfile.firstNameLabel}</Label>
          <Input id={`${uid}-first`} value={form.first_name} maxLength={LINE_MAX} autoComplete="given-name" onChange={(e) => setField('first_name', e.target.value)} />
          {errorText('first_name')}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-last`} className="text-sm">{t.letterProfile.lastNameLabel}</Label>
          <Input id={`${uid}-last`} value={form.last_name} maxLength={LINE_MAX} autoComplete="family-name" onChange={(e) => setField('last_name', e.target.value)} />
          {errorText('last_name')}
        </div>

        {relationOptions && !freeRelationship ? (
          <fieldset className="space-y-1.5 sm:col-span-2">
            <legend className="mb-1.5 text-sm font-medium text-text">{t.letterProfile.relationshipLabel}</legend>
            <div className="flex flex-wrap gap-2">
              {relationOptions.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    'cursor-pointer rounded-full border px-4 py-1.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40',
                    form.relationship === option.value
                      ? 'border-primary bg-primary-light text-primary'
                      : 'border-border bg-white text-text-secondary hover:border-primary'
                  )}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name={`${uid}-relationship`}
                    value={option.value}
                    checked={form.relationship === option.value}
                    onChange={() => setField('relationship', option.value)}
                  />
                  {option.label[lang]}
                </label>
              ))}
            </div>
            {form.relationship && deceasedFirstName && (
              <p className="text-xs text-text-muted">
                {fmt(t.letterProfile.relationshipPreview, { relationship: form.relationship, name: deceasedFirstName })}
              </p>
            )}
            {errorText('relationship')}
          </fieldset>
        ) : (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${uid}-relationship`} className="text-sm">{t.letterProfile.relationshipFreeLabel}</Label>
            <Input
              id={`${uid}-relationship`}
              value={form.relationship}
              maxLength={LINE_MAX}
              placeholder={t.letterProfile.relationshipFreePlaceholder}
              onChange={(e) => setField('relationship', e.target.value)}
            />
            {errorText('relationship')}
          </div>
        )}

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${uid}-address1`} className="text-sm">{t.letterProfile.addressLine1Label}</Label>
          <Input id={`${uid}-address1`} value={form.address_line1} maxLength={LINE_MAX} autoComplete="address-line1" onChange={(e) => setField('address_line1', e.target.value)} />
          <p className="text-xs text-text-muted">{fmt(t.letterProfile.lineCounter, { count: form.address_line1.length })}</p>
          {errorText('address_line1')}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${uid}-address2`} className="text-sm">{t.letterProfile.addressLine2Label}</Label>
          <Input id={`${uid}-address2`} value={form.address_line2} maxLength={LINE_MAX} autoComplete="address-line2" onChange={(e) => setField('address_line2', e.target.value)} />
          {errorText('address_line2')}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-postal`} className="text-sm">{t.letterProfile.postalCodeLabel}</Label>
          <Input id={`${uid}-postal`} value={form.postal_code} maxLength={5} inputMode="numeric" autoComplete="postal-code" onChange={(e) => setField('postal_code', e.target.value)} />
          {errorText('postal_code')}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-city`} className="text-sm">{t.letterProfile.cityLabel}</Label>
          <Input id={`${uid}-city`} value={form.city} maxLength={LINE_MAX} autoComplete="address-level2" onChange={(e) => setField('city', e.target.value)} />
          {errorText('city')}
        </div>

        {deceasedDob && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${uid}-dob`} className="text-sm">
              {fmt(t.letterProfile.dobLabel, { name: deceasedFirstName ?? '' })}
            </Label>
            <Input
              id={`${uid}-dob`}
              type="date"
              value={dob}
              min={DOB_MIN}
              max={deceasedDob.max ?? undefined}
              onChange={(e) => {
                setDob(e.target.value)
                setErrors((prev) => ({ ...prev, deceased_dob: undefined }))
              }}
            />
            <p className="text-xs text-text-muted">{t.letterProfile.dobHint}</p>
            {errorText('deceased_dob')}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button size={variant === 'panel' ? 'sm' : 'default'} onClick={handleSave} disabled={saving} className="gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? t.letterProfile.saving : (submitLabel ?? t.letterProfile.saveCta)}
        </Button>
        {onSkip && (
          <Button variant="ghost" onClick={onSkip} disabled={saving}>
            {t.letterProfile.screenSkip}
          </Button>
        )}
      </div>
      {saved && variant === 'panel' && <p className="text-xs text-success">{t.letterProfile.savedHint}</p>}
      {saveError && <p className="text-xs text-warning">{t.letterProfile.saveError}</p>}
    </div>
  )
}

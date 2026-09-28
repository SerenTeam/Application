import { useEffect, useId, useRef, useState } from 'react'
import * as Sentry from '@sentry/react'
import { Check, Loader2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useT } from '@/i18n/useT'
import { useLang } from '@/i18n/LanguageContext'
import { fmt } from '@/i18n'
import { isFreeRelationLabel, normalizeRelationLabel, relationLabelOptions } from '@/lib/relation-labels'
import {
  DOB_MIN,
  LINE_MAX,
  formatDobForDisplay,
  initialLetterProfileInput,
  saveLetterProfile,
  todayLocalIsoDate,
  validateLetterProfile,
  type LetterProfileDefaults,
  type LetterProfileErrors,
  type LetterProfileField,
  type LetterProfileInput,
  type LetterProfileRow,
} from '@/lib/letter-profile'
import type { RelationV2 } from '@/types/questionnaire'

/**
 * Champ « date de naissance du défunt » : affiché seulement quand l'appelant le fournit.
 * Contrat : `value` est la date actuellement enregistrée (une date inchangée n'est pas réécrite) ;
 * `save` LÈVE en cas d'échec ; `onSaved` n'est appelé qu'après le succès complet (profil, puis date
 * si elle a changé). Profil enregistré mais date en échec : message dédié sous le champ, pas d'onSaved.
 */
export interface DeceasedDobField {
  value: string | null
  max: string | null // date du décès (AAAA-MM-JJ) ; la naissance doit la précéder
  save: (dob: string | null) => Promise<void>
}

interface LetterProfileFormProps {
  userId: string
  profile: LetterProfileRow | null
  // Pré-remplissage quand aucun profil n'existe encore (noms saisis par la PF).
  defaults?: LetterProfileDefaults
  // Réponse `relation` du questionnaire : propose les formes exactes (fils / fille…).
  relation?: RelationV2
  deceasedFirstName?: string
  deceasedDob?: DeceasedDobField
  // panel : lecture puis « Modifier » (panneau d'envoi, Profil) ; screen : édition directe.
  variant?: 'panel' | 'screen'
  // Titre et aide en tête du formulaire, par défaut en variante panel. La page Profil passe false :
  // elle a son propre titre.
  showHeader?: boolean
  submitLabel?: string
  onSaved: (profile: LetterProfileRow) => void
  onSkip?: () => void
}

// Ordre visuel des champs : après une validation en échec, le focus va au premier champ en erreur.
const FIELD_ORDER: LetterProfileField[] = [
  'first_name',
  'last_name',
  'relationship',
  'address_line1',
  'address_line2',
  'postal_code',
  'city',
  'deceased_dob',
]

// Ids DOM d'un champ, de son aide et de son erreur : le préfixe `useId()` les rend uniques par instance.
const fieldId = (uid: string, field: LetterProfileField) => `${uid}-${field}`
const fieldHintId = (uid: string, field: LetterProfileField) => `${uid}-${field}-hint`
const fieldErrorId = (uid: string, field: LetterProfileField) => `${uid}-${field}-error`

/** Valeur d'aria-describedby : les ids présents, joints ; undefined quand il n'y en a aucun. */
function describedBy(...ids: Array<string | false | null | undefined>): string | undefined {
  return ids.filter(Boolean).join(' ') || undefined
}

// Formulaire unique du profil courrier (personnalisation v2, spec §4.5) — remplace SenderProfileForm
// (chantier 2a). Plusieurs instances peuvent coexister (un panneau d'envoi par étape dépliée) :
// `useId()` garantit des ids DOM uniques, et le focus n'est JAMAIS pris au montage, seulement en
// réponse à une action dans CE formulaire (enregistrer, « Modifier », « Annuler »).
// L'état (champs, date de naissance) est initialisé au montage puis à chaque « Modifier », jamais
// resynchronisé en cours de saisie : l'appelant monte le formulaire APRÈS le chargement de ses données
// (profil, noms du dossier, date de naissance), ce que font les trois usages.
export function LetterProfileForm({
  userId,
  profile,
  defaults,
  relation,
  deceasedFirstName,
  deceasedDob,
  variant = 'panel',
  showHeader = variant === 'panel',
  submitLabel,
  onSaved,
  onSkip,
}: LetterProfileFormProps) {
  const t = useT()
  const { lang } = useLang()
  const uid = useId()
  const idOf = (field: LetterProfileField) => fieldId(uid, field)
  const hintIdOf = (field: LetterProfileField) => fieldHintId(uid, field)
  const errId = (field: LetterProfileField) => fieldErrorId(uid, field)
  const savedId = `${uid}-saved`
  const dobSaveErrorId = `${uid}-deceased_dob-save-error`
  const relationOptions = relationLabelOptions(relation)
  // Édition explicite (« Modifier ») ; sans profil, le formulaire s'affiche d'office. Dérivé plutôt que
  // figé au montage : plusieurs étapes peuvent être dépliées à la fois, et si un autre panneau
  // enregistre le profil, celui-ci passe en lecture au lieu de rester un formulaire vide.
  const [editRequested, setEditRequested] = useState(false)
  const editing = variant === 'screen' || editRequested || !profile
  const [form, setForm] = useState<LetterProfileInput>(() => initialLetterProfileInput(profile, defaults, relation))
  // Lien enregistré hors des formes proposées : saisie libre, pour qu'il reste visible et modifiable.
  const [freeRelationship, setFreeRelationship] = useState(() => isFreeRelationLabel(relation, form.relationship))
  const [dob, setDob] = useState(deceasedDob?.value ?? '')
  const [errors, setErrors] = useState<LetterProfileErrors>({})
  const [saving, setSaving] = useState(false)
  // 'profile' : rien n'est enregistré ; 'dob' : le profil l'est, mais pas la date de naissance.
  const [saveError, setSaveError] = useState<'profile' | 'dob' | null>(null)
  const [saved, setSaved] = useState(false)

  // Bascule lecture/édition : le bouton qui avait le focus est démonté, le focus retomberait sur
  // <body>. L'action pose une demande, consommée APRÈS le rendu qu'elle provoque.
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const toggleFocusRef = useRef<'edit-button' | 'first-field' | null>(null)
  useEffect(() => {
    const request = toggleFocusRef.current
    if (!request) return
    toggleFocusRef.current = null
    if (request === 'edit-button') editButtonRef.current?.focus()
    else document.getElementById(fieldId(uid, 'first_name'))?.focus()
  }, [editing, uid])

  // Validation en échec : focus sur le premier champ en erreur, après le rendu qui pose aria-invalid.
  const errorFocusRef = useRef(false)
  useEffect(() => {
    if (!errorFocusRef.current) return
    errorFocusRef.current = false
    const first = FIELD_ORDER.find((field) => errors[field])
    if (first) document.getElementById(fieldId(uid, first))?.focus()
  }, [errors, uid])

  // « Modifier » repart des données à jour : le profil a pu changer depuis un autre panneau.
  const startEditing = () => {
    const next = initialLetterProfileInput(profile, defaults, relation)
    setForm(next)
    setFreeRelationship(isFreeRelationLabel(relation, next.relationship))
    setDob(deceasedDob?.value ?? '')
    setErrors({})
    setSaved(false)
    setSaveError(null)
    toggleFocusRef.current = 'first-field'
    setEditRequested(true)
  }

  // « Annuler » (panel, profil existant) : referme sans enregistrer ; « Modifier » repartira du profil.
  const cancelEditing = () => {
    setErrors({})
    setSaveError(null)
    toggleFocusRef.current = 'edit-button'
    setEditRequested(false)
  }

  const setField = (key: keyof LetterProfileInput, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      const next = { ...prev, [key]: undefined }
      // « Prénom et nom ensemble : 45 caractères » est posée sur le nom : corriger le prénom la lève
      // aussi. Les autres erreurs du nom ne dépendent que du nom : elles restent affichées.
      if (key === 'first_name' && prev.last_name === 'fullNameTooLong') next.last_name = undefined
      return next
    })
    setSaved(false)
    setSaveError(null)
  }

  const setDobValue = (value: string) => {
    setDob(value)
    setErrors((prev) => ({ ...prev, deceased_dob: undefined }))
    setSaved(false)
    setSaveError(null)
  }

  const errorText = (field: LetterProfileField) => {
    const key = errors[field]
    return key ? (
      <p id={errId(field)} className="text-sm text-error">
        {t.letterProfile.errors[key]}
      </p>
    ) : null
  }

  // Attributs communs d'un champ : id (cible du label et du focus), état invalide, descriptions (aide
  // éventuelle puis erreur) et bordure d'erreur, comme le TextField de DossierForm.
  const fieldProps = (field: LetterProfileField, ...hintIds: Array<string | false | null | undefined>) => ({
    id: idOf(field),
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': describedBy(...hintIds, errors[field] && errId(field)),
    className: errors[field] ? 'border-error focus:border-error' : undefined,
  })

  const handleSave = async () => {
    if (saving) return
    // Lien validé et enregistré tel qu'il sera écrit dans les courriers : « Fille » tapé devient « fille ».
    const input: LetterProfileInput = { ...form, relationship: normalizeRelationLabel(relation, form.relationship) }
    const found = validateLetterProfile(input, deceasedDob ? { value: dob, max: deceasedDob.max } : undefined)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      errorFocusRef.current = true
      return
    }
    setSaving(true)
    setSaveError(null)
    let row: LetterProfileRow
    try {
      row = await saveLetterProfile(supabase, userId, input)
    } catch (err) {
      // Message Supabase seul (jamais les `details`, qui contiennent la ligne) : pas de donnée personnelle.
      Sentry.captureException(err)
      setSaveError('profile')
      setSaving(false)
      return
    }
    // Date réécrite seulement si elle a changé. Son échec est signalé à part (le profil, lui, est
    // enregistré) et retient onSaved : contrat de DeceasedDobField.
    if (deceasedDob && (dob || null) !== (deceasedDob.value || null)) {
      try {
        await deceasedDob.save(dob || null)
      } catch (err) {
        Sentry.captureException(err)
        setSaveError('dob')
        setSaving(false)
        return
      }
    }
    setSaving(false)
    setSaved(true)
    if (variant === 'panel') {
      toggleFocusRef.current = 'edit-button'
      setEditRequested(false)
    }
    onSaved(row)
  }

  if (!editing && profile) {
    // Lien relu tel qu'il est écrit dans les courriers (« Fille » du 2a → « fille »).
    const savedRelationship = normalizeRelationLabel(relation, profile.relationship ?? '')
    const dobText = deceasedDob?.value ? formatDobForDisplay(deceasedDob.value, lang) : ''
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
            {savedRelationship && deceasedFirstName && (
              <p className="text-text-muted">
                {fmt(t.letterProfile.relationshipPreview, { relationship: savedRelationship, name: deceasedFirstName })}
              </p>
            )}
            {dobText && (
              <p className="text-text-muted">
                {deceasedFirstName
                  ? fmt(t.letterProfile.dobSummary, { name: deceasedFirstName, date: dobText })
                  : fmt(t.letterProfile.dobSummaryNoName, { date: dobText })}
              </p>
            )}
          </div>
          <Button
            ref={editButtonRef}
            type="button"
            variant="ghost"
            size="sm"
            onClick={startEditing}
            aria-label={t.letterProfile.editAriaLabel}
            aria-describedby={saved ? savedId : undefined}
            className="shrink-0 gap-1.5"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            {t.letterProfile.editCta}
          </Button>
        </div>
        {saved && (
          <p id={savedId} role="status" className="flex items-center gap-1.5 text-sm text-text-secondary">
            <Check className="h-4 w-4 text-success" aria-hidden="true" />
            {t.letterProfile.savedHint}
          </p>
        )}
      </div>
    )
  }

  // Aperçu « {lien} de {prénom} », avec le lien tel qu'il sera enregistré puis écrit dans les courriers.
  const previewRelationship = normalizeRelationLabel(relation, form.relationship)
  const relationshipPreview =
    previewRelationship && deceasedFirstName
      ? fmt(t.letterProfile.relationshipPreview, { relationship: previewRelationship, name: deceasedFirstName })
      : null
  const relationshipHint = relationshipPreview ? (
    <p id={hintIdOf('relationship')} className="text-xs text-text-muted">
      {relationshipPreview}
    </p>
  ) : null

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void handleSave()
      }}
      className={cn('space-y-4', variant === 'panel' && 'rounded-xl border border-border-soft bg-surface p-3')}
    >
      {showHeader && (
        <div>
          <h4 className="font-body text-sm font-medium text-text">{t.letterProfile.title}</h4>
          <p className="text-xs text-text-muted">{t.letterProfile.hint}</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={idOf('first_name')} className="text-sm">{t.letterProfile.firstNameLabel}</Label>
          <Input
            {...fieldProps('first_name')}
            value={form.first_name}
            maxLength={LINE_MAX}
            autoComplete="given-name"
            autoCapitalize="words"
            aria-required="true"
            onChange={(e) => setField('first_name', e.target.value)}
          />
          {errorText('first_name')}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={idOf('last_name')} className="text-sm">{t.letterProfile.lastNameLabel}</Label>
          <Input
            {...fieldProps('last_name')}
            value={form.last_name}
            maxLength={LINE_MAX}
            autoComplete="family-name"
            autoCapitalize="words"
            aria-required="true"
            onChange={(e) => setField('last_name', e.target.value)}
          />
          {errorText('last_name')}
        </div>

        {relationOptions && !freeRelationship ? (
          <fieldset
            className="space-y-1.5 sm:col-span-2"
            aria-describedby={describedBy(
              relationshipPreview && hintIdOf('relationship'),
              errors.relationship && errId('relationship')
            )}
          >
            <legend className="mb-1.5 font-body text-sm font-medium leading-none text-text-secondary">
              {t.letterProfile.relationshipLabel}
            </legend>
            <div className="flex flex-wrap gap-2">
              {relationOptions.map((option, index) => {
                const selected = form.relationship === option.value
                return (
                  <label
                    key={option.value}
                    className={cn(
                      'inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-1.5 text-sm transition-colors',
                      'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40 has-[:focus-visible]:ring-offset-2',
                      selected
                        ? 'border-primary bg-primary-light text-text'
                        : 'border-border bg-white text-text-secondary hover:border-primary'
                    )}
                  >
                    <input
                      type="radio"
                      className="sr-only"
                      // Première pastille : cible du focus quand le lien est en erreur.
                      id={index === 0 ? idOf('relationship') : undefined}
                      name={`${uid}-relationship`}
                      value={option.value}
                      checked={selected}
                      aria-invalid={errors.relationship ? true : undefined}
                      onChange={() => setField('relationship', option.value)}
                    />
                    {/* Marque non chromatique de la sélection, comme QuestionCard : un point dans le cercle. */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                        selected ? 'border-primary' : 'border-border'
                      )}
                    >
                      {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
                    </span>
                    {option.label[lang]}
                  </label>
                )
              })}
            </div>
            {relationshipHint}
            {errorText('relationship')}
          </fieldset>
        ) : (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={idOf('relationship')} className="text-sm">{t.letterProfile.relationshipFreeLabel}</Label>
            <Input
              {...fieldProps('relationship', relationshipPreview && hintIdOf('relationship'))}
              value={form.relationship}
              maxLength={LINE_MAX}
              // Pas de majuscule automatique (iOS, Gboard) : le lien s'écrit en milieu de phrase.
              autoCapitalize="none"
              aria-required="true"
              placeholder={t.letterProfile.relationshipFreePlaceholder}
              onChange={(e) => setField('relationship', e.target.value)}
            />
            {relationshipHint}
            {errorText('relationship')}
          </div>
        )}

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={idOf('address_line1')} className="text-sm">{t.letterProfile.addressLine1Label}</Label>
          <Input
            {...fieldProps('address_line1', hintIdOf('address_line1'))}
            value={form.address_line1}
            maxLength={LINE_MAX}
            autoComplete="address-line1"
            aria-required="true"
            onChange={(e) => setField('address_line1', e.target.value)}
          />
          <p id={hintIdOf('address_line1')} className="text-xs text-text-muted">
            {fmt(t.letterProfile.lineCounter, { count: form.address_line1.length })}
          </p>
          {errorText('address_line1')}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={idOf('address_line2')} className="text-sm">{t.letterProfile.addressLine2Label}</Label>
          <Input
            {...fieldProps('address_line2')}
            value={form.address_line2}
            maxLength={LINE_MAX}
            autoComplete="address-line2"
            onChange={(e) => setField('address_line2', e.target.value)}
          />
          {errorText('address_line2')}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={idOf('postal_code')} className="text-sm">{t.letterProfile.postalCodeLabel}</Label>
          <Input
            {...fieldProps('postal_code')}
            value={form.postal_code}
            maxLength={5}
            inputMode="numeric"
            autoComplete="postal-code"
            aria-required="true"
            onChange={(e) => setField('postal_code', e.target.value)}
          />
          {errorText('postal_code')}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={idOf('city')} className="text-sm">{t.letterProfile.cityLabel}</Label>
          <Input
            {...fieldProps('city')}
            value={form.city}
            maxLength={LINE_MAX}
            autoComplete="address-level2"
            aria-required="true"
            onChange={(e) => setField('city', e.target.value)}
          />
          {errorText('city')}
        </div>

        {deceasedDob && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={idOf('deceased_dob')} className="text-sm">
              {deceasedFirstName
                ? fmt(t.letterProfile.dobLabel, { name: deceasedFirstName })
                : t.letterProfile.dobLabelNoName}
            </Label>
            <Input
              {...fieldProps('deceased_dob', hintIdOf('deceased_dob'), saveError === 'dob' && dobSaveErrorId)}
              type="date"
              value={dob}
              min={DOB_MIN}
              max={deceasedDob.max || todayLocalIsoDate()}
              onChange={(e) => setDobValue(e.target.value)}
            />
            <p id={hintIdOf('deceased_dob')} className="text-xs text-text-muted">
              {t.letterProfile.dobHint}
            </p>
            {errorText('deceased_dob')}
            {saveError === 'dob' && (
              <p id={dobSaveErrorId} role="alert" className="text-sm text-error">
                {t.letterProfile.dobSaveError}
              </p>
            )}
          </div>
        )}
      </div>

      <div className={cn('flex flex-wrap items-center gap-3', variant === 'screen' && 'max-sm:flex-col max-sm:items-stretch')}>
        <Button
          type="submit"
          size={variant === 'panel' ? 'sm' : 'default'}
          disabled={saving}
          className={cn(
            'gap-2',
            // Libellé long (« Enregistrer et voir mon parcours ») : il passe à la ligne sur mobile au lieu
            // de déborder de la carte (le Button est whitespace-nowrap).
            variant === 'screen' && 'max-sm:h-auto max-sm:min-h-[51px] max-sm:whitespace-normal max-sm:py-3 max-sm:text-center'
          )}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {saving ? t.letterProfile.saving : (submitLabel ?? t.letterProfile.saveCta)}
        </Button>
        {variant === 'panel' && editRequested && profile && (
          <Button type="button" variant="ghost" size="sm" onClick={cancelEditing} disabled={saving}>
            {t.letterProfile.cancelCta}
          </Button>
        )}
        {onSkip && (
          <Button type="button" variant="ghost" onClick={onSkip} disabled={saving}>
            {t.letterProfile.screenSkip}
          </Button>
        )}
      </div>
      {saved && variant === 'panel' && (
        <p role="status" className="flex items-center gap-1.5 text-sm text-text-secondary">
          <Check className="h-4 w-4 text-success" aria-hidden="true" />
          {t.letterProfile.savedHint}
        </p>
      )}
      {saveError === 'profile' && (
        <p role="alert" className="text-sm text-error">
          {t.letterProfile.saveError}
        </p>
      )}
    </form>
  )
}

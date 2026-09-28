import { useState, useMemo, useCallback, useEffect } from 'react'
import { formatLetterValue, getLetterTemplate, type LetterTemplate } from '@/data/letter-templates'

export interface LetterGeneratorOptions {
  templateId: string
  userProfile?: {
    firstname?: string
    lastname?: string
    address?: string
    relation?: string
    city?: string
  }
  questionnaireData?: {
    deceased_firstname?: string
    deceased_lastname?: string
    deceased_dob?: string
    deceased_dod?: string
  }
}

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/
function formatDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '' // jamais « Invalid Date » dans un courrier : le champ redevient à saisir
  // Date seule = minuit UTC : formatée en UTC, sinon la veille dans les fuseaux négatifs
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', ...(ISO_DAY_RE.test(iso) ? { timeZone: 'UTC' } : {}) })
}

export function buildInitialValues(
  template: LetterTemplate,
  userProfile?: LetterGeneratorOptions['userProfile'],
  questionnaireData?: LetterGeneratorOptions['questionnaireData']
): Record<string, string> {
  const values: Record<string, string> = {}

  for (const v of template.variables) {
    if (!v.auto_filled) continue

    switch (v.key) {
      case 'user_firstname':
        values[v.key] = userProfile?.firstname ?? ''
        break
      case 'user_lastname':
        values[v.key] = userProfile?.lastname ?? ''
        break
      case 'user_address':
        values[v.key] = userProfile?.address ?? ''
        break
      case 'user_relation':
        values[v.key] = userProfile?.relation ?? ''
        break
      case 'deceased_firstname':
        values[v.key] = questionnaireData?.deceased_firstname ?? ''
        break
      case 'deceased_lastname':
        values[v.key] = questionnaireData?.deceased_lastname ?? ''
        break
      case 'deceased_dob':
        values[v.key] = formatDate(questionnaireData?.deceased_dob)
        break
      case 'deceased_dod':
        values[v.key] = formatDate(questionnaireData?.deceased_dod)
        break
      case 'city':
        values[v.key] = userProfile?.city ?? ''
        break
      case 'today_date':
        values[v.key] = formatDate(new Date().toISOString())
        break
    }
  }

  return values
}

/**
 * Fusionne des valeurs auto-remplies dans l'état courant : une valeur auto NON VIDE remplace, une
 * valeur vide n'efface jamais une saisie manuelle. Même référence si rien ne change.
 */
export function mergeAutoFilled(prev: Record<string, string>, auto: Record<string, string>): Record<string, string> {
  let next = prev
  for (const [key, value] of Object.entries(auto)) {
    if (value && prev[key] !== value) {
      if (next === prev) next = { ...prev }
      next[key] = value
    }
  }
  return next
}

/**
 * Ne garde, parmi les valeurs auto recalculées, que celles qui ont changé depuis le dernier calcul
 * (prevAuto). Au montage (prevAuto === null), l'état initial vient déjà de ces sources : rien à
 * rejouer. Permet de ne resynchroniser que les champs dont LA SOURCE a changé, jamais les autres
 * (ex. une correction manuelle de ville pour ce courrier précis ne doit pas être écrasée par un
 * changement d'adresse sans rapport).
 */
export function pickChangedAuto(prevAuto: Record<string, string> | null, auto: Record<string, string>): Record<string, string> {
  if (prevAuto === null) return {}
  const changed: Record<string, string> = {}
  for (const [key, value] of Object.entries(auto)) {
    if (prevAuto[key] !== value) changed[key] = value
  }
  return changed
}

/** Suivi de la dernière valeur auto : chaque appel renvoie les seules clés dont LA source a changé ({} au premier appel = montage). */
export function createAutoSync(): (auto: Record<string, string>) => Record<string, string> {
  let last: Record<string, string> | null = null
  return (auto) => {
    const changed = pickChangedAuto(last, auto)
    last = auto
    return changed
  }
}

export function useLetterGenerator(options: LetterGeneratorOptions) {
  const template = getLetterTemplate(options.templateId)

  const [values, setValues] = useState<Record<string, string>>(() =>
    template ? buildInitialValues(template, options.userProfile, options.questionnaireData) : {}
  )

  // Personnalisation v2 : resynchronise un champ auto-rempli seulement quand SA source a changé
  // (ex. profil courrier enregistré depuis le panneau d'envoi : l'adresse sous la signature suit
  // alors celle de l'enveloppe) — jamais quand une AUTRE source change (une correction manuelle de
  // ville pour ce courrier précis n'est pas effacée par un changement d'adresse sans rapport). Une
  // valeur auto vide n'efface jamais une saisie manuelle. `autoSync` est créé une seule fois (état
  // React, pas une ref manipulée dans l'updater) et appelé HORS de l'updater passé à setValues :
  // React double-invoque les updaters en StrictMode, ce qui avancerait le suivi deux fois pour un
  // seul changement réel et ferait disparaître la resynchronisation en silence.
  const [autoSync] = useState(createAutoSync)
  const autoSourcesKey = JSON.stringify([options.userProfile ?? null, options.questionnaireData ?? null])
  useEffect(() => {
    if (!template) return
    const auto = buildInitialValues(template, options.userProfile, options.questionnaireData)
    const changed = autoSync(auto) // montage : {} (l'état initial vient déjà de ces sources)
    setValues((prev) => mergeAutoFilled(prev, changed))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- autoSourcesKey résume options.userProfile et options.questionnaireData, des littéraux recréés à chaque rendu par l'appelant
  }, [autoSourcesKey, template])

  const setVariable = useCallback((key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }))
  }, [])

  // Objet résolu exposé séparément : sert aussi de titre au courrier sauvegardé
  const resolvedSubject = useMemo(() => {
    if (!template) return ''
    let subject = template.subject
    for (const v of template.variables) {
      const val = formatLetterValue(values[v.key]) || `[${v.label.toUpperCase()}]`
      subject = subject.replaceAll(`{{${v.key}}}`, val)
    }
    return subject
  }, [template, values])

  const resolvedLetter = useMemo(() => {
    if (!template) return ''

    let result = template.body

    // Resolve recipient_label first
    let resolvedRecipient = template.recipient_label
    for (const v of template.variables) {
      const val = formatLetterValue(values[v.key]) || `[${v.label.toUpperCase()}]`
      resolvedRecipient = resolvedRecipient.replaceAll(`{{${v.key}}}`, val)
    }

    // Replace placeholders in body
    result = result.replaceAll('{{recipient_label}}', resolvedRecipient)
    result = result.replaceAll('{{subject}}', resolvedSubject)

    for (const v of template.variables) {
      const val = formatLetterValue(values[v.key]) || `[${v.label.toUpperCase()}]`
      result = result.replaceAll(`{{${v.key}}}`, val)
    }

    return result
  }, [template, values, resolvedSubject])

  const isComplete = useMemo(() => {
    if (!template) return false
    return template.variables
      .filter((v) => v.required)
      .every((v) => !!values[v.key]?.trim())
  }, [template, values])

  const missingVariables = useMemo(() => {
    if (!template) return []
    return template.variables.filter((v) => !v.auto_filled || !values[v.key]?.trim())
  }, [template, values])

  return {
    template,
    values,
    resolvedLetter,
    resolvedSubject,
    isComplete,
    missingVariables,
    setVariable,
  }
}

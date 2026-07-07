import { useState, useMemo, useCallback } from 'react'
import { getLetterTemplate, type LetterTemplate } from '@/data/letter-templates'

export interface LetterGeneratorOptions {
  templateId: string
  userProfile?: {
    firstname?: string
    lastname?: string
    address?: string
    relation?: string
  }
  questionnaireData?: {
    deceased_firstname?: string
    deceased_lastname?: string
    deceased_dob?: string
    deceased_dod?: string
  }
}

function formatDate(iso?: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function buildInitialValues(
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
      case 'today_date':
        values[v.key] = formatDate(new Date().toISOString())
        break
    }
  }

  return values
}

export function useLetterGenerator(options: LetterGeneratorOptions) {
  const template = getLetterTemplate(options.templateId)

  const [values, setValues] = useState<Record<string, string>>(() =>
    template ? buildInitialValues(template, options.userProfile, options.questionnaireData) : {}
  )

  const setVariable = useCallback((key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }))
  }, [])

  const resolvedLetter = useMemo(() => {
    if (!template) return ''

    let result = template.body

    // Resolve recipient_label and subject first
    let resolvedRecipient = template.recipient_label
    let resolvedSubject = template.subject
    for (const v of template.variables) {
      const val = values[v.key] || `[${v.label.toUpperCase()}]`
      resolvedRecipient = resolvedRecipient.replaceAll(`{{${v.key}}}`, val)
      resolvedSubject = resolvedSubject.replaceAll(`{{${v.key}}}`, val)
    }

    // Replace placeholders in body
    result = result.replaceAll('{{recipient_label}}', resolvedRecipient)
    result = result.replaceAll('{{subject}}', resolvedSubject)

    for (const v of template.variables) {
      const val = values[v.key] || `[${v.label.toUpperCase()}]`
      result = result.replaceAll(`{{${v.key}}}`, val)
    }

    return result
  }, [template, values])

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
    isComplete,
    missingVariables,
    setVariable,
  }
}

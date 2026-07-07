import { useState, useCallback } from 'react'
import { getQuestion, TOTAL_QUESTIONS, type DeterministicQuestion } from '@/data/questionnaire-questions'
import type { QuestionnaireAnswers } from '@/lib/roadmap-generator'

type Phase = 'welcome' | 'question' | 'completing' | 'done'

// Maps raw select option labels to QuestionnaireAnswers.relation values
const RELATION_MAP: Record<string, QuestionnaireAnswers['relation']> = {
  'Conjoint(e)': 'conjoint',
  'Parent': 'parent',
  'Enfant': 'enfant',
  'Frere / Soeur': 'frere_soeur',
  'Autre': 'autre',
}

// Maps multiselect option labels to QuestionnaireAnswers.organismes values
const ORGANISME_MAP: Record<string, QuestionnaireAnswers['organismes'][number]> = {
  'Banque': 'banque',
  'Assurance': 'assurance',
  'CAF': 'caf',
  'Caisse de retraite': 'retraite',
  'Employeur': 'employeur',
  'Mutuelle': 'mutuelle',
  'Bailleur / Logement': 'logement',
  'CPAM (Securite sociale)': 'cpam',
}

export function useQuestionnaire() {
  const [phase, setPhase] = useState<Phase>('welcome')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Partial<QuestionnaireAnswers>>({})
  const [error, setError] = useState<string | null>(null)

  const currentQuestion: DeterministicQuestion | null =
    phase === 'question' ? getQuestion(currentIndex) : null

  const start = useCallback(() => {
    setCurrentIndex(0)
    setAnswers({})
    setError(null)
    setPhase('question')
  }, [])

  const recordAnswer = useCallback(
    (_questionId: string, rawValue: unknown) => {
      const q = getQuestion(currentIndex)
      if (!q) return

      setError(null)

      // Convert raw UI value to the typed QuestionnaireAnswers field
      const key = q.answer_key
      let typedValue: unknown = rawValue

      if (key === 'relation' && typeof rawValue === 'string') {
        typedValue = RELATION_MAP[rawValue] ?? 'autre'
      } else if (key === 'organismes' && Array.isArray(rawValue)) {
        typedValue = rawValue
          .map((label: string) => ORGANISME_MAP[label])
          .filter(Boolean)
      }

      setAnswers((prev) => ({ ...prev, [key]: typedValue }))

      // Advance
      const nextIndex = currentIndex + 1
      if (nextIndex >= TOTAL_QUESTIONS) {
        setPhase('completing')
      } else {
        setCurrentIndex(nextIndex)
      }
    },
    [currentIndex]
  )

  const skipQuestion = useCallback(
    (_questionId: string) => {
      setError(null)
      const nextIndex = currentIndex + 1
      if (nextIndex >= TOTAL_QUESTIONS) {
        setPhase('completing')
      } else {
        setCurrentIndex(nextIndex)
      }
    },
    [currentIndex]
  )

  const markDone = useCallback(() => {
    setPhase('done')
  }, [])

  const buildAnswers = useCallback((): QuestionnaireAnswers => {
    return {
      relation: answers.relation ?? 'autre',
      has_notary: answers.has_notary ?? false,
      organismes: answers.organismes ?? [],
      deceased_was_employed: answers.deceased_was_employed ?? false,
      deceased_was_tenant: answers.deceased_was_tenant ?? false,
      has_life_insurance: answers.has_life_insurance ?? false,
      has_joint_account: answers.has_joint_account ?? false,
      deceased_firstname: answers.deceased_firstname as string | undefined,
      deceased_lastname: answers.deceased_lastname as string | undefined,
      deceased_dod: answers.deceased_dod as string | undefined,
    }
  }, [answers])

  return {
    phase,
    currentQuestion,
    currentIndex,
    totalQuestions: TOTAL_QUESTIONS,
    error,
    start,
    recordAnswer,
    skipQuestion,
    buildAnswers,
    markDone,
  }
}

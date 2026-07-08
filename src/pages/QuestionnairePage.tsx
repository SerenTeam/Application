import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/api'
import { generateRoadmap, saveRoadmapToDb } from '@/lib/roadmap-generator'
import { supabase } from '@/lib/supabase'
import type { QuestionnaireAnswers } from '@/lib/roadmap-generator'
import { adaptAnswersV1toV2 } from '@/lib/answers-adapter'
import { WelcomeScreen } from '@/components/questionnaire/WelcomeScreen'
import { QuestionCard, type QuestionData } from '@/components/questionnaire/QuestionCard'
import { CompletionScreen } from '@/components/questionnaire/CompletionScreen'

type Phase = 'welcome' | 'loading' | 'question' | 'completing' | 'done'

export function QuestionnairePage() {
  const { user, signOut } = useAuth()

  const [phase, setPhase] = useState<Phase>('welcome')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(null)
  const [questionCount, setQuestionCount] = useState(0)
  const [stepsCount, setStepsCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ─── Start questionnaire (calls AI agent) ─────────────────────

  const startQuestionnaire = useCallback(async () => {
    setPhase('loading')
    setError(null)

    try {
      const response = await apiFetch('/api/questionnaire/start', { method: 'POST' })
      const result = await response.json()

      if (result.success) {
        setSessionId(result.session_id)
        setQuestionCount(1)
        setCurrentQuestion(result.data)
        setPhase('question')
      } else {
        setError(result.error || 'Erreur lors du demarrage')
        setPhase('welcome')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue'
      setError('Erreur de connexion : ' + message)
      setPhase('welcome')
    }
  }, [])

  // ─── Submit an answer ─────────────────────────────────────────

  const handleAnswer = useCallback(
    async (questionId: string, answer: unknown) => {
      if (!sessionId || !currentQuestion) return

      setIsSubmitting(true)
      setError(null)

      try {
        const response = await apiFetch('/api/questionnaire/answer', {
          method: 'POST',
          body: JSON.stringify({
            session_id: sessionId,
            question_id: questionId,
            reponse: answer,
            question_text: currentQuestion.question || '',
          }),
        })
        const result = await response.json()

        if (result.success) {
          if (result.data.action === 'fin_questionnaire') {
            // Agent signalled completion — extract & generate roadmap
            await completeQuestionnaire(result.data.answers)
          } else {
            setQuestionCount((c) => c + 1)
            setCurrentQuestion(result.data)
          }
        } else {
          setError(result.error || 'Erreur IA')
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erreur inconnue'
        setError('Erreur de connexion : ' + message)
      } finally {
        setIsSubmitting(false)
      }
    },
    [sessionId, currentQuestion] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const handleSkip = useCallback(
    (questionId: string) => {
      handleAnswer(questionId, null)
    },
    [handleAnswer]
  )

  // ─── Complete: extract answers → roadmap → save ───────────────

  const completeQuestionnaire = useCallback(
    async (agentAnswers?: Record<string, unknown>) => {
      if (!user) return

      setPhase('completing')
      setError(null)

      try {
        let answers: QuestionnaireAnswers

        if (agentAnswers && Object.keys(agentAnswers).length > 0) {
          // Use answers provided directly by the agent
          answers = normalizeAnswers(agentAnswers)
        } else {
          // Fallback: call /complete to extract from conversation
          const response = await apiFetch('/api/questionnaire/complete', {
            method: 'POST',
            body: JSON.stringify({ session_id: sessionId }),
          })
          const result = await response.json()

          if (!result.success) {
            throw new Error(result.error || 'Extraction des reponses impossible')
          }

          answers = normalizeAnswers(result.answers)
        }

        // Save questionnaire answers
        const { data: questionnaire, error: qError } = await supabase
          .from('questionnaires')
          .insert({
            user_id: user.id,
            answers,
            status: 'completed',
          })
          .select()
          .single()

        if (qError || !questionnaire) {
          throw new Error('Impossible de sauvegarder vos reponses.')
        }

        // Generate roadmap
        const steps = generateRoadmap(adaptAnswersV1toV2(answers))
        setStepsCount(steps.length)

        await saveRoadmapToDb(user.id, questionnaire.id, steps)

        setPhase('done')
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erreur inattendue'
        setError(message)
        setPhase('completing') // stay on completing so retry button shows
      }
    },
    [user, sessionId]
  )

  // ─── Render ───────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="p-8 text-center border-b border-border-soft bg-bg-card">
        <div className="font-display text-[1.75rem] font-medium text-accent tracking-[0.02em]">
          Seren<span className="italic font-normal">.</span>
        </div>
        <nav className="mt-4 flex items-center justify-center gap-8 flex-wrap">
          <span className="text-text-soft text-sm font-medium">{user?.email}</span>

          <Link
            to="/dashboard"
            className="text-text-soft no-underline text-sm font-medium uppercase tracking-widest border-b-2 border-text-soft pb-0.5 transition-all duration-200 hover:text-accent hover:border-accent"
          >
            Tableau de bord
          </Link>

          <button
            onClick={signOut}
            className="bg-transparent border-none border-b-2 border-text-soft text-text-soft text-sm font-medium uppercase tracking-widest cursor-pointer p-0 pb-0.5 transition-all duration-200 hover:text-accent hover:border-accent"
          >
            Deconnexion
          </button>
        </nav>
      </header>

      {/* Main content */}
      <main className="max-w-[720px] mx-auto py-12 px-6 pb-24 max-sm:py-8 max-sm:px-4 max-sm:pb-16">
        {/* Welcome */}
        {phase === 'welcome' && (
          <>
            {error && (
              <div className="bg-[#FEF2F0] border border-[#F5D5D0] text-error py-4 px-5 rounded-radius-sm mb-6 text-[0.95rem] text-center">
                {error}
              </div>
            )}
            <WelcomeScreen onStart={startQuestionnaire} />
          </>
        )}

        {/* Loading first question */}
        {phase === 'loading' && (
          <div className="text-center py-16 px-8">
            <div className="w-12 h-12 border-[3px] border-border border-t-accent rounded-full mx-auto mb-6 animate-spin" />
            <p className="text-text-soft text-base">Preparation de votre questionnaire...</p>
          </div>
        )}

        {/* Question */}
        {phase === 'question' && currentQuestion && (
          <QuestionCard
            key={currentQuestion.question_id}
            question={currentQuestion}
            questionCount={questionCount}
            totalQuestions={20}
            onAnswer={handleAnswer}
            onSkip={handleSkip}
            isSubmitting={isSubmitting}
            error={error}
          />
        )}

        {/* Completing / generating roadmap */}
        {phase === 'completing' && !error && (
          <div className="text-center py-16 px-8">
            <div className="w-12 h-12 border-[3px] border-border border-t-accent rounded-full mx-auto mb-6 animate-spin" />
            <p className="text-text-soft text-base">Generation de votre parcours personnalise...</p>
          </div>
        )}

        {/* Error during completion */}
        {phase === 'completing' && error && (
          <div className="text-center py-16 px-8">
            <div className="bg-[#FEF2F0] border border-[#F5D5D0] text-error py-4 px-5 rounded-radius-sm mb-6 text-[0.95rem] max-w-md mx-auto">
              {error}
            </div>
            <button
              onClick={() => {
                setError(null)
                completeQuestionnaire()
              }}
              className="bg-accent text-white border-none py-3 px-6 rounded-radius-md cursor-pointer font-medium transition-all duration-200 hover:bg-accent-hover"
            >
              Reessayer
            </button>
          </div>
        )}

        {/* Done */}
        {phase === 'done' && <CompletionScreen stepsCount={stepsCount} />}
      </main>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────

function normalizeAnswers(raw: Record<string, unknown>): QuestionnaireAnswers {
  return {
    relation: normalizeRelation(raw.relation),
    has_notary: Boolean(raw.has_notary),
    organismes: normalizeOrganismes(raw.organismes),
    deceased_was_employed: Boolean(raw.deceased_was_employed),
    deceased_was_tenant: Boolean(raw.deceased_was_tenant),
    has_life_insurance: Boolean(raw.has_life_insurance),
    has_joint_account: Boolean(raw.has_joint_account),
    deceased_firstname: typeof raw.deceased_firstname === 'string' ? raw.deceased_firstname : undefined,
    deceased_lastname: typeof raw.deceased_lastname === 'string' ? raw.deceased_lastname : undefined,
    deceased_dod: typeof raw.deceased_dod === 'string' ? raw.deceased_dod : undefined,
  }
}

function normalizeRelation(value: unknown): QuestionnaireAnswers['relation'] {
  const valid = ['conjoint', 'parent', 'enfant', 'frere_soeur', 'autre'] as const
  if (typeof value === 'string' && valid.includes(value as typeof valid[number])) {
    return value as QuestionnaireAnswers['relation']
  }
  return 'autre'
}

function normalizeOrganismes(value: unknown): QuestionnaireAnswers['organismes'] {
  const valid = ['banque', 'assurance', 'caf', 'retraite', 'employeur', 'mutuelle', 'logement', 'cpam'] as const
  if (!Array.isArray(value)) return []
  return value.filter((v): v is typeof valid[number] =>
    typeof v === 'string' && valid.includes(v as typeof valid[number])
  )
}

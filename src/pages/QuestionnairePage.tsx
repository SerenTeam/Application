import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/api'
import { generateRoadmap, saveRoadmapToDb } from '@/lib/roadmap-generator'
import { supabase } from '@/lib/supabase'
import type { QuestionnaireAnswersV2 } from '@/types/questionnaire'
import { WelcomeScreen } from '@/components/questionnaire/WelcomeScreen'
import { QuestionCard, type QuestionData } from '@/components/questionnaire/QuestionCard'
import { RecapScreen, type RecapEntry } from '@/components/questionnaire/RecapScreen'
import { CompletionScreen } from '@/components/questionnaire/CompletionScreen'

type Phase = 'welcome' | 'loading' | 'question' | 'recap' | 'completing' | 'done'

type ServerData = (QuestionData & { action: 'question' }) | { action: 'recap'; recap: RecapEntry[] }

export function QuestionnairePage() {
  const { user, signOut } = useAuth()

  const [phase, setPhase] = useState<Phase>('welcome')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(null)
  const [recap, setRecap] = useState<RecapEntry[]>([])
  const [finalAnswers, setFinalAnswers] = useState<QuestionnaireAnswersV2 | null>(null)
  const [stepsCount, setStepsCount] = useState(0)
  const [doneCount, setDoneCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ─── Le serveur renvoie soit une question, soit le récapitulatif ──

  const showServerData = useCallback((data: ServerData) => {
    if (data.action === 'recap') {
      setRecap(data.recap)
      setPhase('recap')
    } else {
      setCurrentQuestion(data)
      setPhase('question')
    }
  }, [])

  // ─── Démarrage ─────────────────────────────────────────────────

  const startQuestionnaire = useCallback(async () => {
    setPhase('loading')
    setError(null)
    try {
      const response = await apiFetch('/api/questionnaire/start', { method: 'POST' })
      const result = await response.json()
      if (result.success) {
        setSessionId(result.session_id)
        showServerData(result.data)
      } else {
        setError(result.error || 'Erreur lors du démarrage')
        setPhase('welcome')
      }
    } catch (err: unknown) {
      setError('Erreur de connexion : ' + (err instanceof Error ? err.message : 'inconnue'))
      setPhase('welcome')
    }
  }, [showServerData])

  // ─── Réponse (valeur canonique, jamais le label) ───────────────

  const handleAnswer = useCallback(
    async (questionId: string, value: unknown) => {
      if (!sessionId) return
      setIsSubmitting(true)
      setError(null)
      try {
        const response = await apiFetch('/api/questionnaire/answer', {
          method: 'POST',
          body: JSON.stringify({ session_id: sessionId, question_id: questionId, value }),
        })
        const result = await response.json()
        if (result.success) {
          showServerData(result.data)
        } else {
          setError(result.error || 'Réponse invalide')
        }
      } catch (err: unknown) {
        setError('Erreur de connexion : ' + (err instanceof Error ? err.message : 'inconnue'))
      } finally {
        setIsSubmitting(false)
      }
    },
    [sessionId, showServerData]
  )

  // ─── Modifier depuis le récap ──────────────────────────────────

  const handleEdit = useCallback(
    async (questionId: string) => {
      if (!sessionId) return
      setPhase('loading')
      setError(null)
      try {
        const response = await apiFetch('/api/questionnaire/reask', {
          method: 'POST',
          body: JSON.stringify({ session_id: sessionId, question_id: questionId }),
        })
        const result = await response.json()
        if (result.success) {
          showServerData(result.data)
        } else {
          setError(result.error || 'Modification impossible')
          setPhase('recap')
        }
      } catch (err: unknown) {
        setError('Erreur de connexion : ' + (err instanceof Error ? err.message : 'inconnue'))
        setPhase('recap')
      }
    },
    [sessionId, showServerData]
  )

  // ─── Confirmation : answers typées → roadmap (aucune extraction IA) ──

  const confirmAndGenerate = useCallback(async () => {
    if (!user) return
    setPhase('completing')
    setError(null)
    try {
      // Idempotent : si /complete a déjà réussi (session supprimée côté serveur),
      // on réutilise les answers en mémoire au lieu de rappeler l'API.
      let answers = finalAnswers
      if (!answers) {
        const response = await apiFetch('/api/questionnaire/complete', {
          method: 'POST',
          body: JSON.stringify({ session_id: sessionId }),
        })
        const result = await response.json()
        if (!result.success) throw new Error(result.error || 'Finalisation impossible')
        answers = result.answers as QuestionnaireAnswersV2
        setFinalAnswers(answers)
      }

      const { data: questionnaire, error: qError } = await supabase
        .from('questionnaires')
        .insert({ user_id: user.id, answers, status: 'completed' })
        .select()
        .single()
      if (qError || !questionnaire) throw new Error('Impossible de sauvegarder vos réponses.')

      const steps = generateRoadmap(answers)
      setStepsCount(steps.length)
      setDoneCount(steps.filter((s) => s.initial_status === 'done').length)
      await saveRoadmapToDb(user.id, questionnaire.id, steps)

      setPhase('done')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue')
      setPhase('completing') // reste sur l'écran pour afficher le bouton Réessayer
    }
  }, [user, sessionId, finalAnswers])

  // ─── Render ───────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-bg">
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
            Déconnexion
          </button>
        </nav>
      </header>

      <main className="max-w-[720px] mx-auto py-12 px-6 pb-24 max-sm:py-8 max-sm:px-4 max-sm:pb-16">
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

        {phase === 'loading' && (
          <div className="text-center py-16 px-8">
            <div className="w-12 h-12 border-[3px] border-border border-t-accent rounded-full mx-auto mb-6 animate-spin" />
            <p className="text-text-soft text-base">Préparation de votre questionnaire...</p>
          </div>
        )}

        {phase === 'question' && currentQuestion && (
          <QuestionCard
            key={currentQuestion.question_id}
            question={currentQuestion}
            onAnswer={handleAnswer}
            isSubmitting={isSubmitting}
            error={error}
          />
        )}

        {phase === 'recap' && (
          <RecapScreen
            entries={recap}
            onEdit={handleEdit}
            onConfirm={confirmAndGenerate}
            isSubmitting={isSubmitting}
            error={error}
          />
        )}

        {phase === 'completing' && !error && (
          <div className="text-center py-16 px-8">
            <div className="w-12 h-12 border-[3px] border-border border-t-accent rounded-full mx-auto mb-6 animate-spin" />
            <p className="text-text-soft text-base">Génération de votre parcours personnalisé...</p>
          </div>
        )}

        {phase === 'completing' && error && (
          <div className="text-center py-16 px-8">
            <div className="bg-[#FEF2F0] border border-[#F5D5D0] text-error py-4 px-5 rounded-radius-sm mb-6 text-[0.95rem] max-w-md mx-auto">
              {error}
            </div>
            <button
              onClick={() => {
                setError(null)
                confirmAndGenerate()
              }}
              className="bg-accent text-white border-none py-3 px-6 rounded-radius-md cursor-pointer font-medium transition-all duration-200 hover:bg-accent-hover"
            >
              Réessayer
            </button>
          </div>
        )}

        {phase === 'done' && <CompletionScreen stepsCount={stepsCount} doneCount={doneCount} />}
      </main>
    </div>
  )
}

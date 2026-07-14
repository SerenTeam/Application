import { useState, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/api'
import { LanguageSwitch } from '@/components/layout/LanguageSwitch'
import { useT } from '@/i18n/useT'
import { useLang } from '@/i18n/LanguageContext'
import { fmt } from '@/i18n'
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
  const t = useT()
  const { lang } = useLang()

  const [phase, setPhase] = useState<Phase>('welcome')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(null)
  const [recap, setRecap] = useState<RecapEntry[]>([])
  const [finalAnswers, setFinalAnswers] = useState<QuestionnaireAnswersV2 | null>(null)
  const [questionnaireId, setQuestionnaireId] = useState<string | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [editingFromRecap, setEditingFromRecap] = useState(false)
  const [stepsCount, setStepsCount] = useState(0)
  const [doneCount, setDoneCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ─── Le serveur renvoie soit une question, soit le récapitulatif ──

  const showServerData = useCallback((data: ServerData) => {
    if (data.action === 'recap') {
      setRecap(data.recap)
      setPhase('recap')
      setEditingFromRecap(false)
    } else {
      setCurrentQuestion(data)
      setPhase('question')
    }
  }, [])

  // ─── Reprise après refresh (session_id conservé en sessionStorage) ──

  useEffect(() => {
    const saved = sessionStorage.getItem('seren_questionnaire_session')
    if (!saved || phase !== 'welcome') return
    // Garde d'annulation : sous StrictMode (dev) l'effet se déclenche deux fois, donc les deux
    // requêtes /resume partent quand même (la garde ne les empêche pas). Elle évite seulement
    // qu'une réponse arrivée après le démontage du premier effet applique son état obsolète.
    let ignore = false
    ;(async () => {
      setPhase('loading')
      try {
        const response = await apiFetch('/api/questionnaire/resume', {
          method: 'POST',
          body: JSON.stringify({ session_id: saved }),
        })
        if (ignore) return
        if (response.status === 404) {
          sessionStorage.removeItem('seren_questionnaire_session')
          setPhase('welcome')
          return
        }
        const result = await response.json()
        if (ignore) return
        if (result.success) {
          setSessionId(saved)
          showServerData(result.data)
        } else {
          setPhase('welcome')
        }
      } catch {
        if (!ignore) setPhase('welcome')
      }
    })()
    return () => { ignore = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        sessionStorage.setItem('seren_questionnaire_session', result.session_id)
        showServerData(result.data)
      } else {
        setError(result.error || t.questionnaire.startError)
        setPhase('welcome')
      }
    } catch (err: unknown) {
      setError(fmt(t.questionnaire.connectionError, { detail: err instanceof Error ? err.message : t.questionnaire.unknownDetail }))
      setPhase('welcome')
    }
  }, [showServerData, t])

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
        if (response.status === 404) {
          // Session expirée côté serveur : écran dédié, pas d'erreur générique
          setSessionExpired(true)
          return
        }
        const result = await response.json()
        if (result.success) {
          // Seul l'écran directement issu de /reask a le bouton retour : une branche
          // rouverte après correction est une vraie nouvelle question sans réponse.
          setEditingFromRecap(false)
          showServerData(result.data)
        } else {
          setError(result.error || t.questionnaire.invalidAnswer)
        }
      } catch (err: unknown) {
        setError(fmt(t.questionnaire.connectionError, { detail: err instanceof Error ? err.message : t.questionnaire.unknownDetail }))
      } finally {
        setIsSubmitting(false)
      }
    },
    [sessionId, showServerData, t]
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
        if (response.status === 404) {
          // Session expirée côté serveur : écran dédié, pas d'erreur générique
          setSessionExpired(true)
          return
        }
        const result = await response.json()
        if (result.success) {
          setEditingFromRecap(true)
          showServerData(result.data)
        } else {
          setError(result.error || t.questionnaire.editError)
          setPhase('recap')
        }
      } catch (err: unknown) {
        setError(fmt(t.questionnaire.connectionError, { detail: err instanceof Error ? err.message : t.questionnaire.unknownDetail }))
        setPhase('recap')
      }
    },
    [sessionId, showServerData, t]
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
        if (response.status === 404) {
          // Session expirée côté serveur : écran dédié, pas d'erreur générique
          setSessionExpired(true)
          return
        }
        const result = await response.json()
        if (!result.success) throw new Error(result.error || t.questionnaire.finalizeError)
        answers = result.answers as QuestionnaireAnswersV2
        setFinalAnswers(answers)
      }

      // Idempotent aussi côté insert : un retry après échec de saveRoadmapToDb
      // réutilise le questionnaire déjà créé au lieu d'en dupliquer un.
      let qId = questionnaireId
      if (!qId) {
        const { data: questionnaire, error: qError } = await supabase
          .from('questionnaires')
          .insert({ user_id: user.id, answers, status: 'completed' })
          .select()
          .single()
        if (qError || !questionnaire) throw new Error(t.questionnaire.saveAnswersError)
        qId = questionnaire.id as string
        setQuestionnaireId(qId)
      }

      const steps = generateRoadmap(answers)
      setStepsCount(steps.length)
      setDoneCount(steps.filter((s) => s.initial_status === 'done').length)
      await saveRoadmapToDb(user.id, qId, steps, lang)

      sessionStorage.removeItem('seren_questionnaire_session')
      setPhase('done')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.questionnaire.unexpectedError)
      setPhase('completing') // reste sur l'écran pour afficher le bouton Réessayer
    }
  }, [user, sessionId, finalAnswers, questionnaireId, t, lang])

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
            {t.layout.dashboard}
          </Link>
          <button
            onClick={signOut}
            className="bg-transparent border-none border-b-2 border-text-soft text-text-soft text-sm font-medium uppercase tracking-widest cursor-pointer p-0 pb-0.5 transition-all duration-200 hover:text-accent hover:border-accent"
          >
            {t.layout.signOut}
          </button>
          <LanguageSwitch />
        </nav>
      </header>

      <main className="max-w-[720px] mx-auto py-12 px-6 pb-24 max-sm:py-8 max-sm:px-4 max-sm:pb-16">
        {sessionExpired && (
          <div className="text-center py-16 px-8">
            <div className="bg-[#FEF2F0] border border-[#F5D5D0] text-error py-4 px-5 rounded-radius-sm mb-6 text-[0.95rem] max-w-md mx-auto">
              {t.questionnaire.sessionExpiredMessage}
            </div>
            <button
              onClick={() => {
                sessionStorage.removeItem('seren_questionnaire_session')
                setSessionExpired(false); setSessionId(null); setCurrentQuestion(null)
                setRecap([]); setFinalAnswers(null); setQuestionnaireId(null)
                setError(null); setEditingFromRecap(false); setPhase('welcome')
              }}
              className="bg-accent text-white border-none py-3 px-6 rounded-radius-md cursor-pointer font-medium transition-all duration-200 hover:bg-accent-hover"
            >
              {t.questionnaire.restart}
            </button>
          </div>
        )}

        {!sessionExpired && phase === 'welcome' && (
          <>
            {error && (
              <div className="bg-[#FEF2F0] border border-[#F5D5D0] text-error py-4 px-5 rounded-radius-sm mb-6 text-[0.95rem] text-center">
                {error}
              </div>
            )}
            <WelcomeScreen onStart={startQuestionnaire} />
          </>
        )}

        {!sessionExpired && phase === 'loading' && (
          <div className="text-center py-16 px-8">
            <div className="w-12 h-12 border-[3px] border-border border-t-accent rounded-full mx-auto mb-6 animate-spin" />
            <p className="text-text-soft text-base">{t.questionnaire.preparing}</p>
          </div>
        )}

        {!sessionExpired && phase === 'question' && currentQuestion && (
          <QuestionCard
            key={currentQuestion.question_id}
            question={currentQuestion}
            onAnswer={handleAnswer}
            onCancel={editingFromRecap ? () => setPhase('recap') : undefined}
            isSubmitting={isSubmitting}
            error={error}
          />
        )}

        {!sessionExpired && phase === 'recap' && (
          <RecapScreen
            entries={recap}
            onEdit={handleEdit}
            onConfirm={confirmAndGenerate}
            isSubmitting={isSubmitting}
            error={error}
          />
        )}

        {!sessionExpired && phase === 'completing' && !error && (
          <div className="text-center py-16 px-8">
            <div className="w-12 h-12 border-[3px] border-border border-t-accent rounded-full mx-auto mb-6 animate-spin" />
            <p className="text-text-soft text-base">{t.questionnaire.generatingRoadmap}</p>
          </div>
        )}

        {!sessionExpired && phase === 'completing' && error && (
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
              {t.questionnaire.retry}
            </button>
          </div>
        )}

        {!sessionExpired && phase === 'done' && <CompletionScreen stepsCount={stepsCount} doneCount={doneCount} />}
      </main>
    </div>
  )
}

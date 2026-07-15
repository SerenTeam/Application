import { useState, useCallback, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/api'
import { AppHeader, HeaderNavLink } from '@/components/layout/AppHeader'
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
import { Button } from '@/components/ui/button'

type Phase = 'welcome' | 'loading' | 'question' | 'recap' | 'completing' | 'done'

type ServerData = (QuestionData & { action: 'question' }) | { action: 'recap'; recap: RecapEntry[] }

export function QuestionnairePage() {
  const { user } = useAuth()
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
      const response = await apiFetch('/api/questionnaire/start', {
        method: 'POST',
        body: JSON.stringify({ lang }),
      })
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
  }, [showServerData, t, lang])

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

      const steps = generateRoadmap(answers, lang)
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
      <AppHeader>
        <HeaderNavLink to="/dashboard">{t.layout.dashboard}</HeaderNavLink>
      </AppHeader>

      <main className="max-w-[720px] mx-auto py-12 px-6 pb-24 max-sm:py-8 max-sm:px-4 max-sm:pb-16">
        {sessionExpired && (
          <div className="text-center py-16 px-8">
            <div className="mx-auto mb-6 max-w-md rounded-2xl border border-error/20 bg-error-light px-5 py-4 text-[14px] text-error">
              {t.questionnaire.sessionExpiredMessage}
            </div>
            <Button
              onClick={() => {
                sessionStorage.removeItem('seren_questionnaire_session')
                setSessionExpired(false); setSessionId(null); setCurrentQuestion(null)
                setRecap([]); setFinalAnswers(null); setQuestionnaireId(null)
                setError(null); setEditingFromRecap(false); setPhase('welcome')
              }}
            >
              {t.questionnaire.restart}
            </Button>
          </div>
        )}

        {!sessionExpired && phase === 'welcome' && (
          <>
            {error && (
              <div className="mb-6 rounded-2xl border border-error/20 bg-error-light px-5 py-4 text-center text-[14px] text-error">
                {error}
              </div>
            )}
            <WelcomeScreen onStart={startQuestionnaire} />
          </>
        )}

        {!sessionExpired && phase === 'loading' && (
          <div className="text-center py-16 px-8">
            <div className="w-12 h-12 border-[3px] border-border border-t-primary rounded-full mx-auto mb-6 animate-spin" />
            <p className="text-text-secondary text-base">{t.questionnaire.preparing}</p>
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
            <div className="w-12 h-12 border-[3px] border-border border-t-primary rounded-full mx-auto mb-6 animate-spin" />
            <p className="text-text-secondary text-base">{t.questionnaire.generatingRoadmap}</p>
          </div>
        )}

        {!sessionExpired && phase === 'completing' && error && (
          <div className="text-center py-16 px-8">
            <div className="mx-auto mb-6 max-w-md rounded-2xl border border-error/20 bg-error-light px-5 py-4 text-[14px] text-error">
              {error}
            </div>
            <Button
              onClick={() => {
                setError(null)
                confirmAndGenerate()
              }}
            >
              {t.questionnaire.retry}
            </Button>
          </div>
        )}

        {!sessionExpired && phase === 'done' && <CompletionScreen stepsCount={stepsCount} doneCount={doneCount} />}
      </main>
    </div>
  )
}

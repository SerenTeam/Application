import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { getStepsCatalog } from '@/data/steps-catalog'
import { AppHeader, HeaderNavLink } from '@/components/layout/AppHeader'
import { useT } from '@/i18n/useT'
import { useLang } from '@/i18n/LanguageContext'
import type { Strings } from '@/i18n/strings.fr'
import type { Lang } from '@/i18n'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  MobileNav,
  ProgressHero,
  PriorityActions,
  QuickAccess,
  RoadmapView,
  LoadingOverlay,
} from '@/components/dashboard'
import type {
  DashboardView,
  RoadmapPhase,
  RoadmapStep,
  ProgressData,
} from '@/components/dashboard'

// ─── DB step row shape ──────────────────────────────────────────

interface DbStep {
  id: string // UUID
  template_id: string
  title: string
  theme: string
  urgency: string
  urgency_label: string
  status: string
  display_order: number
  letter_template_id: string | null
  warning_badge: string | null
}

const URGENCY_ORDER = ['urgent', 'week', 'month', 'later']

// ─── Map DB steps to dashboard types ────────────────────────────

function buildPhases(dbSteps: DbStep[], t: Strings, lang: Lang): RoadmapPhase[] {
  // Map urgency → phase label (langue active)
  const URGENCY_PHASE: Record<string, string> = {
    urgent: t.dashboardPage.urgencyPhase.urgent,
    week: t.dashboardPage.urgencyPhase.week,
    month: t.dashboardPage.urgencyPhase.month,
    later: t.dashboardPage.urgencyPhase.later,
  }
  const grouped = new Map<string, RoadmapStep[]>()

  for (const urgency of URGENCY_ORDER) {
    grouped.set(urgency, [])
  }

  // Résolution par template_id dans le catalogue de la langue active : une roadmap
  // générée en FR bascule intégralement en EN au toggle, sans régénération (les valeurs
  // BDD `title`/`urgency_label` ne servent que de fallback si le template_id est inconnu).
  const catalogById = new Map(getStepsCatalog(lang).map((s) => [s.id, s]))

  for (const step of dbSteps) {
    const template = catalogById.get(step.template_id)
    const description = template
      ? template.description +
        '\n\n' +
        template.what_you_do.map((s) => `\u2022 ${s}`).join('\n')
      : step.title

    const roadmapStep: RoadmapStep = {
      id: step.display_order,
      title: template?.title ?? step.title,
      timeline: template?.when_to_do ?? step.urgency_label,
      description,
      urgent: step.urgency === 'urgent',
      stepDbId: step.id,
      letterTemplateId: step.letter_template_id ?? undefined,
    }

    const list = grouped.get(step.urgency)
    if (list) {
      list.push(roadmapStep)
    }
  }

  return URGENCY_ORDER
    .filter((u) => (grouped.get(u)?.length ?? 0) > 0)
    .map((u) => ({
      phase: URGENCY_PHASE[u] ?? u,
      steps: grouped.get(u)!,
    }))
}

function buildProgress(dbSteps: DbStep[]): ProgressData {
  const completedSteps: number[] = []
  const inProgressSteps: number[] = []
  const skippedSteps: number[] = []

  for (const step of dbSteps) {
    if (step.status === 'done') completedSteps.push(step.display_order)
    else if (step.status === 'in_progress') inProgressSteps.push(step.display_order)
  }

  return { completedSteps, inProgressSteps, skippedSteps, notes: {} }
}

// ─── Page component ─────────────────────────────────────────────

export function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const t = useT()
  const { lang } = useLang()
  // Ref pour l'effet de chargement ci-dessous (deps [user, navigate] uniquement) :
  // évite de refetch Supabase à chaque bascule de langue, tout en gardant le message
  // d'erreur à jour si l'utilisateur bascule la langue avant qu'une erreur survienne.
  const tRef = useRef(t)
  tRef.current = t

  const [activeView, setActiveView] = useState<DashboardView>('dashboard')
  const [scrollToStepId, setScrollToStepId] = useState<number | null>(null)

  const [dbSteps, setDbSteps] = useState<DbStep[]>([])
  const [roadmapId, setRoadmapId] = useState<string | null>(null)
  const [questionnaireAnswers, setQuestionnaireAnswers] = useState<Record<string, unknown>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Map display_order → UUID for updates
  const orderToId = useMemo(() => {
    const map = new Map<number, string>()
    for (const s of dbSteps) map.set(s.display_order, s.id)
    return map
  }, [dbSteps])

  // ─── Fetch roadmap from Supabase ─────────────────────────────

  useEffect(() => {
    if (!user) return

    async function load() {
      setIsLoading(true)
      setError(null)

      // Get latest roadmap
      const { data: roadmap, error: rErr } = await supabase
        .from('roadmaps')
        .select('id, questionnaire_id')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (rErr || !roadmap) {
        // No roadmap yet → redirect to questionnaire
        navigate('/', { replace: true })
        return
      }

      setRoadmapId(roadmap.id)

      // Load questionnaire answers for letter auto-fill
      if (roadmap.questionnaire_id) {
        const { data: qData } = await supabase
          .from('questionnaires')
          .select('answers')
          .eq('id', roadmap.questionnaire_id)
          .single()

        if (qData?.answers) {
          setQuestionnaireAnswers(qData.answers as Record<string, unknown>)
        }
      }

      // Get steps for this roadmap
      const { data: steps, error: sErr } = await supabase
        .from('steps')
        .select('*')
        .eq('roadmap_id', roadmap.id)
        .order('display_order', { ascending: true })

      if (sErr) {
        setError(tRef.current.dashboardPage.loadError)
        setIsLoading(false)
        return
      }

      setDbSteps(steps ?? [])
      setIsLoading(false)
    }

    load()
  }, [user, navigate])

  // ─── Derived data ─────────────────────────────────────────────

  const phases = useMemo(() => buildPhases(dbSteps, t, lang), [dbSteps, t, lang])
  const progress = useMemo(() => buildProgress(dbSteps), [dbSteps])

  const totalSteps = dbSteps.length
  const completedCount = progress.completedSteps.length

  const prioritySteps = useMemo(() => {
    const all = phases.flatMap((p) => p.steps)
    return all
      .filter(
        (s) =>
          !progress.completedSteps.includes(s.id) &&
          !progress.skippedSteps.includes(s.id)
      )
      .slice(0, 3)
  }, [phases, progress])

  // ─── Step toggle (persists to Supabase) ───────────────────────

  const toggleStepStatus = useCallback(
    async (displayOrder: number) => {
      const stepId = orderToId.get(displayOrder)
      if (!stepId) return

      const current = dbSteps.find((s) => s.display_order === displayOrder)
      if (!current) return

      const newStatus = current.status === 'done' ? 'todo' : 'done'

      // Optimistic update
      setDbSteps((prev) =>
        prev.map((s) =>
          s.display_order === displayOrder ? { ...s, status: newStatus } : s
        )
      )

      await supabase
        .from('steps')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', stepId)
    },
    [dbSteps, orderToId]
  )

  const saveStepNote = useCallback((_stepId: number, _note: string) => {
    // Notes not persisted in V1
  }, [])

  // ─── Handlers ─────────────────────────────────────────────────

  const handleNavigate = useCallback((view: DashboardView) => {
    setActiveView(view)
  }, [])

  const handleScrollToStep = useCallback((stepId: number) => {
    setScrollToStepId(stepId)
  }, [])

  const handleScrollComplete = useCallback(() => {
    setScrollToStepId(null)
  }, [])

  // ─── Render ───────────────────────────────────────────────────

  if (isLoading) {
    return (
      <LoadingOverlay
        message={t.dashboardPage.loadingRoadmap}
        detail={t.dashboardPage.loadingDetail}
        isError={false}
      />
    )
  }

  if (error) {
    return (
      <LoadingOverlay
        message={t.dashboardPage.errorTitle}
        detail={error}
        isError={true}
      />
    )
  }

  if (!roadmapId) return null

  return (
    <div className="min-h-screen bg-bg">
      <AppHeader>
        <HeaderNavLink to="/documents">{t.layout.letters}</HeaderNavLink>
      </AppHeader>

      {/* Mobile nav */}
      <MobileNav activeView={activeView} onNavigate={handleNavigate} />

      {/* Dashboard body */}
      <div className="flex min-h-[calc(100vh-82px)]">
        <Sidebar activeView={activeView} onNavigate={handleNavigate} />

        <main className="flex-1 p-4 md:p-10 overflow-y-auto max-w-[1200px]">
          {activeView === 'dashboard' && (
            <DashboardOverview
              completedCount={completedCount}
              totalSteps={totalSteps}
              prioritySteps={prioritySteps}
              onNavigate={handleNavigate}
              onScrollToStep={handleScrollToStep}
            />
          )}

          {activeView === 'roadmap' && (
            <RoadmapView
              phases={phases}
              progress={progress}
              onToggleStep={toggleStepStatus}
              onSaveNote={saveStepNote}
              scrollToStepId={scrollToStepId}
              onScrollComplete={handleScrollComplete}
              userId={user?.id}
              questionnaireData={{
                deceased_firstname: questionnaireAnswers.deceased_firstname as string | undefined,
                deceased_lastname: questionnaireAnswers.deceased_lastname as string | undefined,
                deceased_dod: questionnaireAnswers.deceased_dod as string | undefined,
              }}
            />
          )}

          {activeView === 'documents' && (
            <div className="animate-fade-in py-16 text-center">
              <p className="mb-6 text-text-secondary">
                {t.dashboardPage.documentsHint}
              </p>
              <Button asChild>
                <Link to="/documents">{t.dashboardPage.viewLetters}</Link>
              </Button>
            </div>
          )}

          {activeView === 'contacts' && (
            <div className="animate-fade-in py-16 text-center">
              <p className="text-text-secondary">
                {t.dashboardPage.contactsHint}
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

// ─── Dashboard overview ─────────────────────────────────────────

interface DashboardOverviewProps {
  completedCount: number
  totalSteps: number
  prioritySteps: RoadmapStep[]
  onNavigate: (view: DashboardView) => void
  onScrollToStep: (stepId: number) => void
}

function DashboardOverview({
  completedCount,
  totalSteps,
  prioritySteps,
  onNavigate,
  onScrollToStep,
}: DashboardOverviewProps) {
  const t = useT()
  return (
    <div className="animate-fade-in">
      <ProgressHero completed={completedCount} total={totalSteps} />

      <h3 className="mb-5 mt-10 font-display text-2xl font-normal text-text">
        {t.dashboardPage.priorityActionsTitle}
      </h3>
      <PriorityActions
        steps={prioritySteps}
        onNavigate={onNavigate}
        onScrollToStep={onScrollToStep}
      />

      <h3 className="mb-5 mt-10 font-display text-2xl font-normal text-text">
        {t.dashboardPage.quickAccessTitle}
      </h3>
      <QuickAccess onNavigate={onNavigate} />
    </div>
  )
}

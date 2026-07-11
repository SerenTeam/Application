import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { STEPS_CATALOG } from '@/data/steps-catalog'
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

// Map urgency → phase label
const URGENCY_PHASE: Record<string, string> = {
  urgent: 'Actions urgentes (premières 48h)',
  week: 'Dans la semaine',
  month: 'Dans le mois',
  later: 'À plus long terme',
}

const URGENCY_ORDER = ['urgent', 'week', 'month', 'later']

// ─── Map DB steps to dashboard types ────────────────────────────

function buildPhases(dbSteps: DbStep[]): RoadmapPhase[] {
  const grouped = new Map<string, RoadmapStep[]>()

  for (const urgency of URGENCY_ORDER) {
    grouped.set(urgency, [])
  }

  for (const step of dbSteps) {
    const template = STEPS_CATALOG.find((t) => t.id === step.template_id)
    const description = template
      ? template.description +
        '\n\n' +
        template.what_you_do.map((s) => `\u2022 ${s}`).join('\n')
      : step.title

    const roadmapStep: RoadmapStep = {
      id: step.display_order,
      title: step.title,
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
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

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
        setError('Impossible de charger vos démarches.')
        setIsLoading(false)
        return
      }

      setDbSteps(steps ?? [])
      setIsLoading(false)
    }

    load()
  }, [user, navigate])

  // ─── Derived data ─────────────────────────────────────────────

  const phases = useMemo(() => buildPhases(dbSteps), [dbSteps])
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
        message="Chargement de votre parcours..."
        detail="Récupération des démarches"
        isError={false}
      />
    )
  }

  if (error) {
    return (
      <LoadingOverlay
        message="Erreur"
        detail={error}
        isError={true}
      />
    )
  }

  if (!roadmapId) return null

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="px-4 md:px-8 py-4 border-b border-border-soft bg-bg-card flex justify-between items-center">
        <div className="font-display text-2xl font-medium text-accent tracking-wide">
          Seren<span className="italic font-normal">.</span>
        </div>

        <nav className="flex items-center gap-4 md:gap-6">
          {user?.email && (
            <span className="text-text-soft text-sm hidden sm:inline">
              {user.email}
            </span>
          )}
          <Link
            to="/documents"
            className="text-text-soft text-sm hover:text-accent transition-colors no-underline"
          >
            Courriers
          </Link>
          <button
            onClick={signOut}
            className="text-text-soft text-sm hover:text-accent transition-colors cursor-pointer bg-transparent border-none font-body"
          >
            Déconnexion
          </button>
        </nav>
      </header>

      {/* Mobile nav */}
      <MobileNav activeView={activeView} onNavigate={handleNavigate} />

      {/* Dashboard body */}
      <div className="flex min-h-[calc(100vh-80px)]">
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
            <div className="animate-fade-in text-center py-16">
              <p className="text-text-soft mb-6">
                Retrouvez vos courriers pré-remplis sur la page dédiée.
              </p>
              <Link
                to="/documents"
                className="inline-flex items-center gap-2 bg-accent text-white py-3 px-6 rounded-radius-md no-underline font-medium hover:bg-accent-hover transition-colors"
              >
                Voir mes courriers
              </Link>
            </div>
          )}

          {activeView === 'contacts' && (
            <div className="animate-fade-in text-center py-16">
              <p className="text-text-soft">
                La gestion des contacts sera disponible prochainement.
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
  return (
    <div className="animate-fade-in">
      <ProgressHero completed={completedCount} total={totalSteps} />

      <h3 className="font-display text-2xl font-medium mb-5 mt-10 text-text">
        Prochaines actions prioritaires
      </h3>
      <PriorityActions
        steps={prioritySteps}
        onNavigate={onNavigate}
        onScrollToStep={onScrollToStep}
      />

      <h3 className="font-display text-2xl font-medium mb-5 mt-10 text-text">
        Accès rapides
      </h3>
      <QuickAccess onNavigate={onNavigate} />
    </div>
  )
}

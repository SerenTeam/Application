import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n/useT'
import { fmt } from '@/i18n'
import { useLetterGenerator } from '@/hooks/useLetterGenerator'
import { getTemplateNetwork } from '@/data/letter-templates'
import { shouldAutoResumePaperSend } from '@/lib/paper-send-resume'
import { Button } from '@/components/ui/button'
import { SectionHeading } from '@/components/ui/section-heading'
import { PillBadge } from '@/components/ui/pill-badge'
import { LetterPreview } from '@/components/letter/LetterPreview'
import { LetterVariablesForm } from '@/components/letter/LetterVariablesForm'
import { LetterActions } from '@/components/letter/LetterActions'
import { LetterSendPanel } from '@/components/letter/LetterSendPanel'
import { MarkAsSentButton } from '@/components/letter/MarkAsSentButton'
import { Mail, Circle, CircleCheck } from 'lucide-react'
import type { RoadmapPhase, RoadmapStep, ProgressData } from './types'

interface QuestionnaireData {
  deceased_firstname?: string
  deceased_lastname?: string
  deceased_dod?: string
  // Chantier 2a : donnée d'adressage (jamais transmise au rédacteur Mistral) — résout
  // l'organisme local via l'annuaire (network + département). Absente sur les dossiers
  // antérieurs à la Task 3 : le panneau d'envoi papier la demande alors à la volée.
  deceased_department?: string
}

interface RoadmapViewProps {
  phases: RoadmapPhase[]
  progress: ProgressData
  onToggleStep: (stepId: number) => void
  onSaveNote: (stepId: number, note: string) => void
  scrollToStepId: number | null
  onScrollComplete: () => void
  userId?: string
  questionnaireData?: QuestionnaireData
  // Persistance chantier 2a : le département résolu à la volée dans le panneau papier remonte
  // jusqu'à DashboardPage, seul endroit qui connaît le questionnaire ENTIER (cette vue ne reçoit
  // qu'un sous-ensemble de `QuestionnaireAnswersV2` — un merge partiel ici écraserait le reste).
  onDeceasedDepartmentResolved?: (department: string) => void
}

export function RoadmapView({
  phases,
  progress,
  onToggleStep,
  onSaveNote,
  scrollToStepId,
  onScrollComplete,
  userId,
  questionnaireData,
  onDeceasedDepartmentResolved,
}: RoadmapViewProps) {
  const t = useT()
  return (
    <div className="animate-fade-in">
      <SectionHeading as="h1" className="mb-8 max-w-none" title={t.roadmap.title} lead={t.roadmap.subtitle} />

      {/* v2 (contrat §7.6) : avertissement permanent, tant que la relecture juridique des étapes
          éditoriales n'est pas faite. Jamais masqué par un flag — c'est une mention de prudence. */}
      <p
        role="note"
        className="mb-8 max-w-[900px] rounded-2xl border border-warning/40 bg-warning-light px-4 py-3 text-sm text-text-secondary"
      >
        {t.roadmap.legalReviewNotice}
      </p>

      <div className="max-w-[900px]">
        {phases.map((phase) => (
          <div key={phase.phase} className="mb-10">
            <h3 className="mb-4 border-b border-border pb-2 font-body text-[11px] font-medium uppercase tracking-[1.5px] text-primary">
              {phase.phase}
            </h3>

            {phase.steps.map((step) => (
              <StepItem
                key={step.id}
                step={step}
                isCompleted={progress.completedSteps.includes(step.id)}
                isInProgress={progress.inProgressSteps.includes(step.id)}
                note={progress.notes[step.id] ?? ''}
                onToggle={() => onToggleStep(step.id)}
                onSaveNote={(note) => onSaveNote(step.id, note)}
                shouldScroll={scrollToStepId === step.id}
                onScrollComplete={onScrollComplete}
                userId={userId}
                questionnaireData={questionnaireData}
                onDeceasedDepartmentResolved={onDeceasedDepartmentResolved}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── StepItem ──────────────────────────────────────────────────────

interface StepItemProps {
  step: RoadmapStep
  isCompleted: boolean
  isInProgress: boolean
  note: string
  onToggle: () => void
  onSaveNote: (note: string) => void
  shouldScroll: boolean
  onScrollComplete: () => void
  userId?: string
  questionnaireData?: QuestionnaireData
  onDeceasedDepartmentResolved?: (department: string) => void
}

function StepItem({
  step,
  isCompleted,
  isInProgress,
  note,
  onToggle,
  onSaveNote,
  shouldScroll,
  onScrollComplete,
  userId,
  questionnaireData,
  onDeceasedDepartmentResolved,
}: StepItemProps) {
  const t = useT()
  // Rouvert automatiquement au retour de Stripe Checkout (achat d'un envoi papier à l'acte,
  // legs R1) : sans quoi PaperSendPanel — qui porte la reprise automatique — ne serait jamais
  // remonté (la section est repliée par défaut). Vérifié UNIQUEMENT à l'initialisation (lazy
  // useState) : ni le pli/dépli manuel de l'utilisateur ensuite, ni un re-render, ne doivent le
  // redéclencher.
  const [detailsOpen, setDetailsOpen] = useState(
    () => !!step.letterTemplateId && shouldAutoResumePaperSend(step.letterTemplateId, step.stepDbId ?? '')
  )
  const ref = useRef<HTMLDivElement>(null)
  const [highlight, setHighlight] = useState(false)

  // Scroll-to + highlight effect
  useEffect(() => {
    if (!shouldScroll || !ref.current) return

    const timer = setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlight(true)

      const fadeTimer = setTimeout(() => {
        setHighlight(false)
        onScrollComplete()
      }, 2000)

      return () => clearTimeout(fadeTimer)
    }, 300)

    return () => clearTimeout(timer)
  }, [shouldScroll, onScrollComplete])

  const handleCheckboxClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onToggle()
    },
    [onToggle],
  )

  const hasLetter = !!step.letterTemplateId

  return (
    <div
      ref={ref}
      className={cn(
        'mb-4 rounded-lg border border-border-card bg-white p-5 shadow-card-border transition-all duration-200',
        isCompleted && 'opacity-80',
        isInProgress && 'border-violet bg-violet-light/50',
        highlight && 'ring-2 ring-primary/40 ring-offset-2',
      )}
    >
      {/* Header */}
      <div
        className="flex items-start gap-4 cursor-pointer"
        onClick={() => setDetailsOpen((o) => !o)}
      >
        {/* Status toggle */}
        <div
          onClick={handleCheckboxClick}
          className={cn(
            'mt-0.5 shrink-0 cursor-pointer text-border transition-colors duration-200',
            'hover:text-primary',
            isCompleted && 'text-success',
          )}
        >
          {isCompleted ? <CircleCheck className="h-6 w-6" /> : <Circle className="h-6 w-6" />}
        </div>

        {/* Title + timeline */}
        <div className="flex-1">
          <div
            className={cn(
              'mb-1 flex flex-wrap items-center gap-2 font-body text-[1.05rem] font-medium',
              isCompleted ? 'text-text-muted' : 'text-text',
            )}
          >
            {step.title}
            {hasLetter && <Mail className="h-4 w-4 shrink-0 text-primary" />}
            {step.urgent && !isCompleted && (
              <PillBadge tone="warning">{t.dashboardPage.urgentBadge}</PillBadge>
            )}
          </div>
          <div className="text-sm text-text-muted">{step.timeline}</div>
        </div>
      </div>

      {/* Expandable details */}
      {detailsOpen && (
        <div className="mt-4 border-t border-border-soft pt-4">
          <p className="mb-4 whitespace-pre-line leading-relaxed text-text-secondary">
            {step.description}
          </p>

          {/* Letter section */}
          {hasLetter && step.stepDbId && userId && (
            <StepLetterSection
              templateId={step.letterTemplateId!}
              stepDbId={step.stepDbId}
              userId={userId}
              questionnaireData={questionnaireData}
              onDeceasedDepartmentResolved={onDeceasedDepartmentResolved}
            />
          )}

          <div className="mt-4">
            <label className="mb-2 block font-body text-[14px] font-medium text-text-secondary">
              {t.roadmap.notesLabel}
            </label>
            <textarea
              defaultValue={note}
              placeholder={t.roadmap.notesPlaceholder}
              onBlur={(e) => onSaveNote(e.target.value)}
              className={cn(
                'w-full min-h-[80px] resize-y rounded-2xl border border-border bg-white p-3 font-body text-[15px] text-text transition-colors',
                'placeholder:text-text-muted focus:border-primary focus:outline-none',
                'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2',
              )}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Letter section inside a step ─────────────────────────────────

interface StepLetterSectionProps {
  templateId: string
  stepDbId: string
  userId: string
  questionnaireData?: QuestionnaireData
  onDeceasedDepartmentResolved?: (department: string) => void
}

function StepLetterSection({
  templateId,
  stepDbId,
  userId,
  questionnaireData,
  onDeceasedDepartmentResolved,
}: StepLetterSectionProps) {
  const t = useT()
  // Même logique que `detailsOpen` de StepItem (voir ce commentaire) : rouvert au retour de
  // Checkout pour que PaperSendPanel remonte et consomme la reprise automatique (legs R1).
  const [showLetter, setShowLetter] = useState(() => shouldAutoResumePaperSend(templateId, stepDbId))
  const [sentRefresh, setSentRefresh] = useState(0)

  const {
    template,
    values,
    resolvedLetter,
    resolvedSubject,
    isComplete,
    missingVariables,
    setVariable,
  } = useLetterGenerator({
    templateId,
    questionnaireData: questionnaireData
      ? {
          deceased_firstname: questionnaireData.deceased_firstname,
          deceased_lastname: questionnaireData.deceased_lastname,
          deceased_dod: questionnaireData.deceased_dod,
        }
      : undefined,
  })

  if (!template) return null

  if (!showLetter) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowLetter(true)}
        className="mb-4 gap-2"
      >
        <Mail className="h-4 w-4" />
        {fmt(t.roadmap.generateLetter, { organisme: template.organisme })}
      </Button>
    )
  }

  return (
    <div className="mb-4 space-y-5 rounded-lg border border-border-card bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-display text-lg font-normal text-primary">
          {fmt(t.roadmap.letterTitle, { organisme: template.organisme })}
        </h4>
        <Button variant="ghost" size="sm" onClick={() => setShowLetter(false)}>
          {t.roadmap.collapse}
        </Button>
      </div>

      {/* Variables form */}
      {missingVariables.length > 0 && (
        <LetterVariablesForm
          variables={template.variables}
          values={values}
          onVariableChange={setVariable}
        />
      )}

      {/* Preview */}
      <LetterPreview content={resolvedLetter} notes={template.notes} />

      {/* Envoi — canal email (1 clic, employeur/mutuelle) ou papier (chantier 2a) */}
      {(template.channel === 'email' || template.channel === 'papier') && (
        <LetterSendPanel
          templateId={template.id}
          stepId={stepDbId}
          subject={resolvedSubject}
          body={resolvedLetter}
          isComplete={isComplete}
          channel={template.channel}
          variables={values}
          recipientNetwork={getTemplateNetwork(template.id)}
          deceasedDepartment={questionnaireData?.deceased_department}
          onDeceasedDepartmentResolved={onDeceasedDepartmentResolved}
          userId={userId}
        />
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3 items-start">
        <LetterActions
          resolvedLetter={resolvedLetter}
          resolvedSubject={resolvedSubject}
          isComplete={isComplete}
          template={template}
          stepId={stepDbId}
          userId={userId}
        />
        <MarkAsSentButton
          key={sentRefresh}
          stepId={stepDbId}
          userId={userId}
          hasActions={true}
          onSent={() => setSentRefresh((n) => n + 1)}
        />
      </div>
    </div>
  )
}

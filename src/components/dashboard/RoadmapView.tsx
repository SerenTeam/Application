import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { useLetterGenerator } from '@/hooks/useLetterGenerator'
import { LetterPreview } from '@/components/letter/LetterPreview'
import { LetterVariablesForm } from '@/components/letter/LetterVariablesForm'
import { LetterActions } from '@/components/letter/LetterActions'
import { MarkAsSentButton } from '@/components/letter/MarkAsSentButton'
import { Mail } from 'lucide-react'
import type { RoadmapPhase, RoadmapStep, ProgressData } from './types'

interface QuestionnaireData {
  deceased_firstname?: string
  deceased_lastname?: string
  deceased_dod?: string
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
}: RoadmapViewProps) {
  return (
    <div className="animate-fade-in">
      <h1 className="font-display text-[2.25rem] font-medium mb-2 text-accent">
        Roadmap Administrative
      </h1>
      <p className="text-text-soft text-[1.05rem] mb-8">
        Suivez etape par etape les demarches administratives apres le deces
      </p>

      <div className="max-w-[900px]">
        {phases.map((phase) => (
          <div key={phase.phase} className="mb-10">
            <h3 className="font-display text-[1.35rem] text-accent mb-4 pb-2 border-b-2 border-border">
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
}: StepItemProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)
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
        'bg-bg-card border-2 border-border rounded-[12px] p-5 mb-4 transition-all duration-200',
        isCompleted && 'border-success bg-success/[0.03] opacity-70',
        isInProgress && 'border-[#3B82F6] bg-[#3B82F6]/[0.03]',
        highlight && 'ring-[3px] ring-accent-soft',
      )}
    >
      {/* Header */}
      <div
        className="flex items-start gap-4 cursor-pointer"
        onClick={() => setDetailsOpen((o) => !o)}
      >
        {/* Checkbox */}
        <div
          onClick={handleCheckboxClick}
          className={cn(
            'w-6 h-6 min-w-[24px] border-2 border-border rounded-md cursor-pointer',
            'flex items-center justify-center transition-all duration-200 mt-0.5',
            'hover:border-accent',
            isCompleted && 'bg-success border-success text-white',
          )}
        >
          {isCompleted && '\u2713'}
        </div>

        {/* Title + timeline */}
        <div className="flex-1">
          <div className="font-semibold text-[1.05rem] mb-1 text-text flex items-center gap-2">
            {step.title}
            {hasLetter && (
              <Mail className="h-4 w-4 text-accent shrink-0" />
            )}
          </div>
          <div className="text-sm text-text-muted">{step.timeline}</div>
        </div>
      </div>

      {/* Expandable details */}
      {detailsOpen && (
        <div className="mt-4 pt-4 border-t border-border-soft">
          <p className="text-text-soft leading-relaxed mb-4 whitespace-pre-line">
            {step.description}
          </p>

          {/* Letter section */}
          {hasLetter && step.stepDbId && userId && (
            <StepLetterSection
              templateId={step.letterTemplateId!}
              stepDbId={step.stepDbId}
              userId={userId}
              questionnaireData={questionnaireData}
            />
          )}

          <div className="mt-4">
            <label className="block font-medium mb-2 text-sm">
              Notes personnelles :
            </label>
            <textarea
              defaultValue={note}
              placeholder="Ajoutez vos notes, numeros de dossier, dates, etc."
              onBlur={(e) => onSaveNote(e.target.value)}
              className={cn(
                'w-full p-3 border-2 border-border rounded-[8px] font-body text-[0.95rem]',
                'resize-y min-h-[80px]',
                'focus:outline-none focus:border-accent',
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
}

function StepLetterSection({
  templateId,
  stepDbId,
  userId,
  questionnaireData,
}: StepLetterSectionProps) {
  const [showLetter, setShowLetter] = useState(false)
  const [sentRefresh, setSentRefresh] = useState(0)

  const {
    template,
    values,
    resolvedLetter,
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
      <button
        onClick={() => setShowLetter(true)}
        className="flex items-center gap-2 bg-accent-soft text-accent border border-accent/20 py-2.5 px-4 rounded-radius-md text-sm font-medium cursor-pointer transition-all duration-200 hover:bg-accent hover:text-white mb-4"
      >
        <Mail className="h-4 w-4" />
        Generer le courrier — {template.organisme}
      </button>
    )
  }

  return (
    <div className="mb-4 rounded-lg border border-border bg-bg p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h4 className="font-display text-lg font-medium text-accent">
          Courrier — {template.organisme}
        </h4>
        <button
          onClick={() => setShowLetter(false)}
          className="text-text-muted text-sm hover:text-text cursor-pointer bg-transparent border-none"
        >
          Replier
        </button>
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

      {/* Actions */}
      <div className="flex flex-wrap gap-3 items-start">
        <LetterActions
          resolvedLetter={resolvedLetter}
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

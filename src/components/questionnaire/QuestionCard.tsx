import { useState, useEffect } from 'react'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n/useT'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { QuestionnaireProgress } from './QuestionnaireProgress'

// ─── Types ────────────────────────────────────────────────────────────────────
// Miroir du RenderedQuestion serveur (server/routes/questionnaire.js).

export interface QuestionOption {
  value: string
  label: string
}

export interface QuestionData {
  action?: 'question'
  question_id: string
  question: string
  type: 'select' | 'multiselect' | 'boolean' | 'tristate' | 'text' | 'date'
  options?: QuestionOption[]
  aide?: string
  categorie?: string
  obligatoire: boolean
  progress: { current: number; total: number }
  current_value?: unknown // renvoyé par /reask : pré-remplissage à l'édition
}

interface QuestionCardProps {
  question: QuestionData
  onAnswer: (questionId: string, value: unknown) => void
  onSkip?: (questionId: string) => void
  onCancel?: () => void
  isSubmitting: boolean
  error: string | null
}

// ─── Component ────────────────────────────────────────────────────────────────

export function QuestionCard({ question, onAnswer, onSkip, onCancel, isSubmitting, error }: QuestionCardProps) {
  const t = useT()
  const [selectedValue, setSelectedValue] = useState<unknown>(null)
  const [selectedValues, setSelectedValues] = useState<string[]>([])

  useEffect(() => {
    const cv = question.current_value
    if (question.type === 'multiselect') {
      setSelectedValues(Array.isArray(cv) ? (cv as string[]) : [])
      setSelectedValue(null)
    } else {
      setSelectedValue(cv ?? null)
      setSelectedValues([])
    }
  }, [question.question_id, question.type, question.current_value])

  const isMulti = question.type === 'multiselect'
  const hasValue = selectedValue !== null && selectedValue !== ''
  // Le multiselect est toujours soumissible : une sélection vide est une réponse valide (« aucun »).
  const isNextDisabled = isSubmitting || (!isMulti && question.obligatoire && !hasValue)
  const percent = Math.round((question.progress.current / Math.max(question.progress.total, 1)) * 100)

  function handleSubmit() {
    if (isMulti) {
      onAnswer(question.question_id, selectedValues)
    } else if (selectedValue !== null) {
      onAnswer(question.question_id, selectedValue)
    }
  }

  return (
    <section className="animate-[slideUp_0.5s_ease-out]">
      <QuestionnaireProgress categoryName={question.categorie || t.questionnaire.categoryFallback} percent={percent} />

      <div className="rounded-card border border-border-card bg-white p-10 shadow-card-border max-sm:p-7">
        <h2 className="mb-3 font-display text-[26px] font-normal leading-[1.35] text-text max-sm:text-[22px]">
          {question.question}
        </h2>

        {question.aide && (
          <p className="mb-8 border-l-2 border-primary-light pl-4 text-[15px] text-text-muted">
            {question.aide}
          </p>
        )}

        {error && (
          <div className="mb-6 rounded-2xl border border-error/20 bg-error-light px-5 py-4 text-[14px] text-error">
            {error}
          </div>
        )}

        <div className="mb-6">
          <FormElement
            question={question}
            selectedValue={selectedValue}
            selectedValues={selectedValues}
            onValueChange={setSelectedValue}
            onValuesChange={setSelectedValues}
          />
        </div>

        <div className="mt-8 flex items-center justify-between border-t border-border-soft pt-6">
          {onCancel ? (
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSubmitting}>
              {t.questionnaire.backToRecap}
            </Button>
          ) : !question.obligatoire && onSkip ? (
            <Button variant="ghost" size="sm" onClick={() => onSkip(question.question_id)} disabled={isSubmitting}>
              {t.questionnaire.skip}
            </Button>
          ) : (
            <div />
          )}

          <Button onClick={handleSubmit} disabled={isNextDisabled} className="gap-2">
            {isSubmitting ? t.questionnaire.sending : t.questionnaire.continueBtn}
            {!isSubmitting && <ArrowRight className="h-[18px] w-[18px]" />}
          </Button>
        </div>
      </div>
    </section>
  )
}

// ─── Form element renderer ───────────────────────────────────────────────────

interface FormElementProps {
  question: QuestionData
  selectedValue: unknown
  selectedValues: string[]
  onValueChange: (value: unknown) => void
  onValuesChange: (values: string[]) => void
}

function FormElement({ question, selectedValue, selectedValues, onValueChange, onValuesChange }: FormElementProps) {
  const t = useT()
  switch (question.type) {
    case 'select':
      return (
        <OptionList
          name={question.question_id}
          options={question.options || []}
          isMulti={false}
          selectedValue={selectedValue as string | null}
          selectedValues={selectedValues}
          onValueChange={onValueChange}
          onValuesChange={onValuesChange}
        />
      )
    case 'multiselect':
      return (
        <OptionList
          name={question.question_id}
          options={question.options || []}
          isMulti={true}
          selectedValue={selectedValue as string | null}
          selectedValues={selectedValues}
          onValueChange={onValueChange}
          onValuesChange={onValuesChange}
        />
      )
    case 'boolean':
      return (
        <ChoiceRow
          name={question.question_id}
          items={[
            { label: t.questionnaire.yes, value: true },
            { label: t.questionnaire.no, value: false },
          ]}
          selectedValue={selectedValue}
          onValueChange={onValueChange}
        />
      )
    case 'tristate':
      return (
        <ChoiceRow
          name={question.question_id}
          items={[
            { label: t.questionnaire.yes, value: 'oui' },
            { label: t.questionnaire.no, value: 'non' },
            { label: t.questionnaire.dontKnow, value: 'ne_sait_pas' },
          ]}
          selectedValue={selectedValue}
          onValueChange={onValueChange}
        />
      )
    case 'date':
      return (
        <Input
          type="date"
          value={(selectedValue as string) ?? ''}
          onChange={(e) => onValueChange(e.target.value || null)}
        />
      )
    default:
      return <TextInput value={(selectedValue as string) ?? ''} onValueChange={onValueChange} />
  }
}

// ─── Option list (select / multiselect) — affiche label, soumet value ─────────

interface OptionListProps {
  name: string
  options: QuestionOption[]
  isMulti: boolean
  selectedValue: string | null
  selectedValues: string[]
  onValueChange: (value: unknown) => void
  onValuesChange: (values: string[]) => void
}

function OptionList({ name, options, isMulti, selectedValue, selectedValues, onValueChange, onValuesChange }: OptionListProps) {
  function handleChange(value: string) {
    if (isMulti) {
      const next = selectedValues.includes(value)
        ? selectedValues.filter((v) => v !== value)
        : [...selectedValues, value]
      onValuesChange(next)
    } else {
      onValueChange(value)
    }
  }

  const isSelected = (value: string) => (isMulti ? selectedValues.includes(value) : selectedValue === value)

  return (
    <div className="flex flex-col gap-3">
      {options.map(({ value, label }) => (
        <label
          key={value}
          className={cn(
            'flex items-center rounded-2xl border border-border bg-white px-5 py-4 cursor-pointer transition-colors',
            'hover:border-primary',
            'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40 has-[:focus-visible]:ring-offset-2',
            isSelected(value) && 'border-primary bg-primary-light/50'
          )}
        >
          <input
            type={isMulti ? 'checkbox' : 'radio'}
            name={name}
            value={value}
            checked={isSelected(value)}
            onChange={() => handleChange(value)}
            className="sr-only"
          />
          {isMulti ? (
            <span
              className={cn(
                'w-5 h-5 border-2 border-border rounded mr-4 flex items-center justify-center transition-all duration-200 shrink-0',
                isSelected(value) && 'border-primary bg-primary'
              )}
            >
              {isSelected(value) && <span className="text-white text-xs font-bold">&#10003;</span>}
            </span>
          ) : (
            <span
              className={cn(
                'w-5 h-5 border-2 border-border rounded-full mr-4 flex items-center justify-center transition-all duration-200 shrink-0',
                isSelected(value) && 'border-primary'
              )}
            >
              {isSelected(value) && <span className="w-2.5 h-2.5 bg-primary rounded-full" />}
            </span>
          )}
          <span className="text-base text-text">{label}</span>
        </label>
      ))}
    </div>
  )
}

// ─── Choice row (boolean / tristate) ─────────────────────────────────────────

interface ChoiceRowProps {
  name: string
  items: Array<{ label: string; value: unknown }>
  selectedValue: unknown
  onValueChange: (value: unknown) => void
}

function ChoiceRow({ name, items, selectedValue, onValueChange }: ChoiceRowProps) {
  return (
    <div className="flex gap-4 max-sm:flex-col">
      {items.map(({ label, value }) => (
        <label
          key={label}
          className={cn(
            'flex-1 flex items-center justify-center rounded-2xl border border-border bg-white px-5 py-4 cursor-pointer transition-colors',
            'hover:border-primary',
            'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40 has-[:focus-visible]:ring-offset-2',
            selectedValue === value && 'border-primary bg-primary-light/50'
          )}
        >
          <input
            type="radio"
            name={name}
            value={String(value)}
            checked={selectedValue === value}
            onChange={() => onValueChange(value)}
            className="sr-only"
          />
          <span
            className={cn(
              'w-5 h-5 border-2 border-border rounded-full mr-4 flex items-center justify-center transition-all duration-200 shrink-0',
              selectedValue === value && 'border-primary'
            )}
          >
            {selectedValue === value && <span className="w-2.5 h-2.5 bg-primary rounded-full" />}
          </span>
          <span className="text-base text-text">{label}</span>
        </label>
      ))}
    </div>
  )
}

// ─── Text input ──────────────────────────────────────────────────────────────

function TextInput({ value, onValueChange }: { value: string; onValueChange: (value: unknown) => void }) {
  const t = useT()
  const [localValue, setLocalValue] = useState(value)

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    setLocalValue(raw)
    onValueChange(raw.trim() || null)
  }

  return (
    <Input
      type="text"
      value={localValue}
      onChange={handleChange}
      placeholder={t.questionnaire.answerPlaceholder}
    />
  )
}

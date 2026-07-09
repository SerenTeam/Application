import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
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
}

interface QuestionCardProps {
  question: QuestionData
  onAnswer: (questionId: string, value: unknown) => void
  onSkip?: (questionId: string) => void
  isSubmitting: boolean
  error: string | null
}

// ─── Component ────────────────────────────────────────────────────────────────

export function QuestionCard({ question, onAnswer, onSkip, isSubmitting, error }: QuestionCardProps) {
  const [selectedValue, setSelectedValue] = useState<unknown>(null)
  const [selectedValues, setSelectedValues] = useState<string[]>([])

  useEffect(() => {
    setSelectedValue(null)
    setSelectedValues([])
  }, [question.question_id])

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
      <QuestionnaireProgress categoryName={question.categorie || 'Question'} percent={percent} />

      <div className="bg-bg-card rounded-radius-lg p-10 shadow-md border border-border-soft max-sm:p-7">
        <h2 className="font-display text-[1.75rem] font-medium leading-[1.35] mb-3 text-text max-sm:text-2xl">
          {question.question}
        </h2>

        {question.aide && (
          <p className="text-[0.95rem] text-text-soft mb-8 pl-4 border-l-2 border-accent-soft">
            {question.aide}
          </p>
        )}

        {error && (
          <div className="bg-[#FEF2F0] border border-[#F5D5D0] text-error py-4 px-5 rounded-radius-sm mb-6 text-[0.95rem]">
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

        <div className="flex justify-between items-center mt-8 pt-6 border-t border-border-soft">
          {!question.obligatoire && onSkip ? (
            <button
              onClick={() => onSkip(question.question_id)}
              disabled={isSubmitting}
              className="bg-transparent border-none text-text-muted text-[0.95rem] font-body cursor-pointer py-2 px-4 transition-colors duration-200 hover:text-text-soft disabled:opacity-50"
            >
              Passer cette question
            </button>
          ) : (
            <div />
          )}

          <button
            onClick={handleSubmit}
            disabled={isNextDisabled}
            className="inline-flex items-center gap-2 bg-accent text-white border-none py-3.5 px-7 text-base font-body font-medium rounded-radius-md cursor-pointer transition-all duration-200 hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Envoi...' : 'Continuer'}
            {!isSubmitting && (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-[18px] h-[18px]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            )}
          </button>
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
  switch (question.type) {
    case 'select':
      return (
        <OptionList
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
          items={[
            { label: 'Oui', value: true },
            { label: 'Non', value: false },
          ]}
          selectedValue={selectedValue}
          onValueChange={onValueChange}
        />
      )
    case 'tristate':
      return (
        <ChoiceRow
          items={[
            { label: 'Oui', value: 'oui' },
            { label: 'Non', value: 'non' },
            { label: 'Je ne sais pas', value: 'ne_sait_pas' },
          ]}
          selectedValue={selectedValue}
          onValueChange={onValueChange}
        />
      )
    case 'date':
      return (
        <input
          type="date"
          value={(selectedValue as string) ?? ''}
          onChange={(e) => onValueChange(e.target.value || null)}
          className="w-full py-4 px-5 text-base font-body border-2 border-border rounded-radius-md bg-bg text-text transition-all duration-200 focus:outline-none focus:border-accent focus:bg-white"
        />
      )
    default:
      return <TextInput value={(selectedValue as string) ?? ''} onValueChange={onValueChange} />
  }
}

// ─── Option list (select / multiselect) — affiche label, soumet value ─────────

interface OptionListProps {
  options: QuestionOption[]
  isMulti: boolean
  selectedValue: string | null
  selectedValues: string[]
  onValueChange: (value: unknown) => void
  onValuesChange: (values: string[]) => void
}

function OptionList({ options, isMulti, selectedValue, selectedValues, onValueChange, onValuesChange }: OptionListProps) {
  function handleClick(value: string) {
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
          onClick={(e) => {
            e.preventDefault()
            handleClick(value)
          }}
          className={cn(
            'flex items-center py-4 px-5 bg-bg border-2 border-border rounded-radius-md cursor-pointer transition-all duration-200',
            'hover:border-accent hover:bg-accent-soft',
            isSelected(value) && 'border-accent bg-accent-soft'
          )}
        >
          {isMulti ? (
            <span
              className={cn(
                'w-5 h-5 border-2 border-border rounded mr-4 flex items-center justify-center transition-all duration-200 shrink-0',
                isSelected(value) && 'border-accent bg-accent'
              )}
            >
              {isSelected(value) && <span className="text-white text-xs font-bold">&#10003;</span>}
            </span>
          ) : (
            <span
              className={cn(
                'w-5 h-5 border-2 border-border rounded-full mr-4 flex items-center justify-center transition-all duration-200 shrink-0',
                isSelected(value) && 'border-accent'
              )}
            >
              {isSelected(value) && <span className="w-2.5 h-2.5 bg-accent rounded-full" />}
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
  items: Array<{ label: string; value: unknown }>
  selectedValue: unknown
  onValueChange: (value: unknown) => void
}

function ChoiceRow({ items, selectedValue, onValueChange }: ChoiceRowProps) {
  return (
    <div className="flex gap-4 max-sm:flex-col">
      {items.map(({ label, value }) => (
        <label
          key={label}
          onClick={(e) => {
            e.preventDefault()
            onValueChange(value)
          }}
          className={cn(
            'flex-1 flex items-center justify-center py-4 px-5 bg-bg border-2 border-border rounded-radius-md cursor-pointer transition-all duration-200',
            'hover:border-accent hover:bg-accent-soft',
            selectedValue === value && 'border-accent bg-accent-soft'
          )}
        >
          <span
            className={cn(
              'w-5 h-5 border-2 border-border rounded-full mr-4 flex items-center justify-center transition-all duration-200 shrink-0',
              selectedValue === value && 'border-accent'
            )}
          >
            {selectedValue === value && <span className="w-2.5 h-2.5 bg-accent rounded-full" />}
          </span>
          <span className="text-base text-text">{label}</span>
        </label>
      ))}
    </div>
  )
}

// ─── Text input ──────────────────────────────────────────────────────────────

function TextInput({ value, onValueChange }: { value: string; onValueChange: (value: unknown) => void }) {
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
    <input
      type="text"
      value={localValue}
      onChange={handleChange}
      placeholder="Votre réponse..."
      className="w-full py-4 px-5 text-base font-body border-2 border-border rounded-radius-md bg-bg text-text transition-all duration-200 focus:outline-none focus:border-accent focus:bg-white placeholder:text-text-muted"
    />
  )
}

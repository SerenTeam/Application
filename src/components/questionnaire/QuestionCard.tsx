import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { QuestionnaireProgress } from './QuestionnaireProgress'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuestionData {
  question_id: string
  question: string
  type: 'select' | 'multiselect' | 'boolean' | 'number' | 'textarea' | 'date' | 'email' | 'phone' | 'text'
  options?: string[]
  aide?: string
  categorie?: string
  obligatoire?: boolean
  action?: string
}

interface QuestionCardProps {
  question: QuestionData
  questionCount: number
  totalQuestions: number
  onAnswer: (questionId: string, answer: unknown) => void
  onSkip: (questionId: string) => void
  isSubmitting: boolean
  error: string | null
}

// ─── Component ────────────────────────────────────────────────────────────────

export function QuestionCard({
  question,
  questionCount,
  totalQuestions,
  onAnswer,
  onSkip,
  isSubmitting,
  error,
}: QuestionCardProps) {
  const [selectedValue, setSelectedValue] = useState<unknown>(null)
  const [selectedValues, setSelectedValues] = useState<string[]>([])

  // Reset state when question changes
  useEffect(() => {
    setSelectedValue(question.type === 'number' ? 0 : null)
    setSelectedValues([])
  }, [question.question_id, question.type])

  const hasValue = selectedValue !== null && selectedValue !== ''
  const isRequired = question.obligatoire
  const isNextDisabled = (isRequired && !hasValue) || isSubmitting

  function handleSubmit() {
    if (selectedValue !== null) {
      onAnswer(question.question_id, selectedValue)
    }
  }

  function handleSkip() {
    onSkip(question.question_id)
  }

  return (
    <section className="animate-[slideUp_0.5s_ease-out]">
      {/* Progress bar */}
      <QuestionnaireProgress
        categoryName={question.categorie || 'Question'}
        currentIndex={questionCount - 1}
        totalQuestions={totalQuestions}
      />

      {/* Card */}
      <div className="bg-bg-card rounded-radius-lg p-10 shadow-md border border-border-soft max-sm:p-7">
        {/* Question number */}
        <div className="text-xs font-semibold text-text-muted uppercase tracking-[0.1em] mb-4">
          Question {questionCount}
        </div>

        {/* Question text */}
        <h2 className="font-display text-[1.75rem] font-medium leading-[1.35] mb-3 text-text max-sm:text-2xl">
          {question.question}
        </h2>

        {/* Help text */}
        {question.aide && (
          <p className="text-[0.95rem] text-text-soft mb-8 pl-4 border-l-2 border-accent-soft">
            {question.aide}
          </p>
        )}

        {/* Error message */}
        {error && (
          <div className="bg-[#FEF2F0] border border-[#F5D5D0] text-error py-4 px-5 rounded-radius-sm mb-6 text-[0.95rem]">
            {error}
          </div>
        )}

        {/* Form group */}
        <div className="mb-6">
          <FormElement
            question={question}
            selectedValue={selectedValue}
            selectedValues={selectedValues}
            onValueChange={setSelectedValue}
            onValuesChange={setSelectedValues}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center mt-8 pt-6 border-t border-border-soft">
          {!question.obligatoire ? (
            <button
              onClick={handleSkip}
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-[18px] h-[18px]"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                />
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

function FormElement({
  question,
  selectedValue,
  selectedValues,
  onValueChange,
  onValuesChange,
}: FormElementProps) {
  switch (question.type) {
    case 'select':
      return (
        <SelectOptions
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
        <SelectOptions
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
        <BooleanOptions
          selectedValue={selectedValue}
          onValueChange={onValueChange}
        />
      )

    case 'number':
      return (
        <NumberInput
          value={(selectedValue as number) ?? 0}
          onValueChange={onValueChange}
        />
      )

    case 'textarea':
      return (
        <TextareaInput
          value={(selectedValue as string) ?? ''}
          onValueChange={onValueChange}
        />
      )

    case 'date':
      return (
        <DateInput
          value={(selectedValue as string) ?? ''}
          onValueChange={onValueChange}
        />
      )

    case 'email':
      return (
        <TextInput
          type="email"
          placeholder="exemple@email.com"
          value={(selectedValue as string) ?? ''}
          onValueChange={onValueChange}
        />
      )

    case 'phone':
      return (
        <TextInput
          type="tel"
          placeholder="06 12 34 56 78"
          value={(selectedValue as string) ?? ''}
          onValueChange={onValueChange}
        />
      )

    default:
      return (
        <TextInput
          type="text"
          placeholder="Votre reponse..."
          value={(selectedValue as string) ?? ''}
          onValueChange={onValueChange}
        />
      )
  }
}

// ─── Select options ──────────────────────────────────────────────────────────

interface SelectOptionsProps {
  options: string[]
  isMulti: boolean
  selectedValue: string | null
  selectedValues: string[]
  onValueChange: (value: unknown) => void
  onValuesChange: (values: string[]) => void
}

function SelectOptions({
  options,
  isMulti,
  selectedValue,
  selectedValues,
  onValueChange,
  onValuesChange,
}: SelectOptionsProps) {
  function handleClick(option: string) {
    if (isMulti) {
      const newValues = selectedValues.includes(option)
        ? selectedValues.filter((v) => v !== option)
        : [...selectedValues, option]
      onValuesChange(newValues)
      onValueChange(newValues.length > 0 ? newValues : null)
    } else {
      onValueChange(option)
    }
  }

  function isSelected(option: string): boolean {
    if (isMulti) {
      return selectedValues.includes(option)
    }
    return selectedValue === option
  }

  return (
    <div className="flex flex-col gap-3">
      {options.map((option) => (
        <label
          key={option}
          onClick={(e) => {
            e.preventDefault()
            handleClick(option)
          }}
          className={cn(
            'flex items-center py-4 px-5 bg-bg border-2 border-border rounded-radius-md cursor-pointer transition-all duration-200',
            'hover:border-accent hover:bg-accent-soft',
            isSelected(option) && 'border-accent bg-accent-soft'
          )}
        >
          {/* Radio / Checkbox indicator */}
          {isMulti ? (
            <span
              className={cn(
                'w-5 h-5 border-2 border-border rounded mr-4 flex items-center justify-center transition-all duration-200 shrink-0',
                isSelected(option) && 'border-accent bg-accent'
              )}
            >
              {isSelected(option) && (
                <span className="text-white text-xs font-bold">&#10003;</span>
              )}
            </span>
          ) : (
            <span
              className={cn(
                'w-5 h-5 border-2 border-border rounded-full mr-4 flex items-center justify-center transition-all duration-200 shrink-0',
                isSelected(option) && 'border-accent'
              )}
            >
              {isSelected(option) && (
                <span className="w-2.5 h-2.5 bg-accent rounded-full" />
              )}
            </span>
          )}

          <span className="text-base text-text">{option}</span>
        </label>
      ))}
    </div>
  )
}

// ─── Boolean options ─────────────────────────────────────────────────────────

interface BooleanOptionsProps {
  selectedValue: unknown
  onValueChange: (value: unknown) => void
}

function BooleanOptions({ selectedValue, onValueChange }: BooleanOptionsProps) {
  const options: Array<{ label: string; value: boolean }> = [
    { label: 'Oui', value: true },
    { label: 'Non', value: false },
  ]

  return (
    <div className="flex gap-4 max-sm:flex-col">
      {options.map(({ label, value }) => (
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
            {selectedValue === value && (
              <span className="w-2.5 h-2.5 bg-accent rounded-full" />
            )}
          </span>
          <span className="text-base text-text">{label}</span>
        </label>
      ))}
    </div>
  )
}

// ─── Number input ────────────────────────────────────────────────────────────

interface NumberInputProps {
  value: number
  onValueChange: (value: unknown) => void
}

function NumberInput({ value, onValueChange }: NumberInputProps) {
  function decrement() {
    const newVal = Math.max(0, value - 1)
    onValueChange(newVal)
  }

  function increment() {
    onValueChange(value + 1)
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={decrement}
        className="w-12 h-12 border-2 border-border rounded-radius-sm bg-bg text-2xl text-text cursor-pointer transition-all duration-200 flex items-center justify-center hover:border-accent hover:bg-accent-soft"
      >
        &minus;
      </button>
      <input
        type="number"
        value={value}
        min={0}
        onChange={(e) => onValueChange(parseInt(e.target.value) || 0)}
        className="w-full max-w-[100px] text-center py-4 px-5 text-base font-body border-2 border-border rounded-radius-md bg-bg text-text transition-all duration-200 focus:outline-none focus:border-accent focus:bg-white"
      />
      <button
        type="button"
        onClick={increment}
        className="w-12 h-12 border-2 border-border rounded-radius-sm bg-bg text-2xl text-text cursor-pointer transition-all duration-200 flex items-center justify-center hover:border-accent hover:bg-accent-soft"
      >
        +
      </button>
    </div>
  )
}

// ─── Textarea input ──────────────────────────────────────────────────────────

interface TextareaInputProps {
  value: string
  onValueChange: (value: unknown) => void
}

function TextareaInput({ value, onValueChange }: TextareaInputProps) {
  const [localValue, setLocalValue] = useState(value)

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const raw = e.target.value
    setLocalValue(raw)
    onValueChange(raw.trim() || null)
  }

  return (
    <textarea
      value={localValue}
      onChange={handleChange}
      placeholder="Votre reponse..."
      className="w-full min-h-[120px] resize-y py-4 px-5 text-base font-body border-2 border-border rounded-radius-md bg-bg text-text transition-all duration-200 focus:outline-none focus:border-accent focus:bg-white placeholder:text-text-muted"
    />
  )
}

// ─── Text input ──────────────────────────────────────────────────────────────

interface TextInputProps {
  type: string
  placeholder: string
  value: string
  onValueChange: (value: unknown) => void
}

function TextInput({ type, placeholder, value, onValueChange }: TextInputProps) {
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
      type={type}
      value={localValue}
      onChange={handleChange}
      placeholder={placeholder}
      className="w-full py-4 px-5 text-base font-body border-2 border-border rounded-radius-md bg-bg text-text transition-all duration-200 focus:outline-none focus:border-accent focus:bg-white placeholder:text-text-muted"
    />
  )
}

// ─── Date input ──────────────────────────────────────────────────────────────

interface DateInputProps {
  value: string
  onValueChange: (value: unknown) => void
}

function DateInput({ value, onValueChange }: DateInputProps) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onValueChange(e.target.value || null)}
      className="w-full py-4 px-5 text-base font-body border-2 border-border rounded-radius-md bg-bg text-text transition-all duration-200 focus:outline-none focus:border-accent focus:bg-white"
    />
  )
}

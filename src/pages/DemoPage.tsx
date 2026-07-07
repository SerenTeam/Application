import { useState, useCallback, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Heart, ArrowRight, CheckCircle, Minus, Plus } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DemoQuestion {
  question_id: string
  question: string
  type: 'select' | 'multiselect' | 'boolean' | 'number' | 'textarea' | 'text' | string
  options?: string[]
  aide?: string
  categorie?: string
  obligatoire?: boolean
}

interface AnswerHistoryEntry {
  question: string
  answer: unknown
}

type Screen = 'welcome' | 'loading' | 'question' | 'completion'

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProgressBar({
  category,
  current,
  total,
}: {
  category: string
  current: number
  total: number
}) {
  const pct = Math.round((current / total) * 100)
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="block h-2 w-2 rounded-full bg-accent animate-pulse" />
          <span className="text-[0.8rem] font-medium uppercase tracking-widest text-accent">
            {category}
          </span>
        </div>
        <span className="text-[0.8rem] text-text-muted">
          {current}/{total}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-accent-hover transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// --- Select / Multiselect options ---

function SelectOptions({
  options,
  multi,
  selected,
  onSelect,
}: {
  options: string[]
  multi: boolean
  selected: string | string[] | null
  onSelect: (val: string) => void
}) {
  const isSelected = (opt: string) => {
    if (multi && Array.isArray(selected)) return selected.includes(opt)
    return selected === opt
  }

  return (
    <div className="flex flex-col gap-3">
      {options.map((opt) => {
        const active = isSelected(opt)
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onSelect(opt)}
            className={`flex items-center rounded-[12px] border-2 px-5 py-4 text-left transition-all ${
              active
                ? 'border-accent bg-accent-soft'
                : 'border-border bg-bg hover:border-accent hover:bg-accent-soft'
            }`}
          >
            {/* indicator */}
            {multi ? (
              <span
                className={`mr-4 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-all ${
                  active ? 'border-accent bg-accent text-white' : 'border-border'
                }`}
              >
                {active && (
                  <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
            ) : (
              <span
                className={`mr-4 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                  active ? 'border-accent' : 'border-border'
                }`}
              >
                {active && <span className="block h-2.5 w-2.5 rounded-full bg-accent" />}
              </span>
            )}
            <span className="text-base text-text">{opt}</span>
          </button>
        )
      })}
    </div>
  )
}

// --- Boolean options ---

function BooleanOptions({
  selected,
  onSelect,
}: {
  selected: boolean | null
  onSelect: (val: boolean) => void
}) {
  const items: { label: string; value: boolean }[] = [
    { label: 'Oui', value: true },
    { label: 'Non', value: false },
  ]
  return (
    <div className="flex gap-4 max-sm:flex-col">
      {items.map(({ label, value }) => {
        const active = selected === value
        return (
          <button
            key={label}
            type="button"
            onClick={() => onSelect(value)}
            className={`flex flex-1 items-center justify-center rounded-[12px] border-2 px-5 py-4 transition-all ${
              active
                ? 'border-accent bg-accent-soft'
                : 'border-border bg-bg hover:border-accent hover:bg-accent-soft'
            }`}
          >
            <span
              className={`mr-4 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                active ? 'border-accent' : 'border-border'
              }`}
            >
              {active && <span className="block h-2.5 w-2.5 rounded-full bg-accent" />}
            </span>
            <span className="text-base text-text">{label}</span>
          </button>
        )
      })}
    </div>
  )
}

// --- Number input ---

function NumberInput({
  value,
  onChange,
}: {
  value: number
  onChange: (n: number) => void
}) {
  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        className="flex h-12 w-12 items-center justify-center rounded-[8px] border-2 border-border bg-bg text-xl text-text transition-colors hover:border-accent hover:text-accent"
      >
        <Minus className="h-5 w-5" />
      </button>
      <input
        type="number"
        value={value}
        min={0}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
        className="h-12 w-[100px] rounded-[12px] border-2 border-border bg-bg text-center text-base text-text transition-colors focus:border-accent focus:outline-none"
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="flex h-12 w-12 items-center justify-center rounded-[8px] border-2 border-border bg-bg text-xl text-text transition-colors hover:border-accent hover:text-accent"
      >
        <Plus className="h-5 w-5" />
      </button>
    </div>
  )
}

// --- History panel ---

function HistoryPanel({ history }: { history: AnswerHistoryEntry[] }) {
  if (history.length === 0) return null

  const formatAnswer = (answer: unknown): string => {
    if (answer === null || answer === undefined) return 'Passee'
    if (typeof answer === 'boolean') return answer ? 'Oui' : 'Non'
    if (Array.isArray(answer)) return answer.join(', ')
    return String(answer)
  }

  return (
    <div className="mt-8 rounded-[12px] border border-border bg-bg-card p-6">
      <h3 className="mb-4 text-[0.85rem] font-semibold uppercase tracking-widest text-text-muted">
        Vos reponses
      </h3>
      <ul>
        {history.map((item, i) => (
          <li
            key={i}
            className={`py-3 text-[0.9rem] ${i < history.length - 1 ? 'border-b border-border-soft' : ''}`}
          >
            <div className="text-text-soft">{item.question}</div>
            <div
              className={
                item.answer === null
                  ? 'italic text-text-muted'
                  : 'font-medium text-accent'
              }
            >
              {formatAnswer(item.answer)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export function DemoPage() {
  const [searchParams] = useSearchParams()

  const [screen, setScreen] = useState<Screen>('welcome')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [currentQuestion, setCurrentQuestion] = useState<DemoQuestion | null>(null)
  const [questionCount, setQuestionCount] = useState(0)
  const [answerHistory, setAnswerHistory] = useState<AnswerHistoryEntry[]>([])

  // Answer state (varies by question type)
  const [selectedValue, setSelectedValue] = useState<unknown>(null)
  const [multiValues, setMultiValues] = useState<string[]>([])

  // Completion state
  const [accessCode, setAccessCode] = useState<string | null>(null)
  const [paymentDone, setPaymentDone] = useState(false)

  // -----------------------------------------------------------------------
  // Check for payment success on mount
  // -----------------------------------------------------------------------
  useEffect(() => {
    const payment = searchParams.get('payment')
    if (payment === 'success') {
      const storedCode = localStorage.getItem('transmission_access_code')
      if (storedCode) {
        setAccessCode(storedCode)
        setPaymentDone(true)
        setScreen('completion')
      }
    }
  }, [searchParams])

  // -----------------------------------------------------------------------
  // Derive "effective value" from current question type
  // -----------------------------------------------------------------------
  const effectiveValue = useCallback(() => {
    if (!currentQuestion) return null
    if (currentQuestion.type === 'multiselect') {
      return multiValues.length > 0 ? multiValues : null
    }
    return selectedValue
  }, [currentQuestion, selectedValue, multiValues])

  const isNextDisabled = currentQuestion?.obligatoire && effectiveValue() === null

  // -----------------------------------------------------------------------
  // API helpers
  // -----------------------------------------------------------------------

  const startDemo = async () => {
    setScreen('loading')
    setAnswerHistory([])

    try {
      const response = await fetch('/api/demo/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const result = await response.json()

      if (result.success) {
        setSessionId(result.session_id)
        setQuestionCount(1)
        displayQuestion(result.data)
      } else {
        alert('Erreur : ' + result.error)
        setScreen('welcome')
      }
    } catch (error: unknown) {
      alert('Erreur de connexion : ' + (error instanceof Error ? error.message : 'inconnue'))
      setScreen('welcome')
    }
  }

  const sendAnswer = async (questionId: string, answer: unknown) => {
    setScreen('loading')

    // Save to history
    setAnswerHistory((prev) => [
      ...prev,
      { question: currentQuestion?.question || '', answer },
    ])

    try {
      const response = await fetch('/api/demo/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          question_id: questionId,
          reponse: answer,
          question_text: currentQuestion?.question || '',
          categorie: currentQuestion?.categorie || '',
        }),
      })
      const result = await response.json()

      if (result.success) {
        if (result.data.action === 'fin_demo') {
          await saveDemoQuestionnaire()
        } else {
          setQuestionCount((c) => c + 1)
          displayQuestion(result.data)
        }
      } else {
        alert('Erreur : ' + result.error)
        setScreen('question')
      }
    } catch (error: unknown) {
      alert('Erreur de connexion : ' + (error instanceof Error ? error.message : 'inconnue'))
      setScreen('question')
    }
  }

  const saveDemoQuestionnaire = async () => {
    try {
      const response = await fetch('/api/demo/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      })
      const result = await response.json()

      if (result.success && result.access_code) {
        localStorage.setItem('transmission_access_code', result.access_code)
        setAccessCode(result.access_code)
      }
    } catch (error) {
      console.error('Erreur sauvegarde:', error)
    }

    setScreen('completion')
  }

  // -----------------------------------------------------------------------
  // Display a question (reset answer state)
  // -----------------------------------------------------------------------
  const displayQuestion = (data: DemoQuestion) => {
    setCurrentQuestion(data)
    setSelectedValue(data.type === 'number' ? 0 : null)
    setMultiValues([])
    setScreen('question')
  }

  // -----------------------------------------------------------------------
  // Option click handlers
  // -----------------------------------------------------------------------
  const handleSelectOption = (opt: string) => {
    setSelectedValue(opt)
  }

  const handleMultiSelectOption = (opt: string) => {
    setMultiValues((prev) => {
      if (prev.includes(opt)) return prev.filter((v) => v !== opt)
      return [...prev, opt]
    })
  }

  const handleBooleanSelect = (val: boolean) => {
    setSelectedValue(val)
  }

  const handleNumberChange = (n: number) => {
    setSelectedValue(n)
  }

  const handleTextChange = (val: string) => {
    setSelectedValue(val.trim() || null)
  }

  // -----------------------------------------------------------------------
  // Button handlers
  // -----------------------------------------------------------------------
  const handleNext = () => {
    if (!currentQuestion) return
    const val = effectiveValue()
    if (val !== null) {
      sendAnswer(currentQuestion.question_id, val)
    }
  }

  const handleSkip = () => {
    if (!currentQuestion) return
    sendAnswer(currentQuestion.question_id, null)
  }

  // -----------------------------------------------------------------------
  // Build the Stripe payment link dynamically
  // -----------------------------------------------------------------------
  const stripeSuccessUrl = `${window.location.origin}/demo?payment=success`
  const paymentLink = `https://buy.stripe.com/test_5kQ14m8cDfO312Wegw87K01?success_url=${encodeURIComponent(stripeSuccessUrl)}`

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  const renderFormElement = () => {
    if (!currentQuestion) return null

    switch (currentQuestion.type) {
      case 'select':
        return (
          <SelectOptions
            options={currentQuestion.options || []}
            multi={false}
            selected={selectedValue as string | null}
            onSelect={handleSelectOption}
          />
        )
      case 'multiselect':
        return (
          <SelectOptions
            options={currentQuestion.options || []}
            multi={true}
            selected={multiValues}
            onSelect={handleMultiSelectOption}
          />
        )
      case 'boolean':
        return (
          <BooleanOptions
            selected={selectedValue as boolean | null}
            onSelect={handleBooleanSelect}
          />
        )
      case 'number':
        return (
          <NumberInput
            value={(selectedValue as number) ?? 0}
            onChange={handleNumberChange}
          />
        )
      case 'textarea':
        return (
          <textarea
            className="w-full rounded-[12px] border-2 border-border bg-bg px-5 py-4 text-base text-text transition-colors placeholder:text-text-muted focus:border-accent focus:outline-none"
            placeholder="Votre reponse..."
            rows={4}
            onChange={(e) => handleTextChange(e.target.value)}
          />
        )
      default:
        return (
          <input
            type={currentQuestion.type || 'text'}
            className="w-full rounded-[12px] border-2 border-border bg-bg px-5 py-4 text-base text-text transition-colors placeholder:text-text-muted focus:border-accent focus:outline-none"
            placeholder="Votre reponse..."
            onChange={(e) => handleTextChange(e.target.value)}
          />
        )
    }
  }

  // -----------------------------------------------------------------------
  // Screens
  // -----------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="border-b border-border-soft bg-bg-card p-8 text-center">
        <Link to="/" className="font-display text-[1.75rem] font-medium tracking-wide text-accent">
          Seren<span className="italic font-normal">.</span>
        </Link>
        <nav className="mt-4">
          <Link
            to="/access"
            className="text-[0.9rem] text-text-soft transition-colors hover:text-accent"
          >
            Acces proches
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-[720px] px-6 py-12 pb-24 max-sm:px-4 max-sm:py-8 max-sm:pb-16">
        {/* ---- Welcome Screen ---- */}
        {screen === 'welcome' && (
          <section className="animate-fadeIn py-16 text-center max-sm:py-8">
            <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full border-2 border-accent bg-accent-soft">
              <Heart className="h-9 w-9 text-accent" />
            </div>
            <h1 className="mb-4 font-display text-[2.5rem] font-medium leading-tight text-text max-sm:text-[1.75rem]">
              Preparez l'avenir pour vos proches
            </h1>
            <p className="mx-auto mb-10 max-w-[480px] text-[1.1rem] text-text-soft">
              Ce questionnaire vous guide pour rassembler les informations essentielles qui faciliteront les demarches de vos proches le moment venu.
            </p>
            <button
              onClick={startDemo}
              className="inline-flex items-center gap-3 rounded-[12px] bg-accent px-8 py-4 text-base font-medium text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-lg"
            >
              Commencer
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </button>
          </section>
        )}

        {/* ---- Loading Screen ---- */}
        {screen === 'loading' && (
          <div className="py-16 text-center">
            <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-[3px] border-border border-t-accent" />
            <p className="text-text-soft">Preparation de la question suivante...</p>
          </div>
        )}

        {/* ---- Question Screen ---- */}
        {screen === 'question' && currentQuestion && (
          <section className="animate-slideUp">
            <ProgressBar
              category={currentQuestion.categorie || 'Demo'}
              current={questionCount}
              total={10}
            />

            <div className="rounded-[20px] border border-border bg-bg-card p-10 shadow-md max-sm:p-7">
              <div className="mb-4 text-[0.75rem] font-semibold uppercase tracking-widest text-text-muted">
                Question {questionCount}
              </div>

              {/* Adaptation notice */}
              {questionCount > 1 && (
                <div className="mb-6 flex animate-fadeIn items-center gap-3 rounded-[8px] border border-green-400/30 bg-green-400/10 px-4 py-3">
                  <CheckCircle className="h-5 w-5 shrink-0 text-accent" />
                  <p className="text-[0.85rem] text-accent">
                    Question adaptee selon vos reponses precedentes
                  </p>
                </div>
              )}

              <h2 className="mb-3 font-display text-[1.75rem] font-medium leading-snug text-text max-sm:text-[1.5rem]">
                {currentQuestion.question}
              </h2>

              {currentQuestion.aide && (
                <p className="mb-8 border-l-2 border-accent pl-4 text-[0.95rem] text-text-soft">
                  {currentQuestion.aide}
                </p>
              )}

              {/* Form element */}
              <div className="mb-0">{renderFormElement()}</div>

              {/* Actions */}
              <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
                {!currentQuestion.obligatoire ? (
                  <button
                    onClick={handleSkip}
                    className="px-4 py-2 text-[0.95rem] text-text-muted transition-colors hover:text-text-soft"
                  >
                    Passer
                  </button>
                ) : (
                  <span />
                )}
                <button
                  onClick={handleNext}
                  disabled={!!isNextDisabled}
                  className="inline-flex items-center gap-2 rounded-[12px] bg-accent px-7 py-3.5 text-base font-medium text-white transition-all hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Suivant
                  <ArrowRight className="h-[18px] w-[18px]" />
                </button>
              </div>
            </div>

            {/* History */}
            <HistoryPanel history={answerHistory} />
          </section>
        )}

        {/* ---- Completion Screen ---- */}
        {screen === 'completion' && (
          <section className="animate-fadeIn py-16 text-center max-sm:py-8">
            <div className="mx-auto mb-8 flex h-[100px] w-[100px] items-center justify-center rounded-full border-2 border-accent bg-green-400/15">
              <CheckCircle className="h-12 w-12 text-accent" />
            </div>
            <h2 className="mb-4 font-display text-[2rem] font-medium text-accent">
              Questionnaire termine
            </h2>
            <p className="mx-auto mb-8 max-w-[450px] text-text-soft">
              Vos informations ont ete sauvegardees avec succes.
            </p>

            {/* Before payment */}
            {!paymentDone && (
              <div>
                <p className="mt-8 text-text-soft">
                  Procedez au paiement pour securiser definitivement vos donnees et recevoir votre code d'acces.
                </p>
                <a
                  href={paymentLink}
                  className="mt-6 inline-flex items-center gap-3 rounded-[12px] bg-accent px-8 py-4 text-base font-medium text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-lg no-underline"
                >
                  Proceder au paiement
                  <ArrowRight className="h-5 w-5" />
                </a>
              </div>
            )}

            {/* After payment -- access code */}
            {paymentDone && accessCode && (
              <div className="mx-auto mt-8 max-w-[400px] rounded-[12px] border-2 border-accent bg-accent-soft p-6">
                <p className="mb-2 text-[0.9rem] text-text-soft">
                  Paiement confirme ! Voici votre code d'acces :
                </p>
                <div className="my-3 rounded-[8px] bg-white px-3 py-3 text-center font-mono text-[2rem] font-bold tracking-[0.3em] text-accent">
                  {accessCode}
                </div>
                <p className="mt-3 text-[0.85rem] text-text-muted">
                  Conservez ce code precieusement et transmettez-le a vos proches.
                </p>
                <p className="mt-6 text-center text-[0.9rem] text-text-soft">
                  Vos proches pourront consulter ces informations sur{' '}
                  <Link to="/access" className="font-medium text-accent underline">
                    cette page
                  </Link>{' '}
                  avec le code d'acces.
                </p>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Global keyframe animations via inline style tag */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.8s ease-out; }
        .animate-slideUp { animation: slideUp 0.5s ease-out; }
      `}</style>
    </div>
  )
}

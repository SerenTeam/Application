import { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/api'
import { ArrowRight, ArrowLeft } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Screen = 'codeEntry' | 'loading' | 'data'

interface QAItem {
  question: string
  answer: unknown
}

interface CategoryData {
  category: string
  items: QAItem[]
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export function AccessPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const [screen, setScreen] = useState<Screen>('codeEntry')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Data display state (kept in case direct display is needed later,
  // but current flow redirects to dashboard)
  const [_transmissionData, setTransmissionData] = useState<CategoryData[]>([])
  const [_createdAt, setCreatedAt] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCode(e.target.value.toUpperCase())
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmed = code.trim()
    if (trimmed.length !== 8) {
      setError('Le code doit contenir 8 caractères')
      return
    }

    await fetchTransmissionData(trimmed)
  }

  const fetchTransmissionData = async (accessCode: string) => {
    setError(null)
    setIsSubmitting(true)
    setScreen('loading')

    try {
      const response = await apiFetch(`/api/transmission/${accessCode}`)
      const result = await response.json()

      if (result.success && result.data) {
        // The original code redirects to dashboard with the code
        navigate(`/dashboard?code=${accessCode}`)
      } else {
        setError(result.error || 'Code invalide ou données non trouvées')
        setScreen('codeEntry')
      }
    } catch (err) {
      console.error('Erreur:', err)
      setError('Erreur de connexion au serveur')
      setScreen('codeEntry')
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setScreen('codeEntry')
    setCode('')
    setError(null)
    setTransmissionData([])
    setCreatedAt(null)
    // Focus the input after reset
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  // -----------------------------------------------------------------------
  // Format helpers
  // -----------------------------------------------------------------------

  const formatAnswer = (answer: unknown): { text: string; skipped: boolean } => {
    if (answer === null || answer === undefined) {
      return { text: 'Non renseigné', skipped: true }
    }
    if (typeof answer === 'boolean') {
      return { text: answer ? 'Oui' : 'Non', skipped: false }
    }
    if (Array.isArray(answer)) {
      return { text: answer.join(', '), skipped: false }
    }
    return { text: String(answer), skipped: false }
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="border-b border-border-soft bg-bg-card p-8 text-center">
        <Link to="/" className="font-display text-[1.75rem] font-medium tracking-wide text-accent">
          Seren<span className="italic font-normal">.</span>
        </Link>
        <div className="mt-4 flex items-center justify-center gap-8">
          {user?.email && (
            <span className="text-[0.875rem] font-medium text-text-soft">
              {user.email}
            </span>
          )}
          <button
            onClick={signOut}
            className="border-b-2 border-text-soft bg-transparent p-0 pb-0.5 text-[0.875rem] font-medium uppercase tracking-widest text-text-soft transition-colors hover:border-accent hover:text-accent"
          >
            Déconnexion
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[720px] px-6 py-12 pb-24 max-sm:px-4 max-sm:py-8 max-sm:pb-16">
        {/* ---- Code Entry Form ---- */}
        {screen === 'codeEntry' && (
          <section className="animate-fadeIn rounded-[20px] bg-bg-card p-12 shadow-md max-sm:p-8">
            <h1 className="mb-4 text-center font-display text-[2rem] font-medium text-accent max-sm:text-[1.5rem]">
              Accès aux informations
            </h1>
            <p className="mb-8 text-center text-[1.05rem] text-text-soft">
              Entrez le code d'accès qui vous a été transmis pour consulter les informations laissées par votre proche.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="mb-6">
                <label
                  htmlFor="accessCode"
                  className="mb-2 block font-medium text-text"
                >
                  Code d'accès
                </label>
                <input
                  ref={inputRef}
                  id="accessCode"
                  type="text"
                  value={code}
                  onChange={handleCodeChange}
                  className="w-full rounded-[12px] border-2 border-border bg-bg px-5 py-4 text-center font-mono text-[1.5rem] font-bold uppercase tracking-[0.3em] text-text transition-colors placeholder:text-text-muted placeholder:tracking-[0.2em] focus:border-accent focus:bg-bg-card focus:outline-none max-sm:text-[1.25rem]"
                  placeholder="XXXXXXXX"
                  maxLength={8}
                  pattern="[A-Za-z0-9]{8}"
                  required
                  autoComplete="off"
                />
              </div>

              {/* Error message */}
              {error && (
                <div className="mb-6 rounded-[12px] border-2 border-error bg-error/10 p-4 text-center text-error">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-accent px-8 py-4 text-[1.05rem] font-medium text-white transition-all hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                Accéder aux informations
                <ArrowRight className="h-5 w-5" />
              </button>
            </form>
          </section>
        )}

        {/* ---- Loading Screen ---- */}
        {screen === 'loading' && (
          <div className="py-16 text-center">
            <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-[3px] border-border border-t-accent" />
            <p className="text-text-soft">Récupération des informations...</p>
          </div>
        )}

        {/* ---- Data Display ---- */}
        {screen === 'data' && (
          <div className="animate-fadeIn">
            {/* Header */}
            <div className="mb-8 rounded-[12px] bg-accent-soft px-4 py-8 text-center">
              <h2 className="mb-2 font-display text-[1.75rem] text-accent">
                Informations transmises
              </h2>
              {_createdAt && (
                <p className="text-[0.95rem] text-text-soft">
                  {new Date(_createdAt).toLocaleDateString('fr-FR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              )}
            </div>

            {/* Categories */}
            {_transmissionData.map((cat) => (
              <div key={cat.category} className="mb-10 animate-fadeIn">
                <h3 className="mb-6 border-b-2 border-border pb-2 font-display text-[1.5rem] text-accent">
                  {cat.category}
                </h3>
                <div className="space-y-4">
                  {cat.items.map((item, j) => {
                    const { text, skipped } = formatAnswer(item.answer)
                    return (
                      <div
                        key={j}
                        className="rounded-[8px] bg-bg p-5"
                      >
                        <div className="mb-2 font-medium text-text">
                          {item.question}
                        </div>
                        <div
                          className={
                            skipped
                              ? 'italic text-text-muted'
                              : 'text-[1.05rem] text-accent'
                          }
                        >
                          {text}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Back button */}
            <div className="mt-8 text-center">
              <button
                onClick={resetForm}
                className="inline-flex items-center gap-2 rounded-[12px] border-2 border-accent bg-transparent px-7 py-3.5 text-base font-medium text-accent transition-all hover:bg-accent hover:text-white"
              >
                <ArrowLeft className="h-5 w-5" />
                Consulter un autre code
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Global keyframe animation */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.6s ease-out; }
      `}</style>
    </div>
  )
}

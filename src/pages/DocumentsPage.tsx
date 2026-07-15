import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { DocumentCard, type DocumentData } from '@/components/documents/DocumentCard'
import { LetterPreview } from '@/components/letter/LetterPreview'
import { toast } from '@/hooks/use-toast'
import { ArrowLeft, FileText, X } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { fmt } from '@/i18n'
import { LanguageSwitch } from '@/components/layout/LanguageSwitch'

type ThemeFilter = 'all' | 'banque' | 'assurance' | 'administratif' | 'logement' | 'succession' | 'numerique' | 'fiscal'
type StatusFilter = 'all' | 'sent' | 'not_sent'
type SortOrder = 'newest' | 'oldest'

export function DocumentsPage() {
  const { user } = useAuth()
  const t = useT()
  const THEME_LABELS: Record<ThemeFilter, string> = t.lettersPage.themeLabels
  const [documents, setDocuments] = useState<DocumentData[]>([])
  const [loading, setLoading] = useState(true)
  const [themeFilter, setThemeFilter] = useState<ThemeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')
  const [viewingDoc, setViewingDoc] = useState<DocumentData | null>(null)

  const fetchDocuments = async () => {
    if (!user) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*, steps(title, theme)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Check for sent status by querying step_actions
      const stepIds = (data ?? []).map((d: { step_id?: string }) => d.step_id).filter(Boolean)
      let sentStepIds = new Set<string>()

      if (stepIds.length > 0) {
        const { data: sentActions } = await supabase
          .from('step_actions')
          .select('step_id')
          .eq('user_id', user.id)
          .eq('action_type', 'sent')
          .in('step_id', stepIds)

        sentStepIds = new Set((sentActions ?? []).map((a: { step_id: string }) => a.step_id))
      }

      const docs: DocumentData[] = (data ?? []).map((d: Record<string, unknown>) => ({
        id: d.id as string,
        title: d.title as string,
        content: d.content as string,
        document_type: d.document_type as string,
        created_at: d.created_at as string,
        step_title: (d.steps as { title?: string } | null)?.title,
        step_theme: (d.steps as { theme?: string } | null)?.theme,
        is_sent: sentStepIds.has(d.step_id as string),
      }))

      setDocuments(docs)
    } catch {
      toast({ title: t.lettersPage.loadErrorTitle, description: t.lettersPage.loadErrorDescription })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDocuments()
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('documents').delete().eq('id', id)
      if (error) throw error
      setDocuments((prev) => prev.filter((d) => d.id !== id))
      toast({ title: t.lettersPage.deletedTitle })
    } catch {
      toast({ title: t.lettersPage.deleteErrorTitle, description: t.lettersPage.deleteErrorDescription })
    }
  }

  const filtered = useMemo(() => {
    let result = documents

    if (themeFilter !== 'all') {
      result = result.filter((d) => d.step_theme === themeFilter)
    }

    if (statusFilter === 'sent') {
      result = result.filter((d) => d.is_sent)
    } else if (statusFilter === 'not_sent') {
      result = result.filter((d) => !d.is_sent)
    }

    if (sortOrder === 'oldest') {
      result = [...result].reverse()
    }

    return result
  }, [documents, themeFilter, statusFilter, sortOrder])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-border border-t-accent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Button variant="outline" size="icon" asChild>
            <Link to="/dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="font-display text-2xl font-medium text-accent">{t.lettersPage.title}</h1>
            <p className="text-sm text-text-muted">
              {fmt(t.lettersPage.countLabel, { count: documents.length, s: documents.length !== 1 ? 's' : '' })}
            </p>
          </div>
          <div className="ml-auto">
            <LanguageSwitch />
          </div>
        </div>

        {documents.length === 0 ? (
          /* Empty state */
          <div className="rounded-lg border border-border bg-bg-card p-8 text-center">
            <FileText className="mx-auto mb-4 h-12 w-12 text-text-muted/40" />
            <h2 className="mb-2 font-display text-lg font-medium text-text-primary">
              {t.lettersPage.emptyTitle}
            </h2>
            <p className="mb-6 text-sm text-text-muted">
              {t.lettersPage.emptyHint}
            </p>
            <Button asChild>
              <Link to="/dashboard">{t.lettersPage.viewRoadmap}</Link>
            </Button>
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="mb-4 flex flex-wrap gap-2">
              <select
                value={themeFilter}
                onChange={(e) => setThemeFilter(e.target.value as ThemeFilter)}
                className="rounded-md border border-border bg-bg-card px-3 py-1.5 text-sm text-text-primary"
              >
                {Object.entries(THEME_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="rounded-md border border-border bg-bg-card px-3 py-1.5 text-sm text-text-primary"
              >
                <option value="all">{t.lettersPage.statusAll}</option>
                <option value="sent">{t.lettersPage.statusSent}</option>
                <option value="not_sent">{t.lettersPage.statusNotSent}</option>
              </select>

              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                className="rounded-md border border-border bg-bg-card px-3 py-1.5 text-sm text-text-primary"
              >
                <option value="newest">{t.lettersPage.sortNewest}</option>
                <option value="oldest">{t.lettersPage.sortOldest}</option>
              </select>
            </div>

            {/* Document list */}
            <div className="space-y-3">
              {filtered.length === 0 ? (
                <p className="text-sm text-text-muted italic py-4 text-center">
                  {t.lettersPage.noMatch}
                </p>
              ) : (
                filtered.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    document={doc}
                    onView={setViewingDoc}
                    onDelete={handleDelete}
                  />
                ))
              )}
            </div>
          </>
        )}

        {/* Preview modal */}
        {viewingDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-bg-card p-6 shadow-xl">
              <Button
                variant="outline"
                size="icon"
                className="absolute right-4 top-4"
                onClick={() => setViewingDoc(null)}
              >
                <X className="h-4 w-4" />
              </Button>
              <h2 className="mb-4 font-display text-lg font-medium text-accent">
                {viewingDoc.title}
              </h2>
              <LetterPreview content={viewingDoc.content} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

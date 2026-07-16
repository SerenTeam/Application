import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { fetchUserDocuments, fetchSentStepIds, deleteDocument } from '@/lib/documents'
import { Button } from '@/components/ui/button'
import { DocumentCard, type DocumentData } from '@/components/documents/DocumentCard'
import { LetterPreview } from '@/components/letter/LetterPreview'
import { toast } from '@/hooks/use-toast'
import { ArrowLeft, FileText, X } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { fmt } from '@/i18n'
import { AppHeader, HeaderNavLink } from '@/components/layout/AppHeader'

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
      const data = await fetchUserDocuments(supabase, user.id)

      // Statut « envoyé » via step_actions
      const stepIds = data.map((d) => d.step_id).filter((id): id is string => !!id)
      const sentStepIds = await fetchSentStepIds(supabase, user.id, stepIds)

      const docs: DocumentData[] = data.map((d) => ({
        id: d.id,
        title: d.title,
        content: d.content,
        created_at: d.created_at,
        step_title: d.steps?.title,
        step_theme: d.steps?.theme,
        is_sent: d.step_id != null && sentStepIds.has(d.step_id),
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
      await deleteDocument(supabase, id)
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
      <div className="min-h-screen bg-bg">
        <AppHeader>
          <HeaderNavLink to="/dashboard">{t.layout.dashboard}</HeaderNavLink>
        </AppHeader>
        <div className="flex min-h-[calc(100vh-82px)] items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-border border-t-primary" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg">
      <AppHeader>
        <HeaderNavLink to="/dashboard">{t.layout.dashboard}</HeaderNavLink>
      </AppHeader>

      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Back button + titre (chrome de compte désormais géré par AppHeader) */}
        <div className="mb-6 flex items-center gap-3">
          <Button variant="outline" size="icon" asChild>
            <Link to="/dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="font-display text-2xl font-normal text-primary">{t.lettersPage.title}</h1>
            <p className="text-sm text-text-muted">
              {fmt(t.lettersPage.countLabel, { count: documents.length, s: documents.length !== 1 ? 's' : '' })}
            </p>
          </div>
        </div>

        {documents.length === 0 ? (
          /* Empty state */
          <div className="rounded-card border border-border-card bg-white p-10 text-center shadow-card-border">
            <FileText className="mx-auto mb-4 h-12 w-12 text-text-muted/40" />
            <h2 className="mb-2 font-display text-lg font-normal text-text">
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
                className="h-[42px] rounded-2xl border border-border bg-white px-4 text-[14px] text-text outline-none transition-colors focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
              >
                {Object.entries(THEME_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="h-[42px] rounded-2xl border border-border bg-white px-4 text-[14px] text-text outline-none transition-colors focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
              >
                <option value="all">{t.lettersPage.statusAll}</option>
                <option value="sent">{t.lettersPage.statusSent}</option>
                <option value="not_sent">{t.lettersPage.statusNotSent}</option>
              </select>

              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                className="h-[42px] rounded-2xl border border-border bg-white px-4 text-[14px] text-text outline-none transition-colors focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
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
            <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-card bg-white p-8 shadow-card">
              <Button
                variant="outline"
                size="icon"
                className="absolute right-4 top-4"
                onClick={() => setViewingDoc(null)}
              >
                <X className="h-4 w-4" />
              </Button>
              <h2 className="mb-4 font-display text-lg font-normal text-primary">
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

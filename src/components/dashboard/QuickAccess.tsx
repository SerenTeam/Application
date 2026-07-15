import { FileText, Map, Phone, type LucideIcon } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { IconBadge } from '@/components/ui/icon-badge'
import type { DashboardView } from './types'

interface QuickAccessProps {
  onNavigate: (view: DashboardView) => void
}

const ICONS: Record<'documents' | 'roadmap' | 'contacts', LucideIcon> = {
  documents: FileText,
  roadmap: Map,
  contacts: Phone,
}

export function QuickAccess({ onNavigate }: QuickAccessProps) {
  const t = useT()
  const BUTTONS: { view: DashboardView; icon: LucideIcon; label: string }[] = [
    { view: 'documents', icon: ICONS.documents, label: t.dashboardPage.quickAccessButtons.documents },
    { view: 'roadmap', icon: ICONS.roadmap, label: t.dashboardPage.quickAccessButtons.roadmap },
    { view: 'contacts', icon: ICONS.contacts, label: t.dashboardPage.quickAccessButtons.contacts },
  ]
  return (
    <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
      {BUTTONS.map((btn) => {
        const Icon = btn.icon
        return (
          <button
            key={btn.view}
            onClick={() => onNavigate(btn.view)}
            className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border border-border-card bg-white p-6 text-text shadow-card-border transition-all duration-200 hover:border-primary-border hover:bg-primary-light/40"
          >
            <IconBadge size="md" tone="primary">
              <Icon />
            </IconBadge>
            <span className="font-body font-medium">{btn.label}</span>
          </button>
        )
      })}
    </div>
  )
}

import { useT } from '@/i18n/useT'
import type { DashboardView } from './types'

interface QuickAccessProps {
  onNavigate: (view: DashboardView) => void
}

const ICONS: Record<DashboardView, string> = {
  dashboard: '\uD83D\uDCCA',
  documents: '\uD83D\uDCC4',
  roadmap: '\uD83D\uDDFA\uFE0F',
  contacts: '\uD83D\uDCDE',
}

export function QuickAccess({ onNavigate }: QuickAccessProps) {
  const t = useT()
  const BUTTONS: { view: DashboardView; icon: string; label: string }[] = [
    { view: 'documents', icon: ICONS.documents, label: t.dashboardPage.quickAccessButtons.documents },
    { view: 'roadmap', icon: ICONS.roadmap, label: t.dashboardPage.quickAccessButtons.roadmap },
    { view: 'contacts', icon: ICONS.contacts, label: t.dashboardPage.quickAccessButtons.contacts },
  ]
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-8">
      {BUTTONS.map((btn) => (
        <button
          key={btn.view}
          onClick={() => onNavigate(btn.view)}
          className="flex flex-col items-center gap-3 p-6 bg-bg-card border-2 border-border rounded-[12px] cursor-pointer transition-all duration-200 hover:border-accent hover:bg-accent-soft text-text"
        >
          <span className="text-[2rem]">{btn.icon}</span>
          <span className="font-medium">{btn.label}</span>
        </button>
      ))}
    </div>
  )
}

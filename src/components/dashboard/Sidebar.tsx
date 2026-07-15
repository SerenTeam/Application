import { cn } from '@/lib/utils'
import { useT } from '@/i18n/useT'
import { NAV_ITEMS, type DashboardView } from './types'

interface SidebarProps {
  activeView: DashboardView
  onNavigate: (view: DashboardView) => void
}

export function Sidebar({ activeView, onNavigate }: SidebarProps) {
  const t = useT()
  return (
    <aside
      className={cn(
        'border-border bg-white',
        // Desktop: vertical sidebar
        'hidden md:block md:w-[260px] md:border-r md:py-8',
      )}
    >
      <nav className="flex flex-col gap-1 px-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = activeView === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-4 py-3 text-left font-body text-[15px] font-medium',
                'text-text-secondary transition-colors duration-200 cursor-pointer',
                'hover:bg-primary-light/60 hover:text-primary',
                isActive && 'bg-primary-light text-primary',
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span>{t.layout.nav[item.id]}</span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}

/**
 * Horizontal navigation bar shown on small screens only.
 */
export function MobileNav({
  activeView,
  onNavigate,
}: SidebarProps) {
  const t = useT()
  return (
    <nav
      className={cn(
        'flex md:hidden overflow-x-auto border-b border-border bg-white',
        'gap-1 px-2 py-2',
      )}
    >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        const isActive = activeView === item.id
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={cn(
              'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 font-body text-[14px] font-medium',
              'text-text-secondary transition-colors duration-200 cursor-pointer',
              'hover:bg-primary-light/60 hover:text-primary',
              isActive && 'bg-primary-light text-primary',
            )}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            <span>{t.layout.nav[item.id]}</span>
          </button>
        )
      })}
    </nav>
  )
}

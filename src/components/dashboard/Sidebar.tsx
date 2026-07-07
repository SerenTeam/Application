import { cn } from '@/lib/utils'
import { NAV_ITEMS, type DashboardView } from './types'

interface SidebarProps {
  activeView: DashboardView
  onNavigate: (view: DashboardView) => void
}

export function Sidebar({ activeView, onNavigate }: SidebarProps) {
  return (
    <aside
      className={cn(
        'bg-bg-card border-border-soft',
        // Desktop: vertical sidebar
        'hidden md:block md:w-[260px] md:border-r md:py-8',
      )}
    >
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          onClick={() => onNavigate(item.id)}
          className={cn(
            'flex w-full items-center gap-3 border-l-[3px] border-transparent px-6 py-3.5',
            'text-text-soft transition-all duration-200 cursor-pointer',
            'hover:bg-accent-soft hover:text-text',
            activeView === item.id &&
              'bg-accent-soft text-accent border-l-accent font-medium',
          )}
        >
          <span>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
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
  return (
    <nav
      className={cn(
        'flex md:hidden overflow-x-auto border-b border-border-soft bg-bg-card',
        'py-2',
      )}
    >
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          onClick={() => onNavigate(item.id)}
          className={cn(
            'flex items-center gap-2 whitespace-nowrap px-5 py-2.5',
            'border-b-[3px] border-transparent text-text-soft transition-all duration-200 cursor-pointer',
            'hover:bg-accent-soft hover:text-text',
            activeView === item.id &&
              'border-b-accent text-accent font-medium',
          )}
        >
          <span>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}

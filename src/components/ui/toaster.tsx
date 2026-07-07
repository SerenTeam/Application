import { useToast } from "@/hooks/use-toast"
import { X } from "lucide-react"

export function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="animate-in slide-in-from-bottom-2 rounded-[var(--radius-md)] border border-border bg-bg-card p-4 shadow-lg max-w-sm"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <div className="flex-1">
              {toast.title && (
                <p className="text-sm font-medium text-text">{toast.title}</p>
              )}
              {toast.description && (
                <p className="mt-1 text-sm text-text-soft">{toast.description}</p>
              )}
            </div>
            <button
              onClick={() => dismiss(toast.id)}
              className="text-text-muted hover:text-text"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

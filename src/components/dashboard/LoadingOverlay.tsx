import { cn } from '@/lib/utils'

interface LoadingOverlayProps {
  message: string
  detail: string
  isError?: boolean
}

export function LoadingOverlay({ message, detail, isError }: LoadingOverlayProps) {
  return (
    <div className="fixed inset-0 z-[9999] bg-bg flex flex-col items-center justify-center">
      {/* Spinner */}
      <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-border border-t-accent" />

      <p className="mt-6 text-text-soft text-[1.1rem]">{message}</p>
      <p
        className={cn(
          'mt-2 text-sm',
          isError ? 'text-error' : 'text-text-muted',
        )}
      >
        {detail}
      </p>
    </div>
  )
}

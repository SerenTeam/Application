import { useState, useEffect } from 'react'
import { WifiOff } from 'lucide-react'
import { useT } from '@/i18n/useT'

/**
 * SER-65 — Bannière hors-ligne.
 * S'affiche en haut de l'écran quand le navigateur est déconnecté.
 * Disparaît automatiquement à la reconnexion.
 */
export function OfflineBanner() {
  const t = useT()
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const handleOffline = () => setIsOffline(true)
    const handleOnline = () => setIsOffline(false)

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)

    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-warning/10 px-4 py-2.5 text-sm text-warning"
      role="alert"
      aria-live="assertive"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{t.layout.offlineMessage}</span>
    </div>
  )
}

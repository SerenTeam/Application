import type { ReactNode } from 'react'
import { AppHeader } from '@/components/layout/AppHeader'

interface AuthLayoutProps {
  children: ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-bg">
      {/* Toggle FR/EN accessible dès la connexion : un device FR peut demander l'anglais avant d'avoir un compte */}
      <AppHeader variant="minimal" />
      <main className="mx-auto max-w-[500px] px-6 py-12">
        {children}
      </main>
    </div>
  )
}

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LanguageSwitch } from '@/components/layout/LanguageSwitch'

interface AuthLayoutProps {
  children: ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-bg">
      <header className="relative border-b border-border-soft bg-bg-card p-8 text-center">
        <Link to="/" className="font-display text-[1.75rem] font-medium tracking-wide text-accent">
          Seren<span className="italic font-normal">.</span>
        </Link>
        {/* Toggle FR/EN accessible dès la connexion : un device FR peut demander l'anglais avant d'avoir un compte */}
        <div className="absolute right-6 top-1/2 -translate-y-1/2">
          <LanguageSwitch />
        </div>
      </header>
      <main className="mx-auto max-w-[500px] px-6 py-12">
        {children}
      </main>
    </div>
  )
}

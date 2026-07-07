import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface AuthLayoutProps {
  children: ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border-soft bg-bg-card p-8 text-center">
        <Link to="/" className="font-display text-[1.75rem] font-medium tracking-wide text-accent">
          Seren<span className="italic font-normal">.</span>
        </Link>
      </header>
      <main className="mx-auto max-w-[500px] px-6 py-12">
        {children}
      </main>
    </div>
  )
}

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import type { User, Session } from '@supabase/supabase-js'
import React from 'react'

interface AuthContextType {
  user: User | null
  session: Session | null
  isLoading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()
  const location = useLocation()
  const hadSessionRef = useRef(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      hadSessionRef.current = !!session
      setIsLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        setIsLoading(false)

        // Session expired or token refreshed failed — redirect with returnUrl
        if (
          (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' && !session) &&
          hadSessionRef.current &&
          location.pathname !== '/login'
        ) {
          const returnUrl = location.pathname + location.search
          toast({
            title: 'Votre session a été fermée',
            description: 'Reconnectez-vous pour continuer.',
          })
          navigate(`/login?returnUrl=${encodeURIComponent(returnUrl)}`, { replace: true })
        }

        hadSessionRef.current = !!session
      }
    )

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSignOut = async () => {
    hadSessionRef.current = false // Prevent expiry toast on voluntary sign-out
    await supabase.auth.signOut()
  }

  return React.createElement(
    AuthContext.Provider,
    { value: { user, session, isLoading, signOut: handleSignOut } },
    children
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

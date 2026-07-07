import { useState, useCallback } from 'react'

/**
 * Hook gérant la visibilité d'un champ mot de passe.
 * Retourne le type d'input ('password' | 'text') et un toggle.
 */
export function usePasswordVisibility() {
  const [isVisible, setIsVisible] = useState(false)

  const toggle = useCallback(() => {
    setIsVisible((prev) => !prev)
  }, [])

  return {
    isVisible,
    inputType: isVisible ? 'text' as const : 'password' as const,
    toggle,
  }
}

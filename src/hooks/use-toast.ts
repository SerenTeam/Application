import { useState, useCallback } from "react"

interface Toast {
  id: string
  title?: string
  description?: string
}

let toastCount = 0
let listeners: Array<(toasts: Toast[]) => void> = []
let memoryState: Toast[] = []

function dispatch(toasts: Toast[]) {
  memoryState = toasts
  listeners.forEach((listener) => listener(toasts))
}

export function toast({ title, description }: Omit<Toast, "id">) {
  const id = String(toastCount++)
  const newToast: Toast = { id, title, description }
  dispatch([...memoryState, newToast])

  // Auto-dismiss after 4 seconds
  setTimeout(() => {
    dispatch(memoryState.filter((t) => t.id !== id))
  }, 4000)

  return id
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>(memoryState)

  useState(() => {
    listeners.push(setToasts)
    return () => {
      listeners = listeners.filter((l) => l !== setToasts)
    }
  })

  const dismiss = useCallback((id: string) => {
    dispatch(memoryState.filter((t) => t.id !== id))
  }, [])

  return { toasts, toast, dismiss }
}

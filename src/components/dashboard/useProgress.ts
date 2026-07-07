import { useState, useCallback } from 'react'
import type { ProgressData } from './types'

const EMPTY_PROGRESS: ProgressData = {
  completedSteps: [],
  inProgressSteps: [],
  skippedSteps: [],
  notes: {},
}

function storageKey(code: string) {
  return `transmission_progress_${code}`
}

function loadFromStorage(code: string): ProgressData {
  try {
    const raw = localStorage.getItem(storageKey(code))
    if (raw) return JSON.parse(raw) as ProgressData
  } catch {
    /* ignore corrupt data */
  }
  return { ...EMPTY_PROGRESS }
}

function persistToStorage(code: string, data: ProgressData) {
  localStorage.setItem(storageKey(code), JSON.stringify(data))
}

/**
 * Hook managing roadmap progress state with localStorage persistence.
 * Mirrors the original vanilla JS progressData / saveProgress logic.
 */
export function useProgress(accessCode: string) {
  const [progress, setProgress] = useState<ProgressData>(() =>
    loadFromStorage(accessCode),
  )

  /** Toggle a step between completed / not-completed. */
  const toggleStepStatus = useCallback(
    (stepId: number) => {
      setProgress((prev) => {
        const idx = prev.completedSteps.indexOf(stepId)
        let completedSteps: number[]
        let inProgressSteps = [...prev.inProgressSteps]

        if (idx > -1) {
          // un-complete
          completedSteps = prev.completedSteps.filter((id) => id !== stepId)
        } else {
          // mark completed & remove from in-progress
          completedSteps = [...prev.completedSteps, stepId]
          inProgressSteps = inProgressSteps.filter((id) => id !== stepId)
        }

        const next: ProgressData = {
          ...prev,
          completedSteps,
          inProgressSteps,
        }
        persistToStorage(accessCode, next)
        return next
      })
    },
    [accessCode],
  )

  /** Save a personal note on a step. */
  const saveStepNote = useCallback(
    (stepId: number, note: string) => {
      setProgress((prev) => {
        const next: ProgressData = {
          ...prev,
          notes: { ...prev.notes, [stepId]: note },
        }
        persistToStorage(accessCode, next)
        return next
      })
    },
    [accessCode],
  )

  return { progress, toggleStepStatus, saveStepNote }
}

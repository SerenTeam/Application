// ─── Roadmap types ───

export interface RoadmapStep {
  id: number
  title: string
  timeline: string
  description: string
  urgent: boolean
  /** UUID of the step row in Supabase (for letter actions) */
  stepDbId?: string
  /** Letter template linked to this step, if any */
  letterTemplateId?: string
}

export interface RoadmapPhase {
  phase: string
  steps: RoadmapStep[]
}

// ─── API response types ───

export interface RoadmapApiPhase {
  name: string
  steps: {
    id: number
    title: string
    timeline: string
    description: string
    personalizedTips?: string[]
    urgent: boolean
  }[]
}

export interface RoadmapApiResponse {
  success: boolean
  roadmap?: {
    roadmap: {
      phases: RoadmapApiPhase[]
    }
  }
  error?: string
}

// ─── Transmission data types ───

export interface TransmissionItem {
  question: string
  reponse: string | boolean | null
  categorie?: string
}

export interface TransmissionApiResponse {
  success: boolean
  data?: TransmissionItem[]
}

// ─── Progress tracking ───

export interface ProgressData {
  completedSteps: number[]
  inProgressSteps: number[]
  skippedSteps: number[]
  notes: Record<number, string>
}

// ─── View navigation ───

export type DashboardView = 'dashboard' | 'roadmap' | 'documents' | 'contacts'

export interface NavItem {
  id: DashboardView
  label: string
  icon: string
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '\uD83D\uDCCA' },
  { id: 'roadmap', label: 'Roadmap', icon: '\uD83D\uDDFA\uFE0F' },
  { id: 'documents', label: 'Documents', icon: '\uD83D\uDCC4' },
  { id: 'contacts', label: 'Contacts', icon: '\uD83D\uDCDE' },
]

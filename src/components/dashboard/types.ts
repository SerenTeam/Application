import { LayoutDashboard, Map, FileText, Phone, type LucideIcon } from 'lucide-react'

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
  icon: LucideIcon
}

// Les libellés vivent dans les dictionnaires i18n (t.layout.nav.<id>).
export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', icon: LayoutDashboard },
  { id: 'roadmap', icon: Map },
  { id: 'documents', icon: FileText },
  { id: 'contacts', icon: Phone },
]

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { createElement as h, useEffect, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { RequireAccess } from '@/components/auth/RequireAccess'
import { resetAccountCache, useAccount } from '@/hooks/useAccount'
import type { MeResponse } from '@/types/account'

// Défaut rc2 (démo) : après les 3 consentements sur /bienvenue, la famille était renvoyée sur
// /bienvenue au lieu d'entrer dans le questionnaire. Mécanisme reproduit ici avec le VRAI
// ProtectedRoute + RequireAccess + useAccount, dans un arbre de routes calqué sur App.tsx :
// React Router ne pose aucune clé sur les routes, donc /bienvenue → / RÉUTILISE l'instance de la
// garde (même type, même position) ; son état useAccount, lu au montage, dit encore
// consent.required = true, alors que seule l'instance de ConsentPage a été rafraîchie.

const server = vi.hoisted(() => ({ consentRequired: true }))

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(async () => {
    const body: MeResponse = {
      success: true,
      account: {
        user_id: 'u-1', role: 'family', is_admin: false, partner: null,
        dossier: { id: 'd-1', status: 'active', source: 'partner', partner_name: 'PF Démo', deceased_first_name: 'Jean', activated_at: '2026-09-16T10:00:00Z', included_sends: 5 },
        consent: { version: '2026-09-beta-1', required: server.consentRequired, accepted_at: server.consentRequired ? null : '2026-09-17T08:00:00Z' },
      },
      quota: null,
      flags: { llm_enabled: false, email_sends_enabled: false, extra_sends_enabled: false, paper_sends_enabled: false, partner_activations_enabled: true, partner_billing_preview: false },
      support_email: 'support@seren-app.fr',
    }
    return new Response(JSON.stringify(body), { status: 200 })
  }),
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' }, session: null, isLoading: false, signOut: async () => {} }) }))

// Hôte minimal pour react-dom en environnement node : l'arbre testé ne rend AUCUN élément DOM
// (composants qui renvoient null, cache de compte préchauffé pour éviter le spinner de la garde).
const fakeDocument = { addEventListener() {}, removeEventListener() {} }
const container = { nodeType: 1, nodeName: 'DIV', tagName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml', ownerDocument: fakeDocument, textContent: '', addEventListener() {}, removeEventListener() {} }

const flush = () => new Promise((resolve) => setTimeout(resolve, 20))

let pathname = ''
let questionnaireRendered = false
let submitConsents: (() => Promise<void>) | null = null
let skipConsents: (() => void) | null = null

function LocationProbe() {
  pathname = useLocation().pathname
  return null
}

// Réplique exacte de l'enchaînement de ConsentPage.handleStart après record_consents réussi.
function ConsentStub() {
  const { refresh } = useAccount()
  const navigate = useNavigate()
  useEffect(() => {
    submitConsents = async () => {
      server.consentRequired = false // record_consents a écrit la preuve en base
      await refresh()
      navigate('/', { replace: true })
    }
    // Contournement : aller sur / SANS consentir (lien direct, bouton précédent…).
    skipConsents = () => navigate('/', { replace: true })
  })
  return null
}

function QuestionnaireStub() {
  questionnaireRendered = true
  return null
}

function Warm({ children }: { children?: ReactNode }) {
  useAccount()
  return children ?? null
}

describe('garde d’accès — sortie de /bienvenue après consentement', () => {
  let root: Root
  const globals = globalThis as Record<string, unknown>

  beforeAll(() => {
    globals.window = { HTMLIFrameElement: class {} }
  })
  afterAll(() => {
    root?.unmount()
    delete globals.window
  })

  async function mountOnWelcome() {
    root?.unmount()
    server.consentRequired = true
    questionnaireRendered = false
    submitConsents = null
    skipConsents = null
    resetAccountCache()
    root = createRoot(container as unknown as Element)
    // Préchauffage : GET /api/me initial (consentement requis) mis en cache de module.
    root.render(h(Warm))
    await flush()

    root.render(
      h(MemoryRouter, { initialEntries: ['/bienvenue'] },
        h(LocationProbe),
        h(Routes, null,
          h(Route, { path: '/bienvenue', element: h(ProtectedRoute, { children: h(RequireAccess, { area: 'consent', children: h(ConsentStub) }) }) }),
          h(Route, { path: '/', element: h(ProtectedRoute, { children: h(RequireAccess, { area: 'family', children: h(QuestionnaireStub) }) }) }),
        ),
      ),
    )
    await flush()
  }

  it('entre dans le questionnaire (/) au lieu de revenir sur /bienvenue', async () => {
    await mountOnWelcome()
    expect(pathname).toBe('/bienvenue')
    expect(submitConsents).not.toBeNull()

    await submitConsents!()
    await flush()

    expect(pathname).toBe('/')
    expect(questionnaireRendered).toBe(true)
  })

  // Non-régression sécurité du correctif : la garde remontée n'ouvre rien sans consentement.
  it('sans consentement, navigation directe vers / → renvoyée sur /bienvenue, questionnaire jamais rendu', async () => {
    await mountOnWelcome()
    expect(pathname).toBe('/bienvenue')
    expect(skipConsents).not.toBeNull()

    skipConsents!()
    await flush()
    await flush()

    expect(pathname).toBe('/bienvenue')
    expect(questionnaireRendered).toBe(false)
  })
})

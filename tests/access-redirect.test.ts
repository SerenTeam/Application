import { describe, it, expect } from 'vitest'
import { resolveAccessRedirect, type AccessArea, type AccessDecision } from '@/lib/access-redirect'
import type { Account } from '@/types/account'

const BASE: Account = {
  user_id: 'u-1', role: 'family', is_admin: false, partner: null,
  dossier: { id: 'd-1', status: 'active', source: 'partner', partner_name: 'PF Démo', deceased_first_name: 'Jean', activated_at: '2026-09-16T10:00:00Z', included_sends: 10 },
  consent: { version: '2026-09-beta-1', required: false, accepted_at: '2026-09-16T10:01:00Z' },
}
const ALLOW: AccessDecision = { kind: 'allow' }
const SCREEN: AccessDecision = { kind: 'screen', screen: 'not_activated' }
const to = (path: string): AccessDecision => ({ kind: 'redirect', to: path })

const partner: Account = { ...BASE, role: 'partner', dossier: null, partner: { id: 'p-1', name: 'PF Démo', status: 'active', user_role: 'manager' } }
const familyConsentRequired: Account = { ...BASE, consent: { ...BASE.consent, required: true, accepted_at: null } }
const familyOk: Account = BASE
const familyClosed: Account = { ...BASE, dossier: { ...BASE.dossier!, status: 'closed' } }
const noneAdmin: Account = { ...BASE, role: 'none', dossier: null, is_admin: true }
const none: Account = { ...BASE, role: 'none', dossier: null }

const AREAS: AccessArea[] = ['family', 'consent', 'partner', 'admin']
const TABLE: Array<[string, Account | null, AccessDecision[]]> = [
  ['compte null', null, [SCREEN, SCREEN, SCREEN, SCREEN]],
  ['partner', partner, [to('/partenaire'), to('/partenaire'), ALLOW, to('/partenaire')]],
  ['partner admin', { ...partner, is_admin: true }, [to('/partenaire'), to('/partenaire'), ALLOW, ALLOW]],
  ['famille, consentement requis', familyConsentRequired, [to('/bienvenue'), ALLOW, to('/bienvenue'), to('/bienvenue')]],
  ['famille, consentement requis, admin', { ...familyConsentRequired, is_admin: true }, [to('/bienvenue'), ALLOW, to('/bienvenue'), ALLOW]],
  ['famille, consentement OK', familyOk, [ALLOW, to('/'), to('/'), to('/')]],
  ['famille, consentement OK, admin', { ...familyOk, is_admin: true }, [ALLOW, to('/'), to('/'), ALLOW]],
  ['famille, dossier clos', familyClosed, [SCREEN, SCREEN, SCREEN, SCREEN]],
  ['famille, dossier clos, admin', { ...familyClosed, is_admin: true }, [SCREEN, SCREEN, SCREEN, ALLOW]],
  ['none admin', noneAdmin, [to('/admin'), to('/admin'), to('/admin'), ALLOW]],
  ['none', none, [SCREEN, SCREEN, SCREEN, SCREEN]],
]

describe('resolveAccessRedirect — table §7.2', () => {
  for (const [label, account, expected] of TABLE) {
    AREAS.forEach((area, index) => {
      it(`${label} × ${area}`, () => {
        expect(resolveAccessRedirect(account, area)).toEqual(expected[index])
      })
    })
  }
  it('famille « active » sans objet dossier (forme inattendue) : écran, jamais allow', () => {
    expect(resolveAccessRedirect({ ...BASE, dossier: null }, 'family')).toEqual(SCREEN)
  })
})

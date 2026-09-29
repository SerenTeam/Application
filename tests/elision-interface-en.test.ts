import { describe, it, expect, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { LetterProfileForm } from '@/components/letter/LetterProfileForm'
import { ConsentPage } from '@/pages/ConsentPage'
import type { LetterProfileRow } from '@/lib/letter-profile'

// Pendant anglais de tests/elision-interface.test.ts. Les textes FR lisent {ofName} (« d’Anne »), mais
// leurs versions EN lisent toujours {name} (« Anne’s date of birth ») : les appelants passent les deux.
// Sans ces rendus EN, retirer `name` d'un appel laisserait la suite verte et l'interface anglaise
// afficherait « {name} » en clair (fmt laisse intact un placeholder inconnu). L'aperçu cite le
// courrier, toujours en français.

vi.mock('@/i18n/LanguageContext', () => ({ useLang: () => ({ lang: 'en', setLang: () => {} }) }))
// /bienvenue lit le dossier par useAccount (GET /api/me), son en-tête lit la session par useAuth.
vi.mock('@/hooks/useAccount', () => ({
  useAccount: () => ({ me: { account: { dossier: { deceased_first_name: 'Hélène', partner_name: null } } }, refresh: async () => {} }),
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null, session: null, isLoading: false, signOut: async () => {} }) }))

// Texte visible d'un rendu HTML : balises retirées, entités décodées.
function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
}

const PROFILE: LetterProfileRow = {
  first_name: 'Camille',
  last_name: 'Roussel',
  full_name: 'Camille Roussel',
  address_line1: '18 rue des Tanneurs',
  address_line2: null,
  postal_code: '33000',
  city: 'Bordeaux',
  relationship: 'fille',
}

describe('interface anglaise : le prénom du défunt reste écrit (« Anne’s », « of Hélène »)', () => {
  it('LetterProfileForm, lecture : aperçu du courrier et résumé de la date de naissance', () => {
    const html = renderToStaticMarkup(
      h(LetterProfileForm, {
        userId: 'u1',
        profile: PROFILE,
        relation: 'parent',
        deceasedFirstName: 'Anne',
        deceasedDob: { value: '1941-03-14', max: '2026-09-12', save: async () => {} },
        onSaved: () => {},
      })
    )
    const text = visibleText(html)
    expect(text).toContain("Your letters will read: “fille d'Anne”.")
    expect(text).toContain('Anne’s date of birth: 14 March 1941')
  })

  it('LetterProfileForm, édition : libellé de la date de naissance', () => {
    const html = renderToStaticMarkup(
      h(LetterProfileForm, {
        userId: 'u1',
        profile: PROFILE,
        relation: 'parent',
        deceasedFirstName: 'Hélène',
        deceasedDob: { value: null, max: '2026-09-12', save: async () => {} },
        variant: 'screen',
        onSaved: () => {},
      })
    )
    const text = visibleText(html)
    expect(text).toContain("Your letters will read: “fille d'Hélène”.")
    expect(text).toContain('Hélène’s date of birth (optional)')
  })

  it('ConsentPage : « …following the death of Hélène. »', () => {
    const text = visibleText(renderToStaticMarkup(h(MemoryRouter, null, h(ConsentPage))))
    expect(text).toContain('We are by your side for the formalities following the death of Hélène.')
  })
})

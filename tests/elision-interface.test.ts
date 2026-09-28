import { describe, it, expect, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { fmt } from '@/i18n'
import { STRINGS_FR } from '@/i18n/strings.fr'
import { STRINGS_EN } from '@/i18n/strings.en'
import { withDe } from '@/lib/elision'
import { LetterProfileForm } from '@/components/letter/LetterProfileForm'
import { ConsentPage } from '@/pages/ConsentPage'
import type { LetterProfileRow } from '@/lib/letter-profile'
// @ts-expect-error — module JS serveur
import { renderLetter } from '../server/lib/letter-render.js'

// Même défaut que dans les courriers (revue du 2026-09-28), corrigé par la même règle (withDe) :
// - l'aperçu du profil courrier, en FR comme en EN, annonce le texte du courrier : « fille d'Anne »,
//   avec l'apostrophe droite du courrier ;
// - les textes d'interface FR : « Date de naissance d’Anne » (libellé et résumé), « …liées au décès
//   d’Anne » (décision d'Arnaud : inclus au correctif), avec l'apostrophe typographique de leurs
//   voisins dans les dictionnaires. Les textes anglais ne changent pas.

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

describe('aperçu du profil courrier : il annonce le texte du courrier', () => {
  it("« fille d'Anne » en FR comme en EN (le courrier reste en français)", () => {
    expect(fmt(STRINGS_FR.letterProfile.relationshipPreview, { relationship: 'fille', ofName: withDe('Anne') })).toBe(
      "Vos courriers indiqueront : « fille d'Anne »."
    )
    expect(fmt(STRINGS_EN.letterProfile.relationshipPreview, { relationship: 'fille', ofName: withDe('Anne') })).toBe(
      "Your letters will read: “fille d'Anne”."
    )
  })

  it('le lien annoncé figure tel quel dans le courrier regénéré par le serveur', () => {
    for (const name of ['Anne', 'Hélène', 'Yves', 'Hugues', 'Jean']) {
      const preview = fmt(STRINGS_FR.letterProfile.relationshipPreview, { relationship: 'fille', ofName: withDe(name) })
      const announced = /« (.+) »/.exec(preview)![1]
      const { body } = renderLetter('banque-declaration-deces', {
        organisme_name: 'Banque Populaire',
        user_firstname: 'Camille',
        user_lastname: 'Roussel',
        user_relation: 'fille',
        deceased_firstname: name,
        deceased_lastname: 'Martin',
        deceased_dob: '14/03/1941',
        deceased_dod: '12/09/2026',
        user_address: '18 rue des Tanneurs, 33000 Bordeaux',
        city: 'Bordeaux',
        today_date: '28/09/2026',
      })
      expect(body, name).toContain(`, ${announced} Martin,`)
    }
  })

  it("LetterProfileForm, lecture : « fille d'Anne » et « Date de naissance d’Anne : 14 mars 1941 »", () => {
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
    expect(text).toContain("Vos courriers indiqueront : « fille d'Anne ».")
    expect(text).toContain('Date de naissance d’Anne : 14 mars 1941')
  })

  it('LetterProfileForm, édition : « fille d\'Hélène » et « Date de naissance d’Hélène (facultatif) »', () => {
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
    expect(text).toContain("Vos courriers indiqueront : « fille d'Hélène ».")
    expect(text).toContain('Date de naissance d’Hélène (facultatif)')
  })
})

describe('textes d’interface : « d’ » en français, « of » en anglais', () => {
  it('withDe : apostrophe typographique à la demande (interface FR), règle inchangée', () => {
    expect(withDe('Anne', '’')).toBe('d’Anne')
    expect(withDe('Hélène', '’')).toBe('d’Hélène')
    expect(withDe('Jean', '’')).toBe('de Jean')
    expect(withDe('Hugues', '’')).toBe('de Hugues')
  })

  it('date de naissance du défunt : libellé du champ et résumé', () => {
    const vars = (name: string) => ({ name, ofName: withDe(name, '’'), date: '14 mars 1941' })
    expect(fmt(STRINGS_FR.letterProfile.dobLabel, vars('Anne'))).toBe('Date de naissance d’Anne (facultatif)')
    expect(fmt(STRINGS_FR.letterProfile.dobLabel, vars('Jean'))).toBe('Date de naissance de Jean (facultatif)')
    expect(fmt(STRINGS_EN.letterProfile.dobLabel, vars('Anne'))).toBe('Anne’s date of birth (optional)')
    expect(fmt(STRINGS_FR.letterProfile.dobSummary, vars('Hélène'))).toBe('Date de naissance d’Hélène : 14 mars 1941')
    expect(fmt(STRINGS_FR.letterProfile.dobSummary, vars('Hugues'))).toBe('Date de naissance de Hugues : 14 mars 1941')
    expect(fmt(STRINGS_EN.letterProfile.dobSummary, vars('Hélène'))).toBe('Hélène’s date of birth: 14 mars 1941')
  })

  it('page /bienvenue', () => {
    expect(fmt(STRINGS_FR.consent.deceasedLine, { name: 'Hélène', ofName: withDe('Hélène', '’') })).toBe(
      'Nous sommes à vos côtés pour les démarches liées au décès d’Hélène.'
    )
    expect(fmt(STRINGS_EN.consent.deceasedLine, { name: 'Hélène', ofName: withDe('Hélène', '’') })).toBe(
      'We are by your side for the formalities following the death of Hélène.'
    )
  })

  it('ConsentPage : « …liées au décès d’Hélène. »', () => {
    const text = visibleText(renderToStaticMarkup(h(MemoryRouter, null, h(ConsentPage))))
    expect(text).toContain('Nous sommes à vos côtés pour les démarches liées au décès d’Hélène.')
  })
})

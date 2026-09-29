import { describe, it, expect, afterEach, vi } from 'vitest'
import { buildInitialValues } from '@/hooks/useLetterGenerator'
import { fillLetterPlaceholder, getLetterTemplate } from '@/data/letter-templates'
// @ts-expect-error — module JS serveur
import { renderLetter, fillLetterPlaceholder as fillLetterPlaceholderServer } from '../server/lib/letter-render.js'

// Contrat typographique des courriers, toujours en français et adressés à des organismes :
// - élision de « de » devant le prénom du défunt, au rendu (règle de src/lib/elision.ts, retenue par
//   Arnaud le 2026-09-28) : « fille d'Anne », « fille d'Émile », « fille de Bernard » ; prénom vide :
//   « de » inchangé devant le repli. Apostrophe droite, comme tout le texte des modèles (choix
//   confirmé par Arnaud le 2026-09-29) ;
// - ordinal : le premier du mois s'écrit « 1er » (« né(e) le 1er mars 1941 »), les autres jours en
//   chiffres (« 14 mars 1941 »). Une date seule (AAAA-MM-JJ) reste formatée en UTC : en heure locale,
//   sous un fuseau négatif (Martinique), elle reculerait d'un jour (« 28 février 1941 »).
// Le client pré-remplit les valeurs (buildInitialValues) ; le serveur regénère à partir d'elles le
// corps qui part à l'envoi papier (renderLetter). La parité complète des deux rendus, modèle par
// modèle, est testée dans letter-elision.test.ts.

const TEMPLATE_ID = 'banque-declaration-deces'
const PROFILE = { firstname: 'Camille', lastname: 'Roussel', address: '18 rue des Tanneurs, 33000 Bordeaux', relation: 'fille', city: 'Bordeaux' }
const DECEASED = { deceased_firstname: 'Bernard', deceased_lastname: 'Martin', deceased_dob: '1941-03-14', deceased_dod: '2026-09-12' }

/** Valeurs pré-remplies par le client, puis corps regénéré par le serveur à partir d'elles. */
function sentLetter(deceased: Partial<typeof DECEASED>) {
  const values = buildInitialValues(getLetterTemplate(TEMPLATE_ID)!, PROFILE, { ...DECEASED, ...deceased })
  const { body } = renderLetter(TEMPLATE_ID, { ...values, organisme_name: 'Banque Populaire' })
  return { values, body: body as string }
}

describe('courriers — élision de « de » devant le prénom du défunt', () => {
  it.each([
    ['Anne', "fille d'Anne"],
    ['Émile', "fille d'Émile"],
    ['Bernard', 'fille de Bernard'],
  ])('%s → « %s », côté client comme côté serveur', (name, expected) => {
    const text = 'fille de {{deceased_firstname}}'
    expect(fillLetterPlaceholder(text, 'deceased_firstname', name)).toBe(expected)
    expect(fillLetterPlaceholderServer(text, 'deceased_firstname', name)).toBe(expected)
    expect(sentLetter({ deceased_firstname: name }).body).toContain(`Roussel, ${expected} Martin, né(e) le`)
  })

  it('prénom vide : « de » inchangé, devant le repli dans le courrier', () => {
    const text = 'fille de {{deceased_firstname}}'
    expect(fillLetterPlaceholder(text, 'deceased_firstname', '')).toBe('fille de ')
    expect(fillLetterPlaceholderServer(text, 'deceased_firstname', '')).toBe('fille de ')
    expect(sentLetter({ deceased_firstname: '' }).body).toContain('Roussel, fille de [DECEASED_FIRSTNAME] Martin, né(e) le')
  })
})

describe('courriers — « 1er » pour le premier jour du mois', () => {
  const originalTz = process.env.TZ
  afterEach(() => {
    vi.useRealTimers()
    if (originalTz === undefined) delete process.env.TZ
    else process.env.TZ = originalTz
  })

  describe.each([
    ['fuseau de la machine', undefined],
    ['TZ=America/Martinique (fuseau négatif)', 'America/Martinique'],
  ])('%s', (_label, tz) => {
    it.each([
      ['1941-03-01', '1er mars 1941'],
      ['1941-03-14', '14 mars 1941'],
    ])('naissance le %s → « né(e) le %s »', (iso, expected) => {
      if (tz) process.env.TZ = tz
      const { values, body } = sentLetter({ deceased_dob: iso })
      expect(values.deceased_dob).toBe(expected)
      expect(body).toContain(`né(e) le ${expected}, vous informe`)
    })

    it('décès le 2026-09-01 → « survenu le 1er septembre 2026 »', () => {
      if (tz) process.env.TZ = tz
      const { values, body } = sentLetter({ deceased_dod: '2026-09-01' })
      expect(values.deceased_dod).toBe('1er septembre 2026')
      expect(body).toContain('survenu le 1er septembre 2026.')
    })
  })

  it('date du jour sous la signature : « Bordeaux, le 1er octobre 2026 »', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-01T12:00:00Z')) // midi UTC : le 1er octobre à Paris comme en Martinique
    const { values, body } = sentLetter({})
    expect(values.today_date).toBe('1er octobre 2026')
    expect(body).toContain('Bordeaux, le 1er octobre 2026')
  })
})

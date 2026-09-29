import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import { formatLongDate, type LongDateOptions } from '@/lib/long-date'
// @ts-expect-error — module JS serveur
import { formatLongDate as formatLongDateServer } from '../server/lib/long-date.js'

// Typographie française d'une date en toutes lettres : le premier jour du mois est un ordinal,
// « 1er mars 1941 », jamais « 1 mars 1941 » ; tous les autres jours restent des nombres (« 14 mars »,
// « 21 mars », jamais « 21er »). En anglais (en-GB), jamais d'ordinal : « 1 March 1941 ».

const UTC = { timeZone: 'UTC' } as const

describe('formatLongDate — date en toutes lettres', () => {
  const originalTz = process.env.TZ
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ
    else process.env.TZ = originalTz
  })

  it('premier du mois : « 1er mars 1941 » en français, « 1 March 1941 » en anglais', () => {
    expect(formatLongDate(new Date('1941-03-01'), 'fr', UTC)).toBe('1er mars 1941')
    expect(formatLongDate(new Date('1941-03-01'), 'en', UTC)).toBe('1 March 1941')
  })

  it('autre jour : « 14 mars 1941 », « 14 March 1941 »', () => {
    expect(formatLongDate(new Date('1941-03-14'), 'fr', UTC)).toBe('14 mars 1941')
    expect(formatLongDate(new Date('1941-03-14'), 'en', UTC)).toBe('14 March 1941')
  })

  it('seul le 1 prend « er » : ni « 11er », ni « 21er », ni « 31er » sur tout un mois', () => {
    for (let day = 1; day <= 31; day++) {
      expect(formatLongDate(new Date(Date.UTC(2026, 9, day)), 'fr', UTC)).toBe(`${day === 1 ? '1er' : day} octobre 2026`)
    }
  })

  it('avec l’heure : « 1er octobre 2026 à 14:03 » ; en anglais, le format d’Intl tel quel', () => {
    const at = new Date('2026-10-01T14:03:00Z')
    const withTime = { ...UTC, hour: '2-digit', minute: '2-digit' } as const
    expect(formatLongDate(at, 'fr', withTime)).toBe('1er octobre 2026 à 14:03')
    expect(formatLongDate(at, 'en', withTime)).toBe(
      new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', ...withTime }).format(at)
    )
  })

  it('mois abrégé : « 1er oct. 2026 »', () => {
    expect(formatLongDate(new Date('2026-10-01'), 'fr', { ...UTC, month: 'short' })).toBe('1er oct. 2026')
  })

  it('options refusées au typage : dateStyle et timeStyle (TypeError d’Intl), jour (« 01 », sans ordinal)', () => {
    const at = new Date('2026-10-01T12:00:00Z')
    // @ts-expect-error — timeStyle ne se combine pas avec le jour, le mois et l'année du format par défaut
    expect(() => formatLongDate(at, 'fr', { timeStyle: 'short' })).toThrow(TypeError)
    // @ts-expect-error — dateStyle non plus
    expect(() => formatLongDate(at, 'fr', { dateStyle: 'medium' })).toThrow(TypeError)
    // @ts-expect-error — le jour est fixé par le helper : « 2-digit » écrirait « 01 octobre 2026 »
    expect(formatLongDate(at, 'fr', { day: '2-digit' })).not.toContain('1er')
  })

  it('le jour est celui du fuseau demandé : le 30/09 à 23 h 30 UTC est le « 1er octobre 2026 » à Paris', () => {
    const at = new Date('2026-09-30T23:30:00Z')
    expect(formatLongDate(at, 'fr', { timeZone: 'Europe/Paris' })).toBe('1er octobre 2026')
    expect(formatLongDate(at, 'fr', UTC)).toBe('30 septembre 2026')
  })

  it('sous TZ=America/Martinique : une date seule formatée en UTC reste le 1er, jamais la veille', () => {
    process.env.TZ = 'America/Martinique'
    // Sentinelle : le processus est bien à UTC−4 (sinon ce cas passerait à vide, ses dates étant en UTC).
    expect(new Date('1941-03-01').getDate()).toBe(28)
    expect(formatLongDate(new Date('1941-03-01'), 'fr', UTC)).toBe('1er mars 1941')
    expect(formatLongDate(new Date('1941-03-14'), 'fr', UTC)).toBe('14 mars 1941')
    // Jour calendaire construit en heure locale (formatDay de la liste PF) : formaté en heure locale.
    expect(formatLongDate(new Date(1941, 2, 1), 'fr')).toBe('1er mars 1941')
  })
})

describe('formatLongDate — parité client ↔ serveur', () => {
  it('même texte pour chaque date, langue et option', () => {
    const DATES = ['1941-03-01', '1941-03-14', '2000-02-29', '2026-09-30T23:30:00Z', '2026-10-01T14:03:00Z']
    const OPTIONS: LongDateOptions[] = [
      {},
      UTC,
      { timeZone: 'Europe/Paris' },
      { ...UTC, hour: '2-digit', minute: '2-digit' },
      { ...UTC, month: 'short' },
    ]
    for (const iso of DATES) {
      for (const lang of ['fr', 'en'] as const) {
        for (const options of OPTIONS) {
          const date = new Date(iso)
          expect(formatLongDateServer(date, lang, options), `${iso}, ${lang}, ${JSON.stringify(options)}`).toBe(
            formatLongDate(date, lang, options)
          )
        }
      }
    }
  })
})

// Garde : une date au mois écrit en lettres, formatée directement par Intl (month long, short ou
// narrow ; dateStyle medium, long ou full), écrirait « 1 mars » ou « 1 oct. ». Toute nouvelle date de
// ce genre passe par formatLongDate (qui accepte month: 'short'), ou s'ajoute ci-dessous avec sa raison.
describe('garde — les dates en toutes lettres passent toutes par formatLongDate', () => {
  const ROOT = path.resolve(__dirname, '..')
  const EXEMPT: Record<string, string> = {
    'src/lib/long-date.ts': 'le formateur lui-même',
    'server/lib/long-date.js': 'son miroir serveur',
    'src/pages/AccessPage.tsx': 'produit transmission gelé au chantier 0 (lecture seule) : hors périmètre',
  }
  const LONG_DATE_RE = /month:\s*['"](?:long|short|narrow)['"]|dateStyle:\s*['"](?:medium|long|full)['"]/

  it('aucune autre occurrence dans src/ ni dans server/', () => {
    const offenders = ['src', 'server'].flatMap((dir) =>
      readdirSync(path.join(ROOT, dir), { recursive: true })
        .map((file) => `${dir}/${String(file).split(path.sep).join('/')}`)
        .filter((file) => /\.[cm]?[jt]sx?$/.test(file) && !(file in EXEMPT))
        .filter((file) => LONG_DATE_RE.test(readFileSync(path.join(ROOT, file), 'utf8')))
    )
    expect(offenders).toEqual([])
  })
})

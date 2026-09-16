import { describe, it, expect, beforeEach, vi } from 'vitest'
import { detectLang, fmt } from '../src/i18n'
import { STRINGS_FR } from '../src/i18n/strings.fr'
import { STRINGS_EN } from '../src/i18n/strings.en'

describe('detectLang', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue(null), setItem: vi.fn() })
    vi.stubGlobal('navigator', { language: 'fr-FR' })
  })
  it('device anglais → en (en-US, en-GB)', () => {
    vi.stubGlobal('navigator', { language: 'en-US' })
    expect(detectLang()).toBe('en')
    vi.stubGlobal('navigator', { language: 'en-GB' })
    expect(detectLang()).toBe('en')
  })
  it('device français ou autre → fr', () => {
    expect(detectLang()).toBe('fr')
    vi.stubGlobal('navigator', { language: 'de-DE' })
    expect(detectLang()).toBe('fr')
  })
  it('le choix persisté prime sur le device', () => {
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue('fr'), setItem: vi.fn() })
    vi.stubGlobal('navigator', { language: 'en-US' })
    expect(detectLang()).toBe('fr')
  })
  it('environnement sans navigator (SSR/tests) → fr sans crash', () => {
    vi.stubGlobal('navigator', undefined)
    vi.stubGlobal('localStorage', undefined)
    expect(detectLang()).toBe('fr')
  })
})

describe('fmt', () => {
  it('interpole {name} et laisse les accolades inconnues', () => {
    expect(fmt('Hello {name}, {n} steps', { name: 'Pierre', n: 40 })).toBe('Hello Pierre, 40 steps')
    expect(fmt('Rien à faire', {})).toBe('Rien à faire')
  })
})

// Pages légales publiées (/legal et /security). tsc garantit la parité des CLÉS (STRINGS_EN est
// typé `Strings`), mais `blocks` n'est pas un tuple : un bloc manquant, un paragraphe fusionné ou
// une puce oubliée côté EN passerait le type-check sans bruit. Ces assertions verrouillent ce que
// la revue du lot TEXTES avait dû contrôler à la main, bloc par bloc.
const PAGES = ['legal', 'security'] as const

const paragraphsOf = (body: string) => body.split('\n\n').filter((p) => p.trim() !== '')
const bulletsOf = (body: string) => body.split('\n').filter((l) => l.trimStart().startsWith('•'))
const sectionNumberOf = (heading: string) => heading.match(/^\d+(?:\.\d+)?/)?.[0] ?? null

const shapeOf = (blocks: ReadonlyArray<{ heading: string; body: string }>) =>
  blocks.map((b) => ({
    section: sectionNumberOf(b.heading),
    paragraphs: paragraphsOf(b.body).length,
    bullets: bulletsOf(b.body).length,
  }))

describe('parité FR/EN des pages légales', () => {
  for (const page of PAGES) {
    it(`${page} : mêmes blocs en FR et en EN (numéro de section, paragraphes, puces)`, () => {
      const fr = shapeOf(STRINGS_FR.legalPages[page].blocks)
      const en = shapeOf(STRINGS_EN.legalPages[page].blocks)
      expect(fr.length).toBeGreaterThan(0)
      expect(en).toEqual(fr)
    })
  }

  it('aucun marqueur d’identité resté en français dans la version EN', () => {
    for (const page of PAGES) {
      for (const block of STRINGS_EN.legalPages[page].blocks) {
        expect(block.body, `bloc « ${block.heading} »`).not.toContain('à compléter')
      }
    }
  })
})

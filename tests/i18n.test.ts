import { describe, it, expect, beforeEach, vi } from 'vitest'
import { detectLang, fmt } from '../src/i18n'

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

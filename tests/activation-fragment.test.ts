import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  captureActivationFragment, getActivationToken, clearActivationToken, scrubActivationFragment,
} from '@/lib/activation-fragment'

const TOKEN = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'

function stubWindow(hash: string, pathname = '/activation', search = '') {
  const replaceState = vi.fn()
  vi.stubGlobal('window', { location: { hash, pathname, search }, history: { state: { key: 'k' }, replaceState } })
  return replaceState
}

beforeEach(() => clearActivationToken())
afterEach(() => vi.unstubAllGlobals())

describe('captureActivationFragment', () => {
  it('jeton valide : mémorisé, fragment effacé (state conservé, chemin + query conservés)', () => {
    const replaceState = stubWindow(`#t=${TOKEN}`, '/activation', '?lang=fr')
    captureActivationFragment()
    expect(getActivationToken()).toBe(TOKEN)
    expect(replaceState).toHaveBeenCalledWith({ key: 'k' }, '', '/activation?lang=fr')
  })
  it.each([['#t=trop-court'], ['#t=' + TOKEN + 'X'], ['#t=' + '+'.repeat(43)], ['#t=']])('fragment #t= invalide (%s) : rien mémorisé, MAIS toujours effacé', (hash) => {
    const replaceState = stubWindow(hash)
    captureActivationFragment()
    expect(getActivationToken()).toBeNull()
    expect(replaceState).toHaveBeenCalledTimes(1)
  })
  it('autre fragment (#section) : ni mémorisé ni effacé', () => {
    const replaceState = stubWindow('#section')
    captureActivationFragment()
    expect(getActivationToken()).toBeNull()
    expect(replaceState).not.toHaveBeenCalled()
  })
  it('lecture non destructive (StrictMode) puis clearActivationToken', () => {
    stubWindow(`#t=${TOKEN}`)
    captureActivationFragment()
    expect(getActivationToken()).toBe(TOKEN)
    expect(getActivationToken()).toBe(TOKEN)
    clearActivationToken()
    expect(getActivationToken()).toBeNull()
  })
  it('sans window (SSR/tests) : aucune exception', () => {
    vi.stubGlobal('window', undefined)
    expect(() => captureActivationFragment()).not.toThrow()
  })
})

describe('scrubActivationFragment', () => {
  it('remplace tout #t=… par #t=[scrubbed]', () => {
    expect(scrubActivationFragment(`https://app.seren-app.fr/activation#t=${TOKEN} puis #t=abc`))
      .toBe('https://app.seren-app.fr/activation#t=[scrubbed] puis #t=[scrubbed]')
  })
})

describe('src/main.tsx — ordre contractuel (§6)', () => {
  const source = readFileSync(path.join(process.cwd(), 'src/main.tsx'), 'utf8')
  it('captureActivationFragment() est la PREMIÈRE instruction, avant initSentry() et initPosthog()', () => {
    const body = source.split('\n').filter((line) => line.trim() && !line.trim().startsWith('import') && !line.trim().startsWith('//'))
    expect(body[0].trim()).toBe('captureActivationFragment()')
    expect(source.indexOf('captureActivationFragment()')).toBeLessThan(source.indexOf('initSentry()'))
    expect(source.indexOf('initSentry()')).toBeLessThan(source.indexOf('initPosthog()'))
  })
})

describe('src/lib/sentry.ts — scrub branché', () => {
  it('beforeSend et beforeBreadcrumb utilisent scrubActivationFragment', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/lib/sentry.ts'), 'utf8')
    expect(source).toMatch(/beforeSend\(/)
    expect(source).toMatch(/beforeBreadcrumb\(/)
    expect(source.match(/scrubActivationFragment\(/g)?.length ?? 0).toBeGreaterThanOrEqual(4)
  })
})

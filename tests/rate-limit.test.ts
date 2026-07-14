import { describe, it, expect, vi, afterEach } from 'vitest'
// @ts-expect-error — module JS serveur
import { createUserRateLimiter } from '../server/lib/rate-limit.js'

afterEach(() => vi.useRealTimers())

describe('createUserRateLimiter', () => {
  it('laisse passer jusqu’à la limite puis 429, par utilisateur', () => {
    const limiter = createUserRateLimiter({ max: 2, windowMs: 60_000 })
    const res = { statusCode: 200, body: null as unknown, status(c: number) { this.statusCode = c; return this }, json(b: unknown) { this.body = b; return this } }
    const call = (userId: string) => {
      const r = { ...res, statusCode: 200 }
      let passed = false
      limiter({ user: { id: userId } }, r, () => { passed = true })
      return passed ? 200 : r.statusCode
    }
    expect(call('u1')).toBe(200)
    expect(call('u1')).toBe(200)
    expect(call('u1')).toBe(429)
    expect(call('u2')).toBe(200) // isolation par utilisateur
  })
  it('la fenêtre glissante libère après windowMs', () => {
    vi.useFakeTimers()
    const limiter = createUserRateLimiter({ max: 1, windowMs: 1000 })
    const pass = () => { let ok = false; limiter({ user: { id: 'u' } }, { status: () => ({ json: () => {} }) }, () => { ok = true }); return ok }
    expect(pass()).toBe(true)
    expect(pass()).toBe(false)
    vi.advanceTimersByTime(1100)
    expect(pass()).toBe(true)
  })
  // i18n (Task 4) : `message` accepte une fonction (req) => string — le limiter de /start
  // s'en sert pour traduire le 429 selon req.body.lang, connu avant le chargement de session.
  const langMessage = (req: { body?: { lang?: string } }) => (req.body?.lang === 'en' ? 'EN msg' : 'FR msg')
  const call429 = (limiter: (req: object, res: object, next: () => void) => void, req: object) => {
    const r = { statusCode: 200, body: null as unknown, status(c: number) { this.statusCode = c; return this }, json(b: unknown) { this.body = b; return this } }
    let passed = false
    limiter(req, r, () => { passed = true })
    return { passed, statusCode: r.statusCode, body: r.body as { error?: string } | null }
  }
  it('message fonction : évaluée avec la requête au moment du 429 (lang:en → message EN)', () => {
    const limiter = createUserRateLimiter({ max: 1, windowMs: 60_000, message: langMessage })
    expect(call429(limiter, { user: { id: 'u' }, body: { lang: 'en' } }).passed).toBe(true) // sous la limite
    const blocked = call429(limiter, { user: { id: 'u' }, body: { lang: 'en' } })
    expect(blocked.passed).toBe(false)
    expect(blocked.statusCode).toBe(429)
    expect(blocked.body?.error).toBe('EN msg')
  })
  it('message fonction : requête sans body → repli FR', () => {
    const limiter = createUserRateLimiter({ max: 1, windowMs: 60_000, message: langMessage })
    expect(call429(limiter, { user: { id: 'u' } }).passed).toBe(true)
    const blocked = call429(limiter, { user: { id: 'u' } })
    expect(blocked.passed).toBe(false)
    expect(blocked.statusCode).toBe(429)
    expect(blocked.body?.error).toBe('FR msg')
  })
})

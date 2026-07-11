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
})

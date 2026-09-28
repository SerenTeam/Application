import { describe, it, expect, vi, beforeEach } from 'vitest'

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }))
vi.mock('@sentry/react', () => ({ captureException, init: vi.fn() }))

import { nullOnError } from '@/lib/sentry'

describe('nullOnError — lecture non bloquante mais jamais silencieuse', () => {
  beforeEach(() => captureException.mockClear())

  it('laisse passer la valeur (null compris) sans rien signaler', async () => {
    await expect(nullOnError(Promise.resolve(42))).resolves.toBe(42)
    await expect(nullOnError(Promise.resolve(null))).resolves.toBeNull()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('remplace un échec par null et le signale à Sentry', async () => {
    const err = new Error('column sender_profiles.first_name does not exist')
    await expect(nullOnError(Promise.reject(err))).resolves.toBeNull()
    expect(captureException).toHaveBeenCalledTimes(1)
    expect(captureException).toHaveBeenCalledWith(err)
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { sha256Hex } from '@/lib/activation-token'

type Vector = { token: string; hash: string }
const VECTORS: Vector[] = JSON.parse(readFileSync(path.join(process.cwd(), 'tests/fixtures/invite-token-vector.json'), 'utf8'))

describe('sha256Hex (WebCrypto) — identique au hash Node du serveur', () => {
  it.each(VECTORS)('$token → $hash', async ({ token, hash }) => {
    await expect(sha256Hex(token)).resolves.toBe(hash)
  })
  it('hexadécimal minuscule de 64 caractères', async () => {
    expect(await sha256Hex('x')).toMatch(/^[0-9a-f]{64}$/)
  })
})

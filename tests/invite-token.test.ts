import { describe, it, expect, vi, afterEach } from 'vitest'
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
// @ts-expect-error — module JS serveur
import { generateInviteToken, hashInviteToken, isInviteToken, isTokenHash } from '../server/lib/invite-token.js'

type Vector = { token: string; token_bytes_hex: string; hash: string }
const VECTORS: Vector[] = JSON.parse(readFileSync(path.join(process.cwd(), 'tests/fixtures/invite-token-vector.json'), 'utf8'))

afterEach(() => vi.restoreAllMocks())

describe('jeton d’activation (contrat §6)', () => {
  it.each(VECTORS)('hash sha256 hex des octets UTF-8 de la chaîne base64url ($token)', ({ token, hash }) => {
    expect(hashInviteToken(token)).toBe(hash)
  })
  it.each(VECTORS)('generateInviteToken = base64url de randomBytes(32) ($token)', ({ token, token_bytes_hex }) => {
    vi.spyOn(crypto, 'randomBytes').mockImplementation((() => Buffer.from(token_bytes_hex, 'hex')) as never)
    expect(generateInviteToken()).toBe(token)
    expect(crypto.randomBytes).toHaveBeenCalledWith(32)
  })
  it('1 000 jetons réels : 43 caractères base64url, tous distincts', () => {
    const tokens = Array.from({ length: 1000 }, () => generateInviteToken())
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(new Set(tokens).size).toBe(1000)
  })
  it('isInviteToken / isTokenHash : motifs exacts, types refusés', () => {
    expect(isInviteToken(VECTORS[0].token)).toBe(true)
    expect(isInviteToken(VECTORS[0].token + 'A')).toBe(false)
    expect(isInviteToken('+'.repeat(43))).toBe(false)
    expect(isInviteToken(undefined)).toBe(false)
    expect(isTokenHash(VECTORS[0].hash)).toBe(true)
    expect(isTokenHash(VECTORS[0].hash.toUpperCase())).toBe(false)
    expect(isTokenHash(VECTORS[0].hash.slice(1))).toBe(false)
    expect(isTokenHash(42)).toBe(false)
  })
})

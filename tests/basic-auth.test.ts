import { describe, it, expect } from 'vitest'
// @ts-expect-error — module JS serveur
import { createBasicAuthGate } from '../server/lib/basic-auth.js'

type FakeRes = {
  statusCode: number
  headers: Record<string, string>
  body: unknown
  set(name: string, value: string): FakeRes
  status(code: number): FakeRes
  send(body: unknown): FakeRes
}

function makeRes(): FakeRes {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    set(name: string, value: string) { this.headers[name] = value; return this },
    status(code: number) { this.statusCode = code; return this },
    send(body: unknown) { this.body = body; return this },
  }
}

function call(gate: (req: unknown, res: unknown, next: () => void) => void, path: string, authorization?: string) {
  const req = { path, headers: authorization ? { authorization } : {} }
  const res = makeRes()
  let passed = false
  gate(req, res, () => { passed = true })
  return { passed, res }
}

const basic = (user: string, password: string) =>
  'Basic ' + Buffer.from(`${user}:${password}`).toString('base64')

describe('createBasicAuthGate', () => {
  it('désactivée sans mot de passe configuré : tout passe', () => {
    const gate = createBasicAuthGate({ password: undefined })
    expect(call(gate, '/').passed).toBe(true)
    expect(call(gate, '/dashboard').passed).toBe(true)
  })

  it('sans identifiants → 401 avec WWW-Authenticate (popup navigateur)', () => {
    const gate = createBasicAuthGate({ password: 'secret' })
    const { passed, res } = call(gate, '/')
    expect(passed).toBe(false)
    expect(res.statusCode).toBe(401)
    expect(res.headers['WWW-Authenticate']).toContain('Basic realm=')
  })

  it('mauvais identifiants → 401 ; bons identifiants → passe', () => {
    const gate = createBasicAuthGate({ user: 'seren', password: 'secret' })
    expect(call(gate, '/', basic('seren', 'faux')).passed).toBe(false)
    expect(call(gate, '/', basic('intrus', 'secret')).passed).toBe(false)
    expect(call(gate, '/', basic('seren', 'secret')).passed).toBe(true)
  })

  it("un mot de passe contenant ':' fonctionne", () => {
    const gate = createBasicAuthGate({ user: 'seren', password: 'a:b:c' })
    expect(call(gate, '/', basic('seren', 'a:b:c')).passed).toBe(true)
  })

  it("l'API n'est pas concernée : elle garde son auth Bearer propre", () => {
    const gate = createBasicAuthGate({ password: 'secret' })
    expect(call(gate, '/api/questionnaire/start').passed).toBe(true)
    expect(call(gate, '/api/auth/login').passed).toBe(true)
    // mais la racine et les assets restent protégés
    expect(call(gate, '/assets/index.js').passed).toBe(false)
  })
})

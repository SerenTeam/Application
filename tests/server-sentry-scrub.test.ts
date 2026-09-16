import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
// @ts-expect-error — module JS serveur
import { scrubSentryEvent } from '../server/lib/sentry-scrub.js'

const TOKEN = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'
const HASH = 'ea866a757e4c38babfa8127cbe9a409d3e1f93a00ff1488ff735fcf917afffd0'

describe('scrubSentryEvent', () => {
  it('fragment #t= remplacé dans message, exception.values[].value et request.url', () => {
    const event = scrubSentryEvent({
      message: `échec https://app.seren-app.fr/activation#t=${TOKEN}`,
      exception: { values: [{ type: 'Error', value: `lien #t=${TOKEN} refusé` }] },
      request: { url: `https://app.seren-app.fr/activation#t=${TOKEN}` },
    })
    const json = JSON.stringify(event)
    expect(json).not.toContain(TOKEN)
    expect(event.message).toContain('#t=[scrubbed]')
    expect(event.exception.values[0].value).toContain('#t=[scrubbed]')
    expect(event.request.url).toBe('https://app.seren-app.fr/activation#t=[scrubbed]')
  })
  it.each(['/api/activation/check', '/api/activation/claim', '/api/partner/dossiers', '/api/partner/dossiers/xyz/resend'])(
    '%s : request.data, query_string, cookies et authorization supprimés',
    (route) => {
      const event = scrubSentryEvent({
        request: { url: `https://app.seren-app.fr${route}`, data: { token_hash: HASH, family_email: 'claire@exemple.fr' },
          query_string: 'lang=fr', cookies: { a: 'b' }, headers: { Authorization: 'Bearer eyJ', 'user-agent': 'x' } },
      })
      expect(event.request.data).toBeUndefined()
      expect(event.request.query_string).toBeUndefined()
      expect(event.request.cookies).toBeUndefined()
      expect(event.request.headers.Authorization).toBeUndefined()
      expect(event.request.headers['user-agent']).toBe('x')
    },
  )
  it('autres routes : corps conservé, mais clés sensibles masquées à toute profondeur', () => {
    const event = scrubSentryEvent({
      request: { url: 'https://app.seren-app.fr/api/letters/send', data: { template_id: 'x', nested: { invite_token_hash: HASH } } },
      extra: { activation_url: `https://app.seren-app.fr/activation#t=${TOKEN}`, list: [{ token_hash: HASH }] },
      breadcrumbs: [{ data: { url: `/activation#t=${TOKEN}` } }],
    })
    expect(event.request.data.template_id).toBe('x')
    expect(event.request.data.nested.invite_token_hash).toBe('[scrubbed]')
    expect(event.extra.activation_url).toBe('[scrubbed]')
    expect(event.extra.list[0].token_hash).toBe('[scrubbed]')
    expect(JSON.stringify(event)).not.toContain(TOKEN)
    expect(JSON.stringify(event)).not.toContain(HASH)
  })
  it('renvoie toujours l’événement (on masque, on ne jette pas)', () => {
    const event = { message: 'ok' }
    expect(scrubSentryEvent(event)).toBe(event)
  })
})

describe('server.js — Sentry.init branché sur scrubSentryEvent', () => {
  it('beforeSend appelle scrubSentryEvent', () => {
    const source = readFileSync(path.join(process.cwd(), 'server/server.js'), 'utf8')
    expect(source).toMatch(/beforeSend:\s*\(event\)\s*=>\s*scrubSentryEvent\(event\)/)
  })
})

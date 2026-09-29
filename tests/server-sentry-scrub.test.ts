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
  it.each([
    '/api/activation/check', '/api/activation/claim', '/api/partner/dossiers', '/api/partner/dossiers/xyz/resend',
    '/api/questionnaire/start', '/api/questionnaire/answer', '/api/questionnaire/reask',
    '/api/questionnaire/resume', '/api/questionnaire/complete',
    // Préfixe : tout /api/letters/*, y compris une route qui n'existe pas encore.
    '/api/letters/send', '/api/letters/xyz',
  ])(
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
  // @sentry/node 10 joint le corps BRUT de la requête entrante (chaîne JSON, ≤ 10 ko) à tout
  // événement capturé pendant la requête, même avec sendDefaultPii: false. Or /answer transporte
  // l'identité du défunt et des données de santé (aides_percues : APA, ASH, AAH/PCH ; logement : EHPAD).
  it('/api/questionnaire/answer : le corps brut ne part plus (aucune réponse dans l’événement)', () => {
    const body = JSON.stringify({ session_id: 'sess-1', question_id: 'aides_percues', value: ['apa', 'handicap'], lang: 'fr' })
    const event = scrubSentryEvent({
      request: { method: 'POST', url: 'https://app.seren-app.fr/api/questionnaire/answer', data: body },
    })
    expect(event.request.data).toBeUndefined()
    const json = JSON.stringify(event)
    expect(json).not.toContain('aides_percues')
    expect(json).not.toContain('handicap')
  })
  // Même mécanisme pour les courriers : POST /api/letters/send transporte les variables du courrier
  // (identité du défunt, nom et adresse de l'expéditeur, numéro d'abonné), l'adresse du destinataire
  // et le modèle, qui peut révéler une donnée de santé (aides-departement, ehpad-fin-contrat).
  it('/api/letters/send : le corps brut ne part plus (variables, destinataire, modèle)', () => {
    const body = JSON.stringify({
      template_id: 'aides-departement',
      variables: { deceased_lastname: 'Roussel', sender_address: '12 rue des Lilas, 33000 Bordeaux', subscriber_number: 'AB-123' },
      recipient: { name: 'Conseil départemental', address_line1: '1 esplanade Charles-de-Gaulle', postal_code: '33000', city: 'Bordeaux' },
    })
    const event = scrubSentryEvent({
      request: { method: 'POST', url: 'https://app.seren-app.fr/api/letters/send', data: body },
    })
    expect(event.request.data).toBeUndefined()
    const json = JSON.stringify(event)
    for (const leak of ['aides-departement', 'Roussel', 'rue des Lilas', 'AB-123', 'Charles-de-Gaulle']) {
      expect(json).not.toContain(leak)
    }
  })
  // Le SDK joint TOUS les en-têtes de la requête entrante, cookies compris (aussi analysés dans
  // request.cookies), sur toutes les routes : le jeton Bearer, ou les identifiants Basic de la préprod.
  it.each([
    ['route non sensible', 'https://app.seren-app.fr/api/me'],
    ['page servie derrière la Basic Auth de la préprod', 'https://preprod-app.seren-app.fr/dashboard'],
    ['événement sans URL', undefined],
  ])('%s : en-têtes Authorization et Cookie, et cookies analysés, toujours retirés', (_label, url) => {
    const event = scrubSentryEvent({
      request: {
        url,
        headers: { authorization: 'Bearer eyJ', Cookie: 'sb-access-token=COOKIE', 'user-agent': 'x' },
        cookies: { 'sb-access-token': 'COOKIE' },
      },
    })
    expect(event.request.headers).toEqual({ 'user-agent': 'x' })
    expect(event.request.cookies).toBeUndefined()
    expect(JSON.stringify(event)).not.toMatch(/eyJ|COOKIE/)
  })
  it('route non sensible : corps et query string conservés, clés sensibles masquées à toute profondeur', () => {
    const event = scrubSentryEvent({
      request: {
        url: 'https://app.seren-app.fr/api/payments/checkout-extra-send?lang=fr',
        data: { template_id: 'x', nested: { invite_token_hash: HASH } },
        query_string: 'lang=fr',
        headers: { 'user-agent': 'x', 'content-type': 'application/json', Authorization: 'Bearer eyJ' },
      },
      extra: { activation_url: `https://app.seren-app.fr/activation#t=${TOKEN}`, list: [{ token_hash: HASH }] },
      breadcrumbs: [{ data: { url: `/activation#t=${TOKEN}` } }],
    })
    expect(event.request.data.template_id).toBe('x')
    expect(event.request.query_string).toBe('lang=fr')
    expect(event.request.headers).toEqual({ 'user-agent': 'x', 'content-type': 'application/json' })
    expect(event.request.data.nested.invite_token_hash).toBe('[scrubbed]')
    expect(event.extra.activation_url).toBe('[scrubbed]')
    expect(event.extra.list[0].token_hash).toBe('[scrubbed]')
    expect(JSON.stringify(event)).not.toContain(TOKEN)
    expect(JSON.stringify(event)).not.toContain(HASH)
  })
  // Le webhook MySendingBox est gardé par un secret d'URL (POST /api/letters/provider-webhook/:secret,
  // lot 2a) : le SDK le recopie dans request.url ET dans le nom de transaction de tout événement
  // capturé pendant la requête (constat sur l'enveloppe remise au transport, SDK 10.68.0).
  it('secret d’URL du webhook MySendingBox masqué dans l’URL, la transaction et toute chaîne', () => {
    const SECRET = 'msb-url-secret-42'
    const event = scrubSentryEvent({
      transaction: `POST /api/letters/provider-webhook/${SECRET}`,
      request: { method: 'POST', url: `https://app.seren-app.fr/api/letters/provider-webhook/${SECRET}` },
      breadcrumbs: [{ message: `POST /api/letters/provider-webhook/${SECRET}?retry=1` }],
    })
    expect(JSON.stringify(event)).not.toContain(SECRET)
    expect(event.transaction).toBe('POST /api/letters/provider-webhook/[scrubbed]')
    expect(event.request.url).toBe('https://app.seren-app.fr/api/letters/provider-webhook/[scrubbed]')
    expect(event.breadcrumbs[0].message).toBe('POST /api/letters/provider-webhook/[scrubbed]?retry=1')
  })
  // Produit transmission (gelé, lecture seule) : GET /api/transmission/:code porte le code d'accès dans
  // le chemin et capture ses erreurs, que le SDK recopie donc dans request.url ET le nom de transaction.
  // Express route sans tenir compte de la casse : /API/Transmission/<code> atteint la même route et
  // capture de même (constat sur l'enveloppe remise au transport, SDK 10.68.0).
  it.each(['/api/transmission/', '/API/Transmission/'])(
    'code d’accès transmission masqué dans l’URL, la transaction et toute chaîne (%s)',
    (prefix) => {
      const CODE = 'Zq7Kx9Wm'
      const event = scrubSentryEvent({
        transaction: `GET ${prefix}${CODE}`,
        request: { method: 'GET', url: `https://app.seren-app.fr${prefix}${CODE}` },
        breadcrumbs: [{ category: 'http', data: { url: `https://app.seren-app.fr${prefix}${CODE}?lang=fr` } }],
      })
      expect(JSON.stringify(event)).not.toContain(CODE)
      expect(event.transaction).toBe(`GET ${prefix}[code]`)
      expect(event.request.url).toBe(`https://app.seren-app.fr${prefix}[code]`)
      expect(event.breadcrumbs[0].data.url).toBe(`https://app.seren-app.fr${prefix}[code]?lang=fr`)
    },
  )
  it('/api/user/transmission (route sœur, sans code) : inchangée', () => {
    const event = scrubSentryEvent({
      transaction: 'GET /api/user/transmission',
      request: { method: 'GET', url: 'https://app.seren-app.fr/api/user/transmission' },
    })
    expect(event.transaction).toBe('GET /api/user/transmission')
    expect(event.request.url).toBe('https://app.seren-app.fr/api/user/transmission')
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
  // Première barrière, en amont du scrub : le SDK ne lit plus du tout le corps des requêtes entrantes
  // (option de @sentry/node 10, défaut 'medium' : jusqu'à 10 ko joints à tout événement).
  it('intégration http : aucun corps de requête entrante capturé', () => {
    const source = readFileSync(path.join(process.cwd(), 'server/server.js'), 'utf8')
    expect(source).toMatch(/integrations:\s*\[\s*Sentry\.httpIntegration\(\{\s*maxIncomingRequestBodySize:\s*'none'\s*\}\)\s*\]/)
  })
})

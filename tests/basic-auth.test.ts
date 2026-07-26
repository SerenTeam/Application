import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
// @ts-expect-error — module JS serveur
import { createBasicAuthGate } from '../server/lib/basic-auth.js'

// Porte d'accès des environnements non publics (préprod, staging). Le test qui compte vraiment
// est le dernier : /api/* ne doit JAMAIS être gaté, sinon les webhooks signés (Stripe, Resend)
// se prendraient un 401 — ils n'ont aucun identifiant Basic à présenter, et Stripe réessaierait
// en boucle sans que rien ne soit jamais encaissé.

function makeApp(opts: Parameters<typeof createBasicAuthGate>[0]) {
  const app = express()
  app.use(createBasicAuthGate(opts))
  app.get('/', (_req, res) => res.send('page'))
  app.post('/api/payments/webhook', (_req, res) => res.json({ ok: true }))
  return app
}

const creds = (u: string, p: string) => `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`

describe('porte d’accès Basic Auth', () => {
  it('sans SITE_PASSWORD : totalement inerte (comportement de la production)', async () => {
    const app = makeApp({ password: undefined })
    expect((await request(app).get('/')).status).toBe(200)
  })

  it('avec mot de passe, sans identifiants : 401 + WWW-Authenticate', async () => {
    const app = makeApp({ user: 'seren', password: 'secret' })
    const res = await request(app).get('/')
    expect(res.status).toBe(401)
    expect(res.headers['www-authenticate']).toContain('Basic realm="Seren"')
  })

  it('bons identifiants : 200', async () => {
    const app = makeApp({ user: 'seren', password: 'secret' })
    expect((await request(app).get('/').set('Authorization', creds('seren', 'secret'))).status).toBe(200)
  })

  it('mauvais mot de passe, mauvais utilisateur, schéma inconnu : 401', async () => {
    const app = makeApp({ user: 'seren', password: 'secret' })
    expect((await request(app).get('/').set('Authorization', creds('seren', 'faux'))).status).toBe(401)
    expect((await request(app).get('/').set('Authorization', creds('autre', 'secret'))).status).toBe(401)
    expect((await request(app).get('/').set('Authorization', 'Bearer jeton')).status).toBe(401)
  })

  it('les routes /api/* ne sont JAMAIS gatées — les webhooks signés doivent passer', async () => {
    const app = makeApp({ user: 'seren', password: 'secret' })
    const res = await request(app).post('/api/payments/webhook').send({})
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })
})

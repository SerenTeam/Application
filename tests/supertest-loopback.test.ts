import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import http from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'

// Garde-fou de tests/setup/supertest-loopback.ts (flake « expected 404 to be … » en suite complète
// sur macOS) : le serveur éphémère de supertest doit écouter sur 127.0.0.1 EXACTEMENT, jamais sur
// `::` en double pile — sinon un listener IPv4 tenant déjà le même port (en pratique celui d'un
// autre process) capte la connexion vers 127.0.0.1 et répond à la place de l'app testée. Le reste du
// cycle supertest doit rester celui d'origine : ces cas le verrouillent, le setup étant global.

function whoAmIApp(server: () => http.Server) {
  const app = express()
  app.get('/whoami', (req, res) => {
    res.json({ bound: server().address(), local: req.socket.localAddress, localPort: req.socket.localPort })
  })
  return app
}

describe('supertest — serveur éphémère lié à 127.0.0.1', () => {
  it("écoute sur 127.0.0.1 exactement (pas '::') et sert lui-même la requête", async () => {
    let server!: http.Server
    server = http.createServer(whoAmIApp(() => server))
    const res = await request(server).get('/whoami')
    expect(res.status).toBe(200)
    expect(res.body.bound).toMatchObject({ address: '127.0.0.1', family: 'IPv4' })
    expect(res.body.local).toBe('127.0.0.1')
    expect(res.body.localPort).toBe(res.body.bound.port)
  })

  it('referme le serveur éphémère après la réponse (comportement supertest conservé)', async () => {
    let server!: http.Server
    server = http.createServer(whoAmIApp(() => server))
    await request(server).get('/whoami')
    expect(server.listening).toBe(false)
  })

  it('style callback : .expect() puis .end(cb) fonctionnent toujours', async () => {
    let server!: http.Server
    server = http.createServer(whoAmIApp(() => server))
    const body = await new Promise<{ bound: AddressInfo }>((resolve, reject) => {
      request(server)
        .get('/whoami')
        .expect(200)
        .end((err, res) => (err ? reject(err) : resolve(res.body)))
    })
    expect(body.bound.address).toBe('127.0.0.1')
  })

  it('les redirections sont toujours suivies (.redirects)', async () => {
    const app = express()
    app.get('/old', (_req, res) => res.redirect(302, '/new'))
    app.get('/new', (_req, res) => res.json({ at: 'new' }))
    const res = await request(app).get('/old').redirects(1)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ at: 'new' })
  })

  it('une erreur synchrone de superagent (en-tête invalide) rejette la requête au lieu de la bloquer', async () => {
    const server = http.createServer(express())
    try {
      await expect(request(server).get('/').set('X-Bad', 'a\nb')).rejects.toMatchObject({ code: 'ERR_INVALID_CHAR' })
    } finally {
      server.close()
    }
  })

  it("un serveur déjà à l'écoute est utilisé tel quel et laissé ouvert (chemin supertest inchangé)", async () => {
    let server!: http.Server
    server = http.createServer(whoAmIApp(() => server)).listen(0, '127.0.0.1')
    await once(server, 'listening')
    try {
      const res = await request(server).get('/whoami')
      expect(res.status).toBe(200)
      expect(res.body.bound.port).toBe((server.address() as AddressInfo).port)
      expect(server.listening).toBe(true)
    } finally {
      server.close()
    }
  })
})

// Jeton d'activation famille (contrat §6) : 32 octets aléatoires (256 bits) encodés en base64url.
// Le jeton ne vit QUE dans l'e-mail d'invitation (fragment #t=) ; l'API et la base ne voient que
// son sha256 hexadécimal, calculé sur les octets UTF-8 de la CHAÎNE base64url (identique à
// WebCrypto côté front : vecteurs partagés tests/fixtures/invite-token-vector.json).
import crypto from 'node:crypto'

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
const HASH_RE = /^[0-9a-f]{64}$/

export function generateInviteToken() {
  return crypto.randomBytes(32).toString('base64url')
}

export function hashInviteToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex')
}

export function isInviteToken(value) {
  return typeof value === 'string' && TOKEN_RE.test(value)
}

export function isTokenHash(value) {
  return typeof value === 'string' && HASH_RE.test(value)
}

// Vérification de signature Svix (webhooks Resend), sans dépendance externe — doc :
// https://docs.svix.com/receiving/verifying-payloads/how-manual. Le secret suit le format
// Svix `whsec_<base64>` ; le contenu signé est "{svix-id}.{svix-timestamp}.{corps brut}"
// (HMAC-SHA256, base64) ; l'en-tête svix-signature contient une ou plusieurs entrées
// "v1,<sig>" séparées par des espaces (rotation de clé côté Svix) — on accepte si UNE SEULE
// correspond, comparée en temps constant. Protection anti-rejeu : timestamp à ±5 min de
// l'heure serveur. rawBody DOIT être le corps brut (Buffer) reçu par Express — voir
// server/routes/letters.js (route POST /webhook) et server.js (montage express.raw()).
import crypto from 'crypto'

const TOLERANCE_SECONDS = 5 * 60

export function verifySvixSignature({ secret, svixId, svixTimestamp, svixSignature, rawBody }) {
  if (!secret || !svixId || !svixTimestamp || !svixSignature || !rawBody) return false

  const timestamp = Number(svixTimestamp)
  if (!Number.isFinite(timestamp)) return false
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > TOLERANCE_SECONDS) return false

  const secretKey = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8')
  const signedContent = Buffer.concat([Buffer.from(`${svixId}.${svixTimestamp}.`, 'utf8'), bodyBuffer])
  const expected = crypto.createHmac('sha256', secretKey).update(signedContent).digest()

  return svixSignature
    .split(' ')
    .filter(Boolean)
    .some((entry) => {
      const [version, sig] = entry.split(',')
      if (version !== 'v1' || !sig) return false
      let actual
      try {
        actual = Buffer.from(sig, 'base64')
      } catch {
        return false
      }
      return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
    })
}

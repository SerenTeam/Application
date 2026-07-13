import crypto from 'crypto'

// Porte d'accès type .htaccess (HTTP Basic Auth) pour les environnements non publics
// (préprod, staging). Activée UNIQUEMENT si un mot de passe est fourni : sans
// SITE_PASSWORD, le middleware laisse tout passer — le même code peut donc vivre
// sur toutes les branches, seule la config d'environnement décide.
//
// Les routes /api/* ne sont pas concernées : elles portent leur propre authentification
// (Bearer Supabase via requireAuth) et le frontend écrase l'en-tête Authorization avec
// son token — les gater ici casserait l'application.

// Comparaison en temps constant, insensible à la longueur (hash avant comparaison).
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest()
  const hb = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(ha, hb)
}

export function createBasicAuthGate({ user = 'seren', password, realm = 'Seren' } = {}) {
  return function basicAuthGate(req, res, next) {
    if (!password) return next()
    if (req.path.startsWith('/api/')) return next()

    const [scheme, encoded] = (req.headers.authorization ?? '').split(' ')
    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString()
      const sep = decoded.indexOf(':')
      const u = sep === -1 ? decoded : decoded.slice(0, sep)
      const p = sep === -1 ? '' : decoded.slice(sep + 1)
      if (safeEqual(u, user) && safeEqual(p, password)) return next()
    }

    res.set('WWW-Authenticate', `Basic realm="${realm}", charset="UTF-8"`)
    res.status(401).send('Authentification requise')
  }
}

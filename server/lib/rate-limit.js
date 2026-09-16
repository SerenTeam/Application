// Limiteur en mémoire par utilisateur (fenêtre glissante). Suffisant en mono-instance ;
// pour du multi-instances, remplacer par un compteur partagé (BDD/Redis).
// À monter APRÈS requireAuth (dépend de req.user.id).
// `message` accepte soit une chaîne statique, soit une fonction `(req) => string` — utile
// pour traduire selon la langue déjà connue au moment de la requête (ex. req.body.lang).

export function createUserRateLimiter({ max, windowMs, message = 'Trop de requêtes, réessayez dans quelques minutes.' }) {
  const hits = new Map() // userId → timestamps[]
  return function rateLimit(req, res, next) {
    const now = Date.now()
    const userId = req.user?.id ?? 'anonyme'
    const stamps = (hits.get(userId) ?? []).filter((t) => now - t < windowMs)
    if (stamps.length >= max) {
      const error = typeof message === 'function' ? message(req) : message
      return res.status(429).json({ success: false, error })
    }
    stamps.push(now)
    hits.set(userId, stamps)
    next()
  }
}

// Limiteur en mémoire par IP (routes publiques sans compte : POST /api/activation/check).
// Suppose `app.set('trust proxy', 1)` (server.js) : derrière Render, req.ip est l'IP cliente.
// Purge opportuniste pour qu'une rafale d'IP distinctes ne fasse pas grossir la Map sans fin.
export function createIpRateLimiter({ max, windowMs, message = 'Trop de requêtes, réessayez dans quelques minutes.' }) {
  const hits = new Map() // ip → timestamps[]
  return function ipRateLimit(req, res, next) {
    const now = Date.now()
    const key = req.ip || req.socket?.remoteAddress || 'inconnue'
    const stamps = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
    if (stamps.length >= max) {
      const error = typeof message === 'function' ? message(req) : message
      return res.status(429).json({ success: false, error })
    }
    stamps.push(now)
    hits.set(key, stamps)
    if (hits.size > 10000) {
      for (const [ip, list] of hits) if (!list.some((t) => now - t < windowMs)) hits.delete(ip)
    }
    next()
  }
}

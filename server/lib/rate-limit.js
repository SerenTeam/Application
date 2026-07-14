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

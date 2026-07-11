// Limiteur en mémoire par utilisateur (fenêtre glissante). Suffisant en mono-instance ;
// pour du multi-instances, remplacer par un compteur partagé (BDD/Redis).
// À monter APRÈS requireAuth (dépend de req.user.id).

export function createUserRateLimiter({ max, windowMs, message = 'Trop de requêtes, réessayez dans quelques minutes.' }) {
  const hits = new Map() // userId → timestamps[]
  return function rateLimit(req, res, next) {
    const now = Date.now()
    const userId = req.user?.id ?? 'anonyme'
    const stamps = (hits.get(userId) ?? []).filter((t) => now - t < windowMs)
    if (stamps.length >= max) {
      return res.status(429).json({ success: false, error: message })
    }
    stamps.push(now)
    hits.set(userId, stamps)
    next()
  }
}

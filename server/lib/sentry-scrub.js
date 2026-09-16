// Scrub Sentry serveur (contrat §4.8, §6) : aucun jeton d'activation, hash, URL d'activation, corps
// des routes d'activation/partenaire ni en-tête Authorization ne doit quitter le serveur. Module
// dédié (note N1) : server.js démarre le serveur à l'import et ne peut pas être testé directement.
const TOKEN_FRAGMENT_RE = /#t=[A-Za-z0-9_-]+/g
const SENSITIVE_KEYS = new Set(['token_hash', 'invite_token_hash', 'activation_url'])
const SENSITIVE_ROUTES = ['/api/activation/', '/api/partner/dossiers']
const MAX_DEPTH = 12

function scrubString(value) {
  return typeof value === 'string' ? value.replace(TOKEN_FRAGMENT_RE, '#t=[scrubbed]') : value
}

// Parcours EN PLACE : masque les clés sensibles et le fragment dans toute chaîne.
function scrubDeep(node, depth) {
  if (depth > MAX_DEPTH || node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      if (typeof node[i] === 'string') node[i] = scrubString(node[i])
      else scrubDeep(node[i], depth + 1)
    }
    return
  }
  for (const key of Object.keys(node)) {
    if (SENSITIVE_KEYS.has(key)) {
      node[key] = '[scrubbed]'
    } else if (typeof node[key] === 'string') {
      node[key] = scrubString(node[key])
    } else {
      scrubDeep(node[key], depth + 1)
    }
  }
}

export function scrubSentryEvent(event) {
  if (!event || typeof event !== 'object') return event
  const request = event.request
  if (request && typeof request === 'object') {
    const url = typeof request.url === 'string' ? request.url : ''
    if (SENSITIVE_ROUTES.some((route) => url.includes(route))) {
      delete request.data
      delete request.query_string
      delete request.cookies
      if (request.headers && typeof request.headers === 'object') {
        for (const header of Object.keys(request.headers)) {
          if (header.toLowerCase() === 'authorization') delete request.headers[header]
        }
      }
    }
  }
  scrubDeep(event, 0)
  return event
}

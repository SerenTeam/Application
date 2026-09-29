// Scrub Sentry serveur (contrat §4.8, §6) : aucun jeton d'activation, hash, URL d'activation, secret
// d'URL du webhook MySendingBox, corps des routes d'activation/partenaire/questionnaire/courriers, ni
// en-tête Authorization ou Cookie (sur aucune route) ne doit quitter le serveur. Module dédié
// (note N1) : server.js démarre le serveur à l'import et ne peut pas être testé directement.
const TOKEN_FRAGMENT_RE = /#t=[A-Za-z0-9_-]+/g
// Secret d'URL du webhook MySendingBox (POST /api/letters/provider-webhook/:secret, lot 2a) : le SDK
// le recopie dans request.url et dans le nom de transaction de tout événement capturé pendant la requête.
const PROVIDER_WEBHOOK_SECRET_RE = /(\/provider-webhook\/)[^/?#\s"'<>]+/g
const SENSITIVE_KEYS = new Set(['token_hash', 'invite_token_hash', 'activation_url'])
// Le SDK (@sentry/node 10) joint le corps BRUT de la requête entrante à l'événement, même avec
// sendDefaultPii: false. server.js le lui interdit désormais (maxIncomingRequestBodySize: 'none') ;
// ce filtre reste la seconde barrière. Tout le préfixe à chaque fois :
// - questionnaire : identité du défunt et données de santé (aides_percues : APA, ASH, AAH/PCH ;
//   logement : EHPAD) ;
// - courriers : variables (identité du défunt, nom et adresse de l'expéditeur, numéro d'abonné),
//   adresse du destinataire, et modèle, qui peut révéler une donnée de santé (aides-departement,
//   ehpad-fin-contrat).
const SENSITIVE_ROUTES = ['/api/activation/', '/api/partner/dossiers', '/api/questionnaire/', '/api/letters/']
// Retirés sur TOUTES les routes : le SDK joint tous les en-têtes entrants, dont le jeton Bearer (ou
// les identifiants Basic de la préprod) et les cookies, qu'il analyse aussi dans request.cookies.
const ALWAYS_STRIPPED_HEADERS = new Set(['authorization', 'cookie'])
const MAX_DEPTH = 12

function scrubString(value) {
  return typeof value === 'string'
    ? value.replace(TOKEN_FRAGMENT_RE, '#t=[scrubbed]').replace(PROVIDER_WEBHOOK_SECRET_RE, '$1[scrubbed]')
    : value
}

// Parcours EN PLACE : masque les clés sensibles, et le fragment comme le secret d'URL du webhook
// dans toute chaîne.
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
    }
    // Toutes les routes : ni jeton ni cookie, en en-tête brut comme en cookies déjà analysés.
    delete request.cookies
    if (request.headers && typeof request.headers === 'object') {
      for (const header of Object.keys(request.headers)) {
        if (ALWAYS_STRIPPED_HEADERS.has(header.toLowerCase())) delete request.headers[header]
      }
    }
  }
  scrubDeep(event, 0)
  return event
}

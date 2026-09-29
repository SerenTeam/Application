// Scrub Sentry serveur (contrat §4.8, §6) : aucun jeton d'activation, hash, URL d'activation, secret
// d'URL du webhook MySendingBox, code d'accès du produit transmission, corps des routes
// d'activation/partenaire/questionnaire/courriers, ni en-tête Authorization ou Cookie (sur aucune
// route) ne doit quitter le serveur. Module dédié (note N1) : server.js démarre le serveur à l'import
// et ne peut pas être testé directement.
const TOKEN_FRAGMENT_RE = /#t=[A-Za-z0-9_-]+/g
// Secret d'URL du webhook MySendingBox (POST /api/letters/provider-webhook/:secret, lot 2a) : le SDK
// le recopie dans request.url et dans le nom de transaction de tout événement capturé pendant la requête.
const PROVIDER_WEBHOOK_SECRET_RE = /(\/provider-webhook\/)[^/?#\s"'<>]+/g
// Code d'accès du produit transmission (gelé) : GET /api/transmission/:code le porte dans son chemin,
// recopié de même. Express route sans tenir compte de la casse, d'où /i.
const TRANSMISSION_CODE_RE = /(\/api\/transmission\/)[^/?#\s"'<>]+/gi
// Le même code en paramètre : AccessPage navigue vers /dashboard?code=<code>, URL que le navigateur
// renvoie en Referer à chaque appel d'API émis depuis la page (le SDK joint tous les en-têtes). Seul
// paramètre code= de l'application ; aussi en tête de request.query_string, rempli sans le « ? ».
const CODE_PARAM_RE = /((?:^|[?&])code=)[^&#\s"'<>]+/g
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
    ? value
        .replace(TOKEN_FRAGMENT_RE, '#t=[scrubbed]')
        .replace(PROVIDER_WEBHOOK_SECRET_RE, '$1[scrubbed]')
        .replace(TRANSMISSION_CODE_RE, '$1[code]')
        .replace(CODE_PARAM_RE, '$1[code]')
    : value
}

// Parcours EN PLACE : masque les clés sensibles, et dans toute chaîne le fragment, le secret d'URL du
// webhook et le code d'accès transmission.
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

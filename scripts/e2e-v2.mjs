#!/usr/bin/env node
// ============================================================================
// scripts/e2e-v2.mjs — Parcours v2 de bout en bout par l'API PUBLIQUE (contrat §10.2)
// ============================================================================
// Création PF → check → signUp (hash) → claim (+ rejeu) → record_consents → /api/me (10/10)
// → envoi papier (clé TEST) → quota 9/10 → vue PF sans contenu → compteurs → signUp non invité refusé.
//
// Cibles : Supabase LOCAL par défaut ; préprod seulement avec E2E_TARGET=preprod ; PROD toujours
// refusée (project-ref ou domaine app.seren-app.fr). Node pur, fetch natif, zéro dépendance.
// N'affiche JAMAIS de jeton, de hash, de mot de passe ni d'access token. Sortie TAP, exit 1 si échec.
//
// Variables : E2E_API_URL, E2E_SUPABASE_URL, E2E_SUPABASE_KEY, E2E_PF_EMAIL (repli PROBE_PARTNER_EMAIL),
// E2E_PF_PASSWORD (repli PROBE_PARTNER_PASSWORD), E2E_FAMILY_DOMAIN (défaut seren-test.fr),
// E2E_PAPER=skip (sauter l'envoi papier, ex. local sans clé MySendingBox), E2E_TARGET=preprod.
// ============================================================================
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { isProdTarget } from './check-env-target.mjs'

const env = process.env
function required(name, fallback) {
  const value = env[name] ?? (fallback ? env[fallback] : undefined)
  if (!value) {
    console.error(`Variable manquante : ${name}${fallback ? ` (ou ${fallback})` : ''}`)
    process.exit(1)
  }
  return value
}

const API_URL = required('E2E_API_URL').replace(/\/+$/, '')
const SUPABASE_URL = required('E2E_SUPABASE_URL').replace(/\/+$/, '')
const SUPABASE_KEY = required('E2E_SUPABASE_KEY')
const PF_EMAIL = required('E2E_PF_EMAIL', 'PROBE_PARTNER_EMAIL')
const PF_PASSWORD = required('E2E_PF_PASSWORD', 'PROBE_PARTNER_PASSWORD')
const FAMILY_DOMAIN = env.E2E_FAMILY_DOMAIN || 'seren-test.fr'
const WITH_PAPER = env.E2E_PAPER !== 'skip'

// ── Garde d'environnement (avant tout appel réseau) ────────────────────────
const LOCAL_RE = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/
for (const url of [API_URL, SUPABASE_URL]) {
  if (isProdTarget(url) || new URL(url).hostname === 'app.seren-app.fr') {
    console.error('Refus : cible PROD. Ce script écrit (dossiers, comptes, envoi) — jamais sur la prod.')
    process.exit(1)
  }
}
const isLocal = LOCAL_RE.test(API_URL) && LOCAL_RE.test(SUPABASE_URL)
if (!isLocal && env.E2E_TARGET !== 'preprod') {
  console.error('Refus : URL non locale sans E2E_TARGET=preprod explicite.')
  process.exit(1)
}
if (env.E2E_TARGET === 'preprod' && !SUPABASE_URL.includes('kvtzhyxlqouvpwasedbe')) {
  console.error('Refus : E2E_TARGET=preprod exige la base préprod kvtzhyxlqouvpwasedbe.')
  process.exit(1)
}

const CONSENT_VERSION = readFileSync(new URL('../src/lib/consent-version.ts', import.meta.url), 'utf8')
  .match(/CONSENT_VERSION\s*=\s*'([^']+)'/)?.[1]
if (!CONSENT_VERSION) {
  console.error('CONSENT_VERSION introuvable dans src/lib/consent-version.ts')
  process.exit(1)
}

// ── Utilitaires ─────────────────────────────────────────────────────────────
const results = []
let failed = false
async function step(name, fn) {
  try {
    const detail = await fn()
    results.push(`ok ${results.length + 1} - ${name}${detail ? ` (${detail})` : ''}`)
  } catch (error) {
    failed = true
    results.push(`not ok ${results.length + 1} - ${name} : ${error.message}`)
    throw error
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message)
}
async function http(method, url, { token, body, headers = {} } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(url.startsWith(SUPABASE_URL) ? { apikey: SUPABASE_KEY } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = null }
  return { status: res.status, json }
}
const sha256Hex = (value) => createHash('sha256').update(value, 'utf8').digest('hex')
const FORBIDDEN_CONTENT_KEYS = ['answers', 'roadmap', 'roadmaps', 'steps', 'letters', 'letter_sends', 'sends', 'documents', 'attachments', 'quota', 'consents', 'purchases', 'body', 'variables']
function findForbiddenKeys(node, path = '') {
  if (!node || typeof node !== 'object') return []
  return Object.entries(node).flatMap(([key, value]) => [
    ...(FORBIDDEN_CONTENT_KEYS.includes(key) ? [`${path}${key}`] : []),
    ...findForbiddenKeys(value, `${path}${key}.`),
  ])
}

// ── Parcours ────────────────────────────────────────────────────────────────
const runId = randomUUID().slice(0, 8)
const familyEmail = `e2e.famille+${runId}@${FAMILY_DOMAIN}`
const familyPassword = `E2e-${randomUUID()}-Aa1!`
const deathDate = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString().slice(0, 10)
const state = {}

try {
  await step('connexion du gérant PF', async () => {
    const res = await http('POST', `${SUPABASE_URL}/auth/v1/token?grant_type=password`, { body: { email: PF_EMAIL, password: PF_PASSWORD } })
    assert(res.status === 200 && res.json?.access_token, `connexion PF refusée (HTTP ${res.status})`)
    state.pfToken = res.json.access_token
  })

  await step('création du dossier par la PF (201, hash seul côté base)', async () => {
    const res = await http('POST', `${API_URL}/api/partner/dossiers`, {
      token: state.pfToken,
      body: { family_first_name: 'Claire', family_last_name: `E2E-${runId}`, family_email: familyEmail,
        deceased_first_name: 'Jean', deceased_last_name: `Defunt-${runId}`, deceased_death_date: deathDate, lang: 'fr' },
    })
    assert(res.status === 201, `HTTP ${res.status} ${res.json?.code ?? ''}`)
    assert(typeof res.json?.activation_url === 'string', 'activation_url absent : SHOW_ACTIVATION_LINK=true est requis pour cet E2E')
    state.dossierId = res.json.dossier.id
    state.token = new URL(res.json.activation_url).hash.replace(/^#t=/, '')
    assert(/^[A-Za-z0-9_-]{43}$/.test(state.token), 'jeton de forme inattendue')
    state.hash = sha256Hex(state.token)
    return `dossier ${state.dossierId}, email_sent=${res.json.email_sent}`
  })

  await step('check public de l’invitation (200, e-mail attendu)', async () => {
    const res = await http('POST', `${API_URL}/api/activation/check`, { body: { token_hash: state.hash, lang: 'fr' } })
    assert(res.status === 200, `HTTP ${res.status} ${res.json?.code ?? ''}`)
    assert(res.json.invitation.email === familyEmail, 'e-mail d’invitation inattendu')
  })

  await step('signUp famille avec invite_token_hash (session immédiate)', async () => {
    const res = await http('POST', `${SUPABASE_URL}/auth/v1/signup`, { body: { email: familyEmail, password: familyPassword, data: { invite_token_hash: state.hash } } })
    const accessToken = res.json?.access_token ?? res.json?.session?.access_token
    assert(res.status === 200 && accessToken, `signUp refusé ou sans session (HTTP ${res.status}) — hook et « Confirm email » à vérifier`)
    state.familyToken = accessToken
  })

  await step('claim du dossier (200 claimed) puis rejeu idempotent (already_active)', async () => {
    const first = await http('POST', `${API_URL}/api/activation/claim`, { token: state.familyToken, body: { token_hash: state.hash } })
    assert(first.status === 200 && first.json?.claimed === true, `claim : HTTP ${first.status} ${first.json?.code ?? ''}`)
    const again = await http('POST', `${API_URL}/api/activation/claim`, { token: state.familyToken, body: { token_hash: state.hash } })
    assert(again.status === 200 && again.json?.already_active === true, `rejeu : HTTP ${again.status} ${again.json?.code ?? ''}`)
  })

  await step('check après claim : lien mort (404)', async () => {
    const res = await http('POST', `${API_URL}/api/activation/check`, { body: { token_hash: state.hash } })
    assert(res.status === 404, `HTTP ${res.status}`)
  })

  await step('gate avant consentement : 403 CONSENT_REQUIRED', async () => {
    const res = await http('GET', `${API_URL}/api/letters/quota`, { token: state.familyToken })
    assert(res.status === 403 && res.json?.code === 'CONSENT_REQUIRED', `HTTP ${res.status} ${res.json?.code ?? ''}`)
  })

  await step('record_consents (3 kinds, version courante)', async () => {
    const res = await http('POST', `${SUPABASE_URL}/rest/v1/rpc/record_consents`, {
      token: state.familyToken, body: { p_version: CONSENT_VERSION, p_kinds: ['terms', 'privacy', 'sensitive_data'] },
    })
    assert(res.status === 200 && res.json?.required === false, `HTTP ${res.status}`)
  })

  await step('/api/me famille : role family, consentement OK, quota 10/10', async () => {
    const res = await http('GET', `${API_URL}/api/me`, { token: state.familyToken })
    assert(res.status === 200, `HTTP ${res.status}`)
    assert(res.json.account?.role === 'family' && res.json.account?.consent?.required === false, 'compte inattendu')
    assert(res.json.quota?.balance === 10 && res.json.quota?.included_total === 10, `quota ${JSON.stringify(res.json.quota)}`)
  })

  if (WITH_PAPER) {
    await step('envoi papier (clé TEST) : 202 puis quota 9/10', async () => {
      const user = await http('GET', `${SUPABASE_URL}/auth/v1/user`, { token: state.familyToken })
      assert(user.status === 200 && user.json?.id, 'lecture de l’utilisateur impossible')
      const profile = await http('POST', `${SUPABASE_URL}/rest/v1/sender_profiles`, {
        token: state.familyToken,
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: { user_id: user.json.id, full_name: 'Claire E2E', address_line1: '10 rue des Tests', postal_code: '75011', city: 'Paris' },
      })
      assert(profile.status === 201 || profile.status === 204, `profil expéditeur : HTTP ${profile.status}`)
      const send = await http('POST', `${API_URL}/api/letters/send`, {
        token: state.familyToken,
        body: {
          template_id: 'bailleur-notification', step_id: `e2e-bailleur-${runId}`, lang: 'fr', attachment_ids: [],
          recipient: { name: 'Agence E2E', address_line1: '1 rue de la Paix', postal_code: '75002', city: 'Paris' },
          variables: { deceased_firstname: 'Jean', deceased_lastname: `Defunt-${runId}`, deceased_dod: deathDate,
            organisme_name: 'Agence E2E', user_firstname: 'Claire', user_lastname: `E2E-${runId}`, user_relation: 'fille',
            user_address: '10 rue des Tests, 75011 Paris', city: 'Paris', today_date: new Date().toISOString().slice(0, 10) },
        },
      })
      assert(send.status === 202, `envoi : HTTP ${send.status} ${send.json?.code ?? ''} ${JSON.stringify(send.json?.missing_variables ?? '')}`)
      const quota = await http('GET', `${API_URL}/api/letters/quota`, { token: state.familyToken })
      assert(quota.json?.balance === 9, `quota après envoi : ${quota.json?.balance}`)
    })
  }

  await step('vue PF : dossier activé, AUCUNE clé de contenu', async () => {
    const res = await http('GET', `${API_URL}/api/partner/dossiers`, { token: state.pfToken })
    assert(res.status === 200, `HTTP ${res.status}`)
    const dossier = res.json.dossiers.find((d) => d.id === state.dossierId)
    assert(dossier?.status === 'active', `statut ${dossier?.status}`)
    const forbidden = findForbiddenKeys(res.json)
    assert(forbidden.length === 0, `clés de contenu exposées : ${forbidden.join(', ')}`)
  })

  await step('compteurs PF : activation du mois comptée', async () => {
    const res = await http('GET', `${API_URL}/api/partner/counters`, { token: state.pfToken })
    assert(res.status === 200 && res.json.counters.activated_this_month >= 1, `HTTP ${res.status}`)
  })

  await step('inscription NON invitée refusée par le hook', async () => {
    const res = await http('POST', `${SUPABASE_URL}/auth/v1/signup`, { body: { email: `e2e.refus+${runId}@${FAMILY_DOMAIN}`, password: familyPassword } })
    assert(res.status >= 400 && JSON.stringify(res.json ?? {}).includes('signup_requires_invitation'), `HTTP ${res.status} — compte possiblement créé : le supprimer et vérifier le hook`)
  })
} catch {
  // L'étape en échec est déjà consignée ; les suivantes ne sont pas jouées.
}

console.log(results.join('\n'))
console.log(`1..${results.length}`)
process.exit(failed ? 1 : 0)

#!/usr/bin/env node
// ============================================================================
// scripts/rls-probes.mjs — Probes d'isolation RLS Supabase v2 (rejouables)
// ============================================================================
//
// Prouve, contre un environnement RÉEL (Supabase local, préprod ; prod en lecture seule), les
// frontières du démonstrateur v2 (contrat docs/design-v2-demonstrateur.md §9.1, §10.2) :
//   familles A↔B (tables, storage), deny-all des tables v2 et PF, RPC internes sans secret,
//   correctif F1, PF-X↔PF-Y, PF-X contre le contenu de SA famille active (preuve forte),
//   admin Seren sans PII, anonyme, compte sans dossier (HTTP 403), hook d'inscription.
//
// Node pur, fetch natif, ZÉRO dépendance. Comptes fournis par scripts/provision-v2.mjs (vrai
// parcours d'invitation) : aucun signup à la volée, le hook le refuserait.
//
// -- Modes ------------------------------------------------------------------
//
//   défaut          LECTURE SEULE : aucune inscription, aucun INSERT/UPDATE/DELETE, aucune RPC
//                   mutante. Les sondes d'écriture sortent en « # SKIP mode lecture seule ».
//   PROBE_WRITE=1   écritures de sonde (marqueurs, tentatives d'INSERT refusées, hook, F1), toutes
//                   nettoyées en fin de run. Refusé sur la prod, sans dérogation.
//   prod            lecture seule uniquement, avec PROD_OK=1 explicite (smoke U4) ; seconde barrière
//                   dans rawFetch() : GET/HEAD, connexion et une liste fermée de RPC de lecture.
//
// -- Usage ------------------------------------------------------------------
//
//   node --env-file="$HOME/.seren-probes.env" scripts/rls-probes.mjs
//   PROBE_WRITE=1 node --env-file="$HOME/.seren-probes.env" scripts/rls-probes.mjs
//
// Requises : PROBE_SUPABASE_URL, PROBE_SUPABASE_KEY, PROBE_USER_A_EMAIL/PASSWORD (famille A, active,
// rattachée à PF-X, avec contenu), PROBE_USER_B_EMAIL/PASSWORD (famille B, active, PF-Y).
// Optionnelles (sondes sautées si absentes) : PROBE_PARTNER_EMAIL/PASSWORD (PF-X),
// PROBE_PARTNER_Y_EMAIL/PASSWORD, PROBE_NODOSSIER_EMAIL/PASSWORD, PROBE_ADMIN_EMAIL/PASSWORD,
// PROBE_API_URL (serveur Express : sondes HTTP du gate, ET création du dossier des sondes de hook —
// depuis la revue du 16/09 les RPC de création et de renvoi exigent le secret serveur, donc ces
// sondes passent par POST /api/partner/dossiers, avec SHOW_ACTIVATION_LINK=true pour récupérer le jeton).
// Jamais de valeur par défaut codée en dur, jamais d'écho de mot de passe.
//
// Sortie TAP (`ok`/`not ok`, plan en fin), exit 1 si une sonde échoue ; SKIP ne fait jamais échouer.
// Détail : docs/runbook-rls-probes.md
// ============================================================================

import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { isProdTarget, PROD_PROJECT_REF, PREPROD_PROJECT_REF } from './check-env-target.mjs'

// ----------------------------------------------------------------------
// Garde anti-prod — PREMIÈRE instruction exécutée, avant validateEnv()
// ----------------------------------------------------------------------

const WRITE_MODE = process.env.PROBE_WRITE === '1'
const TARGET_IS_PROD = isProdTarget(process.env.PROBE_SUPABASE_URL)

function refuseProdTarget() {
  if (!TARGET_IS_PROD) return
  if (WRITE_MODE) {
    console.error(`REFUS : PROBE_SUPABASE_URL vise le projet Supabase PROD (${PROD_PROJECT_REF}, utilisateurs réels) avec PROBE_WRITE=1.`)
    console.error("Le mode écriture (marqueurs, tentatives d'INSERT, inscriptions) ne tourne jamais sur la prod, sans dérogation.")
    console.error(`Cibler la préprod (${PREPROD_PROJECT_REF}) ou un Supabase local. Voir docs/runbook-rls-probes.md § Garde anti-prod.`)
    process.exit(1)
  }
  if (process.env.PROD_OK !== '1') {
    console.error(`REFUS : PROBE_SUPABASE_URL vise le projet Supabase PROD (${PROD_PROJECT_REF}, utilisateurs réels).`)
    console.error('Seul le smoke en lecture seule est admis sur la prod, avec la dérogation explicite PROD_OK=1 (runbook bêta prod).')
    process.exit(1)
  }
  console.error(`ATTENTION : lecture seule sur la PROD (${PROD_PROJECT_REF}) avec PROD_OK=1 — aucune écriture ne partira.`)
}

refuseProdTarget()

// Seconde cible réseau possible : le serveur Express (PROBE_API_URL). TARGET_IS_PROD ne regarde que
// PROBE_SUPABASE_URL ; sans ce contrôle, un PROBE_API_URL de prod couplé à une base locale passerait la
// garde (revue du 16/09, mineur 2). Même règle que scripts/e2e-v2.mjs, qui refuse déjà app.seren-app.fr.
const PROD_APP_HOST = 'app.seren-app.fr'

function refuseProdApi() {
  const raw = (process.env.PROBE_API_URL ?? '').trim()
  if (!raw) return
  let host = ''
  try {
    host = new URL(raw).hostname.toLowerCase()
  } catch {
    host = ''
  }
  // Le regex couvre la forme sans schéma (new URL() échoue alors), que fetch rejetterait de toute façon.
  const looksProd = isProdTarget(raw) || host === PROD_APP_HOST || new RegExp(`(?:^|//)${PROD_APP_HOST.replace(/\./g, '\\.')}(?::\\d+)?(?:/|$)`, 'i').test(raw)
  if (!looksProd) return
  console.error(`REFUS : PROBE_API_URL vise le serveur de PRODUCTION (${host || raw}).`)
  console.error('Les sondes HTTP (gate serveur, création du dossier des sondes de hook) ne visent jamais la prod :')
  console.error('cibler le serveur local ou celui de la préprod. Voir docs/runbook-rls-probes.md § Garde anti-prod.')
  process.exit(1)
}

refuseProdApi()

// ----------------------------------------------------------------------
// Configuration / environnement
// ----------------------------------------------------------------------

const REQUIRED_ENV = [
  'PROBE_SUPABASE_URL',
  'PROBE_SUPABASE_KEY',
  'PROBE_USER_A_EMAIL',
  'PROBE_USER_A_PASSWORD',
  'PROBE_USER_B_EMAIL',
  'PROBE_USER_B_PASSWORD',
]

function validateEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key])
  if (missing.length > 0) {
    console.error(`Variables d'environnement manquantes : ${missing.join(', ')}`)
    console.error("Voir l'en-tête de scripts/rls-probes.mjs ou docs/runbook-rls-probes.md pour l'usage.")
    process.exit(1)
  }
}

validateEnv()

const SUPABASE_URL = process.env.PROBE_SUPABASE_URL.replace(/\/+$/, '')
const SUPABASE_KEY = process.env.PROBE_SUPABASE_KEY
const API_URL = process.env.PROBE_API_URL ? process.env.PROBE_API_URL.replace(/\/+$/, '') : null
const OPTIONAL_ACCOUNTS = {
  partner: ['PROBE_PARTNER_EMAIL', 'PROBE_PARTNER_PASSWORD'],
  partnerY: ['PROBE_PARTNER_Y_EMAIL', 'PROBE_PARTNER_Y_PASSWORD'],
  noDossier: ['PROBE_NODOSSIER_EMAIL', 'PROBE_NODOSSIER_PASSWORD'],
  admin: ['PROBE_ADMIN_EMAIL', 'PROBE_ADMIN_PASSWORD'],
}

// ----------------------------------------------------------------------
// Petit client REST (PostgREST + GoTrue + Storage), sans dépendance
// ----------------------------------------------------------------------

class AuthError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

class Skip extends Error {}

// RPC en lecture pure, seules admises vers la prod (en plus de GET/HEAD et de la connexion).
// claim_dossier, record_consents, partner_create_dossier… n'y figureront JAMAIS.
const READONLY_RPCS = new Set([
  'my_account', 'has_active_dossier', 'consent_version', 'partner_list_dossiers',
  'partner_month_counters', 'admin_partner_overview', 'partner_dashboard', 'invitation_preview',
])

function assertNoProdWrite(url, method) {
  if (!isProdTarget(url)) return
  const verb = String(method).toUpperCase()
  if (verb === 'GET' || verb === 'HEAD') return
  const path = new URL(url).pathname
  if (verb === 'POST' && path.endsWith('/auth/v1/token')) return
  const rpcMatch = path.match(/\/rest\/v1\/rpc\/([a-z_]+)$/)
  if (verb === 'POST' && rpcMatch && READONLY_RPCS.has(rpcMatch[1])) return
  if (verb === 'POST' && path.endsWith('/storage/v1/object/list/documents')) return
  throw new Error(`requête ${verb} vers la PROD bloquée par la garde anti-prod (${path})`)
}

async function rawFetch(url, { method = 'GET', token, body, prefer, headers = {} } = {}) {
  assertNoProdWrite(url, method)
  const res = await fetch(url, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  return { ok: res.ok, status: res.status, data }
}

function rest(method, path, opts) {
  return rawFetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, ...opts })
}

function rpc(name, token, body = {}) {
  return rest('POST', `rpc/${name}`, { token, body })
}

function auth(path, body) {
  return rawFetch(`${SUPABASE_URL}/auth/v1${path}`, { method: 'POST', body })
}

// Serveur Express : l'URL ne contient pas le project-ref, la prod est donc gardée par TARGET_IS_PROD.
async function api(method, path, token, body) {
  if (!API_URL) throw new Skip('PROBE_API_URL absente (sondes HTTP du gate sautées)')
  if (TARGET_IS_PROD && method !== 'GET') throw new Skip('prod : sonde HTTP mutante sautée')
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { ok: res.ok, status: res.status, data }
}

function describeError(res) {
  if (res.data && typeof res.data === 'object') {
    return res.data.message ?? res.data.msg ?? res.data.code ?? JSON.stringify(res.data)
  }
  return `HTTP ${res.status}`
}

function isMissingRelation(res) {
  if (res.status !== 404) return false
  const code = res.data?.code
  const msg = String(res.data?.message ?? '')
  return code === 'PGRST205' || code === 'PGRST202' || /schema cache/i.test(msg)
}

function isRlsDenied(res) {
  if (res.ok) return false
  const code = res.data?.code
  const msg = String(res.data?.message ?? '')
  return code === '42501' || /row-level security|permission denied/i.test(msg)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function requireWrite() {
  if (!WRITE_MODE) throw new Skip("mode lecture seule (PROBE_WRITE=1 pour l'activer)")
}

function requireNonProd() {
  if (TARGET_IS_PROD) throw new Skip('sonde non jouée sur la prod')
}

const sha256Hex = (token) => createHash('sha256').update(token, 'utf8').digest('hex')
const randomHash = () => sha256Hex(randomBytes(32).toString('base64url'))

// ----------------------------------------------------------------------
// Authentification (GoTrue) — connexion seulement, jamais d'inscription implicite
// ----------------------------------------------------------------------

async function signIn(email, password, label) {
  const res = await auth('/token?grant_type=password', { email, password })
  if (!res.ok || !res.data?.access_token) {
    throw new AuthError(`Connexion du compte ${label} (${email}) impossible : ${describeError(res)}`, res.status)
  }
  return { token: res.data.access_token, id: res.data.user.id }
}

async function signInOptional(kind, label) {
  const [emailVar, passwordVar] = OPTIONAL_ACCOUNTS[kind]
  if (!process.env[emailVar] || !process.env[passwordVar]) {
    console.log(`# avertissement : ${emailVar}/${passwordVar} absents — sondes « ${label} » sautées`)
    return null
  }
  try {
    const session = await signIn(process.env[emailVar], process.env[passwordVar], label)
    console.log(`# compte ${label} = ${process.env[emailVar]} (${session.id})`)
    return session
  } catch (err) {
    console.log(`# avertissement : ${err.message} — sondes « ${label} » sautées`)
    return null
  }
}

// ----------------------------------------------------------------------
// Runner TAP
// ----------------------------------------------------------------------

let index = 0
let failures = 0

async function runProbe(name, fn) {
  index += 1
  try {
    const note = await fn()
    console.log(`ok ${index} - ${name}${note ? ' # ' + note : ''}`)
  } catch (err) {
    if (err instanceof Skip) {
      console.log(`ok ${index} - ${name} # SKIP ${err.message}`)
      return
    }
    failures += 1
    console.log(`not ok ${index} - ${name}`)
    console.log('  ---')
    console.log(`  message: ${err.message}`)
    console.log('  ...')
  }
}

// ----------------------------------------------------------------------
// État partagé (rempli par main())
// ----------------------------------------------------------------------

let A, B                                   // { token, id }
let PFX = null, PFY = null, ADMIN = null, NODOSSIER = null
let accountA = null, accountB = null
let pfxDossierIds = []
let markerDocId = null
let probeTransmissionId = null
let hookDossierId = null

// ----------------------------------------------------------------------
// 1. Familles A↔B — tables et storage
// ----------------------------------------------------------------------

const FAMILY_TABLES = [
  { table: 'questionnaires', about: 'réponses de questionnaire' },
  { table: 'roadmaps', about: 'roadmaps' },
  { table: 'steps', about: 'étapes de démarche' },
  { table: 'step_actions', about: "historique d'actions" },
  { table: 'documents', about: 'courriers générés' },
  { table: 'questionnaire_sessions', about: 'sessions de questionnaire en cours' },
  { table: 'letter_sends', about: 'envois de courrier (écriture par RPC seulement depuis le 2a)' },
  { table: 'send_debits', about: "débits d'envois" },
  { table: 'purchases', about: 'achats et pont des envois inclus' },
  { table: 'attachments', about: 'pièces jointes' },
  { table: 'sender_profiles', about: 'profils expéditeur' },
  { table: 'consents', about: 'consentements (v2)' },
  { table: 'transmissions', about: 'transmissions (F1)' },
]

async function probeFamilyIsolation(table, readerToken, ownerIds) {
  const res = await rest('GET', `${table}?select=*&limit=50`, { token: readerToken })
  if (isMissingRelation(res)) throw new Skip(`table ${table} absente de cet environnement`)
  assert(res.ok, `SELECT ${table} refusé de façon inattendue : ${describeError(res)}`)
  const rows = Array.isArray(res.data) ? res.data : []
  const leaked = rows.filter((row) => ownerIds.includes(row.user_id))
  assert(leaked.length === 0, `${leaked.length} ligne(s) étrangère(s) visibles sur ${table} (user_id parmi ${ownerIds.join(',')})`)
  return rows.length === 0 ? '0 ligne accessible (preuve faible)' : `${rows.length} ligne(s) lue(s), 0 étrangère`
}

async function probeStoragePrefix(readerToken, ownerId, label) {
  const res = await rawFetch(`${SUPABASE_URL}/storage/v1/object/list/documents`, {
    method: 'POST', token: readerToken, body: { prefix: `${ownerId}/`, limit: 100, offset: 0 },
  })
  if (res.status === 400 || res.status === 404) throw new Skip(`bucket documents indisponible (HTTP ${res.status})`)
  assert(res.ok, `listing storage refusé de façon inattendue : ${describeError(res)}`)
  const rows = Array.isArray(res.data) ? res.data : []
  assert(rows.length === 0, `${label} liste ${rows.length} objet(s) sous le préfixe d'autrui`)
  return `0 objet visible sous ${ownerId}/`
}

// ----------------------------------------------------------------------
// 2. Comptes famille (my_account) — projection sans secret
// ----------------------------------------------------------------------

const ACCOUNT_FORBIDDEN = /(family_email|invite_token_hash|price_ttc|commission_ttc)/

async function probeFamilyAccount(session, label) {
  const res = await rpc('my_account', session.token)
  if (isMissingRelation(res)) throw new Skip('RPC my_account absente (migration v2 non appliquée)')
  assert(res.ok, `my_account refusé : ${describeError(res)}`)
  const acc = res.data
  assert(acc?.role === 'family' && acc.dossier?.status === 'active', `${label} n'a pas de dossier actif (role=${acc?.role})`)
  assert(acc.consent?.required === false, `${label} : consentement requis (provisionnement incomplet)`)
  assert(!ACCOUNT_FORBIDDEN.test(JSON.stringify(acc)), `${label} : my_account expose un champ interdit`)
  return `dossier ${acc.dossier.id} actif, consentement ${acc.consent.version}`
}

async function probeDistinctDossiers() {
  assert(accountA?.dossier?.id && accountB?.dossier?.id, 'dossiers A ou B indisponibles (sonde précédente en échec)')
  assert(accountA.dossier.id !== accountB.dossier.id, 'A et B partagent le même dossier')
  const hasA = await rpc('has_active_dossier', A.token)
  assert(hasA.ok && hasA.data === true, `has_active_dossier(A) inattendu : ${JSON.stringify(hasA.data)}`)
  return 'dossiers distincts, has_active_dossier vrai'
}

// ----------------------------------------------------------------------
// 3. Marqueur + écritures croisées (documents) — écriture
// ----------------------------------------------------------------------

async function probeMarkerNotVisibleToB() {
  requireWrite()
  requireNonProd()
  const marker = `rls-probe-${randomUUID()}`
  const insertRes = await rest('POST', 'documents', {
    token: A.token,
    body: { user_id: A.id, title: marker, content: 'Marqueur de sonde RLS — supprimé en fin de run.' },
    prefer: 'return=representation',
  })
  assert(insertRes.ok && Array.isArray(insertRes.data) && insertRes.data[0], `insertion du marqueur par A impossible : ${describeError(insertRes)}`)
  markerDocId = insertRes.data[0].id
  const readRes = await rest('GET', `documents?id=eq.${markerDocId}&select=id`, { token: B.token })
  assert(readRes.ok, `lecture B refusée de façon inattendue : ${describeError(readRes)}`)
  assert((readRes.data ?? []).length === 0, `B a pu lire le marqueur de A (id=${markerDocId})`)
  return `marqueur ${markerDocId} invisible pour B`
}

async function probeCrossUpdateDenied() {
  requireWrite()
  requireNonProd()
  if (!markerDocId) throw new Skip('marqueur de A indisponible (sonde précédente en échec)')
  const res = await rest('PATCH', `documents?id=eq.${markerDocId}`, { token: B.token, body: { title: 'modifié par B' }, prefer: 'return=representation' })
  assert(res.ok, `PATCH inattendu en erreur : ${describeError(res)}`)
  assert((res.data ?? []).length === 0, `B a pu modifier le document de A (id=${markerDocId})`)
  return '0 ligne modifiée'
}

async function probeCrossInsertImpersonateDenied() {
  requireWrite()
  requireNonProd()
  const res = await rest('POST', 'documents', {
    token: B.token,
    body: { user_id: A.id, title: 'rls-probe-usurpation', content: "B tente de s'insérer en tant que A" },
    prefer: 'return=representation',
  })
  assert(!res.ok, "B a pu insérer un document en usurpant le user_id de A")
  assert(isRlsDenied(res), `refus inattendu, pas attribuable à la RLS : ${describeError(res)}`)
  return `refusé (${res.data?.code ?? res.status})`
}

// ----------------------------------------------------------------------
// 4. Deny-all — lecture (toujours) et écriture (PROBE_WRITE)
// ----------------------------------------------------------------------

const DENY_ALL_TABLES = ['dossiers', 'account_enrollments', 'seren_admins', 'partners', 'partner_users', 'attributions',
  'webhook_config', 'send_limits', 'provider_events']

async function probeDenyAllSelect(session, label) {
  const notes = []
  for (const table of DENY_ALL_TABLES) {
    const res = await rest('GET', `${table}?select=*&limit=5`, { token: session.token })
    if (isMissingRelation(res)) {
      notes.push(`${table}: absente`)
      continue
    }
    if (!res.ok) {
      notes.push(`${table}: refusé (${res.status})`)
      continue
    }
    assert((res.data ?? []).length === 0, `${label} lit ${res.data.length} ligne(s) sur ${table}`)
    notes.push(`${table}: 0`)
  }
  return notes.join(', ')
}

const NO_WRITE_POLICY_TABLES = [
  { table: 'purchases', buildRow: () => ({ user_id: B.id, status: 'paid', kind: 'forfait', included_sends: 10, stripe_session_id: `rls-probe-${randomUUID()}` }) },
  { table: 'send_debits', buildRow: () => ({ user_id: B.id, send_id: randomUUID(), source: 'included' }) },
  { table: 'letter_sends', buildRow: () => ({ user_id: B.id, template_id: 'rls-probe', channel: 'papier', status: 'prepared', dedup_key: `rls-probe-${randomUUID()}` }) },
  { table: 'dossiers', buildRow: () => ({ source: 'direct', status: 'invited', family_email: `rls-probe-${randomUUID()}@seren-test.fr`, price_ttc_cents: 0, commission_ttc_cents: 0, invite_token_hash: randomHash(), invite_expires_at: new Date(Date.now() + 86_400_000).toISOString() }) },
  { table: 'consents', buildRow: () => ({ user_id: B.id, kind: 'terms', version: '2026-09-rls-probe' }) },
  { table: 'account_enrollments', buildRow: () => ({ email: `rls-probe-${randomUUID()}@seren-test.fr`, role: 'seren_admin' }) },
  { table: 'seren_admins', buildRow: () => ({ user_id: B.id }) },
  { table: 'partners', buildRow: () => ({ name: 'rls-probe PF forgée' }) },
  { table: 'partner_users', buildRow: () => ({ user_id: B.id, partner_id: randomUUID() }) },
  { table: 'attributions', buildRow: () => ({ user_id: B.id, partner_id: randomUUID() }) },
]

async function probeNoWritePolicy(table, buildRow) {
  requireWrite()
  requireNonProd()
  const presence = await rest('GET', `${table}?select=*&limit=1`, { token: B.token })
  if (isMissingRelation(presence)) throw new Skip(`table ${table} absente de cet environnement`)
  const res = await rest('POST', table, { token: B.token, body: buildRow(), prefer: 'return=representation' })
  assert(!res.ok, `B a pu insérer directement dans ${table} (aucune policy d'écriture ne devrait le permettre)`)
  assert(isRlsDenied(res), `refus inattendu, pas attribuable à la RLS pour ${table} : ${describeError(res)}`)
  return `refusé (${res.data?.code ?? res.status})`
}

// ----------------------------------------------------------------------
// 5. RPC internes : jamais exécutables sans secret ni rôle
// ----------------------------------------------------------------------

const INTERNAL_RPCS = [
  { name: 'send_balance', body: () => ({ p_user_id: B.id }) },
  { name: 'send_limits_status', body: () => ({ p_user_id: B.id }) },
  { name: 'link_enrollments', body: () => ({}) },
  { name: 'hook_before_user_created', body: () => ({ event: { user: { email: 'rls-probe@seren-test.fr' } } }) },
  { name: 'letter_send_transition_allowed', body: () => ({ p_channel: 'papier', p_from: 'prepared', p_to: 'sent' }) },
]

const SECRET_RPCS = [
  { name: 'consume_send', body: () => ({ p_secret: 'rls-probe-wrong', p_send_id: randomUUID(), p_user_id: A.id }) },
  { name: 'release_debit', body: () => ({ p_secret: 'rls-probe-wrong', p_send_id: randomUUID(), p_user_id: A.id }) },
  { name: 'check_send_limits', body: () => ({ p_secret: 'rls-probe-wrong', p_user_id: A.id }) },
]

async function probeInternalRpcs() {
  requireNonProd()
  const notes = []
  for (const { name, body } of INTERNAL_RPCS) {
    const res = await rpc(name, A.token, body())
    assert(!res.ok, `rpc/${name} exécutable par un compte famille (HTTP ${res.status})`)
    notes.push(`${name}: ${res.status}`)
  }
  for (const { name, body } of SECRET_RPCS) {
    const res = await rpc(name, A.token, body())
    if (isMissingRelation(res)) {
      notes.push(`${name}: absente`)
      continue
    }
    assert(!res.ok, `rpc/${name} a accepté un secret faux`)
    notes.push(`${name}: ${describeError(res)}`)
  }
  return notes.join(', ')
}

// ----------------------------------------------------------------------
// 6. F1 — transmissions
// ----------------------------------------------------------------------

async function probeF1Read() {
  const res = await rest('GET', 'transmissions?select=id,user_id&limit=50', { token: B.token })
  if (isMissingRelation(res)) throw new Skip('table transmissions absente')
  assert(res.ok, `SELECT transmissions refusé : ${describeError(res)}`)
  const foreign = (res.data ?? []).filter((row) => row.user_id !== B.id)
  assert(foreign.length === 0, `B lit ${foreign.length} transmission(s) d'autrui sans code (F1 non corrigé)`)
  return `${(res.data ?? []).length} ligne(s), 0 étrangère`
}

async function probeF1ShareByCode() {
  requireWrite()
  requireNonProd()
  const code = `RLSP${randomBytes(4).toString('hex').toUpperCase()}`
  const ins = await rest('POST', 'transmissions', {
    token: A.token, body: { access_code: code, data: '{"rls_probe":true}', is_complete: false, user_id: A.id }, prefer: 'return=representation',
  })
  assert(ins.ok && ins.data?.[0]?.id, `insertion de la transmission sonde par A impossible : ${describeError(ins)}`)
  probeTransmissionId = ins.data[0].id
  const direct = await rest('GET', `transmissions?id=eq.${probeTransmissionId}&select=id`, { token: B.token })
  assert(direct.ok && (direct.data ?? []).length === 0, 'B lit la transmission de A en direct (F1 non corrigé)')
  const byCode = await rpc('get_transmission_by_code', B.token, { p_code: code.toLowerCase() })
  if (isMissingRelation(byCode)) throw new Skip('RPC get_transmission_by_code absente (F1 non déployé)')
  assert(byCode.ok && Array.isArray(byCode.data) && byCode.data.length === 1, `partage par code KO : ${describeError(byCode)}`)
  const wrong = await rpc('get_transmission_by_code', B.token, { p_code: `${code}X` })
  assert(wrong.ok && (wrong.data ?? []).length === 0, 'un mauvais code renvoie une transmission')
  return 'lecture directe 0, par code 1, mauvais code 0'
}

// ----------------------------------------------------------------------
// 7. Partenaire PF-X — liste, compteurs, contenu de SA famille A
// ----------------------------------------------------------------------

const CONTENT_KEYS = /"(answers|content|body|roadmap|roadmaps|steps|step_actions|letter_sends|attachments|documents|questionnaire|purchases|balance|consents|invite_token_hash|price_ttc_cents|commission_ttc_cents|user_id)"\s*:/i

function requirePartner(session, label = 'PF-X') {
  if (!session) throw new Skip(`aucun compte ${label} disponible`)
}

async function probePartnerAccount() {
  requirePartner(PFX)
  const res = await rpc('my_account', PFX.token)
  assert(res.ok && res.data?.role === 'partner' && res.data.dossier === null, `PF-X n'est pas role partner : ${JSON.stringify(res.data)}`)
  return `partenaire ${res.data.partner.name} (${res.data.partner.user_role})`
}

async function probePartnerListNoContent() {
  requirePartner(PFX)
  const res = await rpc('partner_list_dossiers', PFX.token)
  if (isMissingRelation(res)) throw new Skip('RPC partner_list_dossiers absente')
  assert(res.ok && res.data?.partner, `partner_list_dossiers refusé : ${describeError(res)}`)
  const payload = JSON.stringify(res.data)
  assert(!CONTENT_KEYS.test(payload), `la liste PF expose une clé de contenu ou de secret : ${payload.slice(0, 200)}`)
  pfxDossierIds = res.data.dossiers.map((d) => d.id)
  const strong = accountA?.dossier?.id && pfxDossierIds.includes(accountA.dossier.id)
  return `${pfxDossierIds.length} dossier(s), aucune clé de contenu${strong ? ' ; famille A rattachée à PF-X (preuve forte)' : ' ; famille A NON rattachée à PF-X (preuve faible)'}`
}

async function probePartnerNoFamilyContent() {
  requirePartner(PFX)
  const own = await rest('GET', 'documents?select=id&limit=1', { token: A.token })
  const aHasContent = own.ok && (own.data ?? []).length > 0
  for (const { table } of FAMILY_TABLES) {
    const res = await rest('GET', `${table}?select=*&limit=50`, { token: PFX.token })
    if (isMissingRelation(res)) continue
    assert(res.ok, `SELECT ${table} refusé de façon inattendue pour PF-X : ${describeError(res)}`)
    const leaked = (res.data ?? []).filter((row) => row.user_id === A.id || row.user_id === B.id)
    assert(leaked.length === 0, `PF-X lit ${leaked.length} ligne(s) famille sur ${table}`)
  }
  return aHasContent ? 'A possède du contenu, PF-X n\'en lit rien (preuve forte)' : 'A sans contenu (preuve faible)'
}

async function probePartnerCounters() {
  requirePartner(PFX)
  const res = await rpc('partner_month_counters', PFX.token)
  if (isMissingRelation(res)) throw new Skip('RPC partner_month_counters absente')
  assert(res.ok && res.data && typeof res.data.created_total === 'number', `compteurs PF-X indisponibles : ${describeError(res)}`)
  assert(!CONTENT_KEYS.test(JSON.stringify(res.data)), 'les compteurs exposent une clé de contenu')
  return `mois ${res.data.month}, ${res.data.created_total} dossier(s)`
}

// Revue 16/09 (must-fix 1) : preuve que les 2 RPC où l'appelant choisit le hash du jeton ne sont plus
// utilisables en direct. Sans cette barrière, PF-X fabriquerait un jeton connu d'elle et prendrait le
// compte de sa propre famille. Le vrai secret n'est JAMAIS donné aux probes.
async function probePartnerSecretRequired() {
  requirePartner(PFX)
  requireWrite()
  requireNonProd()
  const identity = {
    p_family_first_name: 'Probe', p_family_last_name: 'Secret', p_family_email: `rls-probe-secret-${randomBytes(4).toString('hex')}@seren-test.fr`,
    p_family_phone: null, p_deceased_first_name: 'Probe', p_deceased_last_name: 'Secret',
    p_deceased_death_date: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10), p_token_hash: randomHash(), p_confirm_duplicate: true,
  }
  const noSecret = await rpc('partner_create_dossier', PFX.token, identity)
  assert(!noSecret.ok, 'partner_create_dossier acceptée SANS secret')
  const wrongSecret = await rpc('partner_create_dossier', PFX.token, { p_secret: 'rls-probe-wrong', ...identity })
  assert(!wrongSecret.ok && wrongSecret.data?.message === 'invalid_secret',
    `création avec un faux secret : ${describeError(wrongSecret)} (attendu invalid_secret)`)
  const rotate = await rpc('partner_rotate_invitation', PFX.token, { p_secret: 'rls-probe-wrong', p_dossier_id: randomUUID(), p_token_hash: randomHash() })
  assert(!rotate.ok && rotate.data?.message === 'invalid_secret',
    `renvoi avec un faux secret : ${describeError(rotate)} (attendu invalid_secret)`)
  return 'création et renvoi en direct refusés (invalid_secret)'
}

// ----------------------------------------------------------------------
// 8. PF-Y contre PF-X
// ----------------------------------------------------------------------

async function probePartnerYListDisjoint() {
  requirePartner(PFY, 'PF-Y')
  const res = await rpc('partner_list_dossiers', PFY.token)
  if (isMissingRelation(res)) throw new Skip('RPC partner_list_dossiers absente')
  assert(res.ok && res.data?.partner, `partner_list_dossiers refusé pour PF-Y : ${describeError(res)}`)
  const overlap = res.data.dossiers.filter((d) => pfxDossierIds.includes(d.id))
  assert(overlap.length === 0, `PF-Y liste ${overlap.length} dossier(s) de PF-X`)
  return `${res.data.dossiers.length} dossier(s), aucun de PF-X`
}

async function probePartnerYCannotTouchPfxDossier() {
  requirePartner(PFY, 'PF-Y')
  requireWrite()
  requireNonProd()
  const target = accountA?.dossier?.id
  if (!target) throw new Skip('dossier de A indisponible')
  // Le renvoi ne passe plus par la RPC (secret serveur) : on le sonde par le VRAI chemin, où PF-Y doit
  // être traitée comme sur un dossier inexistant — 404, jamais 403 ni un indice d'existence.
  let rotateNote = 'renvoi non sondé (PROBE_API_URL absente)'
  if (API_URL) {
    const res = await api('POST', `/api/partner/dossiers/${target}/resend`, PFY.token, {})
    assert(res.status === 404 && res.data?.code === 'DOSSIER_NOT_FOUND',
      `renvoi par PF-Y : HTTP ${res.status} ${JSON.stringify(res.data)} (attendu 404 DOSSIER_NOT_FOUND ; 503 = PARTNER_ACTIVATIONS_ENABLED fermé)`)
    rotateNote = 'renvoi → 404 DOSSIER_NOT_FOUND'
  }
  const cancel = await rpc('partner_cancel_dossier', PFY.token, { p_dossier_id: target })
  assert(!cancel.ok && cancel.data?.message === 'dossier_not_found', `annulation par PF-Y : ${describeError(cancel)} (attendu dossier_not_found)`)
  return `${rotateNote}, annulation → dossier_not_found`
}

// ----------------------------------------------------------------------
// 9. Admin Seren — compteurs sans PII
// ----------------------------------------------------------------------

const ADMIN_PARTNER_KEYS = ['activated', 'cancelled', 'dossiers_this_month', 'dossiers_total', 'invited_pending', 'last_dossier_at', 'name', 'partner_id', 'status']

async function probeAdminOverview() {
  if (!ADMIN) throw new Skip('aucun compte admin disponible')
  const res = await rpc('admin_partner_overview', ADMIN.token)
  if (isMissingRelation(res)) throw new Skip('RPC admin_partner_overview absente (L4c non déployé)')
  assert(res.ok && Array.isArray(res.data?.partners), `vue admin indisponible : ${describeError(res)}`)
  for (const p of res.data.partners) {
    assert(JSON.stringify(Object.keys(p).sort()) === JSON.stringify(ADMIN_PARTNER_KEYS), `clés inattendues : ${Object.keys(p).join(',')}`)
  }
  assert(!/@/.test(JSON.stringify(res.data)), 'la vue admin contient une adresse e-mail')
  return `${res.data.partners.length} partenaire(s), compteurs seuls`
}

async function probeAdminOverviewNullForOthers() {
  const probe = await rpc('admin_partner_overview', A.token)
  if (isMissingRelation(probe)) throw new Skip('RPC admin_partner_overview absente (L4c non déployé)')
  assert(probe.ok && probe.data === null, `un compte famille obtient la vue admin : ${JSON.stringify(probe.data)}`)
  if (PFX) {
    const pf = await rpc('admin_partner_overview', PFX.token)
    assert(pf.ok && pf.data === null, `un gérant PF obtient la vue admin : ${JSON.stringify(pf.data)}`)
  }
  return 'null pour famille et PF'
}

// ----------------------------------------------------------------------
// 10. Anonyme
// ----------------------------------------------------------------------

const ANON_TABLES = ['documents', 'questionnaires', 'purchases', 'dossiers', 'consents', 'account_enrollments', 'transmissions']

async function probeAnonSelect() {
  const notes = []
  for (const table of ANON_TABLES) {
    const res = await rest('GET', `${table}?select=*&limit=5`, {})
    if (isMissingRelation(res)) {
      notes.push(`${table}: absente`)
      continue
    }
    if (!res.ok) {
      notes.push(`${table}: refusé (${res.status})`)
      continue
    }
    assert((res.data ?? []).length === 0, `anonyme lit ${res.data.length} ligne(s) sur ${table}`)
    notes.push(`${table}: 0`)
  }
  return notes.join(', ')
}

async function probeAnonInvitationPreview() {
  const res = await rpc('invitation_preview', undefined, { p_token_hash: randomHash() })
  if (isMissingRelation(res)) throw new Skip('RPC invitation_preview absente')
  assert(res.ok && res.data?.valid === false && res.data.reason === 'invalid' && Object.keys(res.data).length === 2,
    `invitation_preview anonyme inattendue : ${JSON.stringify(res.data)}`)
  return 'hash inconnu → {valid:false, reason:invalid}'
}

async function probeAnonMutatingRpcs() {
  requireNonProd()
  const claim = await rpc('claim_dossier', undefined, { p_token_hash: randomHash() })
  assert(!claim.ok, 'anonyme a pu appeler claim_dossier')
  const create = await rpc('partner_create_dossier', undefined, {
    p_secret: 'rls-probe-wrong',
    p_family_first_name: 'X', p_family_last_name: 'X', p_family_email: 'rls-probe-anon@seren-test.fr', p_family_phone: null,
    p_deceased_first_name: 'X', p_deceased_last_name: 'X', p_deceased_death_date: new Date().toISOString().slice(0, 10), p_token_hash: randomHash(),
  })
  assert(!create.ok, 'anonyme a pu appeler partner_create_dossier')
  const account = await rpc('my_account', undefined)
  assert(!account.ok || account.data === null, 'anonyme obtient un my_account non nul')
  return `claim ${claim.status}, create ${create.status}, my_account ${account.ok ? 'null' : account.status}`
}

// ----------------------------------------------------------------------
// 11. Compte sans dossier actif
// ----------------------------------------------------------------------

async function probeNoDossierAccount() {
  if (!NODOSSIER) throw new Skip('aucun compte sans dossier disponible')
  const acc = await rpc('my_account', NODOSSIER.token)
  assert(acc.ok && acc.data?.role === 'none' && acc.data.is_admin === false, `compte sans dossier : role=${acc.data?.role}`)
  const has = await rpc('has_active_dossier', NODOSSIER.token)
  assert(has.ok && has.data === false, 'has_active_dossier vrai pour un compte sans dossier')
  return 'role none, has_active_dossier faux'
}

async function probeNoDossierConsentRefused() {
  if (!NODOSSIER) throw new Skip('aucun compte sans dossier disponible')
  requireWrite()
  requireNonProd()
  const version = await rpc('consent_version', NODOSSIER.token)
  const res = await rpc('record_consents', NODOSSIER.token, { p_version: version.data, p_kinds: ['terms', 'privacy', 'sensitive_data'] })
  assert(!res.ok && res.data?.message === 'dossier_not_active', `record_consents sans dossier : ${describeError(res)}`)
  return 'dossier_not_active'
}

async function probeNoDossierHttpGate() {
  if (!NODOSSIER) throw new Skip('aucun compte sans dossier disponible')
  const quota = await api('GET', '/api/letters/quota', NODOSSIER.token)
  assert(quota.status === 403 && quota.data?.code === 'DOSSIER_NOT_ACTIVE', `GET /api/letters/quota : HTTP ${quota.status} ${JSON.stringify(quota.data)}`)
  const start = await api('POST', '/api/questionnaire/start', NODOSSIER.token, { lang: 'fr' })
  assert(start.status === 403 && start.data?.code === 'DOSSIER_NOT_ACTIVE', `POST /api/questionnaire/start : HTTP ${start.status} ${JSON.stringify(start.data)}`)
  return '403 DOSSIER_NOT_ACTIVE sur quota et questionnaire'
}

async function probeFamilyHttpMe() {
  const me = await api('GET', '/api/me', A.token)
  assert(me.status === 200 && me.data?.account?.role === 'family', `GET /api/me (A) : HTTP ${me.status}`)
  return `quota ${me.data.quota?.balance}/${me.data.quota?.included_total}`
}

// ----------------------------------------------------------------------
// 12. Hook « Before User Created » — écriture
// ----------------------------------------------------------------------

let hookEmail = null
let hookHash = null

// Le dossier de sonde passe par le serveur : la RPC exige le secret (revue 16/09). Le jeton est donc
// généré par Express et récupéré dans activation_url (SHOW_ACTIVATION_LINK=true en local et préprod).
async function ensureHookDossier() {
  if (hookDossierId) return
  requirePartner(PFX)
  if (!API_URL) throw new Skip('PROBE_API_URL absente : la création du dossier de sonde passe par le serveur')
  hookEmail = `rls-probe-hook-${randomBytes(4).toString('hex')}@seren-test.fr`
  const res = await api('POST', '/api/partner/dossiers', PFX.token, {
    family_first_name: 'Probe', family_last_name: 'Hook', family_email: hookEmail,
    deceased_first_name: 'Probe', deceased_last_name: `Hook-${hookEmail.slice(15, 23)}`,
    deceased_death_date: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10), confirm_duplicate: true,
  })
  assert(res.status === 201 && res.data?.dossier?.id, `création du dossier sonde par PF-X impossible : HTTP ${res.status} ${JSON.stringify(res.data)}`)
  const token = String(res.data.activation_url ?? '').split('#t=')[1]
  assert(Boolean(token), 'activation_url absent : SHOW_ACTIVATION_LINK=true est requis pour les sondes de hook')
  hookHash = createHash('sha256').update(token, 'utf8').digest('hex')
  hookDossierId = res.data.dossier.id
}

const signupPayload = (email, data) => ({ email, password: `Rp-${randomBytes(18).toString('base64url')}`, ...(data ? { data } : {}) })

async function probeHookRefusesStranger() {
  requireWrite()
  requireNonProd()
  const res = await auth('/signup', signupPayload(`rls-probe-inconnu-${randomBytes(4).toString('hex')}@seren-test.fr`))
  assert(!res.ok && JSON.stringify(res.data).includes('signup_requires_invitation'), `inscription non invitée : HTTP ${res.status} ${JSON.stringify(res.data)}`)
  return `refusé (HTTP ${res.status})`
}

async function probeHookRefusesInvitedWithoutHash() {
  requireWrite()
  requireNonProd()
  await ensureHookDossier()
  const res = await auth('/signup', signupPayload(hookEmail))
  assert(!res.ok && JSON.stringify(res.data).includes('signup_requires_invitation'), `invité sans hash : HTTP ${res.status} ${JSON.stringify(res.data)}`)
  return `refusé (HTTP ${res.status})`
}

async function probeHookAcceptsInvitedWithHash() {
  requireWrite()
  requireNonProd()
  await ensureHookDossier()
  const res = await auth('/signup', signupPayload(hookEmail, { invite_token_hash: hookHash }))
  assert(res.ok, `invité avec hash refusé : HTTP ${res.status} ${JSON.stringify(res.data)}`)
  return `accepté (HTTP ${res.status}) — compte ${hookEmail} laissé sans dossier actif`
}

// ----------------------------------------------------------------------
// 13. Écritures famille idempotentes
// ----------------------------------------------------------------------

async function probeFamilyIdempotentWrites() {
  requireWrite()
  requireNonProd()
  const version = await rpc('consent_version', A.token)
  const again = await rpc('record_consents', A.token, { p_version: version.data, p_kinds: ['terms', 'privacy', 'sensitive_data'] })
  assert(again.ok && again.data?.recorded === 0, `rejeu des consentements : ${JSON.stringify(again.data)}`)
  const claim = await rpc('claim_dossier', A.token, { p_token_hash: randomHash() })
  assert(claim.ok && claim.data?.claimed === false && claim.data.already_active === true, `claim d'un compte déjà actif : ${describeError(claim)}`)
  return 'consentements recorded 0, claim already_active'
}

// ----------------------------------------------------------------------
// 14. partner_dashboard v0 (rollback) — jamais de données hors PF
// ----------------------------------------------------------------------

async function probeDashboardV0() {
  const fam = await rpc('partner_dashboard', A.token)
  if (isMissingRelation(fam)) throw new Skip('RPC partner_dashboard absente')
  assert(!fam.ok || fam.data === null, `un compte famille obtient partner_dashboard : ${JSON.stringify(fam.data)}`)
  const anon = await rpc('partner_dashboard', undefined)
  // En hébergé, les privilèges par défaut ont pu donner EXECUTE à anon (seul PUBLIC a été révoqué) :
  // l'appel est alors accepté mais auth.uid() est nul → null. Aucune donnée ne sort dans les deux cas.
  assert(!anon.ok || anon.data === null, `anonyme obtient partner_dashboard : ${JSON.stringify(anon.data)}`)
  return `famille ${fam.ok ? 'null' : fam.status}, anonyme ${anon.ok ? 'null' : anon.status}`
}

// ----------------------------------------------------------------------
// Nettoyage (best-effort, hors comptage TAP)
// ----------------------------------------------------------------------

async function cleanup() {
  const steps = []
  if (markerDocId) steps.push(['marqueur', () => rest('DELETE', `documents?id=eq.${markerDocId}`, { token: A.token })])
  if (probeTransmissionId) steps.push(['transmission sonde', () => rest('DELETE', `transmissions?id=eq.${probeTransmissionId}`, { token: A.token })])
  if (hookDossierId && PFX) steps.push(['dossier sonde hook', () => rpc('partner_cancel_dossier', PFX.token, { p_dossier_id: hookDossierId })])
  for (const [label, fn] of steps) {
    try {
      const res = await fn()
      console.log(res.ok ? `# cleanup : ${label} nettoyé` : `# cleanup : échec ${label} (${describeError(res)}) — à nettoyer à la main`)
    } catch (err) {
      console.log(`# cleanup : exception ${label} : ${err.message}`)
    }
  }
}

// ----------------------------------------------------------------------
// main()
// ----------------------------------------------------------------------

async function main() {
  console.log('TAP version 13')
  console.log(`# probes RLS v2 — ${SUPABASE_URL} — ${WRITE_MODE ? 'mode ÉCRITURE' : 'lecture seule'}`)

  A = await signIn(process.env.PROBE_USER_A_EMAIL, process.env.PROBE_USER_A_PASSWORD, 'famille A')
  B = await signIn(process.env.PROBE_USER_B_EMAIL, process.env.PROBE_USER_B_PASSWORD, 'famille B')
  console.log(`# famille A = ${process.env.PROBE_USER_A_EMAIL} (${A.id})`)
  console.log(`# famille B = ${process.env.PROBE_USER_B_EMAIL} (${B.id})`)
  PFX = await signInOptional('partner', 'PF-X')
  PFY = await signInOptional('partnerY', 'PF-Y')
  NODOSSIER = await signInOptional('noDossier', 'sans dossier')
  ADMIN = await signInOptional('admin', 'admin Seren')

  // 1. Familles A↔B
  for (const { table, about } of FAMILY_TABLES) {
    await runProbe(`family:${table} — B ne lit aucune ligne de A (${about})`, () => probeFamilyIsolation(table, B.token, [A.id]))
  }
  await runProbe('storage:documents — B ne liste aucun objet sous le préfixe de A', () => probeStoragePrefix(B.token, A.id, 'B'))

  // 2. Comptes famille
  await runProbe('account:A — dossier actif, consentement courant, aucun champ interdit', async () => {
    const note = await probeFamilyAccount(A, 'A')
    accountA = (await rpc('my_account', A.token)).data
    return note
  })
  await runProbe('account:B — dossier actif, consentement courant, aucun champ interdit', async () => {
    const note = await probeFamilyAccount(B, 'B')
    accountB = (await rpc('my_account', B.token)).data
    return note
  })
  await runProbe('account:A≠B — dossiers distincts, has_active_dossier vrai', probeDistinctDossiers)

  // 3. Marqueur + écritures croisées
  await runProbe('crosswrite:documents — marqueur inséré par A invisible pour B', probeMarkerNotVisibleToB)
  await runProbe('crosswrite:documents — B ne peut pas UPDATE une ligne de A', probeCrossUpdateDenied)
  await runProbe("crosswrite:documents — B ne peut pas INSERT en usurpant le user_id de A", probeCrossInsertImpersonateDenied)

  // 4. Deny-all
  await runProbe('denyall:select — famille A ne lit aucune table v2/PF/config', () => probeDenyAllSelect(A, 'A'))
  await runProbe('denyall:select — PF-X ne lit aucune table v2/PF/config en direct', () => {
    requirePartner(PFX)
    return probeDenyAllSelect(PFX, 'PF-X')
  })
  for (const { table, buildRow } of NO_WRITE_POLICY_TABLES) {
    await runProbe(`denyall:insert:${table} — INSERT direct refusé même pour un authentifié`, () => probeNoWritePolicy(table, buildRow))
  }

  // 5. RPC internes
  await runProbe('rpc:internal — fonctions internes non exécutables, secrets faux refusés', probeInternalRpcs)

  // 6. F1
  await runProbe('f1:read — B ne lit aucune transmission d\'autrui', probeF1Read)
  await runProbe('f1:share — partage uniquement par code exact via get_transmission_by_code', probeF1ShareByCode)

  // 7-8. Partenaires
  await runProbe('partner:account — PF-X role partner, sans dossier', probePartnerAccount)
  await runProbe('partner:list — liste PF-X sans clé de contenu ni secret', probePartnerListNoContent)
  await runProbe('partner:content — PF-X ne lit aucun contenu de sa famille A ni de B', probePartnerNoFamilyContent)
  await runProbe('partner:storage — PF-X ne liste aucun objet de A', () => {
    requirePartner(PFX)
    return probeStoragePrefix(PFX.token, A.id, 'PF-X')
  })
  await runProbe('partner:counters — compteurs PF-X sans contenu', probePartnerCounters)
  await runProbe('partner:y-list — PF-Y ne liste aucun dossier de PF-X', probePartnerYListDisjoint)
  await runProbe('partner:y-actions — PF-Y ne renvoie ni n\'annule un dossier de PF-X', probePartnerYCannotTouchPfxDossier)
  await runProbe('partner:secret — création et renvoi en direct refusés sans le secret serveur', probePartnerSecretRequired)

  // 9. Admin
  await runProbe('admin:overview — compteurs par partenaire, sans PII', probeAdminOverview)
  await runProbe('admin:overview — null pour famille et PF', probeAdminOverviewNullForOthers)

  // 10. Anonyme
  await runProbe('anon:select — tables sensibles vides ou refusées sans token', probeAnonSelect)
  await runProbe('anon:invitation_preview — hash inconnu sans oracle', probeAnonInvitationPreview)
  await runProbe('anon:rpc — claim, create et my_account refusés sans token', probeAnonMutatingRpcs)

  // 11. Compte sans dossier
  await runProbe('nodossier:account — role none, aucun dossier actif', probeNoDossierAccount)
  await runProbe('nodossier:consents — record_consents refusé (dossier_not_active)', probeNoDossierConsentRefused)
  await runProbe('nodossier:http — gate serveur 403 DOSSIER_NOT_ACTIVE', probeNoDossierHttpGate)
  await runProbe('family:http — /api/me de A (famille active)', probeFamilyHttpMe)

  // 12. Hook
  await runProbe('hook:stranger — inscription d\'un e-mail non invité refusée', probeHookRefusesStranger)
  await runProbe('hook:no-hash — inscription d\'un e-mail invité sans hash refusée', probeHookRefusesInvitedWithoutHash)
  await runProbe('hook:hash — inscription d\'un e-mail invité avec hash valide acceptée', probeHookAcceptsInvitedWithHash)

  // 13-14.
  await runProbe('family:idempotent — rejeu des consentements et du claim sans effet', probeFamilyIdempotentWrites)
  await runProbe('partner_dashboard:v0 — null ou refusé hors PF', probeDashboardV0)

  await cleanup()

  console.log(`1..${index}`)
  console.log(`# ${index - failures}/${index} ok${failures ? `, ${failures} ÉCHEC(S)` : ''}`)
  process.exit(failures ? 1 : 0)
}

main().catch((err) => {
  console.error(`Bug fatal (avant/hors sondes) : ${err.message}`)
  process.exit(1)
})

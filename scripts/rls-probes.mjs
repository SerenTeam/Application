#!/usr/bin/env node
// ============================================================================
// scripts/rls-probes.mjs — Probes d'isolation RLS Supabase (rejouables)
// ============================================================================
//
// Priorité n°1 du chantier transverse Sécurité/RGPD : prouver, contre un
// environnement RÉEL (dev/préprod), que la Row Level Security empêche toute
// fuite entre deux familles (A ne lit jamais les données de B, et
// inversement) et qu'un partenaire ne lit jamais une famille. C'est
// l'industrialisation en script des sondes REST manuelles pratiquées depuis
// juillet (voir docs/audit-rls.md) — le repo n'a pas de harnais BDD-live
// (Vitest est tout-mock), donc ce script, pas la suite Vitest, est l'outil
// pour ce genre de preuve.
//
// Node pur, fetch natif, ZÉRO dépendance. Lecture seule sauf UNE écriture
// tolérée : un document « marqueur » inséré par A pour prouver que B ne le
// lit pas, supprimé en best-effort à la fin du run.
//
// -- Usage --------------------------------------------------------------
//
//   PROBE_SUPABASE_URL=https://xxxx.supabase.co \
//   PROBE_SUPABASE_KEY=sb_publishable_xxx \
//   PROBE_USER_A_EMAIL=test.e2e.claude@seren-test.fr \
//   PROBE_USER_A_PASSWORD='...' \
//   PROBE_USER_B_EMAIL=test.e2e.claude+b@seren-test.fr \
//   PROBE_USER_B_PASSWORD='...' \
//   node scripts/rls-probes.mjs
//
// Le compte B est créé à la volée via POST /auth/v1/signup s'il n'existe pas
// encore déjà (uniquement viable sur un projet où la confirmation email est
// désactivée — dev/préprod de test, jamais prod).
//
// Optionnel — sondes partenaire (sautées avec un avertissement si absentes,
// c'est attendu tant qu'aucun compte PF n'existe sur l'environnement visé) :
//
//   PROBE_PARTNER_EMAIL=... PROBE_PARTNER_PASSWORD=...
//
// JAMAIS de valeur par défaut codée en dur pour ces variables (l'absence
// doit être un échec explicite, pas une sonde silencieusement lancée contre
// le mauvais projet) et JAMAIS d'écho des mots de passe dans les logs.
//
// -- Sortie ---------------------------------------------------------------
//
// Format TAP (`ok N - …` / `not ok N - …`, plan `1..N` en fin de run),
// exit 1 si au moins une sonde échoue (les sondes sautées comptent comme
// `ok … # SKIP …`, elles ne font jamais échouer le run). Chaque sonde
// documente en une ligne (son nom TAP) la propriété RGPD/RLS qu'elle prouve.
//
// Détail d'usage (quand lancer, intégration CI future) :
// docs/runbook-rls-probes.md
// ============================================================================

import { randomUUID } from 'node:crypto'

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
const EMAIL_A = process.env.PROBE_USER_A_EMAIL
const PASSWORD_A = process.env.PROBE_USER_A_PASSWORD
const EMAIL_B = process.env.PROBE_USER_B_EMAIL
const PASSWORD_B = process.env.PROBE_USER_B_PASSWORD
const PARTNER_EMAIL = process.env.PROBE_PARTNER_EMAIL
const PARTNER_PASSWORD = process.env.PROBE_PARTNER_PASSWORD

// ----------------------------------------------------------------------
// Petit client REST (PostgREST + GoTrue), sans dépendance
// ----------------------------------------------------------------------

class AuthError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

// Signal de contrôle : une sonde qui lève un Skip n'est ni un succès « prouvé »
// ni un échec — elle est reportée `ok … # SKIP <raison>` et ne compte jamais
// dans les échecs (table/fonction absente de cet environnement, section
// partenaire non disponible…).
class Skip extends Error {}

async function rawFetch(url, { method = 'GET', token, body, prefer, headers = {} } = {}) {
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

// path relatif à /rest/v1/ — ex. "documents?select=*&limit=5" ou "rpc/partner_dashboard"
function rest(method, path, opts) {
  return rawFetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, ...opts })
}

function auth(path, body) {
  return rawFetch(`${SUPABASE_URL}/auth/v1${path}`, { method: 'POST', body })
}

function describeError(res) {
  if (res.data && typeof res.data === 'object') {
    return res.data.message ?? res.data.code ?? JSON.stringify(res.data)
  }
  return `HTTP ${res.status}`
}

// Table/fonction absente du cache de schéma PostgREST (PGRST205/PGRST202, ou
// message générique) : environnement qui n'a pas encore cette migration —
// à distinguer d'un vrai refus RLS (qui, lui, doit faire échouer la sonde).
function isMissingRelation(res) {
  if (res.status !== 404) return false
  const code = res.data?.code
  const msg = String(res.data?.message ?? '')
  return code === 'PGRST205' || code === 'PGRST202' || /schema cache/i.test(msg)
}

// Refus attribuable à la RLS (policy manquante ou WITH CHECK qui échoue) —
// distingue un « refusé comme attendu » d'un refus accidentel (mauvais
// payload, colonne manquante…) qui rendrait la sonde trompeuse.
function isRlsDenied(res) {
  if (res.ok) return false
  const code = res.data?.code
  const msg = String(res.data?.message ?? '')
  return code === '42501' || /row-level security|permission denied/i.test(msg)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

// ----------------------------------------------------------------------
// Authentification (GoTrue) — jamais d'écho de mot de passe
// ----------------------------------------------------------------------

async function signIn(email, password, label) {
  const res = await auth('/token?grant_type=password', { email, password })
  if (!res.ok || !res.data?.access_token) {
    throw new AuthError(`Connexion du compte ${label} (${email}) impossible : ${describeError(res)}`, res.status)
  }
  return { token: res.data.access_token, id: res.data.user.id }
}

// Compte B (et, en théorie, un compte partenaire de test) : créé à la volée
// si absent. Ne tente le signup QUE sur un échec de connexion plausiblement
// dû à « compte inexistant / mot de passe inconnu » (400) — une panne réseau
// ou un 5xx doit rester une vraie erreur fatale, pas déclencher un signup.
async function ensureAndSignIn(email, password, label) {
  try {
    return await signIn(email, password, label)
  } catch (err) {
    if (err instanceof AuthError && err.status && err.status !== 400) throw err
    console.log(`# compte ${label} introuvable ou mot de passe différent — création via /auth/v1/signup…`)
    const signUpRes = await auth('/signup', { email, password })
    if (!signUpRes.ok) {
      throw new Error(`Création du compte ${label} (${email}) impossible : ${describeError(signUpRes)}`)
    }
    if (signUpRes.data?.access_token && signUpRes.data?.user?.id) {
      return { token: signUpRes.data.access_token, id: signUpRes.data.user.id }
    }
    // Confirmation email désactivée mais pas de session renvoyée directement
    // par /signup selon la version de GoTrue : se reconnecter.
    return await signIn(email, password, label)
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
// État partagé entre sondes (rempli par main())
// ----------------------------------------------------------------------

let tokenA, userAId
let tokenB, userBId
let tokenPartner = null
let partnerAvailable = false
let markerDocId = null

// ----------------------------------------------------------------------
// 1. Isolation famille A↔B — table par table
// ----------------------------------------------------------------------
// Propriété prouvée pour chaque table : un SELECT * (limit 5) exécuté par B
// ne contient AUCUNE ligne de A. Comparaison sur la colonne propriétaire
// (user_id partout, y compris sender_profiles où c'est la PK). Table absente
// de l'environnement → SKIP propre (chantier pas encore migré ici).

const FAMILY_TABLES = [
  { table: 'questionnaires', about: 'réponses de questionnaire' },
  { table: 'roadmaps', about: 'roadmaps' },
  { table: 'steps', about: 'étapes de démarche' },
  { table: 'step_actions', about: "historique d'actions" },
  { table: 'documents', about: 'courriers générés' },
  { table: 'questionnaire_sessions', about: 'sessions de questionnaire en cours' },
  { table: 'letter_sends', about: 'envois de courrier' },
  { table: 'purchases', about: 'achats/paiements du forfait' },
  { table: 'attachments', about: 'pièces jointes (chantier 2a, pas encore migré à ce jour)' },
  { table: 'sender_profiles', about: 'profils expéditeur (chantier 2a, pas encore migré à ce jour)' },
]

async function probeFamilyIsolation(table, readerToken, ownerIds) {
  const res = await rest('GET', `${table}?select=*&limit=5`, { token: readerToken })
  if (isMissingRelation(res)) throw new Skip(`table ${table} absente de cet environnement`)
  assert(res.ok, `SELECT ${table} refusé de façon inattendue : ${describeError(res)}`)
  const rows = Array.isArray(res.data) ? res.data : []
  const leaked = rows.filter((row) => ownerIds.includes(row.user_id))
  assert(leaked.length === 0, `${leaked.length} ligne(s) étrangère(s) visibles sur ${table} (user_id parmi ${ownerIds.join(',')})`)
  return rows.length === 0
    ? '0 ligne accessible (preuve faible — rien à fuiter dans cet environnement)'
    : `${rows.length} ligne(s) lue(s), 0 étrangère`
}

// ----------------------------------------------------------------------
// 2. Marqueur + écritures croisées (documents)
// ----------------------------------------------------------------------

async function probeMarkerNotVisibleToB() {
  const marker = `rls-probe-${randomUUID()}`
  const insertRes = await rest('POST', 'documents', {
    token: tokenA,
    body: { user_id: userAId, title: marker, content: 'Marqueur de sonde RLS — supprimé en fin de run.' },
    prefer: 'return=representation',
  })
  assert(insertRes.ok && Array.isArray(insertRes.data) && insertRes.data[0], `insertion du marqueur par A impossible : ${describeError(insertRes)}`)
  markerDocId = insertRes.data[0].id

  const readRes = await rest('GET', `documents?id=eq.${markerDocId}&select=id`, { token: tokenB })
  assert(readRes.ok, `lecture B refusée de façon inattendue : ${describeError(readRes)}`)
  const rows = Array.isArray(readRes.data) ? readRes.data : []
  assert(rows.length === 0, `B a pu lire le marqueur de A (id=${markerDocId})`)
  return `marqueur ${markerDocId} invisible pour B`
}

async function probeCrossUpdateDenied() {
  if (!markerDocId) throw new Skip('marqueur de A indisponible (sonde précédente en échec)')
  const res = await rest('PATCH', `documents?id=eq.${markerDocId}`, {
    token: tokenB,
    body: { title: 'modifié par B' },
    prefer: 'return=representation',
  })
  assert(res.ok, `PATCH inattendu en erreur : ${describeError(res)}`)
  const rows = Array.isArray(res.data) ? res.data : []
  assert(rows.length === 0, `B a pu modifier le document de A (id=${markerDocId})`)
  return '0 ligne modifiée'
}

async function probeCrossInsertImpersonateDenied() {
  const res = await rest('POST', 'documents', {
    token: tokenB,
    body: { user_id: userAId, title: 'usurpation', content: "B tente de s'insérer en tant que A" },
    prefer: 'return=representation',
  })
  assert(!res.ok, "B a pu insérer un document en usurpant le user_id de A")
  assert(isRlsDenied(res), `refus inattendu, pas attribuable à la RLS : ${describeError(res)}`)
  return `refusé (${res.data?.code ?? res.status})`
}

// ----------------------------------------------------------------------
// 3. Tables sans policy d'écriture — INSERT direct toujours refusé
// ----------------------------------------------------------------------
// Propriété prouvée : même un INSERT « plausible » (avec le user_id du
// demandeur lui-même, pas une usurpation) est refusé — ces tables ne sont
// mutables QUE par les RPC security definer (secret webhook_config), jamais
// directement par un utilisateur authentifié.
//
// letter_sends N'EST PAS dans cette liste : au 2026-09-14 (branche main),
// elle porte encore la policy v1 "own sends" FOR ALL USING/WITH CHECK
// auth.uid() = user_id (supabase/migrations/20260716120000_letter_sends.sql)
// — un self-insert y réussit légitimement aujourd'hui. Le durcissement en
// RPC-only (suppression de cette policy) est planifié et documenté au
// chantier 2a (docs/design-chantier-2a-envoi-papier.md §3.5), pas encore
// livré. Faire échouer un « self-insert refusé » dessus serait un faux
// positif, pas une faille — voir probeLetterSendsImpersonationDenied()
// ci-dessous pour la propriété réellement garantie aujourd'hui sur cette
// table (refus de l'usurpation d'identité, qui elle est déjà vraie).

const NO_WRITE_POLICY_TABLES = [
  { table: 'purchases', buildRow: () => ({ user_id: userBId, stripe_session_id: `rls-probe-${randomUUID()}` }) },
  // send_debits/partners/attributions : schéma pas encore écrit dans ce repo
  // (chantiers 2a/3, cf. docs/design-chantier-2a-envoi-papier.md §4 et la
  // roadmap technique) — buildRow générique, à affiner quand la table existe.
  { table: 'send_debits', buildRow: () => ({ user_id: userBId, send_id: randomUUID(), source: 'included' }) },
  { table: 'partners', buildRow: () => ({}) },
  { table: 'attributions', buildRow: () => ({}) },
]

async function probeNoWritePolicy(table, buildRow) {
  const presence = await rest('GET', `${table}?select=*&limit=1`, { token: tokenB })
  if (isMissingRelation(presence)) throw new Skip(`table ${table} absente de cet environnement`)
  const res = await rest('POST', table, { token: tokenB, body: buildRow(), prefer: 'return=representation' })
  assert(!res.ok, `B a pu insérer directement dans ${table} (aucune policy d'écriture ne devrait le permettre)`)
  assert(isRlsDenied(res), `refus inattendu, pas attribuable à la RLS pour ${table} : ${describeError(res)}`)
  return `refusé (${res.data?.code ?? res.status})`
}

async function probeLetterSendsImpersonationDenied() {
  const presence = await rest('GET', 'letter_sends?select=id&limit=1', { token: tokenB })
  if (isMissingRelation(presence)) throw new Skip('table letter_sends absente de cet environnement')
  const res = await rest('POST', 'letter_sends', {
    token: tokenB,
    body: { user_id: userAId, template_id: 'rls-probe', channel: 'email', dedup_key: `rls-probe-${randomUUID()}` },
    prefer: 'return=representation',
  })
  assert(!res.ok, "B a pu insérer une ligne letter_sends en usurpant le user_id de A")
  assert(isRlsDenied(res), `refus inattendu, pas attribuable à la RLS : ${describeError(res)}`)
  return `refusé (${res.data?.code ?? res.status}) — policy owner "FOR ALL" encore en place (durcissement RPC-only prévu chantier 2a)`
}

// ----------------------------------------------------------------------
// 4. Partenaire — sauté (avec la raison) si le compte n'est pas disponible
//    ou si la table/fonction n'existe pas encore sur cet environnement
// ----------------------------------------------------------------------

const PARTNER_TABLES = ['partners', 'partner_users', 'attributions']

function requirePartner() {
  if (!partnerAvailable) throw new Skip('aucun compte partenaire disponible sur cet environnement (PROBE_PARTNER_EMAIL absent ou connexion refusée)')
}

async function probePartnerDirectSelectDenied() {
  requirePartner()
  const notes = []
  let anyPresent = false
  for (const table of PARTNER_TABLES) {
    const res = await rest('GET', `${table}?select=*&limit=5`, { token: tokenPartner })
    if (isMissingRelation(res)) {
      notes.push(`${table}: absente`)
      continue
    }
    anyPresent = true
    if (!res.ok) {
      notes.push(`${table}: refusé (${res.status})`)
      continue
    }
    const rows = Array.isArray(res.data) ? res.data : []
    assert(rows.length === 0, `le partenaire a pu lire ${rows.length} ligne(s) sur ${table}`)
    notes.push(`${table}: 0 ligne`)
  }
  if (!anyPresent) throw new Skip('partners/partner_users/attributions absentes de cet environnement')
  return notes.join(', ')
}

async function probePartnerDashboardNoPii() {
  requirePartner()
  const res = await rest('POST', 'rpc/partner_dashboard', { token: tokenPartner, body: {} })
  if (isMissingRelation(res)) throw new Skip('RPC partner_dashboard absente de cet environnement (fonctionnalité pas encore livrée)')
  assert(res.ok, `rpc/partner_dashboard refusé pour le partenaire : ${describeError(res)}`)
  const payload = JSON.stringify(res.data ?? {})
  const piiPattern = /"(email|nom|name|prenom|first_name|last_name|adresse|address|telephone|phone)"\s*:/i
  assert(!piiPattern.test(payload), `rpc/partner_dashboard expose une clé qui ressemble à de la PII : ${payload.slice(0, 200)}`)
  return 'agrégats sans clé de type email/nom'
}

async function probePartnerDashboardFamilyAccountDenied() {
  requirePartner()
  const res = await rest('POST', 'rpc/partner_dashboard', { token: tokenA, body: {} })
  if (isMissingRelation(res)) throw new Skip('RPC partner_dashboard absente de cet environnement (fonctionnalité pas encore livrée)')
  const emptyOrDenied = !res.ok || res.data === null || (Array.isArray(res.data) && res.data.length === 0)
  assert(emptyOrDenied, `un compte famille a pu obtenir un résultat de rpc/partner_dashboard : ${JSON.stringify(res.data)}`)
  return res.ok ? 'null/vide pour un compte famille' : `refusé (${res.status})`
}

async function probePartnerNoFamilyTableAccess() {
  requirePartner()
  let anyPresent = false
  for (const { table } of FAMILY_TABLES) {
    const res = await rest('GET', `${table}?select=*&limit=5`, { token: tokenPartner })
    if (isMissingRelation(res)) continue
    anyPresent = true
    assert(res.ok, `SELECT ${table} refusé de façon inattendue pour le partenaire : ${describeError(res)}`)
    const rows = Array.isArray(res.data) ? res.data : []
    const leaked = rows.filter((row) => row.user_id === userAId || row.user_id === userBId)
    assert(leaked.length === 0, `le partenaire a pu lire ${leaked.length} ligne(s) famille sur ${table}`)
  }
  if (!anyPresent) throw new Skip('aucune table famille accessible à sonder sur cet environnement')
  return 'aucune ligne famille (A ou B) visible par le partenaire'
}

// ----------------------------------------------------------------------
// 5. Anonyme — sans token, fail-closed
// ----------------------------------------------------------------------

const ANON_SENSITIVE_TABLES = ['documents', 'questionnaires', 'purchases']

async function probeAnonSelectDenied() {
  const notes = []
  for (const table of ANON_SENSITIVE_TABLES) {
    const res = await rest('GET', `${table}?select=*&limit=5`, {})
    if (isMissingRelation(res)) {
      notes.push(`${table}: absente`)
      continue
    }
    if (!res.ok) {
      notes.push(`${table}: refusé (${res.status})`)
      continue
    }
    const rows = Array.isArray(res.data) ? res.data : []
    assert(rows.length === 0, `anonyme a pu lire ${rows.length} ligne(s) sur ${table}`)
    notes.push(`${table}: 0 ligne`)
  }
  return notes.join(', ')
}

async function probeAnonPartnerDashboardDenied() {
  const res = await rest('POST', 'rpc/partner_dashboard', { body: {} })
  if (isMissingRelation(res)) throw new Skip('RPC partner_dashboard absente de cet environnement (fonctionnalité pas encore livrée)')
  assert(!res.ok, 'anonyme a pu appeler rpc/partner_dashboard')
  return `refusé (${res.status})`
}

// ----------------------------------------------------------------------
// Nettoyage (best-effort, hors comptage TAP)
// ----------------------------------------------------------------------

async function cleanup() {
  if (!markerDocId) return
  try {
    const res = await rest('DELETE', `documents?id=eq.${markerDocId}`, { token: tokenA, prefer: 'return=representation' })
    console.log(res.ok ? `# cleanup : marqueur ${markerDocId} supprimé` : `# cleanup : échec suppression marqueur ${markerDocId} (${describeError(res)}) — best-effort, à nettoyer manuellement si besoin`)
  } catch (err) {
    console.log(`# cleanup : exception lors de la suppression du marqueur : ${err.message}`)
  }
}

// ----------------------------------------------------------------------
// main()
// ----------------------------------------------------------------------

async function main() {
  console.log('TAP version 13')
  console.log(`# probes RLS — ${SUPABASE_URL}`)

  ;({ token: tokenA, id: userAId } = await signIn(EMAIL_A, PASSWORD_A, 'A'))
  ;({ token: tokenB, id: userBId } = await ensureAndSignIn(EMAIL_B, PASSWORD_B, 'B'))
  console.log(`# compte A = ${EMAIL_A} (${userAId})`)
  console.log(`# compte B = ${EMAIL_B} (${userBId})`)

  if (PARTNER_EMAIL && PARTNER_PASSWORD) {
    try {
      const partner = await signIn(PARTNER_EMAIL, PARTNER_PASSWORD, 'partenaire')
      tokenPartner = partner.token
      partnerAvailable = true
      console.log(`# compte partenaire = ${PARTNER_EMAIL} (${partner.id})`)
    } catch (err) {
      console.log(`# avertissement : connexion du compte partenaire impossible (${err.message}) — sondes partenaire sautées`)
    }
  } else {
    console.log("# avertissement : PROBE_PARTNER_EMAIL/PROBE_PARTNER_PASSWORD absents — sondes partenaire sautées (attendu tant qu'aucun compte PF n'existe sur cet environnement)")
  }

  // 1. Familles A↔B
  for (const { table, about } of FAMILY_TABLES) {
    await runProbe(`family:${table} — B ne lit aucune ligne de A (${about})`, () => probeFamilyIsolation(table, tokenB, [userAId]))
  }

  // 2. Marqueur + écritures croisées
  await runProbe('crosswrite:documents — marqueur inséré par A invisible pour B', probeMarkerNotVisibleToB)
  await runProbe('crosswrite:documents — B ne peut pas UPDATE une ligne de A', probeCrossUpdateDenied)
  await runProbe("crosswrite:documents — B ne peut pas INSERT en usurpant le user_id de A", probeCrossInsertImpersonateDenied)

  // 3. Tables sans policy d'écriture
  for (const { table, buildRow } of NO_WRITE_POLICY_TABLES) {
    await runProbe(`denyall:${table} — INSERT direct refusé même pour un authentifié`, () => probeNoWritePolicy(table, buildRow))
  }
  await runProbe('denyall:letter_sends — INSERT en usurpant le user_id de A refusé (policy owner encore FOR ALL, durcissement RPC-only au chantier 2a)', probeLetterSendsImpersonationDenied)

  // 4. Partenaire
  await runProbe('partner:direct-select — partners/partner_users/attributions vides ou refusées', probePartnerDirectSelectDenied)
  await runProbe('partner:rpc-partner_dashboard — agrégats sans PII pour le partenaire', probePartnerDashboardNoPii)
  await runProbe('partner:rpc-partner_dashboard — null pour un compte famille', probePartnerDashboardFamilyAccountDenied)
  await runProbe('partner:no-family-access — le partenaire ne lit aucune table famille (A/B)', probePartnerNoFamilyTableAccess)

  // 5. Anonyme
  await runProbe('anon:select — 3 tables sensibles vides ou refusées sans token', probeAnonSelectDenied)
  await runProbe('anon:rpc-partner_dashboard — refusé sans token', probeAnonPartnerDashboardDenied)

  await cleanup()

  console.log(`1..${index}`)
  console.log(`# ${index - failures}/${index} ok${failures ? `, ${failures} ÉCHEC(S)` : ''}`)
  process.exit(failures ? 1 : 0)
}

main().catch((err) => {
  console.error(`Bug fatal (avant/hors sondes) : ${err.message}`)
  process.exit(1)
})

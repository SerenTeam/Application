#!/usr/bin/env node
// ============================================================================
// scripts/provision-v2.mjs — Provisionnement des comptes v2 par le VRAI parcours (lot L6)
// ============================================================================
//
// Crée (ou vérifie) les comptes utilisés par les probes RLS et la démo, sans clé secrète et sans
// écrire une ligne à la main : chaque état est produit par les RPC du contrat, exactement comme en
// production. Le pont purchases et les consentements sont donc écrits par claim_dossier et
// record_consents, pas par un seed.
//
//   PF-X  (gérant enrôlé)   : compte CRÉÉ PAR ARNAUD (« Add user », mot de passe POSÉ À LA CRÉATION),
//                             apparié par UUID dans la partie 2 du seed (link_enrollments) AVANT tout
//                             appel à ce script, mot de passe fourni ici via PROVISION_PFX_PASSWORD.
//                             Ce script SE CONNECTE réellement : lancé avant la partie 2, il poserait
//                             last_sign_in_at et link_enrollments refuserait ensuite le compte
//                             (enrollment_account_untrusted). Il ne crée
//                             JAMAIS un compte interne : depuis la revue du 16/09 (must-fix 2), un
//                             compte issu d'un signUp public n'est pas fiable et link_enrollments le
//                             refuse (enrollment_account_untrusted).
//   PF-Y  (gérant enrôlé)   : idem, PROVISION_PFY_PASSWORD
//   admin (optionnel)       : idem, rôle seren_admin, PROVISION_ADMIN_PASSWORD
//   famille A (PF-X)        : dossier créé par PF-X → signUp avec le hash → claim → consentements
//                             → contenu privé (document + questionnaire marqués rls-probe)
//   famille B (PF-Y)        : même parcours, sans contenu
//   sans dossier (PF-X)     : inscrite avec un hash valide, SANS claim, dossier annulé ensuite
//   démo (optionnel, PF-X)  : même parcours que A, sans contenu (compte « pré-activé » de la démo)
//
// Les dossiers sont créés par POST /api/partner/dossiers (serveur Express), PLUS par la RPC en direct :
// depuis la revue du 16/09 (must-fix 1), partner_create_dossier exige le secret webhook_config que
// seul le serveur détient. Le jeton est donc généré par le serveur et récupéré ici dans
// activation_url (d'où SHOW_ACTIVATION_LINK=true, local et préprod uniquement) ; seul son sha256 hex
// sert ensuite au signUp, puis il est oublié.
//
// -- Usage ----------------------------------------------------------------
//
//   PROBE_SUPABASE_URL=http://127.0.0.1:54321 PROBE_SUPABASE_KEY=sb_publishable_... \
//   PROVISION_API_URL=http://127.0.0.1:3000 \
//   PROVISION_PFX_EMAIL=pf.demo@seren-test.fr PROVISION_PFY_EMAIL=pf.temoin@seren-test.fr \
//   PROVISION_PFX_PASSWORD=… PROVISION_PFY_PASSWORD=… \
//   [PROVISION_ADMIN_EMAIL=admin.demo@seren-test.fr PROVISION_ADMIN_PASSWORD=…] \
//   [PROVISION_DEMO_EMAIL=famille.demo@seren-test.fr] \
//   [PROVISION_RUN_ID=20260916] [PROBE_ENV_FILE=~/.seren-probes.env] \
//   node scripts/provision-v2.mjs            # écrit
//   node --env-file="$HOME/.seren-probes.env" scripts/provision-v2.mjs --verify   # lecture seule
//
// Préprod : ajouter E2E_TARGET=preprod (et l'URL kvtzhyxlqouvpwasedbe). Prod : refus, sans dérogation.
// Sortie : identifiants écrits dans PROBE_ENV_FILE (mode 600, hors dépôt), TAP en --verify.
// Codes : 0 OK ; 1 erreur ; 2 action d'Arnaud requise (« Add user », partie 2 du seed avec les paires
//         e-mail ↔ UUID, ou mot de passe manquant), puis relancer.
//
// Prérequis serveur (conséquence du must-fix 1) : le serveur visé par PROVISION_API_URL doit porter
// les routes L2b et tourner avec PARTNER_ACTIVATIONS_ENABLED=true, SHOW_ACTIVATION_LINK=true et un
// WEBHOOK_RPC_SECRET égal à webhook_config.rpc_secret de la base visée. Cette task ne peut donc plus
// s'exécuter avant le merge de L2b (écart E10).
// ============================================================================

import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { isProdTarget, PREPROD_PROJECT_REF, PROD_PROJECT_REF } from './check-env-target.mjs'

const VERIFY = process.argv.includes('--verify')
const RAW_URL = process.env.PROBE_SUPABASE_URL ?? ''
const KEY = process.env.PROBE_SUPABASE_KEY ?? ''

function isSecretKey(key) {
  if (/^sb_secret_/.test(key)) return true
  const parts = key.split('.')
  if (parts.length !== 3) return false
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role === 'service_role'
  } catch {
    return false
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

const IS_LOCAL = ['127.0.0.1', 'localhost'].includes(hostOf(RAW_URL))

// Garde de tête : AVANT toute lecture de fichier ou appel réseau.
function refuseUnsafeTarget() {
  if (isProdTarget(RAW_URL)) {
    console.error(`REFUS : PROBE_SUPABASE_URL vise le projet Supabase PROD (${PROD_PROJECT_REF}). Ce script crée des comptes et des dossiers : jamais sur la prod.`)
    process.exit(1)
  }
  if (!RAW_URL || !KEY) {
    console.error('REFUS : PROBE_SUPABASE_URL et PROBE_SUPABASE_KEY sont requises.')
    process.exit(1)
  }
  if (!IS_LOCAL && !(process.env.E2E_TARGET === 'preprod' && RAW_URL.includes(PREPROD_PROJECT_REF))) {
    console.error(`REFUS : hors Supabase local, ce script exige E2E_TARGET=preprod ET l'URL de la préprod (${PREPROD_PROJECT_REF}).`)
    process.exit(1)
  }
  if (isSecretKey(KEY)) {
    console.error('REFUS : PROBE_SUPABASE_KEY est une clé secrète. Seule la clé publishable est admise.')
    process.exit(1)
  }
}

refuseUnsafeTarget()

const SUPABASE_URL = RAW_URL.replace(/\/+$/, '')
const API_URL = process.env.PROVISION_API_URL ? process.env.PROVISION_API_URL.replace(/\/+$/, '') : null
const ENV_FILE = process.env.PROBE_ENV_FILE ?? join(homedir(), '.seren-probes.env')
const RUN_ID = process.env.PROVISION_RUN_ID ?? new Date().toISOString().slice(0, 10).replace(/-/g, '')
const CONSENT_KINDS = ['terms', 'privacy', 'sensitive_data']

// ----------------------------------------------------------------------
// Fichier d'identifiants (hors dépôt, mode 600)
// ----------------------------------------------------------------------

function loadEnvFile(path) {
  const out = {}
  if (!existsSync(path)) return out
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)="(.*)"$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

const stored = loadEnvFile(ENV_FILE)
const creds = { ...stored, PROBE_SUPABASE_URL: SUPABASE_URL, PROBE_SUPABASE_KEY: KEY }

function saveEnvFile() {
  const lines = Object.entries(creds).map(([k, v]) => {
    if (/["\\\n]/.test(String(v))) throw new Error(`valeur de ${k} non sérialisable (guillemet, antislash ou saut de ligne)`)
    return `${k}="${v}"`
  })
  writeFileSync(ENV_FILE, `${lines.join('\n')}\n`, { mode: 0o600 })
  chmodSync(ENV_FILE, 0o600)
}

// ----------------------------------------------------------------------
// Client REST minimal (PostgREST + GoTrue), jamais d'écho de secret
// ----------------------------------------------------------------------

async function request(path, { method = 'POST', token, body } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
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

const describe = (res) =>
  res.data && typeof res.data === 'object' ? res.data.message ?? res.data.msg ?? res.data.error_code ?? res.data.code ?? `HTTP ${res.status}` : `HTTP ${res.status}`

async function rpc(name, token, body = {}) {
  const res = await request(`/rest/v1/rpc/${name}`, { token, body })
  if (!res.ok) throw new Error(`rpc ${name} : ${describe(res)}`)
  return res.data
}

async function signIn(email, password) {
  if (!password) return null
  const res = await request('/auth/v1/token?grant_type=password', { body: { email, password } })
  return res.ok && res.data?.access_token ? { token: res.data.access_token, id: res.data.user.id } : null
}

async function signUp(email, password, metadata) {
  return request('/auth/v1/signup', { body: { email, password, ...(metadata ? { data: metadata } : {}) } })
}

const newPassword = () => `Pv2-${randomBytes(18).toString('base64url')}`
const sha256Hex = (token) => createHash('sha256').update(token, 'utf8').digest('hex')

function assertTestAddress(email, label) {
  if (!email) throw new Error(`${label} : adresse manquante`)
  if (!IS_LOCAL && !email.toLowerCase().endsWith('@seren-test.fr')) {
    throw new Error(`${label} : hors local, seules les adresses @seren-test.fr sont admises`)
  }
}

// ----------------------------------------------------------------------
// Comptes internes (gérants PF, admin)
// ----------------------------------------------------------------------

let linkRequired = false

// Revue 16/09 (must-fix 2) : ce script ne CRÉE plus de compte interne. Un compte né d'un signUp public,
// même autorisé par l'allowlist du hook, n'est pas fiable (n'importe qui connaissant l'adresse aurait
// pu s'inscrire) : link_enrollments le refuse désormais. Ici, on se contente de se connecter.
async function ensureInternal({ label, email, passwordEnv, prefix, expect }) {
  assertTestAddress(email, label)
  const password = process.env[passwordEnv] || creds[`${prefix}_PASSWORD`] || ''
  const session = password ? await signIn(email, password) : null
  if (!session) {
    if (VERIFY) throw new Error(`${label} : connexion impossible`)
    linkRequired = true
    console.log(`# ${label} : connexion impossible pour ${email} — Arnaud doit : (1) Dashboard → Authentication → « Add user » (auto-confirm), en POSANT le mot de passe à la création ; (2) coller l'UUID dans la partie 2 du seed (link_enrollments), AVANT toute connexion ; puis fournir ${passwordEnv} et relancer`)
    return { linked: false, account: null }
  }
  creds[`${prefix}_EMAIL`] = email
  creds[`${prefix}_PASSWORD`] = password
  const account = await rpc('my_account', session.token)
  const linked = expect === 'admin' ? account?.is_admin === true : account?.role === 'partner'
  if (!linked) {
    linkRequired = true
    // L'UUID est imprimé tel quel : c'est exactement ce qu'Arnaud colle dans la partie 2 du seed.
    console.log(`# ${label} : compte non rattaché (${expect}) — exécuter la partie 2 avec la paire {"email": "${email}", "user_id": "${session.id}"}, puis relancer`)
  }
  return { ...session, account, linked }
}

// ----------------------------------------------------------------------
// Familles (vrai parcours d'invitation)
// ----------------------------------------------------------------------

async function recordConsents(token) {
  const version = await rpc('consent_version', token)
  return rpc('record_consents', token, { p_version: version, p_kinds: CONSENT_KINDS })
}

async function ensureContent(session, label) {
  const docs = await request(`/rest/v1/documents?select=id&title=eq.rls-probe-content-${label}`, { method: 'GET', token: session.token })
  if (!docs.ok) throw new Error(`lecture documents ${label} : ${describe(docs)}`)
  if (docs.data.length === 0) {
    const ins = await request('/rest/v1/documents', {
      token: session.token,
      body: { user_id: session.id, title: `rls-probe-content-${label}`, content: `Contenu privé de la famille ${label} — sonde RLS v2, jamais visible par la PF.` },
    })
    if (!ins.ok) throw new Error(`insertion du document ${label} : ${describe(ins)}`)
  }
  const qs = await request('/rest/v1/questionnaires?select=id&limit=1', { method: 'GET', token: session.token })
  if (!qs.ok) throw new Error(`lecture questionnaires ${label} : ${describe(qs)}`)
  if (qs.data.length === 0) {
    const ins = await request('/rest/v1/questionnaires', { token: session.token, body: { user_id: session.id, answers: { rls_probe: true } } })
    if (!ins.ok) throw new Error(`insertion du questionnaire ${label} : ${describe(ins)}`)
  }
}

// Création d'un dossier par le VRAI chemin serveur (contrat §3.4 : la RPC exige le secret, que seul
// Express détient). Le jeton est généré par le serveur ; on le récupère dans activation_url, qui n'est
// présent qu'avec SHOW_ACTIVATION_LINK=true (local et préprod ; jamais en prod, où ce script ne tourne pas).
async function createDossierViaApi({ label, partner, identity, email }) {
  if (!API_URL) throw new Error(`${label} : PROVISION_API_URL est requise — la création de dossier passe par POST /api/partner/dossiers (la RPC exige le secret serveur)`)
  const res = await fetch(`${API_URL}/api/partner/dossiers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${partner.token}` },
    body: JSON.stringify({
      family_first_name: identity.familyFirst,
      family_last_name: identity.familyLast,
      family_email: email,
      deceased_first_name: identity.deceasedFirst,
      deceased_last_name: identity.deceasedLast,
      deceased_death_date: new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10),
      confirm_duplicate: true,
    }),
  })
  const data = await res.json().catch(() => null)
  if (res.status !== 201 || !data?.dossier?.id) {
    throw new Error(`${label} : dossier non créé par le serveur (HTTP ${res.status} ${data?.code ?? ''}) — vérifier PARTNER_ACTIVATIONS_ENABLED et WEBHOOK_RPC_SECRET (= webhook_config)`)
  }
  const token = String(data.activation_url ?? '').split('#t=')[1]
  if (!token) throw new Error(`${label} : activation_url absent — SHOW_ACTIVATION_LINK=true est requis sur le serveur visé`)
  return { dossier: data.dossier, hash: sha256Hex(token) }
}

async function ensureFamily({ label, prefix, email, partner, identity, claim, content, cancelAfter }) {
  assertTestAddress(email, label)
  const password = creds[`${prefix}_PASSWORD`] || newPassword()
  const existing = await signIn(email, password)
  if (existing) {
    const account = await rpc('my_account', existing.token)
    if (claim && account?.role === 'family' && account.dossier?.status === 'active') {
      if (account.consent.required && !VERIFY) await recordConsents(existing.token)
      if (content && !VERIFY) await ensureContent(existing, label)
      console.log(`# ${label} : déjà provisionnée`)
      return existing
    }
    if (!claim && account?.role === 'none') {
      console.log(`# ${label} : déjà provisionnée`)
      return existing
    }
    throw new Error(`${label} : compte existant dans un état inattendu (role=${account?.role}) — changer PROVISION_RUN_ID`)
  }
  if (VERIFY) throw new Error(`${label} : connexion impossible`)
  if (!partner.linked) throw new Error(`${label} : la PF émettrice n'est pas rattachée (link_enrollments)`)

  // Le dossier passe par le serveur : la RPC exige le secret webhook_config (must-fix 1).
  const { dossier, hash } = await createDossierViaApi({ label, partner, identity, email })
  const created = { dossier }

  const su = await signUp(email, password, { invite_token_hash: hash })
  if (!su.ok) throw new Error(`${label} : inscription invitée refusée (${describe(su)})`)
  const session = su.data?.access_token ? { token: su.data.access_token, id: su.data.user.id } : await signIn(email, password)
  if (!session) throw new Error(`${label} : pas de session après inscription (Confirm email actif ?)`)
  creds[`${prefix}_EMAIL`] = email
  creds[`${prefix}_PASSWORD`] = password
  saveEnvFile()

  if (claim) {
    const claimed = await rpc('claim_dossier', session.token, { p_token_hash: hash })
    if (claimed?.claimed !== true && claimed?.already_active !== true) throw new Error(`${label} : claim refusé (${JSON.stringify(claimed)})`)
    await recordConsents(session.token)
  }
  // Best effort, comme le front (§6) : le hash est déjà mort côté base.
  await request('/auth/v1/user', { method: 'PUT', token: session.token, body: { data: { invite_token_hash: null } } })
  if (cancelAfter) await rpc('partner_cancel_dossier', partner.token, { p_dossier_id: created.dossier.id })
  if (content) await ensureContent(session, label)
  console.log(`# ${label} : provisionnée (${claim ? 'dossier actif, consentements, pont' : 'inscrite sans dossier actif'})`)
  return session
}

// ----------------------------------------------------------------------
// Vérification en lecture (--verify)
// ----------------------------------------------------------------------

let index = 0
let failures = 0
function tap(ok, name, note) {
  index += 1
  if (!ok) failures += 1
  console.log(`${ok ? 'ok' : 'not ok'} ${index} - ${name}${note ? ` # ${note}` : ''}`)
}

async function quotaOf(session) {
  const p = await request('/rest/v1/purchases?select=included_sends,status', { method: 'GET', token: session.token })
  const d = await request('/rest/v1/send_debits?select=source', { method: 'GET', token: session.token })
  if (!p.ok || !d.ok) throw new Error(`lecture du quota impossible (${describe(p.ok ? d : p)})`)
  const included = p.data.filter((r) => r.status === 'paid').reduce((s, r) => s + r.included_sends, 0)
  const used = d.data.filter((r) => r.source === 'included' || r.source === 'extra').length
  return { included, balance: Math.max(0, included - used) }
}

async function verifyFamily(label, prefix, { active }) {
  const session = await signIn(creds[`${prefix}_EMAIL`], creds[`${prefix}_PASSWORD`])
  if (!session) return tap(false, `${label} : connexion`, 'identifiants absents ou refusés')
  const account = await rpc('my_account', session.token)
  if (!active) return tap(account?.role === 'none', `${label} : role none`, `role=${account?.role}`)
  tap(account?.role === 'family' && account.dossier?.status === 'active', `${label} : dossier actif`, `role=${account?.role}`)
  tap(account?.consent?.required === false, `${label} : consentement à la version courante`)
  const q = await quotaOf(session)
  const allowUsed = process.env.VERIFY_ALLOW_USED === '1'
  tap(q.included === 10 && (allowUsed ? q.balance >= 1 : q.balance === 10), `${label} : quota`, `${q.balance}/${q.included}`)
}

// ----------------------------------------------------------------------
// main()
// ----------------------------------------------------------------------

async function main() {
  const pfxEmail = process.env.PROVISION_PFX_EMAIL ?? creds.PROBE_PARTNER_EMAIL
  const pfyEmail = process.env.PROVISION_PFY_EMAIL ?? creds.PROBE_PARTNER_Y_EMAIL
  const adminEmail = process.env.PROVISION_ADMIN_EMAIL ?? creds.PROBE_ADMIN_EMAIL
  const demoEmail = process.env.PROVISION_DEMO_EMAIL ?? creds.PROBE_DEMO_EMAIL
  if (!pfxEmail || !pfyEmail) throw new Error('PROVISION_PFX_EMAIL et PROVISION_PFY_EMAIL sont requises')
  if (!VERIFY && !API_URL) throw new Error('PROVISION_API_URL est requise : les dossiers sont créés par POST /api/partner/dossiers (la RPC exige le secret serveur)')

  if (VERIFY) console.log('TAP version 13')
  console.log(`# provision-v2 — ${SUPABASE_URL} — ${VERIFY ? 'vérification (lecture seule)' : `run ${RUN_ID}`}`)

  const pfx = await ensureInternal({ label: 'PF-X', email: pfxEmail, passwordEnv: 'PROVISION_PFX_PASSWORD', prefix: 'PROBE_PARTNER', expect: 'partner' })
  const pfy = await ensureInternal({ label: 'PF-Y', email: pfyEmail, passwordEnv: 'PROVISION_PFY_PASSWORD', prefix: 'PROBE_PARTNER_Y', expect: 'partner' })
  if (adminEmail) await ensureInternal({ label: 'admin', email: adminEmail, passwordEnv: 'PROVISION_ADMIN_PASSWORD', prefix: 'PROBE_ADMIN', expect: 'admin' })
  if (!VERIFY) saveEnvFile()

  if (VERIFY) {
    tap(pfx.linked, 'PF-X : role partner')
    tap(pfy.linked, 'PF-Y : role partner')
    await verifyFamily('famille A', 'PROBE_USER_A', { active: true })
    await verifyFamily('famille B', 'PROBE_USER_B', { active: true })
    await verifyFamily('sans dossier', 'PROBE_NODOSSIER', { active: false })
    if (creds.PROBE_DEMO_EMAIL) await verifyFamily('démo', 'PROBE_DEMO', { active: true })
    console.log(`1..${index}`)
    console.log(`# ${index - failures}/${index} ok${failures ? `, ${failures} ÉCHEC(S)` : ''}`)
    process.exit(failures ? 1 : 0)
  }

  if (linkRequired) {
    console.log(`# identifiants enregistrés dans ${ENV_FILE} ; relancer après « Add user » + partie 2 du seed (paires e-mail ↔ UUID)`)
    process.exit(2)
  }

  const familyEmail = (tag) => creds[`PROBE_${tag}_EMAIL`] ?? `rls-probe-${tag.toLowerCase().replace(/_/g, '-')}-${RUN_ID}@seren-test.fr`
  await ensureFamily({
    label: 'famille A', prefix: 'PROBE_USER_A', email: familyEmail('USER_A'), partner: pfx, claim: true, content: true,
    identity: { familyFirst: 'Probe', familyLast: 'Famille A', deceasedFirst: 'Jean', deceasedLast: `Probe-A-${RUN_ID}` },
  })
  await ensureFamily({
    label: 'famille B', prefix: 'PROBE_USER_B', email: familyEmail('USER_B'), partner: pfy, claim: true, content: false,
    identity: { familyFirst: 'Probe', familyLast: 'Famille B', deceasedFirst: 'Luc', deceasedLast: `Probe-B-${RUN_ID}` },
  })
  await ensureFamily({
    label: 'sans dossier', prefix: 'PROBE_NODOSSIER', email: familyEmail('NODOSSIER'), partner: pfx, claim: false, content: false, cancelAfter: true,
    identity: { familyFirst: 'Probe', familyLast: 'Sans Dossier', deceasedFirst: 'Paul', deceasedLast: `Probe-N-${RUN_ID}` },
  })
  if (demoEmail) {
    await ensureFamily({
      label: 'démo', prefix: 'PROBE_DEMO', email: demoEmail, partner: pfx, claim: true, content: false,
      identity: { familyFirst: 'Claire', familyLast: 'Martin', deceasedFirst: 'Jean', deceasedLast: 'Martin' },
    })
  }
  saveEnvFile()
  console.log(`# OK — identifiants dans ${ENV_FILE} (mode 600). Vérifier : node --env-file="${ENV_FILE}" scripts/provision-v2.mjs --verify`)
}

main().catch((err) => {
  console.error(`ÉCHEC provision-v2 : ${err.message}`)
  process.exit(1)
})

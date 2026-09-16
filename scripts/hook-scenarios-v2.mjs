#!/usr/bin/env node
// ============================================================================
// scripts/hook-scenarios-v2.mjs — Scénarios HTTP du hook « Before User Created » (contrat §10.2)
// ============================================================================
//
// Prouve, contre GoTrue LOCAL et avec le hook réellement branché (supabase/config.toml), que
// l'inscription est fermée : refus de tout e-mail non invité et de toute invitation sans hash
// valide ; acceptation de l'allowlist d'enrôlement et d'un e-mail invité porteur du bon hash, puis
// claim de bout en bout. Complète les scénarios SQL (S0 appelle la fonction en direct) : ici on
// vérifie le branchement, les droits de supabase_auth_admin et le passage de user_metadata (H2, H5).
//
// LOCAL UNIQUEMENT : fixtures écrites en SQL dans le conteneur Postgres local, inscriptions réelles.
// Refus de toute URL qui n'est pas 127.0.0.1/localhost, et de toute clé secrète.
//
// Usage :
//   HOOK_SUPABASE_KEY=$(supabase status -o json --workdir <worktree> | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).PUBLISHABLE_KEY)') \
//   node scripts/hook-scenarios-v2.mjs
// Variables : HOOK_SUPABASE_URL (défaut http://127.0.0.1:54321), HOOK_SUPABASE_KEY (clé publishable
// locale, requise), SUPABASE_DB_CONTAINER (défaut supabase_db_Application).
// Sortie TAP ; exit 1 au premier cas faux (tous les cas sont exécutés, nettoyage garanti).
// ============================================================================

import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { isProdTarget } from './check-env-target.mjs'

const BASE_URL = (process.env.HOOK_SUPABASE_URL ?? 'http://127.0.0.1:54321').replace(/\/+$/, '')
const KEY = process.env.HOOK_SUPABASE_KEY
const CONTAINER = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_Application'

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

function refuseUnsafeTarget() {
  let host = ''
  try {
    host = new URL(BASE_URL).hostname
  } catch {
    host = ''
  }
  if (isProdTarget(BASE_URL) || !['127.0.0.1', 'localhost'].includes(host)) {
    console.error(`REFUS : ${BASE_URL} n'est pas l'API Supabase locale. Ce script écrit (fixtures SQL, inscriptions) : local uniquement.`)
    process.exit(1)
  }
  if (!KEY) {
    console.error('REFUS : HOOK_SUPABASE_KEY manquante (clé publishable LOCALE : supabase status -o json).')
    process.exit(1)
  }
  if (isSecretKey(KEY)) {
    console.error('REFUS : HOOK_SUPABASE_KEY est une clé secrète. Seule la clé publishable est admise, même en local.')
    process.exit(1)
  }
}

refuseUnsafeTarget()

const RUN = randomBytes(4).toString('hex')
const mail = (label) => `${label}-${RUN}@hook.seren-test.fr`
const sha256Hex = (token) => createHash('sha256').update(token, 'utf8').digest('hex')
const newToken = () => randomBytes(32).toString('base64url')
const newPassword = () => `Hk-${randomBytes(18).toString('base64url')}`
const lit = (value) => (value === null ? 'null' : `'${String(value).replace(/'/g, "''")}'`)

function sql(text) {
  return execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-q'], {
    input: text,
    encoding: 'utf8',
  })
}

async function http(path, { body, token } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
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

const signUp = (email, metadata) =>
  http('/auth/v1/signup', { body: { email, password: newPassword(), ...(metadata ? { data: metadata } : {}) } })

let index = 0
let failures = 0
async function check(name, fn) {
  index += 1
  try {
    const note = await fn()
    console.log(`ok ${index} - ${name}${note ? ` # ${note}` : ''}`)
  } catch (err) {
    failures += 1
    console.log(`not ok ${index} - ${name}`)
    console.log(`  ---\n  message: ${err.message}\n  ...`)
  }
}

function assertRefused(res) {
  const payload = JSON.stringify(res.data)
  if (res.ok) throw new Error(`inscription ACCEPTÉE (HTTP ${res.status}) alors qu'elle devait être refusée`)
  if (!payload.includes('signup_requires_invitation')) {
    throw new Error(`refus non attribuable au hook (HTTP ${res.status}) : ${payload.slice(0, 200)}`)
  }
  return `refusé HTTP ${res.status}`
}

function assertAccepted(res) {
  if (!res.ok) throw new Error(`inscription REFUSÉE (HTTP ${res.status}) : ${JSON.stringify(res.data).slice(0, 200)}`)
  return `accepté HTTP ${res.status}`
}

const PARTNER_ID = randomUUID()
const TOKENS = { invite: newToken(), other: newToken(), expired: newToken(), cancelled: newToken() }

function setupFixtures() {
  const invited = (email, token, expires, issued) => `(${lit(PARTNER_ID)}, 'partner', 'invited', 'Hook', 'Scenario', ${lit(email)}, 'Defunt', 'Scenario',
      current_date - 2, 29000, 7000, ${lit(sha256Hex(token))}, ${expires}, ${issued})`
  sql(`
    insert into public.partners (id, name) values (${lit(PARTNER_ID)}, ${lit(`PF Hook ${RUN}`)});
    insert into public.account_enrollments (email, role, partner_id) values
      (${lit(mail('manager'))}, 'partner_manager', ${lit(PARTNER_ID)}),
      (${lit(mail('admin'))}, 'seren_admin', null);
    insert into public.dossiers (partner_id, source, status, family_first_name, family_last_name, family_email,
                                 deceased_first_name, deceased_last_name, deceased_death_date,
                                 price_ttc_cents, commission_ttc_cents, invite_token_hash, invite_expires_at, invite_issued_at) values
      ${invited(mail('invite'), TOKENS.invite, "now() + interval '7 days'", 'now()')},
      ${invited(mail('autre'), TOKENS.other, "now() + interval '7 days'", 'now()')},
      ${invited(mail('expire'), TOKENS.expired, "now() - interval '1 minute'", "now() - interval '8 days'")},
      ${invited(mail('annule'), TOKENS.cancelled, "now() + interval '7 days'", 'now()')};
    update public.dossiers set status = 'cancelled', cancelled_at = now(), invite_token_hash = null, invite_expires_at = null
     where family_email = ${lit(mail('annule'))};
  `)
}

function cleanup() {
  try {
    sql(`
      delete from public.dossiers where partner_id = ${lit(PARTNER_ID)};
      delete from public.account_enrollments where email like ${lit(`%-${RUN}@hook.seren-test.fr`)};
      delete from auth.users where email like ${lit(`%-${RUN}@hook.seren-test.fr`)};
      delete from public.partners where id = ${lit(PARTNER_ID)};
    `)
    console.log(`# nettoyage : fixtures du run ${RUN} supprimées`)
  } catch (err) {
    console.log(`# nettoyage : ÉCHEC (${err.message}) — supprimer à la main les lignes *-${RUN}@hook.seren-test.fr`)
  }
}

async function main() {
  console.log('TAP version 13')
  console.log(`# hook before_user_created — ${BASE_URL} — run ${RUN}`)
  setupFixtures()
  try {
    await check('e-mail aléatoire, sans metadata → refusé', async () => assertRefused(await signUp(mail('inconnu'))))
    await check('e-mail invité, sans hash → refusé', async () => assertRefused(await signUp(mail('invite'))))
    await check("e-mail invité, hash d'un autre dossier → refusé", async () =>
      assertRefused(await signUp(mail('invite'), { invite_token_hash: sha256Hex(TOKENS.other) })))
    await check('e-mail invité, hash expiré → refusé', async () =>
      assertRefused(await signUp(mail('expire'), { invite_token_hash: sha256Hex(TOKENS.expired) })))
    await check("e-mail d'un dossier annulé, ancien hash → refusé", async () =>
      assertRefused(await signUp(mail('annule'), { invite_token_hash: sha256Hex(TOKENS.cancelled) })))
    await check('aucun compte auth créé par les refus', async () => {
      const n = sql(`select count(*) from auth.users where email in (${[mail('inconnu'), mail('invite'), mail('expire'), mail('annule')].map(lit).join(', ')});`).trim()
      if (n !== '0') throw new Error(`${n} compte(s) créé(s) malgré le refus`)
      return '0 compte'
    })
    await check('e-mail enrôlé partner_manager → accepté', async () => assertAccepted(await signUp(mail('manager'))))
    await check('e-mail enrôlé seren_admin → accepté', async () => assertAccepted(await signUp(mail('admin'))))
    await check('e-mail invité + hash valide → accepté, puis claim_dossier OK', async () => {
      const res = await signUp(mail('invite'), { invite_token_hash: sha256Hex(TOKENS.invite) })
      assertAccepted(res)
      const token = res.data?.access_token
      if (!token) throw new Error('inscription acceptée sans session (Confirm email actif en local ?)')
      const claim = await http('/rest/v1/rpc/claim_dossier', { token, body: { p_token_hash: sha256Hex(TOKENS.invite) } })
      if (!claim.ok || claim.data?.claimed !== true) throw new Error(`claim refusé : HTTP ${claim.status} ${JSON.stringify(claim.data)}`)
      // `status || '|' || (invite_token_hash is null)` concatène un BOOLÉEN : la conversion
      // booléen → texte rend 'true'/'false' (le 't'/'f' n'est que l'affichage psql d'une COLONNE
      // booléenne). L'attendu est donc 'active|true' — cf. note post-revue du 2026-09-16.
      const state = sql(`select status || '|' || (invite_token_hash is null) from public.dossiers where family_email = ${lit(mail('invite'))};`).trim()
      if (state !== 'active|true') throw new Error(`dossier dans un état inattendu : ${state}`)
      return 'dossier actif, hash effacé'
    })
  } finally {
    cleanup()
  }
  console.log(`1..${index}`)
  console.log(`# ${index - failures}/${index} ok${failures ? `, ${failures} ÉCHEC(S)` : ''}`)
  process.exit(failures ? 1 : 0)
}

main().catch((err) => {
  console.error(`Bug fatal : ${err.message}`)
  cleanup()
  process.exit(1)
})

// Garde d'environnement de scripts/provision-v2.mjs (lot L6, contrat §8.2) : ce script CRÉE des
// comptes et des dossiers — il doit refuser la prod dans tous ses modes, exiger E2E_TARGET=preprod
// hors local, et rejeter toute clé secrète.
//
// Aucun appel réseau : les URL « prod » visent 127.0.0.1 (le project-ref n'apparaît que dans le
// chemin), les autres cas visent le port 9 (fermé). PROBE_ENV_FILE pointe systématiquement sur un
// fichier inexistant d'un répertoire temporaire : le test ne lit ni n'écrit jamais le fichier
// d'identifiants réel (~/.seren-probes.env).
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PROD_PROJECT_REF, PREPROD_PROJECT_REF } from '../scripts/check-env-target.mjs'

const PROVISION_SCRIPT = fileURLToPath(new URL('../scripts/provision-v2.mjs', import.meta.url))

const PROD_URL = `http://127.0.0.1:9/${PROD_PROJECT_REF}`
const PREPROD_URL = `https://${PREPROD_PROJECT_REF}.supabase.co`
const LOCAL_URL = 'http://127.0.0.1:9'
const PUBLISHABLE = 'sb_publishable_test_dummy'

// JWT de forme service_role (signature factice) : seule la charge utile est lue par isSecretKey().
const SERVICE_ROLE_JWT = [
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url'),
  'signature-factice',
].join('.')

// Environnement minimal et explicite : jamais hérité du shell (qui pourrait porter E2E_TARGET,
// PROVISION_* ou une vraie URL Supabase).
function runProvision(env: Record<string, string>, args: string[] = []) {
  const envFile = join(mkdtempSync(join(tmpdir(), 'seren-provision-')), 'absent.env')
  const res = spawnSync(process.execPath, [PROVISION_SCRIPT, ...args], {
    env: { PROBE_ENV_FILE: envFile, ...env },
    encoding: 'utf8',
    timeout: 15_000,
  })
  return { ...res, envFile }
}

describe('provision-v2 — garde anti-prod', () => {
  it('refuse (exit 1) une cible prod, avant tout appel réseau', () => {
    const res = runProvision({ PROBE_SUPABASE_URL: PROD_URL, PROBE_SUPABASE_KEY: PUBLISHABLE })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain('REFUS')
    expect(res.stderr).toContain(PROD_PROJECT_REF)
    // Aucune trace d'exécution : le script n'a pas atteint sa bannière.
    expect(res.stdout).not.toContain('# provision-v2')
  })

  it('refuse la prod aussi en --verify (le mode lecture seule n\'ouvre aucune brèche)', () => {
    const res = runProvision({ PROBE_SUPABASE_URL: PROD_URL, PROBE_SUPABASE_KEY: PUBLISHABLE }, ['--verify'])
    expect(res.status).toBe(1)
    expect(res.stderr).toContain('REFUS')
    expect(res.stdout).not.toContain('TAP version')
  })

  it('refuse une cible non locale sans E2E_TARGET=preprod', () => {
    const res = runProvision({ PROBE_SUPABASE_URL: PREPROD_URL, PROBE_SUPABASE_KEY: PUBLISHABLE })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain('REFUS')
    expect(res.stderr).toContain('E2E_TARGET=preprod')
  })

  it('refuse une clé secrète (préfixe sb_secret_) même en local', () => {
    const res = runProvision({ PROBE_SUPABASE_URL: LOCAL_URL, PROBE_SUPABASE_KEY: 'sb_secret_ne_doit_pas_passer' })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain('REFUS')
    expect(res.stderr).toContain('clé secrète')
  })

  it('refuse une clé secrète de forme JWT service_role', () => {
    const res = runProvision({ PROBE_SUPABASE_URL: LOCAL_URL, PROBE_SUPABASE_KEY: SERVICE_ROLE_JWT })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain('clé secrète')
  })

  it('refuse quand PROBE_SUPABASE_URL ou PROBE_SUPABASE_KEY manque', () => {
    expect(runProvision({ PROBE_SUPABASE_KEY: PUBLISHABLE }).status).toBe(1)
    expect(runProvision({ PROBE_SUPABASE_URL: LOCAL_URL }).status).toBe(1)
  })

  it("n'écrit jamais la clé dans le message de refus", () => {
    const key = 'sb_secret_ne_doit_jamais_apparaitre'
    const res = runProvision({ PROBE_SUPABASE_URL: LOCAL_URL, PROBE_SUPABASE_KEY: key })
    expect(res.stderr).not.toContain(key)
    expect(res.stdout).not.toContain(key)
  })

  it('ne bloque pas une cible locale (échec plus loin, faute de comptes — pas la garde)', () => {
    const res = runProvision({ PROBE_SUPABASE_URL: LOCAL_URL, PROBE_SUPABASE_KEY: PUBLISHABLE })
    expect(res.status).toBe(1)
    expect(res.stderr).not.toContain('REFUS')
    expect(res.stderr).toContain('ÉCHEC provision-v2')
    // Le fichier d'identifiants n'est jamais créé quand le script s'arrête avant le provisionnement.
    expect(existsSync(res.envFile)).toBe(false)
  })
})

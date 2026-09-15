// Garde d'environnement (lot L0) : scripts/check-env-target.mjs refuse une cible Supabase PROD,
// et scripts/rls-probes.mjs refuse de s'exécuter (il écrit) contre la prod.
// Aucun appel réseau : les URL « prod » de ces tests visent 127.0.0.1 (le project-ref n'apparaît
// que dans le chemin) — si une garde régressait, la requête échouerait en local, jamais vers Supabase.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  isProdTarget,
  checkEnvTarget,
  PROD_PROJECT_REF,
  PREPROD_PROJECT_REF,
} from '../scripts/check-env-target.mjs'

const CHECK_SCRIPT = fileURLToPath(new URL('../scripts/check-env-target.mjs', import.meta.url))
const PROBES_SCRIPT = fileURLToPath(new URL('../scripts/rls-probes.mjs', import.meta.url))

const PROD_URL = `https://${PROD_PROJECT_REF}.supabase.co`
const PREPROD_URL = `https://${PREPROD_PROJECT_REF}.supabase.co`
const LOCAL_URL = 'http://localhost:54321'

// Environnement minimal et explicite pour les sous-processus : jamais hérité du shell du
// développeur (qui pourrait contenir SUPABASE_URL, PROD_OK…).
function runNode(script: string, env: Record<string, string>, cwd?: string) {
  return spawnSync(process.execPath, [script], { env, cwd, encoding: 'utf8', timeout: 15_000 })
}

describe('isProdTarget', () => {
  it("vrai pour l'URL du projet prod", () => {
    expect(isProdTarget(PROD_URL)).toBe(true)
  })

  it('vrai quelle que soit la casse ou la forme (hôte, chemin, sans schéma)', () => {
    expect(isProdTarget(`https://${PROD_PROJECT_REF.toUpperCase()}.supabase.co`)).toBe(true)
    expect(isProdTarget(`${PROD_PROJECT_REF}.supabase.co/rest/v1`)).toBe(true)
    expect(isProdTarget(`postgresql://postgres@db.${PROD_PROJECT_REF}.supabase.co:5432/postgres`)).toBe(true)
  })

  it('faux pour la préprod et le Supabase local', () => {
    expect(isProdTarget(PREPROD_URL)).toBe(false)
    expect(isProdTarget(LOCAL_URL)).toBe(false)
  })

  it('faux pour toute valeur absente ou non-chaîne', () => {
    expect(isProdTarget(undefined)).toBe(false)
    expect(isProdTarget(null)).toBe(false)
    expect(isProdTarget('')).toBe(false)
    expect(isProdTarget(42)).toBe(false)
    expect(isProdTarget({ url: PROD_URL })).toBe(false)
  })
})

describe('checkEnvTarget', () => {
  it('refuse (1) si SUPABASE_URL vise la prod', () => {
    const result = checkEnvTarget({ SUPABASE_URL: PROD_URL, VITE_SUPABASE_URL: PREPROD_URL })
    expect(result.exitCode).toBe(1)
    expect(result.prodVars).toEqual(['SUPABASE_URL'])
    expect(result.message).toMatch(/^REFUS/)
    expect(result.message).toContain(PROD_PROJECT_REF)
  })

  it('refuse (1) si VITE_SUPABASE_URL seule vise la prod', () => {
    const result = checkEnvTarget({ SUPABASE_URL: PREPROD_URL, VITE_SUPABASE_URL: PROD_URL })
    expect(result.exitCode).toBe(1)
    expect(result.prodVars).toEqual(['VITE_SUPABASE_URL'])
  })

  it('accepte (0) la préprod, le local, ou des variables absentes', () => {
    expect(checkEnvTarget({ SUPABASE_URL: PREPROD_URL, VITE_SUPABASE_URL: PREPROD_URL }).exitCode).toBe(0)
    expect(checkEnvTarget({ SUPABASE_URL: LOCAL_URL, VITE_SUPABASE_URL: LOCAL_URL }).exitCode).toBe(0)
    expect(checkEnvTarget({}).exitCode).toBe(0)
  })

  it('PROD_OK=1 (valeur exacte) lève le refus avec un avertissement', () => {
    const result = checkEnvTarget({ SUPABASE_URL: PROD_URL, PROD_OK: '1' })
    expect(result.exitCode).toBe(0)
    expect(result.message).toMatch(/^ATTENTION/)
  })

  it("toute autre valeur de PROD_OK n'ouvre rien", () => {
    for (const value of ['true', 'yes', '0', '', ' 1']) {
      expect(checkEnvTarget({ SUPABASE_URL: PROD_URL, PROD_OK: value }).exitCode).toBe(1)
    }
  })

  it("n'écrit jamais de clé dans le message", () => {
    const key = 'sb_publishable_ne_doit_jamais_apparaitre'
    const refused = checkEnvTarget({ SUPABASE_URL: PROD_URL, SUPABASE_PUBLISHABLE_KEY: key })
    const accepted = checkEnvTarget({ SUPABASE_URL: PREPROD_URL, SUPABASE_PUBLISHABLE_KEY: key })
    expect(refused.message).not.toContain(key)
    expect(accepted.message).not.toContain(key)
  })
})

describe('check-env-target en CLI', () => {
  it('sort en 1 avec un message sur stderr quand une URL vise la prod', () => {
    const res = runNode(CHECK_SCRIPT, { VITE_SUPABASE_URL: PROD_URL })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain('REFUS')
  })

  it('sort en 0 sur la préprod', () => {
    const res = runNode(CHECK_SCRIPT, { SUPABASE_URL: PREPROD_URL, VITE_SUPABASE_URL: PREPROD_URL })
    expect(res.status).toBe(0)
    expect(res.stdout).toContain('OK')
  })

  it('sort en 0 sur la prod avec PROD_OK=1', () => {
    const res = runNode(CHECK_SCRIPT, { SUPABASE_URL: PROD_URL, PROD_OK: '1' })
    expect(res.status).toBe(0)
    expect(res.stdout).toContain('ATTENTION')
  })

  it('ne lit jamais le fichier .env du répertoire courant', () => {
    const dir = mkdtempSync(join(tmpdir(), 'seren-check-env-'))
    try {
      writeFileSync(join(dir, '.env'), `SUPABASE_URL=${PROD_URL}\nVITE_SUPABASE_URL=${PROD_URL}\n`)
      const res = runNode(CHECK_SCRIPT, {}, dir)
      expect(res.status).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('rls-probes — garde anti-prod', () => {
  const baseEnv = {
    PROBE_SUPABASE_KEY: 'sb_publishable_test_dummy',
    PROBE_USER_A_EMAIL: 'a@seren-test.fr',
    PROBE_USER_A_PASSWORD: 'dummy-a',
    PROBE_USER_B_EMAIL: 'b@seren-test.fr',
    PROBE_USER_B_PASSWORD: 'dummy-b',
  }

  it('refuse (exit 1) avant tout appel réseau quand PROBE_SUPABASE_URL vise la prod', () => {
    const res = runNode(PROBES_SCRIPT, { ...baseEnv, PROBE_SUPABASE_URL: `http://127.0.0.1:9/${PROD_PROJECT_REF}` })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain('REFUS')
    expect(res.stderr).toContain(PROD_PROJECT_REF)
    // Aucune trace d'exécution : ni en-tête TAP, ni tentative de connexion.
    expect(res.stdout).not.toContain('TAP version')
    expect(res.stderr).not.toContain('Bug fatal')
  })

  it('refuse même si les autres variables requises manquent (la garde passe en premier)', () => {
    const res = runNode(PROBES_SCRIPT, { PROBE_SUPABASE_URL: PROD_URL })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain('REFUS')
    expect(res.stderr).not.toContain('Variables d\'environnement manquantes')
  })

  it('ne bloque pas une cible hors prod (échec réseau local attendu, pas la garde)', () => {
    const res = runNode(PROBES_SCRIPT, { ...baseEnv, PROBE_SUPABASE_URL: 'http://127.0.0.1:9' })
    expect(res.status).toBe(1)
    expect(res.stderr).not.toContain('REFUS')
    expect(res.stdout).toContain('TAP version')
  })
})

// Parité CONSENT_VERSION (contrat §7.5, arbitrage A4) : la constante front et le corps de
// public.consent_version() doivent porter la même valeur. Changer de version = migration
// corrective + ce fichier front, dans le même commit.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CONSENT_VERSION } from '@/lib/consent-version'

const CORE = fileURLToPath(new URL('../supabase/migrations/20260915200000_v2_core.sql', import.meta.url))

describe('CONSENT_VERSION', () => {
  it('respecte le motif du CHECK consents_version_check', () => {
    expect(CONSENT_VERSION).toMatch(/^[0-9]{4}-[0-9]{2}-[a-z0-9-]{1,40}$/)
  })

  it('est la valeur renvoyée par public.consent_version()', () => {
    const sql = readFileSync(CORE, 'utf8')
    const m = sql.match(/create\s+or\s+replace\s+function\s+public\.consent_version\(\)[\s\S]*?as\s+\$fn\$([\s\S]*?)\$fn\$/i)
    expect(m).not.toBeNull()
    expect(m![1].replace(/\s+/g, ' ').trim()).toBe(`select '${CONSENT_VERSION}'::text`)
  })
})

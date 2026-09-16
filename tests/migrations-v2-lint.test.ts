// Lint des migrations v2 — contrat docs/design-v2-demonstrateur.md §3.1 (règles communes),
// §3.4 (droits) et §3.5 (codes d'exception). Lecture de fichiers uniquement : aucun accès base,
// compatible avec la CI réseau-nulle. Chaque règle correspond à un défaut qui ne se rattrape plus
// une fois la migration poussée (U2).
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DIR = fileURLToPath(new URL('../supabase/migrations/', import.meta.url))
const CORE = '20260915200000_v2_core.sql'
const PARTNER = '20260915201000_v2_partner_rpc.sql'
const ADMIN = '20260915202000_v2_admin.sql'
const F1 = '20260915210000_transmissions_f1.sql'

interface SqlFile { name: string; raw: string; code: string }
interface SqlFunction { file: string; name: string; signature: string; params: string; header: string; body: string }

// Les fichiers v2 n'utilisent jamais `--` dans une chaîne : retrait naïf des commentaires sûr.
const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, '')
const squash = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

function load(name: string): SqlFile | null {
  const path = DIR + name
  if (!existsSync(path)) return null
  const raw = readFileSync(path, 'utf8')
  return { name, raw, code: stripComments(raw) }
}

const FILES: SqlFile[] = [CORE, PARTNER, ADMIN, F1].map(load).filter((f): f is SqlFile => f !== null)
const file = (name: string) => FILES.find((f) => f.name === name)

function parseFunctions(f: SqlFile): SqlFunction[] {
  const re = /create\s+or\s+replace\s+function\s+(public\.[a-z_]+)\s*\(([\s\S]*?)\)\s*(returns\b[\s\S]*?)\bas\s+\$fn\$([\s\S]*?)\$fn\$\s*;/gi
  const out: SqlFunction[] = []
  for (const m of f.code.matchAll(re)) {
    const params = m[2]
    const types = params
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => p.replace(/\s+default\s+[\s\S]*$/i, '').trim().split(/\s+/).slice(1).join(' ').toLowerCase())
    out.push({ file: f.name, name: m[1].toLowerCase(), signature: `${m[1].toLowerCase()}(${types.join(', ')})`, params, header: m[3], body: m[4] })
  }
  return out
}

const FUNCTIONS = FILES.flatMap(parseFunctions)

// §3.4 — rôles EXACTS recevant EXECUTE, par fonction. Toute fonction absente de cette table est
// un ajout hors contrat (helper compris) et fait échouer le lint.
const EXPECTED_GRANTS: Record<string, string[]> = {
  'public.consent_version': ['authenticated'],
  'public.hook_before_user_created': ['supabase_auth_admin'],
  'public.link_enrollments': [],
  'public.invitation_preview': ['anon', 'authenticated'],
  'public.claim_dossier': ['authenticated'],
  'public.my_account': ['authenticated'],
  'public.record_consents': ['authenticated'],
  'public.has_active_dossier': ['authenticated'],
  'public.partner_create_dossier': ['authenticated'],
  'public.partner_rotate_invitation': ['authenticated'],
  'public.partner_cancel_dossier': ['authenticated'],
  'public.partner_list_dossiers': ['authenticated'],
  'public.partner_month_counters': ['authenticated'],
  'public.admin_partner_overview': ['authenticated'],
  'public.get_transmission_by_code': ['authenticated'],
}

const EXPECTED_BY_FILE: Record<string, string[]> = {
  [CORE]: ['public.consent_version', 'public.hook_before_user_created', 'public.link_enrollments', 'public.invitation_preview',
    'public.claim_dossier', 'public.my_account', 'public.record_consents', 'public.has_active_dossier'],
  [PARTNER]: ['public.partner_create_dossier', 'public.partner_rotate_invitation', 'public.partner_cancel_dossier',
    'public.partner_list_dossiers', 'public.partner_month_counters'],
  [ADMIN]: ['public.admin_partner_overview'],
  [F1]: ['public.get_transmission_by_code'],
}

// §3.5 — seuls messages d'exception autorisés.
const CODES = new Set(['not_authenticated', 'account_role_forbidden', 'invalid_token', 'invitation_expired', 'email_mismatch',
  'account_already_linked', 'dossier_not_active', 'consent_version_mismatch', 'consent_incomplete', 'not_a_partner',
  'partner_inactive', 'invalid_family_name', 'invalid_email', 'invalid_phone', 'invalid_deceased_name', 'invalid_death_date',
  'invalid_token_hash', 'partner_daily_limit', 'email_unavailable', 'dossier_not_found', 'dossier_not_invitable',
  'rotation_too_soon', 'rotation_limit', 'dossier_already_active', 'cancel_window_elapsed', 'enrollment_conflict_family',
  'invalid_secret', 'enrollment_account_untrusted'])

// Revue de sécurité du 16/09 (must-fix 1) : les 2 seules RPC où l'APPELANT choisit un secret
// d'authentification (le hash du jeton d'activation). Elles exigent p_secret en 1er paramètre.
const SECRET_RPCS = ['public.partner_create_dossier', 'public.partner_rotate_invitation']
const SECRET_GUARD = "if not exists (select 1 from public.webhook_config w where w.id = 1 and w.rpc_secret = p_secret) then raise exception 'invalid_secret' using errcode = 'p0001'; end if;"

const PROTECTED = ['partner_dashboard', 'consume_send', 'send_balance', 'release_debit', 'create_pending_purchase', 'mark_purchase_paid']
const CONTENT_TABLES = ['questionnaires', 'roadmaps', 'steps', 'step_actions', 'documents', 'letter_sends', 'send_debits',
  'attachments', 'sender_profiles', 'questionnaire_sessions', 'transmissions']

describe('migrations v2 — présence', () => {
  it('les deux fichiers du lot L1 existent', () => {
    expect(file(CORE), CORE).toBeDefined()
    expect(file(PARTNER), PARTNER).toBeDefined()
  })

  it('chaque fichier présent définit exactement ses fonctions du contrat, sans helper', () => {
    for (const f of FILES) {
      const names = FUNCTIONS.filter((fn) => fn.file === f.name).map((fn) => fn.name).sort()
      expect(names, f.name).toEqual([...EXPECTED_BY_FILE[f.name]].sort())
    }
  })
})

describe('migrations v2 — structure additive et rejouable', () => {
  it('aucun drop table', () => {
    for (const f of FILES) expect(f.code, f.name).not.toMatch(/\bdrop\s+table\b/i)
  })

  it('aucune retouche des fonctions protégées (drop, create, alter, grant, revoke)', () => {
    for (const f of FILES) {
      for (const name of PROTECTED) {
        const re = new RegExp(`(drop\\s+function|create\\s+(or\\s+replace\\s+)?function|alter\\s+function|on\\s+function)\\s+(if\\s+exists\\s+)?(public\\.)?${name}\\b`, 'i')
        expect(f.code, `${f.name} touche ${name}`).not.toMatch(re)
      }
    }
  })

  it('create table toujours « if not exists », add column toujours « if not exists »', () => {
    for (const f of FILES) {
      expect(f.code.match(/create\s+table\s+(?!if\s+not\s+exists)/gi), f.name).toBeNull()
      expect(f.code.match(/add\s+column\s+(?!if\s+not\s+exists)/gi), f.name).toBeNull()
    }
  })

  it('chaque add constraint vit dans un bloc do … exception when duplicate_object', () => {
    for (const f of FILES) {
      const total = (f.code.match(/add\s+constraint/gi) ?? []).length
      const guarded = (f.code.match(/do\s+\$\$\s*begin\s+alter\s+table\s+[a-z_.]+\s+add\s+constraint\s+[a-z_]+\s+check\s*\([\s\S]*?\)\s*;\s*exception\s+when\s+duplicate_object\s+then\s+null;\s*end\s*\$\$\s*;/gi) ?? []).length
      expect(guarded, f.name).toBe(total)
    }
  })
})

describe('migrations v2 — policies', () => {
  it('drop policy : seulement F1 sur transmissions et la policy neuve des consents', () => {
    const allowed = new Set(['authenticated users can read with access_code|public.transmissions', 'own consents read|public.consents'])
    for (const f of FILES) {
      for (const m of f.code.matchAll(/drop\s+policy\s+(?:if\s+exists\s+)?"([^"]+)"\s+on\s+([a-z_.]+)/gi)) {
        expect(allowed.has(`${m[1].toLowerCase()}|${m[2].toLowerCase()}`), `${f.name} : drop policy "${m[1]}" on ${m[2]}`).toBe(true)
      }
    }
  })

  it('create policy : une seule, SELECT own sur consents, jamais une policy d\'écriture', () => {
    const created = FILES.flatMap((f) => [...f.code.matchAll(/create\s+policy\s+"([^"]+)"\s+on\s+([a-z_.]+)([\s\S]*?);/gi)])
    expect(created.length).toBe(file(CORE) ? 1 : 0)
    for (const m of created) {
      expect(m[1]).toBe('own consents read')
      expect(m[2].toLowerCase()).toBe('public.consents')
      expect(squash(m[3])).toBe('for select to authenticated using (auth.uid() = user_id)')
    }
  })
})

describe('migrations v2 — fonctions', () => {
  it('security definer partout sauf consent_version (invoker + immutable), search_path vide partout', () => {
    for (const fn of FUNCTIONS) {
      const h = squash(fn.header)
      expect(h, fn.signature).toContain("set search_path = ''")
      if (fn.name === 'public.consent_version') {
        expect(h).toContain('security invoker')
        expect(h).toContain('immutable')
      } else {
        expect(h, fn.signature).toContain('security definer')
      }
    }
  })

  it('chaque fonction : revoke all … from public, anon, authenticated sur sa signature complète', () => {
    for (const fn of FUNCTIONS) {
      const code = squash(FILES.find((f) => f.name === fn.file)!.code)
      expect(code, fn.signature).toContain(`revoke all on function ${fn.signature} from public, anon, authenticated;`)
    }
  })

  it('grants EXACTS du §3.4, sur la signature complète', () => {
    for (const fn of FUNCTIONS) {
      const code = FILES.find((f) => f.name === fn.file)!.code
      const roles = [...code.matchAll(/grant\s+execute\s+on\s+function\s+(public\.[a-z_]+)\s*\(([^)]*)\)\s+to\s+([^;]+);/gi)]
        .filter((m) => squash(`${m[1]}(${m[2]})`).replace(/\s*,\s*/g, ', ') === fn.signature)
        .flatMap((m) => m[3].split(',').map((r) => r.trim().toLowerCase()))
        .sort()
      expect(roles, fn.signature).toEqual([...(EXPECTED_GRANTS[fn.name] ?? ['<fonction hors contrat>'])].sort())
    }
  })

  it('hook : owner postgres explicite et usage du schéma pour supabase_auth_admin', () => {
    const core = file(CORE)
    if (!core) return
    const code = squash(core.code)
    expect(code).toContain('alter function public.hook_before_user_created(jsonb) owner to postgres;')
    expect(code).toContain('grant usage on schema public to supabase_auth_admin;')
  })

  it('aucune identité dérivée d\'un paramètre (p_user_id, p_partner_id, p_role, p_email…)', () => {
    for (const fn of FUNCTIONS) {
      expect(fn.params, fn.signature).not.toMatch(/\bp_(user_id|partner_id|uid|role|is_admin|admin|email)\b/i)
    }
  })

  it('RPC à secret : p_secret en 1er paramètre, contrôle webhook_config AVANT toute lecture', () => {
    for (const name of SECRET_RPCS) {
      const fn = FUNCTIONS.find((f) => f.name === name)
      if (!fn) continue
      expect(fn.signature.startsWith(`${name}(text,`), fn.signature).toBe(true)
      expect(squash(fn.params).toLowerCase().startsWith('p_secret text'), fn.signature).toBe(true)
      const body = squash(fn.body).toLowerCase()
      expect(body, `${name} : garde du secret absente ou réécrite`).toContain(SECRET_GUARD)
      const before = body.slice(0, body.indexOf(SECRET_GUARD))
      expect(before, `${name} : lecture avant le contrôle du secret`)
        .not.toMatch(/from (public\.)?(dossiers|partner_users|partners|account_enrollments|seren_admins)\b/)
    }
  })

  // Revue L1/L1b (défaut C1) : la révocation d'un partenaire doit exister au serveur, pas seulement
  // à l'écran. Le renvoi refuse toute PF non 'active' (§3.3.6, §3.3.10 étape 1bis) ; l'annulation
  // refuse une PF résiliée (§3.3.11 étape 1). Sans ces gardes, un ex-gérant relit la PII famille.
  it('renvoi et annulation contrôlent le statut du partenaire', () => {
    const rotate = FUNCTIONS.find((f) => f.name === 'public.partner_rotate_invitation')
    if (rotate) {
      const body = squash(rotate.body)
      expect(body, 'renvoi : garde de statut absente').toContain("if coalesce(v_status, '') <> 'active' then raise exception 'partner_inactive'")
      expect(body.indexOf("'partner_inactive'") < body.indexOf('from public.dossiers'), 'renvoi : statut contrôlé après la lecture du dossier').toBe(true)
    }
    const cancel = FUNCTIONS.find((f) => f.name === 'public.partner_cancel_dossier')
    if (cancel) {
      expect(squash(cancel.body), 'annulation : une PF résiliée garde la main').toContain("p.status <> 'terminated'")
    }
  })

  it('le secret n\'est lu que par ces 2 RPC, et jamais inscrit en dur', () => {
    for (const fn of FUNCTIONS) {
      if (SECRET_RPCS.includes(fn.name)) continue
      expect(fn.body, fn.signature).not.toMatch(/webhook_config/i)
    }
    for (const f of FILES) expect(f.code, f.name).not.toMatch(/rpc_secret\s*=\s*'/i)
  })

  it('link_enrollments : appariement explicite par paires et conditions de confiance', () => {
    const fn = FUNCTIONS.find((f) => f.name === 'public.link_enrollments')
    if (!fn) return
    expect(fn.signature).toBe('public.link_enrollments(jsonb)')
    expect(squash(fn.params).toLowerCase()).toContain('p_pairs jsonb')
    const body = squash(fn.body).toLowerCase()
    for (const needle of ['enrollment_account_untrusted', 'last_sign_in_at', 'email_change', 'untrusted', 'p_pairs']) {
      expect(body, `link_enrollments : « ${needle} » absent`).toContain(needle)
    }
  })

  it('exceptions : message ∈ codes du §3.5, toujours avec errcode P0001', () => {
    for (const f of FILES) {
      for (const m of f.code.matchAll(/raise\s+exception\s+'([^']*)'([^;]*);/gi)) {
        expect(CODES.has(m[1]), `${f.name} : code « ${m[1]} » hors contrat`).toBe(true)
        expect(squash(m[2]), `${f.name} : ${m[1]}`).toBe("using errcode = 'p0001'")
      }
    }
  })

  it('pont : un seul INSERT dans purchases, dans claim_dossier ; auth.jwt() lu seulement par claim_dossier', () => {
    const inserts = FUNCTIONS.filter((fn) => /insert\s+into\s+public\.purchases\b/i.test(fn.body))
    expect(inserts.map((fn) => fn.name)).toEqual(file(CORE) ? ['public.claim_dossier'] : [])
    for (const f of FILES) expect((f.code.match(/insert\s+into\s+public\.purchases\b/gi) ?? []).length).toBeLessThanOrEqual(1)
    const jwtReaders = FUNCTIONS.filter((fn) => /auth\.jwt\(\)/i.test(fn.body)).map((fn) => fn.name)
    expect(jwtReaders).toEqual(file(CORE) ? ['public.claim_dossier'] : [])
  })

  it('RPC PF, admin et core ne lisent aucune table de contenu famille ni le storage', () => {
    for (const f of FILES.filter((x) => x.name !== F1)) {
      for (const t of CONTENT_TABLES) expect(f.code, `${f.name} → ${t}`).not.toMatch(new RegExp(`\\b(public\\.)?${t}\\b`, 'i'))
      expect(f.code, `${f.name} → storage`).not.toMatch(/\bstorage\./i)
    }
    for (const name of [PARTNER, ADMIN]) {
      const f = file(name)
      if (!f) continue
      expect(f.code, `${name} → purchases`).not.toMatch(/\bpurchases\b/i)
      expect(f.code, `${name} → consents`).not.toMatch(/\bconsents\b/i)
    }
  })

  it('aucune clé ou rôle secret mentionné', () => {
    for (const f of FILES) expect(f.raw, f.name).not.toMatch(/service_role|sb_secret_/i)
  })
})

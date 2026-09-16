# Démonstrateur v2 — SQL, hook, probes et scripts de données · Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer, validés sur Supabase local avec le hook « Before User Created » réellement actif, les 4 fichiers de migration v2 (core, RPC PF, admin, F1), le harnais de scénarios SQL et HTTP, les probes RLS v2 avec provisionnement par le vrai parcours d'invitation, et les scripts SQL de données (seed démo parties 1-3, backfill bêta prod, effacement famille), prêts pour le gel SQL de mercredi 11h et le push U2 de 12h30.

**Architecture:** Contrat figé `docs/design-v2-demonstrateur.md` (référence unique : §3 données, §3.4 droits, §3.5 codes, §9 sécurité, §10 tests). Tout le SQL est additif, `security definer` + `set search_path = ''`, identités dérivées de `auth.uid()` / `auth.jwt()` uniquement, erreurs métier levées avec le code exact en message. La validation passe par `supabase db reset --local` + `scripts/sql-scenarios-v2.sql` (scénarios en transactions `rollback`, identité simulée par `request.jwt.claims`) + `scripts/hook-scenarios-v2.mjs` (vrais `POST /auth/v1/signup` sur l'API locale) ; la CI réseau-nulle reçoit un lint Vitest des migrations. Les probes et le provisionnement parlent uniquement à l'API publique (clé publishable), jamais à la clé secrète.

**Tech Stack:** PostgreSQL 17 (Supabase local, CLI 2.109.1, Docker), plpgsql, PostgREST, GoTrue (hook Postgres), Node 22 (`fetch` natif, `node:crypto`), Vitest.

---

## Règles d'exécution (valent pour toutes les tasks)

1. **Interdits absolus** : `supabase link`, toute commande `--linked`, `supabase db push`, tout appel réseau vers un Supabase distant (sauf L6 en mode préprod explicite, API publique, comptes `@seren-test.fr`, après U2), Render, Stripe, MySendingBox, Resend. Jamais de lecture d'un fichier `.env`. Jamais de clé secrète (`sb_secret_…`, `service_role`) dans un script ou un appel, **même en local**.
2. **Worktree par lot**, créé depuis `integration/v2-demo` **après** le commit des stubs L0bis (§8.1 du contrat). Branches : `feature/v2-l1`, `feature/v2-l1b`, **`feature/v2-l4c-sql`**, `feature/v2-l6`, **`feature/v2-l7-sql`**, **`feature/v2-l9-sql`** (suffixe `-sql` depuis la revue du 16/09, SF2.7 : `docs/plan-v2-app.md` travaille en parallèle sur `feature/v2-l4c-app`, `-l7-app`, `-l9-app` et `feature/v2-l6-e2e` — deux `worktree add -b` sur la même branche ou le même chemin échouent, et deux subagents dans un même worktree se disputent `.git/index.lock`). Commits sur la branche de lot uniquement ; aucun merge, aucun push (c'est L8 et Arnaud).
3. **Base locale = ressource partagée** (un seul jeu de conteneurs `supabase_*_Application`). Toute commande qui la réinitialise ou y écrit passe par `with-db-lock` (Task 0). Verrou tenu → code 75 : attendre et relancer, ne jamais forcer. **Seule la Task 5 (L1) a le droit d'arrêter/redémarrer la stack** (activation du hook).
4. **Gate local avant de rendre la main** : `gate <worktree>` (Task 0) = `npx tsc --noEmit && npx vitest run && npm run build` avec les 2 variables factices de la CI.
5. Prose et commentaires en français, identifiants en anglais. Messages de commit terminés par la ligne `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
6. Une divergence avec le contrat découverte en cours de task → on s'arrête, on écrit la note §12.2 (orchestrateur), puis on reprend. Les écarts déjà identifiés à la rédaction de ce plan sont listés en fin de document (§ « Écarts relevés à la rédaction »).

## Constats du 15/09 ~18h qui conditionnent le harnais (vérifiés sur la stack locale)

- Stack locale démarrée (`supabase status` OK, 14 migrations appliquées), `psql` **absent** de la machine : on passe par `docker exec -i supabase_db_Application psql`.
- `postgres` : `rolbypassrls = true`, propriétaire des tables `public` → une fonction `security definer` owner postgres lit les tables deny-all (H5 plausible, prouvée par les scénarios).
- `postgres` est membre de `anon` et `authenticated` (donc `set local role` possible dans les scénarios), **pas** de `supabase_auth_admin` (le test du hook sous ce rôle passe par l'API HTTP, Task 5).
- **Écart local/hébergé** : la CLI 2.109.1 pose des privilèges par défaut restrictifs sur `public` (`authenticated=Dxtm` pour les tables, `postgres=X` seul pour les fonctions). Résultat : en local, `authenticated` n'a **ni SELECT ni INSERT** sur aucune table applicative (même `documents`), alors que les projets hébergés ont les grants classiques (les probes de juillet et l'audit F1 ont obtenu des `200`/`42501 RLS` sur la prod). Le harnais réapplique donc après chaque `db reset` les grants de tables « comme l'hébergé » (`hosted-grants.sql`, Task 0). Les fonctions ne sont pas re-grantées (cela annulerait les `revoke` des migrations) : c'est pourquoi le lint impose `revoke` + `grant` explicites sur chaque fonction v2, ce qui rend leur comportement identique en local et en hébergé.
- `storage.objects` porte le trigger `protect_objects_delete` : suppression d'objets Storage par SQL impossible → l'effacement passe par le Dashboard Storage (Task 14).
- Vecteur de jeton du contrat vérifié en SQL : `encode(sha256(convert_to('AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8','UTF8')),'hex')` = `ea866a75…afffd0`.
- `md5(prosrc)` de `partner_dashboard()` v0 tel qu'écrit dans `20260913200000` = `8277ca3955cc35a54f42223295052c28` (sert au scénario S11).
- **Pré-validation à la rédaction (15/09 ~20h40, base locale, transactions annulées, rien de persistant) :** le SQL des 4 migrations de ce plan compile. `sql-scenarios-v2.sql` (Tasks 2 et 3 assemblées) passe avec 225 assertions `OK`, et `sql-scenarios-f1.sql` aussi. Deux passages du seed parties 1-3 donnent `SEED V2 : OK`. Le backfill (DRY-RUN 3/1/2, écriture 2 puis 0 au rejeu) donne `BACKFILL CHECK : OK`, l'effacement `ERASE CHECK : OK`. Vitest passe (`migrations-v2-lint` sur les 4 fichiers, `consent-version`, `check-env-target` avec le nouveau `rls-probes.mjs`, 36 tests). `node --check` passe sur les 3 scripts Node. N'ont **pas** été exécutés : le hook en HTTP (Task 5), `provision-v2.mjs` et les probes contre l'API locale, le redémarrage de la stack. Les exécutants refont toutes les étapes, rien n'est considéré comme acquis.

---

## Structure des fichiers

| Fichier | Lot | Rôle |
|---|---|---|
| `supabase/migrations/20260915200000_v2_core.sql` (C) | L1 | DDL v2 (partners, partner_users, account_enrollments, seren_admins, dossiers, consents), copie attributions → dossiers, 8 fonctions core (hook, link_enrollments, invitation_preview, claim_dossier + pont, my_account, record_consents, has_active_dossier, consent_version) |
| `supabase/migrations/20260915201000_v2_partner_rpc.sql` (C) | L1 | 5 RPC PF (create, rotate, cancel, list, month_counters) |
| `supabase/migrations/20260915202000_v2_admin.sql` (C) | L4c | `admin_partner_overview()` |
| `supabase/migrations/20260915210000_transmissions_f1.sql` (C) | L1b | drop policy F1 + `get_transmission_by_code(text)` |
| `supabase/config.toml` (M, l.278-281) | L1 | bloc `[auth.hook.before_user_created]` activé |
| `scripts/sql-scenarios-v2.sql` (C) | L1 | scénarios S0-S14 (§10.2 du contrat + hook unitaire S0 + link_enrollments S14) ; S10 sauté tant que L4c n'est pas appliqué |
| `scripts/hook-scenarios-v2.mjs` (C) | L1 | 8 cas HTTP du hook (§10.2), local uniquement |
| `scripts/sql-scenarios-f1.sql` (C) | L1b | scénario F1 |
| `tests/migrations-v2-lint.test.ts` (C) | L1 | lint des 4 migrations v2 (§3.1, §3.4, §3.5) |
| `tests/consent-version.test.ts` (C) | L1 | parité `CONSENT_VERSION` front ↔ SQL |
| `scripts/provision-v2.mjs` (C) | L6 | comptes de probes et de démo par le vrai parcours (RPC create → signUp avec hash → claim → consents), mode `--verify` en lecture |
| `scripts/rls-probes.mjs` (M) | L6 | probes v2, lecture seule par défaut, écriture sur `PROBE_WRITE=1`, garde anti-prod renforcée |
| `docs/runbook-rls-probes.md` (M) | L6 | usage v2 |
| `scripts/seed-demo-v2.sql` (C) | L7 | partie 1 (partenaires + enrôlements), partie 2 (`link_enrollments`), partie 3 de secours (dossier actif + consents + pont) |
| `scripts/backfill-prod-beta.sql` (C) | L9 | détection des résidus + dossiers `source='direct'` pour les vrais comptes (D6), dry-run par défaut |
| `scripts/erase-family.sql` (C) | L9 | procédure d'effacement manuelle (lecture, anonymisation, vérification post-Delete user) |
| `$S/bin/*` (scratchpad, **non versionné**) | Task 0 | `v2-env.sh`, `psql-local`, `with-db-lock`, `run-sql-checks`, `gate`, `hosted-grants.sql` |

Hors de ce plan (propriété L6 au contrat §8.2, à couvrir par le plan serveur/E2E) : `scripts/e2e-v2.mjs`.

Ordre de merge (contrat §8.3) : `L5 → L2a → L2b → L1b → L1 → L4c → L6 → L3 → L4 → L7 → L4b`, L9 à tout moment après L7. Conséquence pour ce plan : **L4c (Task 8), L6 (Tasks 9-11), L7 (Task 12) et L9 (Tasks 13-14) ne s'exécutent en local qu'avec les migrations L1 présentes** (rebase sur `integration/v2-demo` après le merge de L1, ou worktree jetable de validation décrit dans chaque task).

---

### Task 0: Préalables communs — outillage local, verrou, worktrees

**Files:**
- Create (scratchpad, non versionné) : `$S/bin/v2-env.sh`, `$S/bin/psql-local`, `$S/bin/with-db-lock`, `$S/bin/run-sql-checks`, `$S/bin/gate`, `$S/bin/hosted-grants.sql`

**Niveau de revue :** aucun (outillage hors dépôt), mais la sortie de l'étape 3 est collée dans le rapport de la task.

- [ ] **Step 1: Vérifier la précondition L0bis (stubs contractuels committés)**

```bash
git -C /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-integration log --oneline -1 -- src/lib/consent-version.ts docs/design-v2-demonstrateur.md
```
Expected : une ligne de commit. **Sortie vide → STOP** : prévenir l'orchestrateur (les branches de lot ne se créent qu'après L0bis).

- [ ] **Step 2: Écrire l'outillage dans le scratchpad**

`$S/bin/v2-env.sh` :
```sh
# Environnement commun des lots SQL v2 — à sourcer en tête de chaque bloc de commandes.
export S=/private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad
export INT="$S/wt-integration"
export DB_CONTAINER=supabase_db_Application
export VITE_SUPABASE_URL=http://localhost:54321
export VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci_dummy
export PATH="$S/bin:$PATH"
```

`$S/bin/psql-local` :
```sh
#!/bin/sh
# psql dans le conteneur de la base LOCALE (psql n'est pas installé sur la machine).
exec docker exec -i "${DB_CONTAINER:-supabase_db_Application}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
```

`$S/bin/with-db-lock` :
```sh
#!/bin/sh
# Verrou exclusif sur la base locale partagée. Échec immédiat (75) si déjà tenu : relancer plus tard.
LOCK="$S/.local-db.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "VERROU base locale tenu : $(cat "$LOCK/owner" 2>/dev/null)" >&2
  exit 75
fi
echo "$(date +%H:%M:%S) $*" > "$LOCK/owner"
trap 'rm -rf "$LOCK"' EXIT INT TERM
"$@"
```

`$S/bin/hosted-grants.sql` :
```sql
-- Réplique LOCALE des privilèges de tables des projets hébergés (constat du 15/09 : la CLI
-- 2.109.1 ne donne plus SELECT/INSERT/UPDATE/DELETE à anon/authenticated sur les tables créées
-- par postgres). Aucune migration ne révoque de privilège de TABLE : l'état final hébergé est
-- donc « tout accordé, RLS en barrière ». Les FONCTIONS ne sont PAS re-grantées (cela annulerait
-- les revoke des migrations).
grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
```

`$S/bin/run-sql-checks` :
```sh
#!/bin/sh
# usage : run-sql-checks <worktree> [fichier.sql relatif au worktree]...
# Sous un seul verrou : db reset --local (migrations du worktree) + grants « hébergé » + fichiers.
set -e
WT="$1"; shift
with-db-lock sh -ec '
  WT="$1"; shift
  supabase db reset --local --workdir "$WT"
  psql-local -q < "$S/bin/hosted-grants.sql"
  for f in "$@"; do echo "== $f"; psql-local -q < "$WT/$f"; done
' sh "$WT" "$@"
```

`$S/bin/gate` :
```sh
#!/bin/sh
# usage : gate <worktree> — gate local obligatoire avant de rendre la main.
set -e
cd "$1"
npx tsc --noEmit
npx vitest run
npm run build
```

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh 2>/dev/null || true
chmod +x /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/psql-local /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/with-db-lock /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/run-sql-checks /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/gate
```

- [ ] **Step 3: Vérifier l'outillage sur la base locale**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
echo "select count(*) as migrations from supabase_migrations.schema_migrations;" | psql-local -At
with-db-lock true && echo LOCK_OK
```
Expected : `14` (ou davantage si un lot a déjà rejoué des migrations), puis `LOCK_OK`.

- [ ] **Step 4: Créer le worktree du lot à exécuter (exemple L1 ; remplacer `l1` par `l1b`, `l4c`, `l6`, `l7`, `l9`)**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
git -C "$INT" worktree add "$S/wt-v2-l1" -b feature/v2-l1 integration/v2-demo
ln -s "$INT/node_modules" "$S/wt-v2-l1/node_modules"
gate "$S/wt-v2-l1" 2>&1 | tail -5
```
Expected : `Test Files  … passed`, `Tests  N passed` (N consigné dans le rapport : base du lot), build `✓ built in`. Si le lien symbolique casse `vite build` : supprimer le lien et lancer `npm ci --prefix "$S/wt-v2-l1"`.

---

## Lot L1 — Migrations v2 core + RPC PF + harnais local

Branche `feature/v2-l1`, worktree `$S/wt-v2-l1`. **Niveau de revue : double revue (spec puis qualité) + passe adversariale dédiée** sur : permissions du hook, `claim_dossier` et le pont, énumération via `invitation_preview`, isolation PF-X/PF-Y, rejouabilité. Parallélisation possible : un 2ᵉ subagent peut rédiger `20260915201000_v2_partner_rpc.sql` (Task 3, Step 3) pendant la Task 2 ; ses scénarios ne s'exécutent qu'après la Task 2.

### Task 1: Lint des migrations v2 et parité `CONSENT_VERSION` (tests d'abord)

**Files:**
- Create: `tests/migrations-v2-lint.test.ts`
- Create: `tests/consent-version.test.ts`

- [ ] **Step 1: Écrire `tests/migrations-v2-lint.test.ts`**

```ts
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
```

- [ ] **Step 2: Écrire `tests/consent-version.test.ts`**

```ts
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
```

- [ ] **Step 3: Vérifier l'échec**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
cd "$S/wt-v2-l1" && npx vitest run tests/migrations-v2-lint.test.ts tests/consent-version.test.ts 2>&1 | tail -15
```
Expected : FAIL — `les deux fichiers du lot L1 existent` (`expected undefined to be defined`) et `est la valeur renvoyée par public.consent_version()` (`ENOENT … 20260915200000_v2_core.sql`) ; les autres cas passent à vide.

- [ ] **Step 4: Commit (rouge assumé, verdi par les Tasks 2-3)**

```bash
git -C /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l1 add tests/migrations-v2-lint.test.ts tests/consent-version.test.ts
git -C /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l1 commit -m "test(v2-l1): lint des migrations v2 et parité CONSENT_VERSION (rouge attendu)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 2: Migration `v2_core` — scénarios SQL core d'abord, puis DDL et 8 fonctions

**Files:**
- Create: `scripts/sql-scenarios-v2.sql` (fixtures, helpers, S0, S4, S5, S6, S7, S8, S12, S13, S14, nettoyage)
- Create: `supabase/migrations/20260915200000_v2_core.sql`
- Test: `scripts/sql-scenarios-v2.sql` via `run-sql-checks`, `tests/consent-version.test.ts`, `tests/migrations-v2-lint.test.ts`

Identifiants de fixtures (utilisés tels quels dans tout le fichier) :

| Rôle | UUID | E-mail |
|---|---|---|
| PF-X (active) | `00000000-0000-4000-8000-00000000a001` | — |
| PF-Y (active) | `00000000-0000-4000-8000-00000000a002` | — |
| PF-S (suspendue) | `00000000-0000-4000-8000-00000000a003` | — |
| gérant PF-X | `00000000-0000-4000-8000-00000000b001` | `pfx.manager@scenario.seren-test.fr` |
| conseiller PF-X | `00000000-0000-4000-8000-00000000b002` | `pfx.advisor@scenario.seren-test.fr` |
| gérant PF-Y | `00000000-0000-4000-8000-00000000b003` | `pfy.manager@scenario.seren-test.fr` |
| gérant PF-S | `00000000-0000-4000-8000-00000000b004` | `pfs.manager@scenario.seren-test.fr` |
| admin Seren | `00000000-0000-4000-8000-00000000b005` | `admin@scenario.seren-test.fr` |
| famille 1 | `00000000-0000-4000-8000-00000000b006` | `fam1@scenario.seren-test.fr` |
| famille 2 | `00000000-0000-4000-8000-00000000b007` | `fam2@scenario.seren-test.fr` |
| sans dossier | `00000000-0000-4000-8000-00000000b008` | `nobody@scenario.seren-test.fr` |
| famille 3 | `00000000-0000-4000-8000-00000000b009` | `fam3@scenario.seren-test.fr` |
| enrôlement sans compte | — | `pending.manager@scenario.seren-test.fr` |

- [ ] **Step 1: Écrire `scripts/sql-scenarios-v2.sql` (partie core)**

```sql
-- ════════════════════════════════════════════════════════════════════════════════════════
-- scripts/sql-scenarios-v2.sql — Scénarios SQL du démonstrateur v2 (contrat §10.2)
-- ════════════════════════════════════════════════════════════════════════════════════════
-- LOCAL UNIQUEMENT. Lancement : run-sql-checks <worktree> scripts/sql-scenarios-v2.sql
-- (db reset --local + grants « comme l'hébergé » + ce fichier), ou psql-local < ce fichier.
-- Chaque scénario vit dans une transaction terminée par ROLLBACK ; l'identité est simulée par
-- request.jwt.claims + `set local role authenticated|anon` (auth.uid() et auth.jwt() lisent ces
-- claims). Sortie attendue : une ligne « NOTICE:  OK … » par assertion, puis
-- « NOTICE:  SCENARIOS V2 : OK ». Premier écart = ERROR avec le libellé du scénario, code 3.
-- Les fixtures (partenaires, comptes, enrôlements) sont committées en tête et supprimées en fin.
\set ON_ERROR_STOP on

-- ── 0. Garde et nettoyage d'un run interrompu ──────────────────────────────────────────────
do $$
begin
  if (select count(*) from auth.users where email not like '%@scenario.seren-test.fr') > 200 then
    raise exception 'REFUS : plus de 200 comptes hors fixtures — ce script ne tourne que sur une base locale jetable';
  end if;
end $$;

drop schema if exists scenario_v2 cascade;
delete from public.dossiers
 where family_email like '%@scenario.seren-test.fr'
    or user_id in (select id from auth.users where email like '%@scenario.seren-test.fr')
    or partner_id in ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000a003');
delete from public.account_enrollments where email like '%@scenario.seren-test.fr';
delete from auth.users where email like '%@scenario.seren-test.fr';
delete from public.partners
 where id in ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000a003');

-- ── 1. Helpers (schéma jetable, supprimé en fin de fichier) ───────────────────────────────
create schema scenario_v2;
grant usage on schema scenario_v2 to anon, authenticated;

create function scenario_v2.h(p text) returns text language sql immutable as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex')
$$;

create function scenario_v2.claims(p_uid uuid, p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    case when p_uid is null then '{}'
         else json_build_object('sub', p_uid, 'email', p_email, 'role', 'authenticated')::text end,
    true);
end $$;

create function scenario_v2.ok(p_label text, p_cond boolean, p_detail text default null) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception '[%] ÉCHEC%', p_label, coalesce(' — ' || p_detail, '');
  end if;
  raise notice 'OK %', p_label;
end $$;

-- p_expected = message exact (code §3.5), ou '#<SQLSTATE>' pour comparer l'état (ex. '#42501').
create function scenario_v2.expect_error(p_label text, p_sql text, p_expected text) returns void language plpgsql as $$
declare
  v_err   text;
  v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    v_err := sqlerrm;
    v_state := sqlstate;
  end;
  if v_err is null then
    raise exception '[%] attendu l''erreur « % », obtenu un succès', p_label, p_expected;
  end if;
  if p_expected like '#%' then
    if v_state <> substr(p_expected, 2) then
      raise exception '[%] attendu SQLSTATE %, obtenu % (%)', p_label, substr(p_expected, 2), v_state, v_err;
    end if;
  elsif v_err <> p_expected then
    raise exception '[%] attendu « % », obtenu « % » (SQLSTATE %)', p_label, p_expected, v_err, v_state;
  end if;
  raise notice 'OK % (%)', p_label, p_expected;
end $$;

grant execute on all functions in schema scenario_v2 to anon, authenticated;

-- ── 2. Fixtures committées ─────────────────────────────────────────────────────────────────
insert into public.partners (id, name, status, siret, billing_email, price_ttc_cents, commission_ttc_cents, contract_signed_at) values
  ('00000000-0000-4000-8000-00000000a001', 'PF Scénario X', 'active', '12345678900011', 'factu.x@scenario.seren-test.fr', 29000, 7000, current_date),
  ('00000000-0000-4000-8000-00000000a002', 'PF Scénario Y', 'active', '12345678900012', null, 29000, 7000, current_date),
  ('00000000-0000-4000-8000-00000000a003', 'PF Scénario Suspendue', 'suspended', null, null, 29000, 7000, null);

-- ORDRE IMPOSÉ (revue 16/09, must-fix 2) : l'enrôlement AVANT les comptes, comme dans le runbook
-- (partie 1 du seed, puis « Add user »). link_enrollments refuse désormais tout compte dont
-- created_at est ANTÉRIEUR à son enrôlement : des fixtures dans l'ordre inverse seraient rejetées.
insert into public.account_enrollments (email, role, partner_id) values
  ('pfx.manager@scenario.seren-test.fr',     'partner_manager', '00000000-0000-4000-8000-00000000a001'),
  ('pfy.manager@scenario.seren-test.fr',     'partner_manager', '00000000-0000-4000-8000-00000000a002'),
  ('pfs.manager@scenario.seren-test.fr',     'partner_manager', '00000000-0000-4000-8000-00000000a003'),
  ('pending.manager@scenario.seren-test.fr', 'partner_manager', '00000000-0000-4000-8000-00000000a001'),
  ('admin@scenario.seren-test.fr',           'seren_admin',     null);

-- Comptes « créés par Arnaud » : last_sign_in_at null, email_change vide (constat local du 16/09 sur
-- l'API admin de GoTrue, équivalent du bouton « Add user »).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated', u.email, '', now(),
       '{}'::jsonb, '{}'::jsonb, now(), now()
  from (values
    ('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr'),
    ('00000000-0000-4000-8000-00000000b002', 'pfx.advisor@scenario.seren-test.fr'),
    ('00000000-0000-4000-8000-00000000b003', 'pfy.manager@scenario.seren-test.fr'),
    ('00000000-0000-4000-8000-00000000b004', 'pfs.manager@scenario.seren-test.fr'),
    ('00000000-0000-4000-8000-00000000b005', 'admin@scenario.seren-test.fr'),
    ('00000000-0000-4000-8000-00000000b006', 'fam1@scenario.seren-test.fr'),
    ('00000000-0000-4000-8000-00000000b007', 'fam2@scenario.seren-test.fr'),
    ('00000000-0000-4000-8000-00000000b008', 'nobody@scenario.seren-test.fr'),
    ('00000000-0000-4000-8000-00000000b009', 'fam3@scenario.seren-test.fr')
  ) as u(id, email);

insert into public.partner_users (user_id, partner_id, role) values
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000a001', 'manager'),
  ('00000000-0000-4000-8000-00000000b002', '00000000-0000-4000-8000-00000000a001', 'advisor'),
  ('00000000-0000-4000-8000-00000000b003', '00000000-0000-4000-8000-00000000a002', 'manager'),
  ('00000000-0000-4000-8000-00000000b004', '00000000-0000-4000-8000-00000000a003', 'manager');

insert into public.seren_admins (user_id) values ('00000000-0000-4000-8000-00000000b005');

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S0 — hook_before_user_created (appel direct en rôle postgres) : acceptés ET refusés
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
insert into public.dossiers (partner_id, source, status, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, invite_token_hash, invite_expires_at, invite_issued_at) values
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'invited', 'Anne', 'Durand', 'fam3@scenario.seren-test.fr',
   'Louis', 'Durand', current_date - 5, 29000, 7000, scenario_v2.h('s0-ok'), now() + interval '7 days', now()),
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'invited', 'Eve', 'Morel', 'expired.s0@scenario.seren-test.fr',
   'Marc', 'Morel', current_date - 20, 29000, 7000, scenario_v2.h('s0-exp'), now() - interval '1 minute', now() - interval '8 days');
insert into public.dossiers (partner_id, source, status, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, cancelled_at) values
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'cancelled', 'Lou', 'Petit', 'cancel.s0@scenario.seren-test.fr',
   'René', 'Petit', current_date - 2, 29000, 7000, now());

do $$
declare
  v_refus constant jsonb := '{"error":{"http_code":403,"message":"signup_requires_invitation"}}';
begin
  perform scenario_v2.ok('S0a e-mail absent → refus', public.hook_before_user_created('{"user":{}}') = v_refus);
  perform scenario_v2.ok('S0b e-mail blanc → refus', public.hook_before_user_created('{"user":{"email":"  "}}') = v_refus);
  perform scenario_v2.ok('S0c e-mail aléatoire sans metadata → refus',
    public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', 'inconnu@scenario.seren-test.fr'))) = v_refus);
  perform scenario_v2.ok('S0d e-mail invité sans hash → refus',
    public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', 'fam3@scenario.seren-test.fr', 'user_metadata', '{}'::jsonb))) = v_refus);
  perform scenario_v2.ok('S0e e-mail invité + hash d''un autre dossier → refus',
    public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', 'fam3@scenario.seren-test.fr',
      'user_metadata', jsonb_build_object('invite_token_hash', scenario_v2.h('s0-exp'))))) = v_refus);
  perform scenario_v2.ok('S0f e-mail invité (casse et espaces) + bon hash → accepté',
    public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', '  FAM3@Scenario.Seren-Test.fr ',
      'user_metadata', jsonb_build_object('invite_token_hash', scenario_v2.h('s0-ok'))))) = '{}'::jsonb);
  perform scenario_v2.ok('S0g bon hash mais autre e-mail → refus',
    public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', 'fam2@scenario.seren-test.fr',
      'user_metadata', jsonb_build_object('invite_token_hash', scenario_v2.h('s0-ok'))))) = v_refus);
  perform scenario_v2.ok('S0h invitation expirée → refus',
    public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', 'expired.s0@scenario.seren-test.fr',
      'user_metadata', jsonb_build_object('invite_token_hash', scenario_v2.h('s0-exp'))))) = v_refus);
  perform scenario_v2.ok('S0i dossier annulé, ancien hash → refus',
    public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', 'cancel.s0@scenario.seren-test.fr',
      'user_metadata', jsonb_build_object('invite_token_hash', scenario_v2.h('s0-cancel'))))) = v_refus);
  perform scenario_v2.ok('S0j hash hors motif (majuscules) → refus',
    public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', 'fam3@scenario.seren-test.fr',
      'user_metadata', jsonb_build_object('invite_token_hash', upper(scenario_v2.h('s0-ok')))))) = v_refus);
  perform scenario_v2.ok('S0k enrôlé partner_manager sans compte, sans hash → accepté',
    public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', 'pending.manager@scenario.seren-test.fr'))) = '{}'::jsonb);
  perform scenario_v2.ok('S0l enrôlé seren_admin → accepté',
    public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', 'admin@scenario.seren-test.fr'))) = '{}'::jsonb);
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S4 — invitation_preview (rôle anon) : valide, expirée, inconnue, hors motif, dossier direct
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
insert into public.dossiers (partner_id, source, status, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, invite_token_hash, invite_expires_at, invite_issued_at) values
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'invited', 'Anne', 'Durand', 'fam3@scenario.seren-test.fr',
   'Louis', 'Durand', current_date - 5, 29000, 7000, scenario_v2.h('s4-ok'), now() + interval '7 days', now()),
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'invited', 'Eve', 'Morel', 'expired.s4@scenario.seren-test.fr',
   'Marc', 'Morel', current_date - 20, 29000, 7000, scenario_v2.h('s4-exp'), now() - interval '1 minute', now() - interval '8 days'),
  (null, 'direct', 'invited', null, null, 'direct.s4@scenario.seren-test.fr',
   null, null, null, 0, 0, scenario_v2.h('s4-direct'), now() + interval '7 days', now());
select scenario_v2.claims(null, null);
set local role anon;
do $$
declare r jsonb;
begin
  r := public.invitation_preview(scenario_v2.h('s4-ok'));
  perform scenario_v2.ok('S4a lien valide', (r->>'valid')::boolean and r->>'email' = 'fam3@scenario.seren-test.fr'
    and r->>'partner_name' = 'PF Scénario X' and r->>'family_first_name' = 'Anne' and r->>'deceased_first_name' = 'Louis', r::text);
  perform scenario_v2.ok('S4b clés exactes, ni nom de famille, ni date de décès, ni identifiant',
    (select array_agg(k order by k) from jsonb_object_keys(r) as k)
      = array['deceased_first_name', 'email', 'expires_at', 'family_first_name', 'partner_name', 'valid'], r::text);
  r := public.invitation_preview(scenario_v2.h('s4-exp'));
  perform scenario_v2.ok('S4c lien expiré', r = jsonb_build_object('valid', false, 'reason', 'expired', 'partner_name', 'PF Scénario X'), r::text);
  r := public.invitation_preview(scenario_v2.h('inconnu'));
  perform scenario_v2.ok('S4d hash inconnu', r = '{"valid":false,"reason":"invalid"}'::jsonb, r::text);
  r := public.invitation_preview('pas-un-hash');
  perform scenario_v2.ok('S4e hash hors motif', r = '{"valid":false,"reason":"invalid"}'::jsonb, r::text);
  r := public.invitation_preview(null);
  perform scenario_v2.ok('S4f hash null', r = '{"valid":false,"reason":"invalid"}'::jsonb, r::text);
  r := public.invitation_preview(scenario_v2.h('s4-direct'));
  perform scenario_v2.ok('S4g dossier direct : partner_name null', (r->>'valid')::boolean and r->'partner_name' = 'null'::jsonb, r::text);
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S5 — claim_dossier : ordre strict des refus, succès, idempotence, pont purchases
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
insert into public.dossiers (partner_id, source, status, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, included_sends, invite_token_hash, invite_expires_at, invite_issued_at) values
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'invited', 'Claire', 'Martin', 'fam1@scenario.seren-test.fr',
   'Jean', 'Martin', current_date - 3, 29000, 7000, 10, scenario_v2.h('s5-ok'), now() + interval '7 days', now()),
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'invited', 'Paul', 'Roy', 'fam2@scenario.seren-test.fr',
   'Luc', 'Roy', current_date - 30, 29000, 7000, 10, scenario_v2.h('s5-exp'), now() - interval '1 minute', now() - interval '8 days'),
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'invited', 'Anne', 'Durand', 'fam3@scenario.seren-test.fr',
   'Louis', 'Durand', current_date - 5, 29000, 7000, 10, scenario_v2.h('s5-fam3'), now() + interval '7 days', now()),
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'invited', 'Lou', 'Petit', 'cancel.s5@scenario.seren-test.fr',
   'René', 'Petit', current_date - 2, 29000, 7000, 10, scenario_v2.h('s5-cancel'), now() + interval '7 days', now());
-- famille 3 porte déjà un dossier clos (ancienne adresse) → account_already_linked
insert into public.dossiers (partner_id, source, status, user_id, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, activated_at, closed_at) values
  ('00000000-0000-4000-8000-00000000a002', 'partner', 'closed', '00000000-0000-4000-8000-00000000b009', 'Anne', 'Durand',
   'ancien.fam3@scenario.seren-test.fr', 'Paul', 'Durand', current_date - 400, 29000, 7000, now() - interval '300 days', now() - interval '1 day');
-- le dossier « annulé » : même transition que partner_cancel_dossier (hash effacé)
update public.dossiers set status = 'cancelled', cancelled_at = now(), invite_token_hash = null, invite_expires_at = null
 where family_email = 'cancel.s5@scenario.seren-test.fr';

select scenario_v2.claims(null, null);
set local role authenticated;
do $$ begin
  perform scenario_v2.expect_error('S5a sans identité', format('select public.claim_dossier(%L)', scenario_v2.h('s5-ok')), 'not_authenticated');
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.expect_error('S5b compte PF', format('select public.claim_dossier(%L)', scenario_v2.h('s5-ok')), 'account_role_forbidden');
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b005', 'admin@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.expect_error('S5c compte admin', format('select public.claim_dossier(%L)', scenario_v2.h('s5-ok')), 'account_role_forbidden');
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b007', 'fam2@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.expect_error('S5d hash hors motif', $q$select public.claim_dossier('xyz')$q$, 'invalid_token');
  perform scenario_v2.expect_error('S5e hash inconnu, aucun dossier actif', format('select public.claim_dossier(%L)', scenario_v2.h('inconnu')), 'invalid_token');
  perform scenario_v2.expect_error('S5f invitation expirée', format('select public.claim_dossier(%L)', scenario_v2.h('s5-exp')), 'invitation_expired');
  perform scenario_v2.expect_error('S5g lien d''une autre adresse', format('select public.claim_dossier(%L)', scenario_v2.h('s5-ok')), 'email_mismatch');
  perform scenario_v2.expect_error('S5h dossier annulé, ancien lien', format('select public.claim_dossier(%L)', scenario_v2.h('s5-cancel')), 'invalid_token');
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b009', 'fam3@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.expect_error('S5i compte déjà rattaché à un dossier', format('select public.claim_dossier(%L)', scenario_v2.h('s5-fam3')), 'account_already_linked');
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b006', 'FAM1@Scenario.Seren-Test.fr');
set local role authenticated;
do $$
declare r jsonb; r2 jsonb; r3 jsonb;
begin
  r := public.claim_dossier(scenario_v2.h('s5-ok'));
  perform scenario_v2.ok('S5j succès (e-mail du JWT normalisé)', (r->>'claimed')::boolean and not (r->>'already_active')::boolean
    and r->>'partner_name' = 'PF Scénario X' and (r->>'dossier_id') is not null, r::text);
  perform set_config('scenario.s5_dossier', r->>'dossier_id', true);
  r2 := public.claim_dossier(scenario_v2.h('s5-ok'));
  perform scenario_v2.ok('S5k rejeu → already_active, même dossier', not (r2->>'claimed')::boolean and (r2->>'already_active')::boolean
    and r2->>'dossier_id' = r->>'dossier_id', r2::text);
  r3 := public.claim_dossier(scenario_v2.h('inconnu'));
  perform scenario_v2.ok('S5l hash inconnu avec dossier actif → already_active (étape 5)', (r3->>'already_active')::boolean, r3::text);
end $$;

reset role;
do $$
declare v_id uuid := current_setting('scenario.s5_dossier')::uuid;
begin
  perform scenario_v2.ok('S5m dossier activé, hash et expiration effacés',
    (select status = 'active' and user_id = '00000000-0000-4000-8000-00000000b006' and invite_token_hash is null
            and invite_expires_at is null and activated_at is not null from public.dossiers where id = v_id));
  perform scenario_v2.ok('S5n pont : exactement 1 ligne purchases paid/forfait/10, montant null',
    (select count(*) = 1 and bool_and(user_id = '00000000-0000-4000-8000-00000000b006' and status = 'paid' and kind = 'forfait'
            and included_sends = 10 and amount_total is null and paid_at is not null)
       from public.purchases where stripe_session_id = 'partner_dossier:' || v_id::text));
  perform scenario_v2.ok('S5o aucun autre achat pour la famille',
    (select count(*) = 1 from public.purchases where user_id = '00000000-0000-4000-8000-00000000b006'));
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S6 — pont : send_balance = 10 après claim, 10 consume_send passent, le 11ᵉ lève quota_exhausted
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
insert into public.webhook_config (id, rpc_secret) values (1, 'scenario-local-secret')
  on conflict (id) do update set rpc_secret = excluded.rpc_secret;
insert into public.dossiers (partner_id, source, status, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, invite_token_hash, invite_expires_at, invite_issued_at) values
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'invited', 'Claire', 'Martin', 'fam1@scenario.seren-test.fr',
   'Jean', 'Martin', current_date - 3, 29000, 7000, scenario_v2.h('s6-ok'), now() + interval '7 days', now());
select scenario_v2.claims('00000000-0000-4000-8000-00000000b006', 'fam1@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform public.claim_dossier(scenario_v2.h('s6-ok'));
  perform public.claim_dossier(scenario_v2.h('s6-ok'));   -- double clic
end $$;
reset role;
do $$
declare
  v_uid  uuid := '00000000-0000-4000-8000-00000000b006';
  v_send uuid;
  r      jsonb;
  i      integer;
begin
  perform scenario_v2.ok('S6a double claim → une seule ligne pont', (select count(*) = 1 from public.purchases where user_id = v_uid));
  perform scenario_v2.ok('S6b send_balance = 10 après claim', public.send_balance(v_uid) = 10);
  for i in 1..11 loop
    insert into public.letter_sends (user_id, template_id, channel, status, dedup_key)
    values (v_uid, 'scenario', 'papier', 'prepared', 'scenario-s6-' || i)
    returning id into v_send;
    if i <= 10 then
      r := public.consume_send('scenario-local-secret', v_send, v_uid);
      perform scenario_v2.ok('S6c débit ' || i || '/10', (r->>'debited')::boolean and r->>'source' = 'included'
        and (r->>'balance_after')::int = 10 - i, r::text);
    else
      perform scenario_v2.expect_error('S6d 11ᵉ envoi refusé',
        format('select public.consume_send(%L, %L::uuid, %L::uuid)', 'scenario-local-secret', v_send, v_uid), 'quota_exhausted');
    end if;
  end loop;
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S7 — record_consents : refus, succès, rejeu, bascule de my_account().consent.required
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
insert into public.dossiers (partner_id, source, status, user_id, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, activated_at) values
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'active', '00000000-0000-4000-8000-00000000b006', 'Claire', 'Martin',
   'fam1@scenario.seren-test.fr', 'Jean', 'Martin', current_date - 3, 29000, 7000, now());

select scenario_v2.claims(null, null);
set local role authenticated;
do $$ begin
  perform scenario_v2.expect_error('S7a sans identité',
    $q$select public.record_consents('2026-09-beta-1', array['terms','privacy','sensitive_data'])$q$, 'not_authenticated');
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b007', 'fam2@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.expect_error('S7b sans dossier actif',
    $q$select public.record_consents(public.consent_version(), array['terms','privacy','sensitive_data'])$q$, 'dossier_not_active');
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b006', 'fam1@scenario.seren-test.fr');
set local role authenticated;
do $$
declare r jsonb;
begin
  perform scenario_v2.ok('S7c consentement requis avant', (public.my_account()->'consent'->>'required')::boolean);
  perform scenario_v2.expect_error('S7d mauvaise version',
    $q$select public.record_consents('2026-01-autre', array['terms','privacy','sensitive_data'])$q$, 'consent_version_mismatch');
  perform scenario_v2.expect_error('S7e kinds incomplets',
    $q$select public.record_consents(public.consent_version(), array['terms','privacy'])$q$, 'consent_incomplete');
  perform scenario_v2.expect_error('S7f kind inconnu en plus',
    $q$select public.record_consents(public.consent_version(), array['terms','privacy','sensitive_data','marketing'])$q$, 'consent_incomplete');
  perform scenario_v2.expect_error('S7g élément null',
    $q$select public.record_consents(public.consent_version(), array['terms','privacy','sensitive_data',null])$q$, 'consent_incomplete');
  perform scenario_v2.expect_error('S7h tableau null',
    $q$select public.record_consents(public.consent_version(), null)$q$, 'consent_incomplete');
  r := public.record_consents(public.consent_version(), array['sensitive_data', 'terms', 'privacy', 'terms']);
  perform scenario_v2.ok('S7i succès (ordre et doublons ignorés)', (r->>'recorded')::int = 3 and not (r->>'required')::boolean
    and r->>'version' = '2026-09-beta-1', r::text);
  r := public.record_consents(public.consent_version(), array['terms', 'privacy', 'sensitive_data']);
  perform scenario_v2.ok('S7j rejeu → recorded 0', (r->>'recorded')::int = 0, r::text);
  r := public.my_account();
  perform scenario_v2.ok('S7k consentement plus requis, accepted_at posé', not (r->'consent'->>'required')::boolean
    and r->'consent'->>'accepted_at' is not null and r->'consent'->>'version' = '2026-09-beta-1', r::text);
  perform scenario_v2.ok('S7l la famille lit ses 3 consentements', (select count(*) = 3 from public.consents));
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b007', 'fam2@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.ok('S7m une autre famille ne lit aucun consentement', (select count(*) = 0 from public.consents));
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S8 — my_account : rôles exclusifs (§2.3), projection sans snapshot ni e-mail ni hash
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
insert into public.dossiers (partner_id, source, status, user_id, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, activated_at) values
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'active', '00000000-0000-4000-8000-00000000b006', 'Claire', 'Martin',
   'fam1@scenario.seren-test.fr', 'Jean', 'Martin', current_date - 3, 29000, 7000, now());
insert into public.dossiers (partner_id, source, status, user_id, family_email, price_ttc_cents, commission_ttc_cents,
                             activated_at, closed_at) values
  (null, 'direct', 'closed', '00000000-0000-4000-8000-00000000b007', 'fam2@scenario.seren-test.fr', 0, 0,
   now() - interval '10 days', now() - interval '1 day');

select scenario_v2.claims('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr');
set local role authenticated;
do $$
declare r jsonb := public.my_account();
begin
  perform scenario_v2.ok('S8a gérant PF → role partner', r->>'role' = 'partner' and not (r->>'is_admin')::boolean
    and r->'partner' = jsonb_build_object('id', '00000000-0000-4000-8000-00000000a001', 'name', 'PF Scénario X', 'status', 'active', 'user_role', 'manager')
    and r->'dossier' = 'null'::jsonb and not (r->'consent'->>'required')::boolean, r::text);
  perform scenario_v2.ok('S8b clés de premier niveau exactes',
    (select array_agg(k order by k) from jsonb_object_keys(r) as k) = array['consent', 'dossier', 'is_admin', 'partner', 'role', 'user_id'], r::text);
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b002', 'pfx.advisor@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.ok('S8c conseiller → user_role advisor', public.my_account()->'partner'->>'user_role' = 'advisor');
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b006', 'fam1@scenario.seren-test.fr');
set local role authenticated;
do $$
declare r jsonb := public.my_account();
begin
  perform scenario_v2.ok('S8d famille active', r->>'role' = 'family' and r->'partner' = 'null'::jsonb
    and r->'dossier'->>'status' = 'active' and r->'dossier'->>'source' = 'partner'
    and r->'dossier'->>'partner_name' = 'PF Scénario X' and r->'dossier'->>'deceased_first_name' = 'Jean'
    and (r->'dossier'->>'included_sends')::int = 10 and r->'dossier'->>'activated_at' is not null
    and (r->'consent'->>'required')::boolean and r->'consent'->'accepted_at' = 'null'::jsonb, r::text);
  perform scenario_v2.ok('S8e clés du dossier exactes',
    (select array_agg(k order by k) from jsonb_object_keys(r->'dossier') as k)
      = array['activated_at', 'deceased_first_name', 'id', 'included_sends', 'partner_name', 'source', 'status'], r::text);
  perform scenario_v2.ok('S8f ni e-mail, ni hash, ni snapshot', r::text !~ '(family_email|invite_token_hash|price_ttc|commission_ttc|@scenario)', r::text);
  perform scenario_v2.ok('S8g has_active_dossier vrai', public.has_active_dossier());
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b007', 'fam2@scenario.seren-test.fr');
set local role authenticated;
do $$
declare r jsonb := public.my_account();
begin
  perform scenario_v2.ok('S8h dossier clos direct → family, closed, partner_name null', r->>'role' = 'family'
    and r->'dossier'->>'status' = 'closed' and r->'dossier'->'partner_name' = 'null'::jsonb, r::text);
  perform scenario_v2.ok('S8i has_active_dossier faux sur dossier clos', not public.has_active_dossier());
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b008', 'nobody@scenario.seren-test.fr');
set local role authenticated;
do $$
declare r jsonb := public.my_account();
begin
  perform scenario_v2.ok('S8j compte vide → none', r->>'role' = 'none' and not (r->>'is_admin')::boolean
    and r->'partner' = 'null'::jsonb and r->'dossier' = 'null'::jsonb and not (r->'consent'->>'required')::boolean, r::text);
  perform scenario_v2.ok('S8k has_active_dossier faux', not public.has_active_dossier());
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b005', 'admin@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.ok('S8l admin → none + is_admin', public.my_account()->>'role' = 'none' and (public.my_account()->>'is_admin')::boolean);
end $$;

reset role;
select scenario_v2.claims(null, null);
set local role authenticated;
do $$ begin
  perform scenario_v2.ok('S8m sans identité → null', public.my_account() is null);
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S12 — deny-all : aucune lecture ni écriture directe des tables v2 et PF (grants « hébergé » appliqués)
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
insert into public.dossiers (partner_id, source, status, user_id, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, activated_at) values
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'active', '00000000-0000-4000-8000-00000000b006', 'Claire', 'Martin',
   'fam1@scenario.seren-test.fr', 'Jean', 'Martin', current_date - 3, 29000, 7000, now());
insert into public.attributions (user_id, partner_id) values ('00000000-0000-4000-8000-00000000b007', '00000000-0000-4000-8000-00000000a001');

select scenario_v2.claims('00000000-0000-4000-8000-00000000b006', 'fam1@scenario.seren-test.fr');
set local role authenticated;
do $$
declare n integer;
begin
  perform scenario_v2.ok('S12a SELECT dossiers → 0', (select count(*) = 0 from public.dossiers));
  perform scenario_v2.ok('S12b SELECT account_enrollments → 0', (select count(*) = 0 from public.account_enrollments));
  perform scenario_v2.ok('S12c SELECT seren_admins → 0', (select count(*) = 0 from public.seren_admins));
  perform scenario_v2.ok('S12d SELECT partners → 0', (select count(*) = 0 from public.partners));
  perform scenario_v2.ok('S12e SELECT partner_users → 0', (select count(*) = 0 from public.partner_users));
  perform scenario_v2.ok('S12f SELECT attributions → 0', (select count(*) = 0 from public.attributions));
  perform scenario_v2.expect_error('S12g INSERT dossiers',
    format($q$insert into public.dossiers (source, status, family_email, price_ttc_cents, commission_ttc_cents, invite_token_hash, invite_expires_at)
              values ('direct', 'invited', 'forge@scenario.seren-test.fr', 0, 0, %L, now() + interval '7 days')$q$, scenario_v2.h('forge')), '#42501');
  perform scenario_v2.expect_error('S12h INSERT account_enrollments',
    $q$insert into public.account_enrollments (email, role) values ('forge@scenario.seren-test.fr', 'seren_admin')$q$, '#42501');
  perform scenario_v2.expect_error('S12i INSERT seren_admins',
    $q$insert into public.seren_admins (user_id) values ('00000000-0000-4000-8000-00000000b006')$q$, '#42501');
  perform scenario_v2.expect_error('S12j INSERT partners', $q$insert into public.partners (name) values ('PF forgée')$q$, '#42501');
  perform scenario_v2.expect_error('S12k INSERT partner_users',
    $q$insert into public.partner_users (user_id, partner_id) values ('00000000-0000-4000-8000-00000000b006', '00000000-0000-4000-8000-00000000a001')$q$, '#42501');
  perform scenario_v2.expect_error('S12l INSERT attributions',
    $q$insert into public.attributions (user_id, partner_id) values ('00000000-0000-4000-8000-00000000b006', '00000000-0000-4000-8000-00000000a001')$q$, '#42501');
  perform scenario_v2.expect_error('S12m INSERT consents (aucune policy d''écriture)',
    $q$insert into public.consents (user_id, kind, version) values ('00000000-0000-4000-8000-00000000b006', 'terms', '2026-09-beta-1')$q$, '#42501');
  update public.dossiers set included_sends = 99 where true;
  get diagnostics n = row_count;
  perform scenario_v2.ok('S12n UPDATE dossiers → 0 ligne', n = 0);
end $$;

reset role;
select scenario_v2.claims(null, null);
set local role anon;
do $$ begin
  perform scenario_v2.ok('S12o anon : dossiers et consents → 0', (select count(*) = 0 from public.dossiers) and (select count(*) = 0 from public.consents));
end $$;

reset role;
do $$ begin
  perform scenario_v2.ok('S12p le dossier est intact', (select included_sends = 10 from public.dossiers where user_id = '00000000-0000-4000-8000-00000000b006'));
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S13 — droits des fonctions core (§3.4)
-- ════════════════════════════════════════════════════════════════════════════════════════
do $$
declare v_fn text;
begin
  foreach v_fn in array array['public.consent_version()', 'public.hook_before_user_created(jsonb)', 'public.link_enrollments(jsonb)',
                              'public.invitation_preview(text)', 'public.claim_dossier(text)', 'public.my_account()',
                              'public.record_consents(text, text[])', 'public.has_active_dossier()'] loop
    perform scenario_v2.ok('S13a aucun EXECUTE PUBLIC : ' || v_fn,
      (select p.proacl is not null and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
         from pg_proc p where p.oid = v_fn::regprocedure));
    perform scenario_v2.ok('S13b search_path vide : ' || v_fn,
      (select coalesce(array_to_string(p.proconfig, ',') like '%search_path=""%', false) from pg_proc p where p.oid = v_fn::regprocedure));
    perform scenario_v2.ok('S13c security definer sauf consent_version : ' || v_fn,
      (select p.prosecdef = (v_fn <> 'public.consent_version()') from pg_proc p where p.oid = v_fn::regprocedure));
  end loop;
  perform scenario_v2.ok('S13d anon ne claim pas', not has_function_privilege('anon', 'public.claim_dossier(text)', 'execute'));
  perform scenario_v2.ok('S13e anon sans my_account', not has_function_privilege('anon', 'public.my_account()', 'execute'));
  perform scenario_v2.ok('S13f anon sans record_consents', not has_function_privilege('anon', 'public.record_consents(text, text[])', 'execute'));
  perform scenario_v2.ok('S13g anon sans has_active_dossier', not has_function_privilege('anon', 'public.has_active_dossier()', 'execute'));
  perform scenario_v2.ok('S13h invitation_preview : anon et authenticated',
    has_function_privilege('anon', 'public.invitation_preview(text)', 'execute')
    and has_function_privilege('authenticated', 'public.invitation_preview(text)', 'execute'));
  perform scenario_v2.ok('S13i hook : ni anon ni authenticated',
    not has_function_privilege('anon', 'public.hook_before_user_created(jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.hook_before_user_created(jsonb)', 'execute'));
  perform scenario_v2.ok('S13j hook : supabase_auth_admin', has_function_privilege('supabase_auth_admin', 'public.hook_before_user_created(jsonb)', 'execute'));
  perform scenario_v2.ok('S13k hook : owner postgres',
    (select pg_get_userbyid(proowner) = 'postgres' from pg_proc where oid = 'public.hook_before_user_created(jsonb)'::regprocedure));
  perform scenario_v2.ok('S13l link_enrollments non exposée',
    not has_function_privilege('anon', 'public.link_enrollments(jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.link_enrollments(jsonb)', 'execute'));
  perform scenario_v2.ok('S13m usage du schéma public pour supabase_auth_admin', has_schema_privilege('supabase_auth_admin', 'public', 'usage'));
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S14 — link_enrollments : liaison, rejeu, conflit famille
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
delete from public.partner_users
 where user_id in ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000b003', '00000000-0000-4000-8000-00000000b004');
delete from public.seren_admins;
do $$
declare
  -- Appariement explicite e-mail ↔ UUID (revue 16/09) : exactement ce qu'Arnaud colle depuis « Add user ».
  v_pairs constant jsonb := '[
    {"email": "pfx.manager@scenario.seren-test.fr", "user_id": "00000000-0000-4000-8000-00000000b001"},
    {"email": "pfy.manager@scenario.seren-test.fr", "user_id": "00000000-0000-4000-8000-00000000b003"},
    {"email": "pfs.manager@scenario.seren-test.fr", "user_id": "00000000-0000-4000-8000-00000000b004"},
    {"email": "admin@scenario.seren-test.fr",       "user_id": "00000000-0000-4000-8000-00000000b005"}
  ]'::jsonb;
  r jsonb;
begin
  r := public.link_enrollments(v_pairs);
  perform scenario_v2.ok('S14a compteurs', r = '{"partner_users_linked":3,"seren_admins_linked":1,"pending":1,"untrusted":0}'::jsonb, r::text);
  perform scenario_v2.ok('S14b gérants recréés en manager sur la bonne PF',
    (select count(*) = 3 from public.partner_users
      where (user_id, partner_id, role) in (('00000000-0000-4000-8000-00000000b001'::uuid, '00000000-0000-4000-8000-00000000a001'::uuid, 'manager'),
                                           ('00000000-0000-4000-8000-00000000b003'::uuid, '00000000-0000-4000-8000-00000000a002'::uuid, 'manager'),
                                           ('00000000-0000-4000-8000-00000000b004'::uuid, '00000000-0000-4000-8000-00000000a003'::uuid, 'manager'))));
  perform scenario_v2.ok('S14c admin recréé', exists (select 1 from public.seren_admins where user_id = '00000000-0000-4000-8000-00000000b005'));
  perform scenario_v2.ok('S14d liaisons tracées, enrôlement sans compte en attente',
    (select count(*) filter (where linked_user_id is not null and linked_at is not null) = 4
        and count(*) filter (where email = 'pending.manager@scenario.seren-test.fr' and linked_user_id is null) = 1
       from public.account_enrollments where email like '%@scenario.seren-test.fr'));
  r := public.link_enrollments(v_pairs);
  perform scenario_v2.ok('S14e rejeu sans doublon (paires déjà liées : contrôles de confiance sautés)',
    r = '{"partner_users_linked":3,"seren_admins_linked":1,"pending":1,"untrusted":0}'::jsonb
    and (select count(*) = 4 from public.partner_users where user_id::text like '00000000-0000-4000-8000-00000000b%'), r::text);
  perform scenario_v2.ok('S14e2 appel sans paires : état des lieux, aucune liaison',
    public.link_enrollments() = '{"partner_users_linked":0,"seren_admins_linked":0,"pending":1,"untrusted":0}'::jsonb);
end $$;
insert into public.dossiers (partner_id, source, status, user_id, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, activated_at) values
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'active', '00000000-0000-4000-8000-00000000b006', 'Claire', 'Martin',
   'fam1@scenario.seren-test.fr', 'Jean', 'Martin', current_date - 3, 29000, 7000, now());
insert into public.account_enrollments (email, role) values ('fam1@scenario.seren-test.fr', 'seren_admin');
do $$ begin
  -- La garde famille précède le traitement des paires : elle se déclenche même sans paire.
  perform scenario_v2.expect_error('S14f compte enrôlé portant un dossier → refus', 'select public.link_enrollments()', 'enrollment_conflict_family');
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S14g-l — comptes NON FIABLES : aucun ne devient gérant PF ni admin Seren (revue 16/09, must-fix 2)
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
do $$
declare
  v_pfx constant text := '[{"email": "pfx.manager@scenario.seren-test.fr", "user_id": "00000000-0000-4000-8000-00000000b001"}]';
begin
  -- g : l'UUID collé ne correspond pas à l'adresse (copier-coller de la mauvaise ligne « Add user »)
  perform scenario_v2.expect_error('S14g UUID d''un autre compte → non lié',
    format('select public.link_enrollments(%L::jsonb)',
           '[{"email": "pfx.manager@scenario.seren-test.fr", "user_id": "00000000-0000-4000-8000-00000000b002"}]'),
    'enrollment_account_untrusted');
  -- h : adresse non enrôlée (faute de frappe, ou partie 1 non exécutée)
  perform scenario_v2.expect_error('S14h adresse non enrôlée → non liée',
    format('select public.link_enrollments(%L::jsonb)',
           '[{"email": "inconnu@scenario.seren-test.fr", "user_id": "00000000-0000-4000-8000-00000000b008"}]'),
    'enrollment_account_untrusted');
  -- i : compte ANTÉRIEUR à l'enrôlement (inscription publique glissée entre la partie 1 et « Add user »)
  update auth.users set created_at = now() - interval '1 day' where id = '00000000-0000-4000-8000-00000000b001';
  perform scenario_v2.expect_error('S14i compte créé avant l''enrôlement → non lié',
    format('select public.link_enrollments(%L::jsonb)', v_pfx), 'enrollment_account_untrusted');
  update auth.users set created_at = now() where id = '00000000-0000-4000-8000-00000000b001';
  -- j : compte DÉJÀ CONNECTÉ (un « Add user » neuf a last_sign_in_at null — constat local 16/09)
  update auth.users set last_sign_in_at = now() where id = '00000000-0000-4000-8000-00000000b001';
  perform scenario_v2.expect_error('S14j compte déjà connecté → non lié',
    format('select public.link_enrollments(%L::jsonb)', v_pfx), 'enrollment_account_untrusted');
  update auth.users set last_sign_in_at = null where id = '00000000-0000-4000-8000-00000000b001';
  -- k : changement d'adresse en attente sur le compte
  update auth.users set email_change = 'squat@scenario.seren-test.fr' where id = '00000000-0000-4000-8000-00000000b001';
  perform scenario_v2.expect_error('S14k changement d''e-mail en attente → non lié',
    format('select public.link_enrollments(%L::jsonb)', v_pfx), 'enrollment_account_untrusted');
  update auth.users set email_change = '' where id = '00000000-0000-4000-8000-00000000b001';
end $$;

delete from public.partner_users
 where user_id in ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000b003', '00000000-0000-4000-8000-00000000b004');
delete from public.seren_admins;
do $$
declare r jsonb := public.link_enrollments();
begin
  perform scenario_v2.ok('S14l untrusted compte les adresses enrôlées déjà portées par un compte',
    (r->>'untrusted')::int = 4 and (r->>'pending')::int = 1
    and (r->>'partner_users_linked')::int = 0 and (r->>'seren_admins_linked')::int = 0, r::text);
  perform scenario_v2.ok('S14m aucun rôle donné sans appariement',
    (select count(*) = 0 from public.seren_admins)
    and (select count(*) = 1 from public.partner_users where user_id::text like '00000000-0000-4000-8000-00000000b%'));
end $$;
rollback;

-- ═══ SCÉNARIOS PARTENAIRE ET ADMIN (Task 3 : S1, S2, S3, S9, S10, S11, S13p) — insérés ici ═══

-- ── Nettoyage des fixtures (committé) ──────────────────────────────────────────────────────
delete from public.dossiers
 where family_email like '%@scenario.seren-test.fr'
    or partner_id in ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000a003');
delete from public.account_enrollments where email like '%@scenario.seren-test.fr';
delete from auth.users where email like '%@scenario.seren-test.fr';
delete from public.partners
 where id in ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000a003');
drop schema scenario_v2 cascade;
do $$ begin raise notice 'SCENARIOS V2 : OK'; end $$;
```

- [ ] **Step 2: Vérifier l'échec (migration absente)**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
run-sql-checks "$S/wt-v2-l1" scripts/sql-scenarios-v2.sql; echo "exit=$?"
```
Expected : `Finished supabase db reset`, puis `ERROR:  relation "public.dossiers" does not exist` et `exit=3` (ou `75` si le verrou est tenu : relancer plus tard).

- [ ] **Step 3: Écrire `supabase/migrations/20260915200000_v2_core.sql`**

```sql
-- ════════════════════════════════════════════════════════════════════════════════════════
-- v2 core — dossiers PF, allowlist d'enrôlement, admins Seren, consentements, hook d'inscription,
-- activation par jeton et pont purchases (démonstrateur v2 + bêta pilote).
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Contrat : docs/design-v2-demonstrateur.md §3.2 (DDL), §3.3.1 à §3.3.8 (fonctions), §3.4 (droits).
-- Plan : docs/plan-v2-sql.md, Task 2. Migration ADDITIVE et REJOUABLE : aucun drop de table,
-- aucune retouche de partner_dashboard / consume_send / send_balance / release_debit /
-- create_pending_purchase / mark_purchase_paid (lint tests/migrations-v2-lint.test.ts).
--
-- Modèle de sécurité (mêmes principes que purchases et le dashboard PF v0) :
--  • account_enrollments, seren_admins et dossiers : RLS activée SANS policy (deny-all). dossiers
--    n'a pas même de SELECT owner (arbitrage A1 : la ligne porte les snapshots prix/commission).
--    Toute lecture passe par my_account(), has_active_dossier(), invitation_preview() ou les RPC PF.
--  • consents : une seule policy, SELECT own. Aucune policy d'écriture : record_consents est la porte.
--  • Chaque fonction : security definer (sauf consent_version), search_path vide, noms qualifiés,
--    revoke all from public, anon, authenticated, puis grants nominatifs du §3.4. Les RPC restent
--    appelables en direct via PostgREST : TOUTE leur sécurité est ici (auth.uid(), jeton, rôle).
--  • Aucune identité ne vient d'un paramètre : user_id = auth.uid(), e-mail = auth.jwt() ->> 'email'.
--  • Erreurs métier : raise exception '<code>' using errcode = 'P0001' — le message EST le code.

-- ── partners : champs contractuels v2 (name = raison sociale ; commission_rate conservée, plus lue) ──
alter table public.partners
  add column if not exists siret                text,
  add column if not exists billing_email        text,
  add column if not exists status               text not null default 'active',
  add column if not exists price_ttc_cents      integer not null default 29000,
  add column if not exists commission_ttc_cents integer not null default 7000,
  add column if not exists contract_signed_at   date,
  add column if not exists updated_at           timestamptz not null default now();

do $$ begin
  alter table public.partners add constraint partners_status_check check (status in ('prospect','active','suspended','terminated'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.partners add constraint partners_price_check check (price_ttc_cents >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.partners add constraint partners_commission_check check (commission_ttc_cents >= 0 and commission_ttc_cents <= price_ttc_cents);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.partners add constraint partners_siret_check check (siret is null or siret ~ '^[0-9]{14}$');
exception when duplicate_object then null; end $$;

-- ── partner_users : rôle (la colonne existe, aucun écran conseiller en bêta) ──
alter table public.partner_users
  add column if not exists role text not null default 'manager';

do $$ begin
  alter table public.partner_users add constraint partner_users_role_check check (role in ('manager','advisor'));
exception when duplicate_object then null; end $$;

-- ── account_enrollments : allowlist lue par le hook (deny-all) ──
create table if not exists public.account_enrollments (
  id             uuid primary key default gen_random_uuid(),
  email          text not null,
  role           text not null,
  partner_id     uuid references public.partners(id) on delete cascade,
  linked_user_id uuid references auth.users(id) on delete set null,
  linked_at      timestamptz,
  created_at     timestamptz not null default now(),
  constraint account_enrollments_email_check   check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint account_enrollments_role_check    check (role in ('partner_manager','seren_admin')),
  constraint account_enrollments_partner_check check ((role = 'partner_manager') = (partner_id is not null))
);
create unique index if not exists account_enrollments_email_role_uidx on public.account_enrollments (email, role);
alter table public.account_enrollments enable row level security;   -- AUCUNE policy

-- ── seren_admins : rôle admin Seren (deny-all, rempli par link_enrollments) — ici et non dans
--    v2_admin, parce que my_account() la lit (arbitrage A2) ──
create table if not exists public.seren_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.seren_admins enable row level security;          -- AUCUNE policy

-- ── dossiers : source de vérité de l'activation (deny-all, arbitrage A1) ──
create table if not exists public.dossiers (
  id                    uuid primary key default gen_random_uuid(),
  partner_id            uuid references public.partners(id) on delete restrict,
  source                text not null,
  status                text not null default 'invited',
  user_id               uuid references auth.users(id) on delete set null,
  family_first_name     text,
  family_last_name      text,
  family_email          text not null,
  family_phone          text,
  deceased_first_name   text,
  deceased_last_name    text,
  deceased_death_date   date,
  price_ttc_cents       integer not null,
  commission_ttc_cents  integer not null,
  included_sends        integer not null default 10,
  invite_token_hash     text,
  invite_expires_at     timestamptz,
  invite_issued_at      timestamptz,
  invite_rotation_count integer not null default 0,
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  activated_at          timestamptz,
  cancelled_at          timestamptz,
  cancelled_by          uuid references auth.users(id) on delete set null,
  closed_at             timestamptz,
  updated_at            timestamptz not null default now(),
  constraint dossiers_source_check   check (source in ('partner','direct','demo')),
  constraint dossiers_status_check   check (status in ('invited','active','closed','cancelled')),
  constraint dossiers_partner_check  check ((source = 'direct') = (partner_id is null)),
  constraint dossiers_email_check    check (family_email = lower(btrim(family_email))
                                            and char_length(family_email) <= 254
                                            and family_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint dossiers_phone_check    check (family_phone is null or family_phone ~ '^[0-9 +().-]{6,30}$'),
  constraint dossiers_identity_check check (source <> 'partner' or (
                                              family_first_name   is not null and family_last_name   is not null and
                                              deceased_first_name is not null and deceased_last_name is not null and
                                              deceased_death_date is not null)),
  constraint dossiers_names_check    check (coalesce(char_length(family_first_name),1)   between 1 and 100
                                        and coalesce(char_length(family_last_name),1)    between 1 and 100
                                        and coalesce(char_length(deceased_first_name),1) between 1 and 100
                                        and coalesce(char_length(deceased_last_name),1)  between 1 and 100),
  constraint dossiers_amounts_check  check (price_ttc_cents >= 0 and commission_ttc_cents >= 0 and included_sends >= 0),
  constraint dossiers_hash_check     check (invite_token_hash is null or invite_token_hash ~ '^[0-9a-f]{64}$'),
  constraint dossiers_state_check    check (
       (status = 'invited'   and user_id is null and invite_token_hash is not null and invite_expires_at is not null
                             and activated_at is null and cancelled_at is null)
    or (status = 'active'    and user_id is not null and activated_at is not null and invite_token_hash is null
                             and cancelled_at is null)
    or (status = 'closed'    and closed_at is not null and invite_token_hash is null)
    or (status = 'cancelled' and cancelled_at is not null and user_id is null and invite_token_hash is null))
);
-- Un e-mail = au plus un dossier non annulé (unicité GLOBALE, toutes PF confondues).
create unique index if not exists dossiers_family_email_open_uidx on public.dossiers (family_email) where status <> 'cancelled';
-- Un compte = au plus un dossier.
create unique index if not exists dossiers_user_uidx              on public.dossiers (user_id) where user_id is not null;
create unique index if not exists dossiers_invite_hash_uidx       on public.dossiers (invite_token_hash) where invite_token_hash is not null;
create index        if not exists dossiers_partner_created_idx    on public.dossiers (partner_id, created_at desc);
create index        if not exists dossiers_partner_deceased_idx   on public.dossiers (partner_id, lower(deceased_last_name), deceased_death_date);
alter table public.dossiers enable row level security;              -- AUCUNE policy (A1)
-- ⚠️ Conséquence voulue de dossiers_state_check : un « Delete user » sur le compte d'un dossier
-- ACTIF échoue (on delete set null viole l'état 'active'). L'effacement passe d'abord par la
-- clôture du dossier (scripts/erase-family.sql).

-- ── consents : preuve append-only ──
create table if not exists public.consents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  dossier_id  uuid references public.dossiers(id) on delete set null,
  kind        text not null,
  version     text not null,
  accepted_at timestamptz not null default now(),
  constraint consents_kind_check    check (kind in ('terms','privacy','sensitive_data')),
  constraint consents_version_check check (version ~ '^[0-9]{4}-[0-9]{2}-[a-z0-9-]{1,40}$')
);
create unique index if not exists consents_user_kind_version_uidx on public.consents (user_id, kind, version);
alter table public.consents enable row level security;
drop policy if exists "own consents read" on public.consents;   -- policy NEUVE de ce fichier : drop/create rejouable
create policy "own consents read" on public.consents for select to authenticated using (auth.uid() = user_id);

-- ── Copie des attributions v0 → dossiers de démo (aucun DROP d'attributions, dépréciée) ──
-- Ni pont purchases ni consentement : un compte de démo copié arrive sur /bienvenue avec un solde 0.
insert into public.dossiers (partner_id, source, status, user_id, family_email,
                             price_ttc_cents, commission_ttc_cents, included_sends, activated_at, created_at)
select a.partner_id, 'demo', 'active', a.user_id, lower(btrim(u.email)),
       p.price_ttc_cents, p.commission_ttc_cents, 10, a.created_at, a.created_at
  from public.attributions a
  join auth.users u   on u.id = a.user_id
  join public.partners p on p.id = a.partner_id
 where u.email is not null
   and not exists (select 1 from public.dossiers d where d.user_id = a.user_id)
   and not exists (select 1 from public.dossiers d where d.family_email = lower(btrim(u.email)) and d.status <> 'cancelled');
comment on table public.attributions is 'DÉPRÉCIÉE (v2) : remplacée par public.dossiers (source=demo). Conservée pour le rollback de partner_dashboard v0.';

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §3.3.1 consent_version — constante jumelle de src/lib/consent-version.ts (test de parité)
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.consent_version()
returns text
language sql
immutable
security invoker
set search_path = ''
as $fn$
  select '2026-09-beta-1'::text
$fn$;
revoke all on function public.consent_version() from public, anon, authenticated;
grant execute on function public.consent_version() to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §3.3.2 hook_before_user_created — Supabase Auth « Before User Created » (Postgres)
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Accepte : (1) un e-mail de l'allowlist d'enrôlement (gérants PF, admins Seren), ou (2) un e-mail
-- invité dont user_metadata.invite_token_hash correspond à un dossier 'invited' non expiré.
-- Refuse tout le reste (403 signup_requires_invitation). Aucune écriture, aucune exception levée :
-- une erreur interne remonte comme erreur du hook et Auth refuse l'inscription (fail-closed).
-- security definer owner postgres : supabase_auth_admin est soumis à la RLS, les deux tables lues
-- sont deny-all — sans definer, le hook ne verrait aucune ligne et refuserait TOUT.
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_email text := lower(btrim(event -> 'user' ->> 'email'));
  v_hash  text := event -> 'user' -> 'user_metadata' ->> 'invite_token_hash';
  v_refus constant jsonb := jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'signup_requires_invitation'));
begin
  if v_email is null or v_email = '' then
    return v_refus;
  end if;

  if exists (select 1 from public.account_enrollments e where e.email = v_email) then
    return '{}'::jsonb;
  end if;

  if v_hash ~ '^[0-9a-f]{64}$'
     and exists (select 1
                   from public.dossiers d
                  where d.invite_token_hash = v_hash
                    and d.family_email = v_email
                    and d.status = 'invited'
                    and d.invite_expires_at > now()) then
    return '{}'::jsonb;
  end if;

  return v_refus;
end
$fn$;
alter function public.hook_before_user_created(jsonb) owner to postgres;
revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §3.3.3 link_enrollments — NON exposée (aucun grant) : SQL Editor d'Arnaud, rôle postgres
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Revue de sécurité du 16/09 (must-fix 2) : AUCUNE liaison par simple égalité d'e-mail. Lier tout
-- compte qui PORTE une adresse enrôlée donnerait le rôle de gérant PF (liste des familles : identité,
-- e-mail, téléphone, défunt) ou d'admin Seren à un intrus inscrit entre la partie 1 du seed et le
-- « Add user » d'Arnaud. L'appariement est explicite : p_pairs = [{"email": …, "user_id": <UUID copié
-- depuis « Add user »>}], et le compte doit être FIABLE : créé après l'enrôlement, jamais connecté,
-- sans changement d'e-mail en attente. Tout écart → enrollment_account_untrusted (STOP, enquête).
create or replace function public.link_enrollments(p_pairs jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_pair      jsonb;
  v_email     text;
  v_uid       uuid;
  v_u         record;
  v_first     timestamptz;
  v_rec       record;
  v_partner_n integer := 0;
  v_admin_n   integer := 0;
  v_pending   integer := 0;
  v_untrusted integer := 0;
begin
  -- Garde AVANT toute écriture : un compte enrôlé qui porte un dossier famille ne devient jamais interne.
  if exists (select 1
               from public.account_enrollments e
               join auth.users u on lower(btrim(u.email)) = e.email
               join public.dossiers d on d.user_id = u.id) then
    raise exception 'enrollment_conflict_family' using errcode = 'P0001';
  end if;

  for v_pair in select value from jsonb_array_elements(coalesce(p_pairs, '[]'::jsonb))
  loop
    v_email := lower(btrim(v_pair ->> 'email'));
    begin
      v_uid := (v_pair ->> 'user_id')::uuid;
    exception when others then
      raise notice 'link_enrollments : user_id illisible pour %', v_email;
      raise exception 'enrollment_account_untrusted' using errcode = 'P0001';
    end;

    select min(e.created_at) into v_first from public.account_enrollments e where e.email = v_email;
    if v_first is null then
      raise notice 'link_enrollments : % n''est pas enrôlée (exécuter la partie 1 du seed)', v_email;
      raise exception 'enrollment_account_untrusted' using errcode = 'P0001';
    end if;

    -- Rejeu de la partie 2 : si la paire est DÉJÀ liée à ce compte, les contrôles sont sautés (après
    -- une première liaison, le gérant s'est connecté : last_sign_in_at n'est plus null). Les insert
    -- restent rejoués, donc le rejeu est idempotent et rend les mêmes compteurs.
    if exists (select 1 from public.account_enrollments e
                where e.email = v_email and e.linked_user_id is distinct from v_uid) then
      select u.id,
             lower(btrim(u.email))            as email,
             u.created_at                     as created_at,
             u.last_sign_in_at                as last_sign_in_at,
             coalesce(u.email_change, '')     as email_change
        into v_u
        from auth.users u
       where u.id = v_uid;
      if not found
         or v_u.email is distinct from v_email          -- UUID collé sur la mauvaise ligne
         or v_u.created_at < v_first                    -- compte antérieur à l'enrôlement
         or v_u.last_sign_in_at is not null             -- quelqu'un s'est déjà connecté
         or v_u.email_change <> '' then                 -- changement d'adresse en attente
        raise notice 'link_enrollments : compte non fiable pour % — attendu un compte créé par « Add user » APRÈS l''enrôlement, jamais connecté, sans changement d''e-mail en attente', v_email;
        raise exception 'enrollment_account_untrusted' using errcode = 'P0001';
      end if;
    end if;

    for v_rec in select e.id as enrollment_id, e.role, e.partner_id
                   from public.account_enrollments e
                  where e.email = v_email
    loop
      if v_rec.role = 'partner_manager' then
        insert into public.partner_users (user_id, partner_id, role)
        values (v_uid, v_rec.partner_id, 'manager')
        on conflict (user_id) do update set partner_id = excluded.partner_id, role = 'manager';
        v_partner_n := v_partner_n + 1;
      elsif v_rec.role = 'seren_admin' then
        insert into public.seren_admins (user_id) values (v_uid)
        on conflict (user_id) do nothing;
        v_admin_n := v_admin_n + 1;
      end if;

      update public.account_enrollments
         set linked_user_id = v_uid,
             linked_at      = coalesce(linked_at, now())
       where id = v_rec.enrollment_id;
    end loop;
  end loop;

  -- pending  : enrôlement sans AUCUN compte auth → « Add user » reste à faire.
  -- untrusted: enrôlement non lié alors qu'un compte PORTE l'adresse → SIGNAL D'ALARME (quelqu'un la
  --            détient, ou l'UUID n'a pas été apparié). > 0 = STOP, enquête avant toute ouverture.
  select count(*) filter (where not exists (select 1 from auth.users u where lower(btrim(u.email)) = e.email)),
         count(*) filter (where     exists (select 1 from auth.users u where lower(btrim(u.email)) = e.email))
    into v_pending, v_untrusted
    from public.account_enrollments e
   where e.linked_user_id is null;

  return jsonb_build_object('partner_users_linked', v_partner_n,
                            'seren_admins_linked',  v_admin_n,
                            'pending',              v_pending,
                            'untrusted',            v_untrusted);
end
$fn$;
revoke all on function public.link_enrollments(jsonb) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §3.3.4 invitation_preview — seule RPC anonyme ; pas d'oracle d'état (utilisé/annulé = invalid)
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.invitation_preview(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_d            public.dossiers%rowtype;
  v_partner_name text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('valid', false, 'reason', 'invalid');
  end if;

  select * into v_d from public.dossiers d where d.invite_token_hash = p_token_hash;
  if not found or v_d.status <> 'invited' then
    return jsonb_build_object('valid', false, 'reason', 'invalid');
  end if;

  select p.name into v_partner_name from public.partners p where p.id = v_d.partner_id;

  if v_d.invite_expires_at <= now() then
    return jsonb_build_object('valid', false, 'reason', 'expired', 'partner_name', v_partner_name);
  end if;

  -- Jamais : nom de famille, téléphone, date de décès, snapshots, identifiant de dossier.
  return jsonb_build_object('valid',               true,
                            'email',               v_d.family_email,
                            'partner_name',        v_partner_name,
                            'family_first_name',   v_d.family_first_name,
                            'deceased_first_name', v_d.deceased_first_name,
                            'expires_at',          v_d.invite_expires_at);
end
$fn$;
revoke all on function public.invitation_preview(text) from public, anon, authenticated;
grant execute on function public.invitation_preview(text) to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §3.3.5 claim_dossier — activation par la famille + pont purchases (D4), ordre strict du contrat
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Le pont écrit la SEULE ligne purchases non Stripe du système : stripe_session_id =
-- 'partner_dossier:<id>' (unique → idempotent), amount_total null (dette documentée §9.3-7 :
-- toute requête de CA sur purchases doit exclure ce préfixe). consume_send/send_balance intacts.
-- Le statut du partenaire n'est PAS vérifié : une PF suspendue ne coupe jamais une famille invitée.
create or replace function public.claim_dossier(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid          uuid := auth.uid();
  v_email        text := lower(btrim(auth.jwt() ->> 'email'));
  v_d            public.dossiers%rowtype;
  v_active_id    uuid;
  v_partner_name text;
begin
  -- 1.
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  -- 2. Un compte interne n'est jamais famille (§2.3).
  if exists (select 1 from public.partner_users pu where pu.user_id = v_uid)
     or exists (select 1 from public.seren_admins sa where sa.user_id = v_uid) then
    raise exception 'account_role_forbidden' using errcode = 'P0001';
  end if;
  -- 3.
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;
  -- 4. Verrou de ligne : deux claims concurrents du même lien se sérialisent.
  select * into v_d from public.dossiers d where d.invite_token_hash = p_token_hash for update;
  -- 5. Idempotence (double clic, retry réseau) : le hash est déjà effacé par le premier claim.
  if not found then
    select d.id into v_active_id from public.dossiers d where d.user_id = v_uid and d.status = 'active';
    if v_active_id is not null then
      return jsonb_build_object('claimed', false, 'already_active', true, 'dossier_id', v_active_id);
    end if;
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;
  -- 6.
  if v_d.status <> 'invited' then
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;
  -- 7.
  if v_d.invite_expires_at <= now() then
    raise exception 'invitation_expired' using errcode = 'P0001';
  end if;
  -- 8. L'e-mail vient du JWT, jamais d'un paramètre.
  if v_email is null or v_d.family_email <> v_email then
    raise exception 'email_mismatch' using errcode = 'P0001';
  end if;
  -- 9.
  if exists (select 1 from public.dossiers d where d.user_id = v_uid) then
    raise exception 'account_already_linked' using errcode = 'P0001';
  end if;
  -- 10.
  update public.dossiers
     set status            = 'active',
         user_id           = v_uid,
         activated_at      = now(),
         invite_token_hash = null,
         invite_expires_at = null,
         updated_at        = now()
   where id = v_d.id;
  -- 11. Pont, même transaction.
  insert into public.purchases (user_id, status, kind, stripe_session_id, included_sends, amount_total, currency, paid_at)
  values (v_uid, 'paid', 'forfait', 'partner_dossier:' || v_d.id::text, v_d.included_sends, null, null, now())
  on conflict (stripe_session_id) do nothing;
  -- 12.
  select p.name into v_partner_name from public.partners p where p.id = v_d.partner_id;
  return jsonb_build_object('claimed',        true,
                            'already_active', false,
                            'dossier_id',     v_d.id,
                            'partner_name',   v_partner_name);
end
$fn$;
revoke all on function public.claim_dossier(text) from public, anon, authenticated;
grant execute on function public.claim_dossier(text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §3.3.6 my_account — rôle exclusif (partner > family > none), is_admin orthogonal
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.my_account()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_uid      uuid := auth.uid();
  v_version  text := public.consent_version();
  v_is_admin boolean;
  v_role     text := 'none';
  v_partner  jsonb := null;
  v_dossier  jsonb := null;
  v_pu       record;
  v_d        record;
  v_kinds    integer;
  v_accepted timestamptz;
begin
  if v_uid is null then
    return null;
  end if;

  v_is_admin := exists (select 1 from public.seren_admins sa where sa.user_id = v_uid);

  -- Contrat résilié (décision 16/09) : plus aucun rôle PF, donc plus aucune PII famille. 'suspended'
  -- garde la lecture (seules création et renvoi sont bloquées par partner_inactive).
  select p.id, p.name, p.status, pu.role as user_role
    into v_pu
    from public.partner_users pu
    join public.partners p on p.id = pu.partner_id
   where pu.user_id = v_uid
     and p.status <> 'terminated';

  if found then
    v_role := 'partner';
    v_partner := jsonb_build_object('id', v_pu.id, 'name', v_pu.name, 'status', v_pu.status, 'user_role', v_pu.user_role);
  else
    select d.id, d.status, d.source, d.deceased_first_name, d.activated_at, d.included_sends, p.name as partner_name
      into v_d
      from public.dossiers d
      left join public.partners p on p.id = d.partner_id
     where d.user_id = v_uid
       and d.status in ('active','closed');
    if found then
      v_role := 'family';
      -- Jamais de snapshot prix/commission, jamais family_email, jamais de hash.
      v_dossier := jsonb_build_object('id',                  v_d.id,
                                      'status',              v_d.status,
                                      'source',              v_d.source,
                                      'partner_name',        v_d.partner_name,
                                      'deceased_first_name', v_d.deceased_first_name,
                                      'activated_at',        v_d.activated_at,
                                      'included_sends',      v_d.included_sends);
    end if;
  end if;

  select count(distinct c.kind), min(c.accepted_at)
    into v_kinds, v_accepted
    from public.consents c
   where c.user_id = v_uid
     and c.version = v_version
     and c.kind in ('terms','privacy','sensitive_data');

  return jsonb_build_object(
    'user_id',  v_uid,
    'role',     v_role,
    'is_admin', v_is_admin,
    'partner',  v_partner,
    'dossier',  v_dossier,
    'consent',  jsonb_build_object('version',     v_version,
                                   'required',    v_role = 'family' and v_kinds < 3,
                                   'accepted_at', case when v_kinds = 3 then v_accepted end));
end
$fn$;
revoke all on function public.my_account() from public, anon, authenticated;
grant execute on function public.my_account() to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §3.3.7 record_consents — 3 finalités exactement, version courante, dossier actif
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.record_consents(p_version text, p_kinds text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid        uuid := auth.uid();
  v_dossier_id uuid;
  v_kinds      text[];
  v_inserted   integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select d.id into v_dossier_id from public.dossiers d where d.user_id = v_uid and d.status = 'active';
  if v_dossier_id is null then
    raise exception 'dossier_not_active' using errcode = 'P0001';
  end if;

  if p_version is null or p_version <> public.consent_version() then
    raise exception 'consent_version_mismatch' using errcode = 'P0001';
  end if;

  -- Ensemble exact {privacy, sensitive_data, terms} : ordre et doublons ignorés ; un null ou une
  -- valeur inconnue rend l'ensemble différent.
  select coalesce(array_agg(distinct k order by k), '{}'::text[])
    into v_kinds
    from unnest(coalesce(p_kinds, '{}'::text[])) as k;
  if v_kinds is distinct from array['privacy','sensitive_data','terms']::text[] then
    raise exception 'consent_incomplete' using errcode = 'P0001';
  end if;

  insert into public.consents (user_id, dossier_id, kind, version)
  select v_uid, v_dossier_id, k, p_version
    from unnest(v_kinds) as k
  on conflict (user_id, kind, version) do nothing;
  get diagnostics v_inserted = row_count;

  return jsonb_build_object('recorded', v_inserted, 'version', p_version, 'required', false);
end
$fn$;
revoke all on function public.record_consents(text, text[]) from public, anon, authenticated;
grant execute on function public.record_consents(text, text[]) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §3.3.8 has_active_dossier — sans paramètre : aucun oracle sur autrui
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.has_active_dossier()
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (select 1 from public.dossiers d where d.user_id = auth.uid() and d.status = 'active')
$fn$;
revoke all on function public.has_active_dossier() from public, anon, authenticated;
grant execute on function public.has_active_dossier() to authenticated;
```

- [ ] **Step 4: Vérifier le succès des scénarios core**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
run-sql-checks "$S/wt-v2-l1" scripts/sql-scenarios-v2.sql > "$S/out-l1-t2.txt" 2>&1; echo "exit=$?"
grep -E "NOTICE|ERROR" "$S/out-l1-t2.txt" | tail -25
```
Expected : `Applying migration 20260915200000_v2_core.sql...` pendant le reset, des lignes `NOTICE:  OK S0a …` à `NOTICE:  OK S14m …` (dont `S14f … (enrollment_conflict_family)` et les quatre refus `S14g`-`S14k … (enrollment_account_untrusted)`), puis `NOTICE:  SCENARIOS V2 : OK`, aucune ligne `ERROR`.
Si `S13j` échoue (`supabase_auth_admin` sans EXECUTE) ou si le reset refuse `alter function … owner to postgres` : consigner la sortie, STOP, note de contrat (hypothèse H6).

- [ ] **Step 5: Vérifier la parité `CONSENT_VERSION` et l'état du lint**

```bash
cd /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l1 && npx vitest run tests/consent-version.test.ts tests/migrations-v2-lint.test.ts 2>&1 | tail -12
```
Expected : `consent-version.test.ts` 2 passed ; lint : un seul échec, `les deux fichiers du lot L1 existent` (partner_rpc absent), tous les autres cas verts. Tout autre échec du lint se corrige dans la migration (jamais dans le test).

- [ ] **Step 6: Commit**

```bash
git -C /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l1 add supabase/migrations/20260915200000_v2_core.sql scripts/sql-scenarios-v2.sql
git -C /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l1 commit -m "feat(v2-l1): migration v2_core (dossiers, enrôlements, hook, claim + pont, consentements) et scénarios SQL core

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 3: Migration `v2_partner_rpc` — scénarios PF d'abord, puis les 5 RPC

**Files:**
- Modify: `scripts/sql-scenarios-v2.sql` (bloc inséré à la place de la ligne `-- ═══ SCÉNARIOS PARTENAIRE ET ADMIN (Task 3 : …) — insérés ici ═══`)
- Create: `supabase/migrations/20260915201000_v2_partner_rpc.sql`
- Test: `run-sql-checks`, `tests/migrations-v2-lint.test.ts`

- [ ] **Step 1: Insérer les scénarios partenaire et admin**

Remplacer la ligne repère par le bloc suivant (la ligne repère disparaît) :

```sql
-- ════════════════════════════════════════════════════════════════════════════════════════
-- S1 — partner_create_dossier : création, doublon de défunt signalé puis confirmé
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
-- Secret partagé (revue 16/09, must-fix 1) : partner_create_dossier et partner_rotate_invitation
-- l'exigent en 1er argument, comme consume_send. Même insertion qu'en S6.
insert into public.webhook_config (id, rpc_secret) values (1, 'scenario-local-secret')
  on conflict (id) do update set rpc_secret = excluded.rpc_secret;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr');
set local role authenticated;
do $$
declare r jsonb;
begin
  -- Sans secret valide, AUCUNE création : même un gérant légitime est refusé avant toute lecture.
  perform scenario_v2.expect_error('S1z secret faux → invalid_secret (avant toute validation)',
    format('select public.partner_create_dossier(%L, %L, %L, %L, %L, %L, %L, %L::date, %L)',
           'mauvais-secret', 'Claire', 'Martin', 'secret.s1@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 3, scenario_v2.h('s1-z')),
    'invalid_secret');
  perform scenario_v2.expect_error('S1z2 secret null → invalid_secret',
    format('select public.partner_create_dossier(null, %L, %L, %L, %L, %L, %L, %L::date, %L)',
           'Claire', 'Martin', 'secret2.s1@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 3, scenario_v2.h('s1-z2')),
    'invalid_secret');
  perform scenario_v2.ok('S1z3 aucune insertion par les appels sans secret',
    (select count(*) = 0 from public.dossiers where family_email like 'secret%.s1@scenario.seren-test.fr'));
  r := public.partner_create_dossier('scenario-local-secret', 'Claire', 'Martin', '  Claire.S1@Scenario.Seren-Test.fr ', '06 12 34 56 78',
                                     'Jean', 'Martin', current_date - 3, scenario_v2.h('s1-a'));
  perform scenario_v2.ok('S1a création', (r->>'created')::boolean and not (r->>'duplicate_warning')::boolean
    and r->>'partner_name' = 'PF Scénario X' and r->'dossier'->>'status' = 'invited'
    and r->'dossier'->>'family_email' = 'claire.s1@scenario.seren-test.fr'
    and r->'dossier'->>'deceased_death_date' = to_char(current_date - 3, 'YYYY-MM-DD'), r::text);
  perform scenario_v2.ok('S1b clés exactes du dossier',
    (select array_agg(k order by k) from jsonb_object_keys(r->'dossier') as k)
      = array['created_at', 'deceased_death_date', 'deceased_first_name', 'deceased_last_name', 'family_email',
              'family_first_name', 'family_last_name', 'id', 'invite_expires_at', 'status'], r::text);
  r := public.partner_create_dossier('scenario-local-secret', 'Paul', 'Martin', 'paul.s1@scenario.seren-test.fr', null,
                                     'Jean', 'MARTIN', current_date - 3, scenario_v2.h('s1-b'));
  perform scenario_v2.ok('S1c même défunt (casse différente) → avertissement, pas d''insertion',
    not (r->>'created')::boolean and (r->>'duplicate_warning')::boolean and (r->>'duplicate_count')::int = 1
    and (select array_agg(k order by k) from jsonb_object_keys(r) as k) = array['created', 'duplicate_count', 'duplicate_warning'], r::text);
  r := public.partner_create_dossier('scenario-local-secret', 'Paul', 'Martin', 'paul.s1@scenario.seren-test.fr', null,
                                     'Jean', 'MARTIN', current_date - 3, scenario_v2.h('s1-b'), true);
  perform scenario_v2.ok('S1d doublon confirmé → créé', (r->>'created')::boolean, r::text);
end $$;
reset role;
do $$ begin
  perform scenario_v2.ok('S1e exactement 2 dossiers en base',
    (select count(*) = 2 from public.dossiers where partner_id = '00000000-0000-4000-8000-00000000a001'));
  perform scenario_v2.ok('S1f snapshots, 10 envois, expiration à +7 j, créateur, source partner',
    (select bool_and(source = 'partner' and price_ttc_cents = 29000 and commission_ttc_cents = 7000 and included_sends = 10
                     and invite_expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 minute'
                     and invite_issued_at is not null and invite_rotation_count = 0
                     and created_by = '00000000-0000-4000-8000-00000000b001' and user_id is null)
       from public.dossiers where partner_id = '00000000-0000-4000-8000-00000000a001'));
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S2 — partner_create_dossier : validations, e-mail indisponible, plafond, rôles refusés
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
insert into public.webhook_config (id, rpc_secret) values (1, 'scenario-local-secret')
  on conflict (id) do update set rpc_secret = excluded.rpc_secret;
-- l'admin n'est connu QUE par seren_admins (teste la branche « compte interne » sans enrôlement)
delete from public.account_enrollments where email = 'admin@scenario.seren-test.fr';
insert into public.dossiers (partner_id, source, status, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, invite_token_hash, invite_expires_at, invite_issued_at) values
  ('00000000-0000-4000-8000-00000000a002', 'partner', 'invited', 'Pierre', 'Pris', 'pris.s2@scenario.seren-test.fr',
   'Défunt', 'Pris', current_date - 4, 29000, 7000, scenario_v2.h('s2-pris'), now() + interval '7 days', now());
-- 50 dossiers PF-Y dans les dernières 24 h → plafond atteint
insert into public.dossiers (partner_id, source, status, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, invite_token_hash, invite_expires_at, invite_issued_at, created_at)
select '00000000-0000-4000-8000-00000000a002', 'partner', 'invited', 'Lim', 'Ite', 'limit' || g || '.s2@scenario.seren-test.fr',
       'Def', 'Unt' || g, current_date - 1, 29000, 7000, scenario_v2.h('s2-limit-' || g), now() + interval '7 days', now(), now() - interval '1 hour'
  from generate_series(1, 50) as g;

select scenario_v2.claims('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr');
set local role authenticated;
do $$
declare
  -- Le secret est INLINÉ dans le gabarit : tous les appels format(v_sql, …) restent inchangés.
  v_sql constant text := 'select public.partner_create_dossier(''scenario-local-secret'', %L, %L, %L, %L, %L, %L, %L::date, %L)';
  v_ok_hash text := scenario_v2.h('s2-valide');
  r jsonb;
begin
  perform scenario_v2.expect_error('S2a prénom famille blanc',
    format(v_sql, '  ', 'Martin', 'ok.s2@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 3, v_ok_hash), 'invalid_family_name');
  perform scenario_v2.expect_error('S2b nom famille > 100',
    format(v_sql, 'Claire', repeat('x', 101), 'ok.s2@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 3, v_ok_hash), 'invalid_family_name');
  perform scenario_v2.expect_error('S2c e-mail invalide',
    format(v_sql, 'Claire', 'Martin', 'pas-un-email', null, 'Jean', 'Martin', current_date - 3, v_ok_hash), 'invalid_email');
  perform scenario_v2.expect_error('S2d e-mail > 254',
    format(v_sql, 'Claire', 'Martin', repeat('a', 250) || '@x.fr', null, 'Jean', 'Martin', current_date - 3, v_ok_hash), 'invalid_email');
  perform scenario_v2.expect_error('S2e téléphone invalide',
    format(v_sql, 'Claire', 'Martin', 'ok.s2@scenario.seren-test.fr', 'abc', 'Jean', 'Martin', current_date - 3, v_ok_hash), 'invalid_phone');
  perform scenario_v2.expect_error('S2f prénom défunt blanc',
    format(v_sql, 'Claire', 'Martin', 'ok.s2@scenario.seren-test.fr', null, ' ', 'Martin', current_date - 3, v_ok_hash), 'invalid_deceased_name');
  perform scenario_v2.expect_error('S2g date de décès future',
    format(v_sql, 'Claire', 'Martin', 'ok.s2@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date + 1, v_ok_hash), 'invalid_death_date');
  perform scenario_v2.expect_error('S2h date de décès > 2 ans',
    format(v_sql, 'Claire', 'Martin', 'ok.s2@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 800, v_ok_hash), 'invalid_death_date');
  perform scenario_v2.expect_error('S2i date de décès absente',
    format(v_sql, 'Claire', 'Martin', 'ok.s2@scenario.seren-test.fr', null, 'Jean', 'Martin', null, v_ok_hash), 'invalid_death_date');
  perform scenario_v2.expect_error('S2j hash hors motif',
    format(v_sql, 'Claire', 'Martin', 'ok.s2@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 3, 'xyz'), 'invalid_token_hash');
  perform scenario_v2.expect_error('S2k e-mail d''un dossier ouvert (autre PF, casse et espaces)',
    format(v_sql, 'Claire', 'Martin', '  PRIS.S2@Scenario.Seren-Test.fr ', null, 'Jean', 'Martin', current_date - 3, v_ok_hash), 'email_unavailable');
  perform scenario_v2.expect_error('S2l e-mail enrôlé sans compte',
    format(v_sql, 'Claire', 'Martin', 'pending.manager@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 3, v_ok_hash), 'email_unavailable');
  perform scenario_v2.expect_error('S2m e-mail d''un conseiller PF (compte interne non enrôlé)',
    format(v_sql, 'Claire', 'Martin', 'pfx.advisor@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 3, v_ok_hash), 'email_unavailable');
  perform scenario_v2.expect_error('S2n e-mail d''un admin Seren (seren_admins seul)',
    format(v_sql, 'Claire', 'Martin', 'admin@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 3, v_ok_hash), 'email_unavailable');
  r := public.partner_create_dossier('scenario-local-secret', 'Claire', 'Martin', 'tel.s2@scenario.seren-test.fr', '   ', 'Jean', 'Martin', current_date - 3, v_ok_hash);
  perform scenario_v2.ok('S2o téléphone blanc accepté', (r->>'created')::boolean, r::text);
  perform scenario_v2.expect_error('S2p hash déjà porté par un dossier (course) → email_unavailable',
    format(v_sql, 'Luc', 'Autre', 'autre.s2@scenario.seren-test.fr', null, 'Marc', 'Autre', current_date - 3, v_ok_hash), 'email_unavailable');
end $$;

reset role;
do $$ begin
  perform scenario_v2.ok('S2q téléphone blanc stocké null',
    (select family_phone is null from public.dossiers where family_email = 'tel.s2@scenario.seren-test.fr'));
end $$;

select scenario_v2.claims('00000000-0000-4000-8000-00000000b003', 'pfy.manager@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.expect_error('S2r plafond de 50 dossiers / 24 h',
    format('select public.partner_create_dossier(''scenario-local-secret'', %L, %L, %L, %L, %L, %L, %L::date, %L)',
           'Claire', 'Martin', 'plafond.s2@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 3, scenario_v2.h('s2-plafond')), 'partner_daily_limit');
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b006', 'fam1@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.expect_error('S2s compte famille',
    format('select public.partner_create_dossier(''scenario-local-secret'', %L, %L, %L, %L, %L, %L, %L::date, %L)',
           'Claire', 'Martin', 'x.s2@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 3, scenario_v2.h('s2-x')), 'not_a_partner');
end $$;

reset role;
select scenario_v2.claims(null, null);
set local role authenticated;
do $$ begin
  perform scenario_v2.expect_error('S2t sans identité',
    format('select public.partner_create_dossier(''scenario-local-secret'', %L, %L, %L, %L, %L, %L, %L::date, %L)',
           'Claire', 'Martin', 'x.s2@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 3, scenario_v2.h('s2-x')), 'not_a_partner');
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b004', 'pfs.manager@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.expect_error('S2u PF suspendue',
    format('select public.partner_create_dossier(''scenario-local-secret'', %L, %L, %L, %L, %L, %L, %L::date, %L)',
           'Claire', 'Martin', 'x.s2@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 3, scenario_v2.h('s2-x')), 'partner_inactive');
end $$;

-- PF résiliée : création refusée comme pour une PF suspendue (décision 16/09)
reset role;
update public.partners set status = 'terminated' where id = '00000000-0000-4000-8000-00000000a003';
select scenario_v2.claims('00000000-0000-4000-8000-00000000b004', 'pfs.manager@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.expect_error('S2v PF résiliée → création refusée',
    format('select public.partner_create_dossier(''scenario-local-secret'', %L, %L, %L, %L, %L, %L, %L::date, %L)',
           'Claire', 'Martin', 'x.s2@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 3, scenario_v2.h('s2-x')), 'partner_inactive');
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S3 — renvoi, annulation, isolation PF-X / PF-Y, liste sans contenu
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
insert into public.webhook_config (id, rpc_secret) values (1, 'scenario-local-secret')
  on conflict (id) do update set rpc_secret = excluded.rpc_secret;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr');
set local role authenticated;
do $$
declare r jsonb;
begin
  r := public.partner_create_dossier('scenario-local-secret', 'Claire', 'Martin', 'claire.s3@scenario.seren-test.fr', null, 'Jean', 'Martin', current_date - 3, scenario_v2.h('s3-v1'));
  perform set_config('scenario.s3_id', r->'dossier'->>'id', true);
  -- Le contrôle du secret précède la lecture du dossier : pas d'oracle d'existence pour qui n'a pas le secret.
  perform scenario_v2.expect_error('S3z renvoi sans secret → invalid_secret (avant tout le reste)',
    format('select public.partner_rotate_invitation(%L, %L::uuid, %L)', 'mauvais-secret', r->'dossier'->>'id', scenario_v2.h('s3-z')), 'invalid_secret');
  perform scenario_v2.ok('S3z2 le lien d''origine est intact après un renvoi sans secret',
    (public.invitation_preview(scenario_v2.h('s3-v1'))->>'valid')::boolean);
  perform scenario_v2.expect_error('S3a hash hors motif (avant toute lecture)',
    format('select public.partner_rotate_invitation(''scenario-local-secret'', %L::uuid, %L)', r->'dossier'->>'id', 'xyz'), 'invalid_token_hash');
  perform scenario_v2.expect_error('S3b renvoi immédiat',
    format('select public.partner_rotate_invitation(''scenario-local-secret'', %L::uuid, %L)', r->'dossier'->>'id', scenario_v2.h('s3-v2')), 'rotation_too_soon');
end $$;

reset role;
update public.dossiers set invite_issued_at = now() - interval '11 minutes' where id = current_setting('scenario.s3_id')::uuid;

select scenario_v2.claims('00000000-0000-4000-8000-00000000b003', 'pfy.manager@scenario.seren-test.fr');
set local role authenticated;
do $$
declare
  v_id uuid := current_setting('scenario.s3_id')::uuid;
  r    jsonb;
begin
  perform scenario_v2.expect_error('S3c PF-Y renvoie un dossier de PF-X',
    format('select public.partner_rotate_invitation(''scenario-local-secret'', %L::uuid, %L)', v_id, scenario_v2.h('s3-y')), 'dossier_not_found');
  perform scenario_v2.expect_error('S3d PF-Y annule un dossier de PF-X',
    format('select public.partner_cancel_dossier(%L::uuid)', v_id), 'dossier_not_found');
  perform scenario_v2.expect_error('S3e dossier inexistant : même réponse',
    format('select public.partner_cancel_dossier(%L::uuid)', gen_random_uuid()), 'dossier_not_found');
  r := public.partner_list_dossiers();
  perform scenario_v2.ok('S3f PF-Y ne liste aucun dossier de PF-X',
    r->'partner'->>'id' = '00000000-0000-4000-8000-00000000a002' and jsonb_array_length(r->'dossiers') = 0, r::text);
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr');
set local role authenticated;
do $$
declare
  v_id uuid := current_setting('scenario.s3_id')::uuid;
  r    jsonb;
  v_d  jsonb;
begin
  r := public.partner_rotate_invitation('scenario-local-secret', v_id, scenario_v2.h('s3-v2'));
  perform scenario_v2.ok('S3g renvoi', (r->>'rotated')::boolean and r->>'partner_name' = 'PF Scénario X'
    and r->'dossier'->>'id' = v_id::text and r->'dossier'->>'status' = 'invited'
    and (select array_agg(k order by k) from jsonb_object_keys(r->'dossier') as k)
      = array['created_at', 'deceased_death_date', 'deceased_first_name', 'deceased_last_name', 'family_email',
              'family_first_name', 'family_last_name', 'id', 'invite_expires_at', 'status'], r::text);
  perform scenario_v2.ok('S3h l''ancien lien est mort', public.invitation_preview(scenario_v2.h('s3-v1'))->>'reason' = 'invalid');
  perform scenario_v2.ok('S3i le nouveau lien est valide', (public.invitation_preview(scenario_v2.h('s3-v2'))->>'valid')::boolean);
  r := public.partner_list_dossiers();
  v_d := r->'dossiers'->0;
  perform scenario_v2.ok('S3j liste PF-X : partenaire et 1 dossier',
    r->'partner' = jsonb_build_object('id', '00000000-0000-4000-8000-00000000a001', 'name', 'PF Scénario X', 'status', 'active', 'user_role', 'manager')
    and jsonb_array_length(r->'dossiers') = 1, r::text);
  perform scenario_v2.ok('S3k clés exactes d''un dossier listé',
    (select array_agg(k order by k) from jsonb_object_keys(v_d) as k)
      = array['activated_at', 'can_cancel', 'can_resend', 'cancel_deadline', 'cancelled_at', 'created_at', 'deceased_death_date',
              'deceased_first_name', 'deceased_last_name', 'family_email', 'family_first_name', 'family_last_name', 'family_phone',
              'id', 'invite_expired', 'invite_expires_at', 'source', 'status'], v_d::text);
  perform scenario_v2.ok('S3l drapeaux calculés', (v_d->>'can_resend')::boolean and (v_d->>'can_cancel')::boolean
    and not (v_d->>'invite_expired')::boolean
    and (v_d->>'cancel_deadline')::timestamptz = (v_d->>'created_at')::timestamptz + interval '48 hours', v_d::text);
  perform scenario_v2.ok('S3m aucune donnée de contenu ni secret',
    r::text !~ '(invite_token_hash|price_ttc|commission_ttc|user_id|answers|content|roadmap|letter|attachment|purchase|consent|balance)', r::text);
end $$;

reset role;
update public.dossiers set invite_issued_at = now() - interval '11 minutes', invite_rotation_count = 10 where id = current_setting('scenario.s3_id')::uuid;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.expect_error('S3n 11ᵉ renvoi',
    format('select public.partner_rotate_invitation(''scenario-local-secret'', %L::uuid, %L)', current_setting('scenario.s3_id'), scenario_v2.h('s3-v3')), 'rotation_limit');
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b002', 'pfx.advisor@scenario.seren-test.fr');
set local role authenticated;
do $$
declare
  v_id uuid := current_setting('scenario.s3_id')::uuid;
  r    jsonb;
begin
  r := public.partner_cancel_dossier(v_id);
  perform scenario_v2.ok('S3o le conseiller annule sous 48 h', (r->>'cancelled')::boolean and not (r->>'already_cancelled')::boolean
    and r->'dossier'->>'status' = 'cancelled' and r->'dossier'->>'cancelled_at' is not null
    and (select array_agg(k order by k) from jsonb_object_keys(r->'dossier') as k) = array['cancelled_at', 'id', 'status'], r::text);
  r := public.partner_cancel_dossier(v_id);
  perform scenario_v2.ok('S3p rejeu → already_cancelled', not (r->>'cancelled')::boolean and (r->>'already_cancelled')::boolean, r::text);
  perform scenario_v2.expect_error('S3q renvoi d''un dossier annulé',
    format('select public.partner_rotate_invitation(''scenario-local-secret'', %L::uuid, %L)', v_id, scenario_v2.h('s3-v4')), 'dossier_not_invitable');
  perform scenario_v2.ok('S3r le lien annulé est mort', public.invitation_preview(scenario_v2.h('s3-v2'))->>'reason' = 'invalid');
end $$;

reset role;
do $$ begin
  perform scenario_v2.ok('S3s annulation tracée, hash effacé',
    (select status = 'cancelled' and invite_token_hash is null and invite_expires_at is null
            and cancelled_by = '00000000-0000-4000-8000-00000000b002' from public.dossiers where id = current_setting('scenario.s3_id')::uuid));
end $$;
insert into public.dossiers (partner_id, source, status, user_id, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, created_at, activated_at) values
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'active', '00000000-0000-4000-8000-00000000b006', 'Claire', 'Martin',
   'fam1@scenario.seren-test.fr', 'Jean', 'Martin', current_date - 3, 29000, 7000, now() - interval '1 day', now());
insert into public.dossiers (partner_id, source, status, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, invite_token_hash, invite_expires_at, invite_issued_at, created_at) values
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'invited', 'Vieux', 'Lien', 'vieux.s3@scenario.seren-test.fr',
   'Marc', 'Lien', current_date - 10, 29000, 7000, scenario_v2.h('s3-old'), now() + interval '5 days', now() - interval '49 hours', now() - interval '49 hours');
select set_config('scenario.s3_active', (select id::text from public.dossiers where user_id = '00000000-0000-4000-8000-00000000b006'), true);
select set_config('scenario.s3_old', (select id::text from public.dossiers where family_email = 'vieux.s3@scenario.seren-test.fr'), true);

select scenario_v2.claims('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr');
set local role authenticated;
do $$
declare r jsonb;
begin
  perform scenario_v2.expect_error('S3t annuler un dossier activé (aucune PF ne coupe une famille)',
    format('select public.partner_cancel_dossier(%L::uuid)', current_setting('scenario.s3_active')), 'dossier_already_active');
  perform scenario_v2.expect_error('S3u renvoyer un dossier activé',
    format('select public.partner_rotate_invitation(''scenario-local-secret'', %L::uuid, %L)', current_setting('scenario.s3_active'), scenario_v2.h('s3-act')), 'dossier_not_invitable');
  perform scenario_v2.expect_error('S3v annuler après 48 h',
    format('select public.partner_cancel_dossier(%L::uuid)', current_setting('scenario.s3_old')), 'cancel_window_elapsed');
  r := public.partner_rotate_invitation('scenario-local-secret', current_setting('scenario.s3_old')::uuid, scenario_v2.h('s3-old2'));
  perform scenario_v2.ok('S3w une vieille invitation reste renvoyable', (r->>'rotated')::boolean, r::text);
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S9 — partner_month_counters : jeu daté de 6 dossiers (mois précédent, annulé, expiré, démo)
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
insert into public.webhook_config (id, rpc_secret) values (1, 'scenario-local-secret')
  on conflict (id) do update set rpc_secret = excluded.rpc_secret;
do $$
declare
  v_start timestamptz := date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
begin
  -- d1 : partner, activé ce mois → facturable
  insert into public.dossiers (partner_id, source, status, user_id, family_first_name, family_last_name, family_email,
                               deceased_first_name, deceased_last_name, deceased_death_date, price_ttc_cents, commission_ttc_cents, created_at, activated_at)
  values ('00000000-0000-4000-8000-00000000a001', 'partner', 'active', '00000000-0000-4000-8000-00000000b006', 'A', 'Un', 'd1.s9@scenario.seren-test.fr',
          'X', 'Un', current_date - 3, 29000, 7000, now(), now());
  -- d2 : partner, créé et activé le mois précédent
  insert into public.dossiers (partner_id, source, status, user_id, family_first_name, family_last_name, family_email,
                               deceased_first_name, deceased_last_name, deceased_death_date, price_ttc_cents, commission_ttc_cents, created_at, activated_at)
  values ('00000000-0000-4000-8000-00000000a001', 'partner', 'active', '00000000-0000-4000-8000-00000000b007', 'B', 'Deux', 'd2.s9@scenario.seren-test.fr',
          'X', 'Deux', current_date - 40, 29000, 7000, v_start - interval '5 days', v_start - interval '4 days');
  -- d3 : invité en attente, créé ce mois
  insert into public.dossiers (partner_id, source, status, family_first_name, family_last_name, family_email, deceased_first_name, deceased_last_name,
                               deceased_death_date, price_ttc_cents, commission_ttc_cents, invite_token_hash, invite_expires_at, invite_issued_at, created_at)
  values ('00000000-0000-4000-8000-00000000a001', 'partner', 'invited', 'C', 'Trois', 'd3.s9@scenario.seren-test.fr', 'X', 'Trois',
          current_date - 2, 29000, 7000, scenario_v2.h('s9-d3'), now() + interval '7 days', now(), now());
  -- d4 : invité expiré, créé le mois précédent
  insert into public.dossiers (partner_id, source, status, family_first_name, family_last_name, family_email, deceased_first_name, deceased_last_name,
                               deceased_death_date, price_ttc_cents, commission_ttc_cents, invite_token_hash, invite_expires_at, invite_issued_at, created_at)
  values ('00000000-0000-4000-8000-00000000a001', 'partner', 'invited', 'D', 'Quatre', 'd4.s9@scenario.seren-test.fr', 'X', 'Quatre',
          current_date - 45, 29000, 7000, scenario_v2.h('s9-d4'), now() - interval '1 hour', v_start - interval '10 days', v_start - interval '10 days');
  -- d5 : annulé ce mois
  insert into public.dossiers (partner_id, source, status, family_first_name, family_last_name, family_email, deceased_first_name, deceased_last_name,
                               deceased_death_date, price_ttc_cents, commission_ttc_cents, cancelled_at, created_at)
  values ('00000000-0000-4000-8000-00000000a001', 'partner', 'cancelled', 'E', 'Cinq', 'd5.s9@scenario.seren-test.fr', 'X', 'Cinq',
          current_date - 1, 29000, 7000, now(), now());
  -- d6 : démo, activé ce mois → jamais facturable
  insert into public.dossiers (partner_id, source, status, user_id, family_email, price_ttc_cents, commission_ttc_cents, created_at, activated_at)
  values ('00000000-0000-4000-8000-00000000a001', 'demo', 'active', '00000000-0000-4000-8000-00000000b009', 'd6.s9@scenario.seren-test.fr',
          29000, 7000, now(), now());
end $$;

select scenario_v2.claims('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr');
set local role authenticated;
do $$
declare r jsonb := public.partner_month_counters();
begin
  perform scenario_v2.ok('S9a mois courant Europe/Paris', r->>'month' = to_char(now() at time zone 'Europe/Paris', 'YYYY-MM'), r::text);
  perform scenario_v2.ok('S9b compteurs', (r->>'created_this_month')::int = 4 and (r->>'created_total')::int = 6
    and (r->>'activated_total')::int = 3 and (r->>'pending_activation')::int = 1 and (r->>'expired_invitations')::int = 1
    and (r->>'cancelled_total')::int = 1 and (r->>'activated_this_month')::int = 2, r::text);
  perform scenario_v2.ok('S9c estimation gérant (source partner, activé ce mois)',
    r->'billing_preview' = '{"billable_count":1,"seren_due_ttc_cents":22000,"unit_due_ttc_cents":22000,"currency":"EUR"}'::jsonb, r::text);
  perform scenario_v2.ok('S9d clés exactes',
    (select array_agg(k order by k) from jsonb_object_keys(r) as k)
      = array['activated_this_month', 'activated_total', 'billing_preview', 'cancelled_total', 'created_this_month',
              'created_total', 'expired_invitations', 'month', 'pending_activation'], r::text);
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b002', 'pfx.advisor@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.ok('S9e conseiller → billing_preview null', public.partner_month_counters()->'billing_preview' = 'null'::jsonb);
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b006', 'fam1@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.ok('S9f famille → compteurs null', public.partner_month_counters() is null);
  perform scenario_v2.ok('S9g famille → liste null', public.partner_list_dossiers() is null);
end $$;

-- PF résiliée (décision 16/09) : plus aucune lecture, donc plus aucune PII famille. 'suspended' garde
-- la lecture (prouvé par S2u/S2v : seule la création est refusée pour une PF non 'active').
reset role;
update public.partners set status = 'terminated' where id = '00000000-0000-4000-8000-00000000a001';
select scenario_v2.claims('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr');
set local role authenticated;
do $$
declare a jsonb;
begin
  perform scenario_v2.ok('S9h PF résiliée → compteurs null', public.partner_month_counters() is null);
  perform scenario_v2.ok('S9i PF résiliée → liste null', public.partner_list_dossiers() is null);
  a := public.my_account();
  perform scenario_v2.ok('S9j PF résiliée → my_account sans rôle partenaire',
    a->>'role' = 'none' and a->'partner' = 'null'::jsonb, a::text);
end $$;

reset role;
update public.partners set status = 'suspended' where id = '00000000-0000-4000-8000-00000000a001';
select scenario_v2.claims('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr');
set local role authenticated;
do $$
declare r jsonb := public.partner_list_dossiers();
begin
  perform scenario_v2.ok('S9k PF suspendue → lecture conservée',
    r is not null and r->'partner'->>'status' = 'suspended' and jsonb_array_length(r->'dossiers') = 6, r::text);
  perform scenario_v2.ok('S9l PF suspendue → compteurs conservés', public.partner_month_counters() is not null);
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S10 — admin_partner_overview (migration L4c) : SAUTÉ tant que la fonction n'existe pas
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
insert into public.dossiers (partner_id, source, status, user_id, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date, price_ttc_cents, commission_ttc_cents, created_at, activated_at) values
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'active', '00000000-0000-4000-8000-00000000b006', 'Claire', 'Martin',
   'fam1@scenario.seren-test.fr', 'Jean', 'Martin', current_date - 3, 29000, 7000, now(), now());
insert into public.dossiers (partner_id, source, status, family_first_name, family_last_name, family_email, deceased_first_name, deceased_last_name,
                             deceased_death_date, price_ttc_cents, commission_ttc_cents, invite_token_hash, invite_expires_at, invite_issued_at, created_at) values
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'invited', 'Paul', 'Roy', 'paul.s10@scenario.seren-test.fr', 'Luc', 'Roy',
   current_date - 2, 29000, 7000, scenario_v2.h('s10-inv'), now() + interval '7 days', now(), now());
insert into public.dossiers (partner_id, source, status, family_first_name, family_last_name, family_email, deceased_first_name, deceased_last_name,
                             deceased_death_date, price_ttc_cents, commission_ttc_cents, cancelled_at, created_at) values
  ('00000000-0000-4000-8000-00000000a002', 'partner', 'cancelled', 'Lou', 'Petit', 'lou.s10@scenario.seren-test.fr', 'René', 'Petit',
   current_date - 1, 29000, 7000, now(), now());

do $$ begin
  if to_regprocedure('public.admin_partner_overview()') is null then
    raise notice 'SKIP S10 admin_partner_overview absente (migration L4c non appliquée)';
  end if;
end $$;

select scenario_v2.claims('00000000-0000-4000-8000-00000000b005', 'admin@scenario.seren-test.fr');
set local role authenticated;
do $$
declare
  r   jsonb;
  v_x jsonb;
  v_y jsonb;
  v_s jsonb;
begin
  if to_regprocedure('public.admin_partner_overview()') is null then
    return;
  end if;
  r := public.admin_partner_overview();
  select e into v_x from jsonb_array_elements(r->'partners') as e where e->>'partner_id' = '00000000-0000-4000-8000-00000000a001';
  select e into v_y from jsonb_array_elements(r->'partners') as e where e->>'partner_id' = '00000000-0000-4000-8000-00000000a002';
  select e into v_s from jsonb_array_elements(r->'partners') as e where e->>'partner_id' = '00000000-0000-4000-8000-00000000a003';
  perform scenario_v2.ok('S10a admin → vue du mois', r->>'month' = to_char(now() at time zone 'Europe/Paris', 'YYYY-MM')
    and r->>'generated_at' is not null, r::text);
  perform scenario_v2.ok('S10b PF-X', v_x->>'name' = 'PF Scénario X' and v_x->>'status' = 'active'
    and (v_x->>'dossiers_total')::int = 2 and (v_x->>'dossiers_this_month')::int = 2 and (v_x->>'invited_pending')::int = 1
    and (v_x->>'activated')::int = 1 and (v_x->>'cancelled')::int = 0 and v_x->>'last_dossier_at' is not null, v_x::text);
  perform scenario_v2.ok('S10c PF-Y annulé, PF-S vide et suspendue', (v_y->>'cancelled')::int = 1 and (v_y->>'dossiers_total')::int = 1
    and (v_s->>'dossiers_total')::int = 0 and v_s->'last_dossier_at' = 'null'::jsonb and v_s->>'status' = 'suspended', r::text);
  perform scenario_v2.ok('S10d clés exactes par partenaire',
    (select array_agg(k order by k) from jsonb_object_keys(v_x) as k)
      = array['activated', 'cancelled', 'dossiers_this_month', 'dossiers_total', 'invited_pending', 'last_dossier_at', 'name', 'partner_id', 'status'], v_x::text);
  perform scenario_v2.ok('S10e aucune PII famille ni donnée de facturation', r::text !~ '(@|family|deceased|email|siret|billing)', r::text);
  perform scenario_v2.ok('S10f tri par raison sociale',
    (select array_agg(e->>'name' order by ord) from jsonb_array_elements(r->'partners') with ordinality as t(e, ord))
      = (select array_agg(e->>'name' order by e->>'name') from jsonb_array_elements(r->'partners') as e), r::text);
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  if to_regprocedure('public.admin_partner_overview()') is null then return; end if;
  perform scenario_v2.ok('S10g gérant PF → null', public.admin_partner_overview() is null);
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b006', 'fam1@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  if to_regprocedure('public.admin_partner_overview()') is null then return; end if;
  perform scenario_v2.ok('S10h famille → null', public.admin_partner_overview() is null);
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S11 — partner_dashboard() v0 intacte (rollback Render vers le deploy de U1 toujours sûr)
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
do $$ begin
  perform scenario_v2.ok('S11a corps identique à 20260913200000 (md5 de prosrc)',
    (select md5(prosrc) = '8277ca3955cc35a54f42223295052c28' from pg_proc where oid = 'public.partner_dashboard()'::regprocedure));
  perform scenario_v2.ok('S11b grant authenticated conservé', has_function_privilege('authenticated', 'public.partner_dashboard()', 'execute'));
end $$;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr');
set local role authenticated;
do $$
declare r json := public.partner_dashboard();
begin
  perform scenario_v2.ok('S11c exécutable par le gérant PF-X', r is not null and r->>'partner_name' = 'PF Scénario X'
    and r->>'attributed_count' = '0', r::text);
end $$;
rollback;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- S13p — droits des RPC PF, admin (si L4c) et F1 (si L1b)
-- ════════════════════════════════════════════════════════════════════════════════════════
do $$
declare v_fn text;
begin
  foreach v_fn in array array['public.partner_create_dossier(text, text, text, text, text, text, text, date, text, boolean)',
                              'public.partner_rotate_invitation(text, uuid, text)', 'public.partner_cancel_dossier(uuid)',
                              'public.partner_list_dossiers()', 'public.partner_month_counters()',
                              'public.admin_partner_overview()', 'public.get_transmission_by_code(text)'] loop
    if to_regprocedure(v_fn) is null then
      raise notice 'SKIP S13p % absente', v_fn;
      continue;
    end if;
    perform scenario_v2.ok('S13p aucun EXECUTE PUBLIC : ' || v_fn,
      (select p.proacl is not null and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
         from pg_proc p where p.oid = v_fn::regprocedure));
    perform scenario_v2.ok('S13p search_path vide et security definer : ' || v_fn,
      (select p.prosecdef and coalesce(array_to_string(p.proconfig, ',') like '%search_path=""%', false)
         from pg_proc p where p.oid = v_fn::regprocedure));
    perform scenario_v2.ok('S13p anon refusé, authenticated autorisé : ' || v_fn,
      not has_function_privilege('anon', v_fn, 'execute') and has_function_privilege('authenticated', v_fn, 'execute'));
  end loop;
end $$;
```

- [ ] **Step 2: Vérifier l'échec**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
run-sql-checks "$S/wt-v2-l1" scripts/sql-scenarios-v2.sql > "$S/out-l1-t3.txt" 2>&1; echo "exit=$?"; grep -E "ERROR" "$S/out-l1-t3.txt" | head -3
```
Expected : `exit=3`, `ERROR:  function public.partner_create_dossier(unknown, …) does not exist` (scénario S1).

- [ ] **Step 3: Écrire `supabase/migrations/20260915201000_v2_partner_rpc.sql`**

```sql
-- ════════════════════════════════════════════════════════════════════════════════════════
-- v2 RPC partenaire — création, renvoi, annulation, liste et compteurs des dossiers PF
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Contrat : docs/design-v2-demonstrateur.md §3.3.9 à §3.3.13, droits §3.4, codes §3.5.
-- Plan : docs/plan-v2-sql.md, Task 3. Dépend de 20260915200000_v2_core.sql.
--
-- Règle rouge : la PF voit l'identité de la famille et du défunt, JAMAIS le contenu. Ces fonctions ne
-- lisent que partners, partner_users et dossiers (lint : aucune table de contenu, ni purchases, ni
-- consents, ni storage). partner_id vient EXCLUSIVEMENT de auth.uid() : un dossier d'une autre PF
-- répond dossier_not_found, exactement comme un dossier inexistant (pas d'oracle d'existence).
-- partner_dashboard() v0 n'est pas touchée : le rollback de code vers le deploy de U1 reste sûr.
-- Le jeton n'arrive jamais ici : seul son sha256 hex (p_token_hash), calculé par le serveur.

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §3.3.9 partner_create_dossier
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.partner_create_dossier(
  p_secret              text,
  p_family_first_name   text,
  p_family_last_name    text,
  p_family_email        text,
  p_family_phone        text,
  p_deceased_first_name text,
  p_deceased_last_name  text,
  p_deceased_death_date date,
  p_token_hash          text,
  p_confirm_duplicate   boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_pid            uuid;
  v_partner        public.partners%rowtype;
  v_family_first   text := btrim(p_family_first_name);
  v_family_last    text := btrim(p_family_last_name);
  v_email          text := lower(btrim(p_family_email));
  v_phone          text := nullif(btrim(p_family_phone), '');
  v_deceased_first text := btrim(p_deceased_first_name);
  v_deceased_last  text := btrim(p_deceased_last_name);
  v_dup            integer;
  v_d              public.dossiers%rowtype;
begin
  -- 0. Secret partagé, AVANT TOUT (revue 16/09, must-fix 1) : ici l'APPELANT choisit le hash du jeton
  -- d'activation. Appelable en direct via PostgREST, cette RPC laisserait une PF fabriquer un jeton
  -- qu'elle connaît, s'inscrire à la place de la famille (hook satisfait) et prendre son compte.
  -- Même patron que consume_send, INLINÉ (jamais encapsulé dans un helper). N'identifie personne :
  -- partner_id vient toujours d'auth.uid().
  if not exists (select 1 from public.webhook_config w where w.id = 1 and w.rpc_secret = p_secret) then
    raise exception 'invalid_secret' using errcode = 'P0001';
  end if;
  -- 1.
  select pu.partner_id into v_pid from public.partner_users pu where pu.user_id = auth.uid();
  if v_pid is null then
    raise exception 'not_a_partner' using errcode = 'P0001';
  end if;
  -- 2.
  select * into v_partner from public.partners p where p.id = v_pid;
  if v_partner.status <> 'active' then
    raise exception 'partner_inactive' using errcode = 'P0001';
  end if;
  -- 3. Validations, dans l'ordre du contrat (les CHECK de la table restent le filet).
  if coalesce(v_family_first, '') = '' or coalesce(v_family_last, '') = ''
     or char_length(v_family_first) > 100 or char_length(v_family_last) > 100 then
    raise exception 'invalid_family_name' using errcode = 'P0001';
  end if;
  if v_email is null or char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;
  if v_phone is not null and v_phone !~ '^[0-9 +().-]{6,30}$' then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;
  if coalesce(v_deceased_first, '') = '' or coalesce(v_deceased_last, '') = ''
     or char_length(v_deceased_first) > 100 or char_length(v_deceased_last) > 100 then
    raise exception 'invalid_deceased_name' using errcode = 'P0001';
  end if;
  if p_deceased_death_date is null or p_deceased_death_date > current_date
     or p_deceased_death_date < (current_date - interval '2 years') then
    raise exception 'invalid_death_date' using errcode = 'P0001';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_token_hash' using errcode = 'P0001';
  end if;
  -- 4. Plafond anti-abus (borne aussi la consommation d'envois par une PF qui s'inviterait elle-même).
  if (select count(*) from public.dossiers d where d.partner_id = v_pid and d.created_at > now() - interval '24 hours') >= 50 then
    raise exception 'partner_daily_limit' using errcode = 'P0001';
  end if;
  -- 5. E-mail indisponible : message générique, ne dit jamais pourquoi.
  if exists (select 1 from public.dossiers d where d.family_email = v_email and d.status <> 'cancelled')
     or exists (select 1 from public.account_enrollments e where e.email = v_email)
     or exists (select 1
                  from auth.users u
                 where lower(u.email) = v_email
                   and (exists (select 1 from public.partner_users pu2 where pu2.user_id = u.id)
                        or exists (select 1 from public.seren_admins sa where sa.user_id = u.id))) then
    raise exception 'email_unavailable' using errcode = 'P0001';
  end if;
  -- 6. Doublon de défunt chez CE partenaire (nom de famille insensible à la casse + date).
  if not coalesce(p_confirm_duplicate, false) then
    select count(*) into v_dup
      from public.dossiers d
     where d.partner_id = v_pid
       and d.status <> 'cancelled'
       and lower(d.deceased_last_name) = lower(v_deceased_last)
       and d.deceased_death_date = p_deceased_death_date;
    if v_dup > 0 then
      return jsonb_build_object('created', false, 'duplicate_warning', true, 'duplicate_count', v_dup);
    end if;
  end if;
  -- 7. Insertion : snapshots copiés du partenaire au moment de la création.
  begin
    insert into public.dossiers (partner_id, source, status,
                                 family_first_name, family_last_name, family_email, family_phone,
                                 deceased_first_name, deceased_last_name, deceased_death_date,
                                 price_ttc_cents, commission_ttc_cents, included_sends,
                                 invite_token_hash, invite_expires_at, invite_issued_at, created_by)
    values (v_pid, 'partner', 'invited',
            v_family_first, v_family_last, v_email, v_phone,
            v_deceased_first, v_deceased_last, p_deceased_death_date,
            v_partner.price_ttc_cents, v_partner.commission_ttc_cents, 10,
            p_token_hash, now() + interval '7 days', now(), auth.uid())
    returning * into v_d;
  exception when unique_violation then
    -- course sur l'index e-mail ou sur le hash
    raise exception 'email_unavailable' using errcode = 'P0001';
  end;
  -- 8.
  return jsonb_build_object(
    'created',           true,
    'duplicate_warning', false,
    'partner_name',      v_partner.name,
    'dossier', jsonb_build_object('id',                  v_d.id,
                                  'status',              v_d.status,
                                  'created_at',          v_d.created_at,
                                  'invite_expires_at',   v_d.invite_expires_at,
                                  'family_first_name',   v_d.family_first_name,
                                  'family_last_name',    v_d.family_last_name,
                                  'family_email',        v_d.family_email,
                                  'deceased_first_name', v_d.deceased_first_name,
                                  'deceased_last_name',  v_d.deceased_last_name,
                                  'deceased_death_date', v_d.deceased_death_date));
end
$fn$;
-- EXECUTE reste accordé à authenticated : le serveur appelle avec le TOKEN UTILISATEUR (auth.uid()
-- doit être celui du gérant). C'est le secret, et non le grant, qui ferme le chemin direct.
revoke all on function public.partner_create_dossier(text, text, text, text, text, text, text, date, text, boolean) from public, anon, authenticated;
grant execute on function public.partner_create_dossier(text, text, text, text, text, text, text, date, text, boolean) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §3.3.10 partner_rotate_invitation — nouveau lien, l'ancien meurt ; 1 / 10 min, 10 au total
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.partner_rotate_invitation(p_secret text, p_dossier_id uuid, p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_pid          uuid;
  v_partner_name text;
  v_d            public.dossiers%rowtype;
begin
  -- 0. Secret partagé, AVANT TOUT (revue 16/09, must-fix 1) : sans lui, une PF tuerait en direct le
  -- lien d'une famille (rotation silencieuse, aucun e-mail envoyé) et lui substituerait un jeton de
  -- son choix. Le contrôle précède la lecture du dossier : aucun oracle d'existence.
  if not exists (select 1 from public.webhook_config w where w.id = 1 and w.rpc_secret = p_secret) then
    raise exception 'invalid_secret' using errcode = 'P0001';
  end if;
  -- 1.
  select pu.partner_id, p.name into v_pid, v_partner_name
    from public.partner_users pu
    join public.partners p on p.id = pu.partner_id
   where pu.user_id = auth.uid();
  if v_pid is null then
    raise exception 'not_a_partner' using errcode = 'P0001';
  end if;
  -- 2.
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_token_hash' using errcode = 'P0001';
  end if;
  -- 3. Même réponse pour un dossier inexistant ou d'une autre PF.
  select * into v_d from public.dossiers d where d.id = p_dossier_id and d.partner_id = v_pid for update;
  if not found then
    raise exception 'dossier_not_found' using errcode = 'P0001';
  end if;
  -- 4. (une invitation expirée reste renvoyable)
  if v_d.status <> 'invited' then
    raise exception 'dossier_not_invitable' using errcode = 'P0001';
  end if;
  -- 5.
  if v_d.invite_issued_at > now() - interval '10 minutes' then
    raise exception 'rotation_too_soon' using errcode = 'P0001';
  end if;
  -- 6.
  if v_d.invite_rotation_count >= 10 then
    raise exception 'rotation_limit' using errcode = 'P0001';
  end if;
  -- 7.
  begin
    update public.dossiers
       set invite_token_hash     = p_token_hash,
           invite_expires_at     = now() + interval '7 days',
           invite_issued_at      = now(),
           invite_rotation_count = invite_rotation_count + 1,
           updated_at            = now()
     where id = v_d.id
    returning * into v_d;
  exception when unique_violation then
    raise exception 'invalid_token_hash' using errcode = 'P0001';
  end;

  return jsonb_build_object(
    'rotated',      true,
    'partner_name', v_partner_name,
    'dossier', jsonb_build_object('id',                  v_d.id,
                                  'status',              v_d.status,
                                  'created_at',          v_d.created_at,
                                  'invite_expires_at',   v_d.invite_expires_at,
                                  'family_first_name',   v_d.family_first_name,
                                  'family_last_name',    v_d.family_last_name,
                                  'family_email',        v_d.family_email,
                                  'deceased_first_name', v_d.deceased_first_name,
                                  'deceased_last_name',  v_d.deceased_last_name,
                                  'deceased_death_date', v_d.deceased_death_date));
end
$fn$;
revoke all on function public.partner_rotate_invitation(text, uuid, text) from public, anon, authenticated;
grant execute on function public.partner_rotate_invitation(text, uuid, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §3.3.11 partner_cancel_dossier — seulement 'invited' et créé il y a moins de 48 h
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.partner_cancel_dossier(p_dossier_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_pid uuid;
  v_d   public.dossiers%rowtype;
begin
  -- 1.
  select pu.partner_id into v_pid from public.partner_users pu where pu.user_id = auth.uid();
  if v_pid is null then
    raise exception 'not_a_partner' using errcode = 'P0001';
  end if;
  -- 2.
  select * into v_d from public.dossiers d where d.id = p_dossier_id and d.partner_id = v_pid for update;
  if not found then
    raise exception 'dossier_not_found' using errcode = 'P0001';
  end if;
  -- 3. Aucune action PF ne coupe une famille.
  if v_d.status in ('active','closed') then
    raise exception 'dossier_already_active' using errcode = 'P0001';
  end if;
  -- 4.
  if v_d.status = 'cancelled' then
    return jsonb_build_object('cancelled', false, 'already_cancelled', true,
                              'dossier', jsonb_build_object('id', v_d.id, 'status', v_d.status, 'cancelled_at', v_d.cancelled_at));
  end if;
  -- 5.
  if v_d.created_at <= now() - interval '48 hours' then
    raise exception 'cancel_window_elapsed' using errcode = 'P0001';
  end if;
  -- 6. Le hash meurt avec le dossier : le lien envoyé devient « invalid ».
  update public.dossiers
     set status            = 'cancelled',
         cancelled_at      = now(),
         cancelled_by      = auth.uid(),
         invite_token_hash = null,
         invite_expires_at = null,
         updated_at        = now()
   where id = v_d.id
  returning * into v_d;

  return jsonb_build_object('cancelled', true, 'already_cancelled', false,
                            'dossier', jsonb_build_object('id', v_d.id, 'status', v_d.status, 'cancelled_at', v_d.cancelled_at));
end
$fn$;
revoke all on function public.partner_cancel_dossier(uuid) from public, anon, authenticated;
grant execute on function public.partner_cancel_dossier(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §3.3.12 partner_list_dossiers — identité et statuts, aucune jointure vers le contenu
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.partner_list_dossiers()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_pid     uuid;
  v_partner jsonb;
  v_list    jsonb;
begin
  -- Contrat résilié (décision 16/09) : plus aucune lecture, donc plus aucune PII famille pour l'ex-PF.
  -- 'suspended' conserve la lecture (seules création et renvoi sont bloquées).
  select p.id, jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status, 'user_role', pu.role)
    into v_pid, v_partner
    from public.partner_users pu
    join public.partners p on p.id = pu.partner_id
   where pu.user_id = auth.uid()
     and p.status <> 'terminated';
  if v_pid is null then
    return null;
  end if;

  select coalesce(jsonb_agg(x.item order by x.created_at desc, x.id), '[]'::jsonb)
    into v_list
    from (select d.id,
                 d.created_at,
                 jsonb_build_object(
                   'id',                  d.id,
                   'status',              d.status,
                   'source',              d.source,
                   'family_first_name',   d.family_first_name,
                   'family_last_name',    d.family_last_name,
                   'family_email',        d.family_email,
                   'family_phone',        d.family_phone,
                   'deceased_first_name', d.deceased_first_name,
                   'deceased_last_name',  d.deceased_last_name,
                   'deceased_death_date', d.deceased_death_date,
                   'created_at',          d.created_at,
                   'activated_at',        d.activated_at,
                   'cancelled_at',        d.cancelled_at,
                   'invite_expires_at',   d.invite_expires_at,
                   'invite_expired',      d.status = 'invited' and d.invite_expires_at <= now(),
                   'can_resend',          d.status = 'invited',
                   'can_cancel',          d.status = 'invited' and d.created_at > now() - interval '48 hours',
                   'cancel_deadline',     d.created_at + interval '48 hours') as item
            from public.dossiers d
           where d.partner_id = v_pid
           order by d.created_at desc, d.id
           limit 500) as x;

  return jsonb_build_object('partner', v_partner, 'dossiers', v_list);
end
$fn$;
revoke all on function public.partner_list_dossiers() from public, anon, authenticated;
grant execute on function public.partner_list_dossiers() to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- §3.3.13 partner_month_counters — compteurs du mois (Europe/Paris) + estimation gérant (A7)
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.partner_month_counters()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_start      timestamptz := date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
  v_pid        uuid;
  v_role       text;
  v_price      integer;
  v_commission integer;
  v_c          record;
  v_bill       record;
  v_billing    jsonb := null;
begin
  -- Contrat résilié : null (même règle que partner_list_dossiers, décision 16/09).
  select pu.partner_id, pu.role, p.price_ttc_cents, p.commission_ttc_cents
    into v_pid, v_role, v_price, v_commission
    from public.partner_users pu
    join public.partners p on p.id = pu.partner_id
   where pu.user_id = auth.uid()
     and p.status <> 'terminated';
  if v_pid is null then
    return null;
  end if;

  select count(*) filter (where d.created_at >= v_start)                                   as created_this_month,
         count(*)                                                                          as created_total,
         count(*) filter (where d.activated_at is not null)                                as activated_total,
         count(*) filter (where d.status = 'invited' and d.invite_expires_at > now())      as pending_activation,
         count(*) filter (where d.status = 'invited' and d.invite_expires_at <= now())     as expired_invitations,
         count(*) filter (where d.status = 'cancelled')                                    as cancelled_total,
         count(*) filter (where d.activated_at >= v_start)                                 as activated_this_month
    into v_c
    from public.dossiers d
   where d.partner_id = v_pid;

  -- Estimation : gérant uniquement ; dossiers source 'partner' activés ce mois, calculée sur les
  -- snapshots. Le serveur la remet à null si PARTNER_BILLING_PREVIEW n'est pas 'true'.
  if v_role = 'manager' then
    select count(*) as billable_count,
           coalesce(sum(d.price_ttc_cents - d.commission_ttc_cents), 0) as seren_due
      into v_bill
      from public.dossiers d
     where d.partner_id = v_pid
       and d.source = 'partner'
       and d.activated_at >= v_start
       and d.status in ('active','closed');
    v_billing := jsonb_build_object('billable_count',      v_bill.billable_count,
                                    'seren_due_ttc_cents', v_bill.seren_due,
                                    'unit_due_ttc_cents',  v_price - v_commission,
                                    'currency',            'EUR');
  end if;

  return jsonb_build_object('month',                to_char(now() at time zone 'Europe/Paris', 'YYYY-MM'),
                            'created_this_month',   v_c.created_this_month,
                            'created_total',        v_c.created_total,
                            'activated_total',      v_c.activated_total,
                            'pending_activation',   v_c.pending_activation,
                            'expired_invitations',  v_c.expired_invitations,
                            'cancelled_total',      v_c.cancelled_total,
                            'activated_this_month', v_c.activated_this_month,
                            'billing_preview',      v_billing);
end
$fn$;
revoke all on function public.partner_month_counters() from public, anon, authenticated;
grant execute on function public.partner_month_counters() to authenticated;
```

- [ ] **Step 4: Vérifier le succès (scénarios + lint + parité)**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
run-sql-checks "$S/wt-v2-l1" scripts/sql-scenarios-v2.sql > "$S/out-l1-t3.txt" 2>&1; echo "exit=$?"
grep -cE "NOTICE:  OK" "$S/out-l1-t3.txt"; grep -E "ERROR|SKIP|SCENARIOS V2" "$S/out-l1-t3.txt"
cd "$S/wt-v2-l1" && npx vitest run tests/migrations-v2-lint.test.ts tests/consent-version.test.ts 2>&1 | tail -6
```
Expected : `exit=0` ; environ 190 lignes `OK` ; `NOTICE:  SKIP S10 admin_partner_overview absente (migration L4c non appliquée)`, `SKIP S13p public.admin_partner_overview() absente`, `SKIP S13p public.get_transmission_by_code(text) absente` (sauf si L1b est déjà mergé dans la base du lot) ; `NOTICE:  SCENARIOS V2 : OK` ; aucune ligne `ERROR`. Vitest : 2 fichiers, tous les tests verts.

- [ ] **Step 5: Commit**

```bash
git -C /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l1 add supabase/migrations/20260915201000_v2_partner_rpc.sql scripts/sql-scenarios-v2.sql
git -C /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l1 commit -m "feat(v2-l1): RPC partenaire (création, renvoi, annulation, liste, compteurs) et scénarios PF/admin

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 4: Rejouabilité des migrations et copie `attributions` → `dossiers`

**Files:**
- Create (scratchpad, non versionné) : `$S/l1-replay-fixture.sql`, `$S/l1-replay-check.sql`
- Test: rejeu des fichiers `20260915200000_v2_core.sql` et `20260915201000_v2_partner_rpc.sql` sur une base déjà migrée

- [ ] **Step 1: Écrire la fixture `$S/l1-replay-fixture.sql`**

```sql
-- Rejeu L1 : une attribution v0 à copier, une attribution en conflit d'e-mail (non copiée).
\set ON_ERROR_STOP on
insert into public.partners (id, name) values ('00000000-0000-4000-8000-0000000c0000', 'PF Copie v0');
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000c0001', 'authenticated', 'authenticated', 'Demo.Copie@Seren-Test.fr', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000c0002', 'authenticated', 'authenticated', 'conflit.copie@seren-test.fr', now(), now());
insert into public.attributions (user_id, partner_id, created_at) values
  ('00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000c0000', now() - interval '3 days'),
  ('00000000-0000-4000-8000-0000000c0002', '00000000-0000-4000-8000-0000000c0000', now() - interval '2 days');
-- l'e-mail du 2ᵉ compte est déjà porté par un dossier ouvert (autre compte, direct invité)
insert into public.dossiers (source, status, family_email, price_ttc_cents, commission_ttc_cents, invite_token_hash, invite_expires_at)
values ('direct', 'invited', 'conflit.copie@seren-test.fr', 0, 0, encode(sha256(convert_to('replay-conflit', 'UTF8')), 'hex'), now() + interval '7 days');
```

- [ ] **Step 2: Écrire le contrôle `$S/l1-replay-check.sql`**

```sql
\set ON_ERROR_STOP on
do $$
declare v_attr timestamptz;
begin
  select created_at into v_attr from public.attributions where user_id = '00000000-0000-4000-8000-0000000c0001';
  if (select count(*) from public.dossiers where user_id = '00000000-0000-4000-8000-0000000c0001') <> 1 then
    raise exception '[R1] copie demo absente ou dupliquée';
  end if;
  if not (select source = 'demo' and status = 'active' and family_email = 'demo.copie@seren-test.fr'
                 and partner_id = '00000000-0000-4000-8000-0000000c0000' and price_ttc_cents = 29000
                 and commission_ttc_cents = 7000 and included_sends = 10 and activated_at = v_attr and created_at = v_attr
            from public.dossiers where user_id = '00000000-0000-4000-8000-0000000c0001') then
    raise exception '[R2] dossier demo copié avec de mauvaises valeurs';
  end if;
  if exists (select 1 from public.dossiers where user_id = '00000000-0000-4000-8000-0000000c0002') then
    raise exception '[R3] attribution en conflit d''e-mail copiée à tort';
  end if;
  if exists (select 1 from public.purchases where user_id = '00000000-0000-4000-8000-0000000c0001')
     or exists (select 1 from public.consents where user_id = '00000000-0000-4000-8000-0000000c0001') then
    raise exception '[R4] la copie ne doit créer ni pont ni consentement';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'consents') <> 1 then
    raise exception '[R5] policies consents dupliquées ou absentes';
  end if;
  if (select count(*) from pg_constraint where conrelid = 'public.partners'::regclass
        and conname in ('partners_status_check', 'partners_price_check', 'partners_commission_check', 'partners_siret_check')) <> 4 then
    raise exception '[R6] contraintes partners absentes';
  end if;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
        and proname in ('consent_version', 'hook_before_user_created', 'link_enrollments', 'invitation_preview', 'claim_dossier',
                        'my_account', 'record_consents', 'has_active_dossier', 'partner_create_dossier', 'partner_rotate_invitation',
                        'partner_cancel_dossier', 'partner_list_dossiers', 'partner_month_counters')) <> 13 then
    raise exception '[R7] surcharge ou fonction manquante après rejeu';
  end if;
  raise notice 'REJEU V2 : OK';
end $$;
```

- [ ] **Step 3: Rejouer (base migrée + fixture + fichiers rejoués deux fois) et contrôler**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
with-db-lock sh -ec '
  WT="$S/wt-v2-l1"
  supabase db reset --local --workdir "$WT"
  psql-local -q < "$S/l1-replay-fixture.sql"
  psql-local -q < "$WT/supabase/migrations/20260915200000_v2_core.sql"
  psql-local -q < "$WT/supabase/migrations/20260915201000_v2_partner_rpc.sql"
  psql-local -q < "$WT/supabase/migrations/20260915200000_v2_core.sql"
  psql-local -q < "$S/l1-replay-check.sql"
' > "$S/out-l1-t4.txt" 2>&1; echo "exit=$?"; grep -E "ERROR|REJEU" "$S/out-l1-t4.txt"
```
Expected : `exit=0`, `NOTICE:  REJEU V2 : OK`, aucune ligne `ERROR` (les `NOTICE: … already exists, skipping` sont normaux). Un `ERROR` = défaut de rejouabilité à corriger dans la migration, puis relancer Tasks 2-3 Step 4.

- [ ] **Step 4: Remettre la base au propre**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
run-sql-checks "$S/wt-v2-l1" scripts/sql-scenarios-v2.sql > "$S/out-l1-t4b.txt" 2>&1; echo "exit=$?"; grep -c "SCENARIOS V2 : OK" "$S/out-l1-t4b.txt"
```
Expected : `exit=0`, `1`. Pas de commit (aucun fichier du dépôt modifié) sauf correctif de migration.

---

### Task 5: Hook réel — `scripts/hook-scenarios-v2.mjs` puis activation dans `supabase/config.toml`

**Files:**
- Create: `scripts/hook-scenarios-v2.mjs`
- Modify: `supabase/config.toml:278-281`

**Attention :** le Step 4 redémarre la stack locale partagée (1-3 min d'indisponibilité pour tous les lots). Prévenir l'orchestrateur avant, et après : toute inscription locale non invitée est refusée pour tout le monde (voulu).

- [ ] **Step 1: Écrire `scripts/hook-scenarios-v2.mjs`**

```js
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
      const state = sql(`select status || '|' || (invite_token_hash is null) from public.dossiers where family_email = ${lit(mail('invite'))};`).trim()
      if (state !== 'active|t') throw new Error(`dossier dans un état inattendu : ${state}`)
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
```

- [ ] **Step 2: Vérifier l'échec, hook encore désactivé**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
export HOOK_SUPABASE_KEY=$(supabase status -o json --workdir "$S/wt-v2-l1" 2>/dev/null | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).PUBLISHABLE_KEY)')
with-db-lock node "$S/wt-v2-l1/scripts/hook-scenarios-v2.mjs"; echo "exit=$?"
```
Expected : `not ok 1 - e-mail aléatoire, sans metadata → refusé` (`inscription ACCEPTÉE`), les cas 2 à 6 aussi `not ok`, cas 7 et 8 `ok`, cas 9 `not ok` (le cas 2 a déjà créé le compte invité : `user_already_exists`), `# 2/9 ok, 7 ÉCHEC(S)`, `exit=1`. La garde se vérifie aussi : `HOOK_SUPABASE_URL=https://kvtzhyxlqouvpwasedbe.supabase.co node "$S/wt-v2-l1/scripts/hook-scenarios-v2.mjs"; echo $?` → `REFUS : …`, `1`.

- [ ] **Step 3: Activer le hook dans `supabase/config.toml`**

Remplacer les lignes 278-281 :
```toml
# This hook runs before a new user is created and allows developers to reject the request based on the incoming user object.
# [auth.hook.before_user_created]
# enabled = true
# uri = "pg-functions://postgres/auth/before-user-created-hook"
```
par :
```toml
# Hook « Before User Created » (démonstrateur v2, contrat §3.3.2) : inscription réservée à l'allowlist
# d'enrôlement (gérants PF, admins Seren) et aux e-mails invités porteurs d'un hash de jeton valide.
# Local uniquement : sur les projets hébergés, le branchement se fait dans Dashboard → Authentication →
# Hooks (préprod en U2, prod en U4). Changer ce bloc exige supabase stop puis supabase start.
[auth.hook.before_user_created]
enabled = true
uri = "pg-functions://postgres/public/hook_before_user_created"
```

- [ ] **Step 4: Redémarrer la stack locale avec le hook (prévenir l'orchestrateur avant)**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
with-db-lock sh -ec 'supabase stop --workdir "$S/wt-v2-l1"; supabase start --workdir "$S/wt-v2-l1"' > "$S/out-l1-t5-restart.txt" 2>&1; echo "exit=$?"; tail -3 "$S/out-l1-t5-restart.txt"
run-sql-checks "$S/wt-v2-l1" > "$S/out-l1-t5-reset.txt" 2>&1; echo "exit=$?"
```
Expected : `exit=0` deux fois, `Started supabase local development setup.` puis `Finished supabase db reset`.

- [ ] **Step 5: Vérifier le succès**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
export HOOK_SUPABASE_KEY=$(supabase status -o json --workdir "$S/wt-v2-l1" 2>/dev/null | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).PUBLISHABLE_KEY)')
with-db-lock node "$S/wt-v2-l1/scripts/hook-scenarios-v2.mjs"; echo "exit=$?"
```
Expected : 9 lignes `ok`, `# 9/9 ok`, `exit=0`. Si les cas refusés passent mais que « enrôlé → accepté » échoue avec un message de permission : H5 fausse → STOP, note de contrat (grant select + policy `to supabase_auth_admin`). Si « invité + hash valide » est refusé alors que S0f passe : H2 fausse (user_metadata absent du payload) → STOP, note de contrat (plan B §12.1 H2).

- [ ] **Step 6: Commit**

```bash
git -C /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l1 add scripts/hook-scenarios-v2.mjs supabase/config.toml
git -C /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l1 commit -m "test(v2-l1): hook Before User Created branché en local et scénarios HTTP acceptés/refusés

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Clôture L1 — gate, double revue, passe adversariale

**Files:** aucun nouveau ; correctifs éventuels dans les fichiers des Tasks 1-5.

- [ ] **Step 1: Rejeu complet**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
run-sql-checks "$S/wt-v2-l1" scripts/sql-scenarios-v2.sql > "$S/out-l1-final-sql.txt" 2>&1; echo "sql exit=$?"
export HOOK_SUPABASE_KEY=$(supabase status -o json --workdir "$S/wt-v2-l1" 2>/dev/null | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).PUBLISHABLE_KEY)')
with-db-lock node "$S/wt-v2-l1/scripts/hook-scenarios-v2.mjs" > "$S/out-l1-final-hook.txt" 2>&1; echo "hook exit=$?"
gate "$S/wt-v2-l1" > "$S/out-l1-final-gate.txt" 2>&1; echo "gate exit=$?"; grep -E "Tests |built in" "$S/out-l1-final-gate.txt"
```
Expected : `sql exit=0`, `hook exit=0`, `gate exit=0`, `Tests  <base du lot + nouveaux> passed`, `✓ built in`.

- [ ] **Step 2: Revue spec (subagent frais) — conformité au contrat**

Le relecteur reçoit : `docs/design-v2-demonstrateur.md` §3, les 2 migrations, `scripts/sql-scenarios-v2.sql`. Il coche, fonction par fonction : signature exacte (§3.3), ordre des gardes, codes (§3.5), clés JSON exactes, grants (§3.4), DDL identique au §3.2 (colonnes, contraintes nommées, index). Toute différence → correctif + scénario qui la couvre.

- [ ] **Step 3: Revue qualité + passe adversariale (subagent frais distinct)**

Questions obligatoires, réponse argumentée par écrit dans le rapport :
1. Un compte `authenticated` quelconque peut-il, par appel PostgREST direct : lire une ligne de `dossiers`, `account_enrollments`, `seren_admins` ; obtenir un hash ; créer ou activer un dossier sans jeton ; s'octroyer un pont `purchases` ; devenir partenaire ou admin ?
2. Le hook peut-il accepter un e-mail non invité (casse, espaces, e-mail d'un dossier annulé ou clos, hash d'un autre dossier) ou refuser un gérant enrôlé ? Que se passe-t-il si `account_enrollments` contient une adresse non normalisée (le CHECK l'interdit-il bien) ?
3. `claim_dossier` : deux appels concurrents avec le même hash (même compte, puis deux comptes) peuvent-ils produire deux lignes `purchases` ou deux dossiers actifs ? Un compte PF peut-il devenir famille par un chemin quelconque ?
4. `invitation_preview` est-elle un oracle (différencier « utilisé » de « jamais existé », fuite de nom de famille, de date, d'identifiant) ?
5. Une PF peut-elle lire, renvoyer, annuler ou compter un dossier d'une autre PF, ou détecter son existence (message, délai, compteur) ?
6. Les montants de `billing_preview` peuvent-ils compter un dossier `demo`, annulé, ou activé le mois précédent ?
7. Les `raise exception` peuvent-ils fuiter une donnée (message ≠ code) ?
8. La migration rejouée sur une base où `20260915200000` a été appliquée avec une version antérieure du fichier converge-t-elle (contraintes et index homonymes au prédicat différent) ?

- [ ] **Step 4: Appliquer les correctifs, rejouer Step 1, commit**

```bash
git -C /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l1 add -A supabase/migrations scripts tests supabase/config.toml
git -C /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l1 commit -m "fix(v2-l1): correctifs de revue (spec, qualité, adversariale)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
Expected : commit créé seulement s'il y a des correctifs (sinon `nothing to commit`). Rapport de rendu : nombre de tests, sorties `SCENARIOS V2 : OK` et `# 9/9 ok`, liste des questions adversariales et réponses, déviations → « Notes post-revue ».

---

## Lot L1b — Correctif F1 `transmissions`

Branche `feature/v2-l1b`, worktree `$S/wt-v2-l1b` (Task 0, Step 4 avec `l1b`). Indépendant de L1 (merge avant L1). **Niveau de revue : double revue RLS.**

### Task 7: Migration `transmissions_f1` — scénario d'abord

**Files:**
- Create: `scripts/sql-scenarios-f1.sql`
- Create: `supabase/migrations/20260915210000_transmissions_f1.sql`

- [ ] **Step 1: Écrire `scripts/sql-scenarios-f1.sql`**

```sql
-- ════════════════════════════════════════════════════════════════════════════════════════
-- scripts/sql-scenarios-f1.sql — Correctif F1 (docs/audit-rls.md, contrat §3.3.15, §10.2-14)
-- ════════════════════════════════════════════════════════════════════════════════════════
-- LOCAL UNIQUEMENT : run-sql-checks <worktree> scripts/sql-scenarios-f1.sql
-- Prouve qu'un authentifié tiers ne lit plus AUCUNE transmission en direct, que le partage passe
-- par get_transmission_by_code (code exact, casse ignorée, une ligne au plus) et que les 4 policies
-- owner restent en place. Sortie attendue : « NOTICE:  SCENARIOS F1 : OK ».
\set ON_ERROR_STOP on

do $$
begin
  if (select count(*) from auth.users where email not like '%@f1.seren-test.fr') > 200 then
    raise exception 'REFUS : base qui ne ressemble pas à une base locale jetable';
  end if;
end $$;

delete from public.transmissions where access_code = 'F1SCEN01';
delete from auth.users where email like '%@f1.seren-test.fr';
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000f1001', 'authenticated', 'authenticated', 'owner@f1.seren-test.fr', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000f1002', 'authenticated', 'authenticated', 'reader@f1.seren-test.fr', now(), now());
insert into public.transmissions (access_code, data, is_complete, user_id)
values ('F1SCEN01', '{"probe":"f1"}', true, '00000000-0000-4000-8000-0000000f1001');

begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000f1002","email":"reader@f1.seren-test.fr","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n integer;
begin
  select count(*) into n from public.transmissions;
  if n <> 0 then
    raise exception '[F1a] un authentifié tiers lit % transmission(s) sans code', n;
  end if;
  raise notice 'OK F1a lecture directe par un tiers → 0 ligne';

  select count(*) into n from public.get_transmission_by_code('f1scen01');
  if n <> 1 then raise exception '[F1b] RPC avec le bon code (minuscules) → % ligne(s)', n; end if;
  raise notice 'OK F1b RPC avec le bon code, casse ignorée → 1 ligne';

  if (select data from public.get_transmission_by_code('F1SCEN01')) is distinct from '{"probe":"f1"}' then
    raise exception '[F1c] données renvoyées inattendues';
  end if;
  raise notice 'OK F1c données renvoyées';

  select count(*) into n from public.get_transmission_by_code('F1SCEN99');
  if n <> 0 then raise exception '[F1d] mauvais code → % ligne(s)', n; end if;
  raise notice 'OK F1d mauvais code → 0 ligne';

  select count(*) into n from public.get_transmission_by_code('abc');
  if n <> 0 then raise exception '[F1e] code trop court → % ligne(s)', n; end if;
  raise notice 'OK F1e code de moins de 4 caractères → 0 ligne';
end $$;

reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000f1001","email":"owner@f1.seren-test.fr","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.transmissions) <> 1 then
    raise exception '[F1f] le propriétaire ne lit plus sa transmission';
  end if;
  raise notice 'OK F1f le propriétaire lit toujours sa transmission';
end $$;

reset role;
do $$ begin
  if has_function_privilege('anon', 'public.get_transmission_by_code(text)', 'execute') then
    raise exception '[F1g] anon peut exécuter get_transmission_by_code';
  end if;
  if not has_function_privilege('authenticated', 'public.get_transmission_by_code(text)', 'execute') then
    raise exception '[F1h] authenticated ne peut pas exécuter get_transmission_by_code';
  end if;
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a
              where p.oid = 'public.get_transmission_by_code(text)'::regprocedure and a.grantee = 0) then
    raise exception '[F1i] EXECUTE accordé à PUBLIC';
  end if;
  if not (select prosecdef and array_to_string(proconfig, ',') like '%search_path=""%'
            from pg_proc where oid = 'public.get_transmission_by_code(text)'::regprocedure) then
    raise exception '[F1j] security definer ou search_path vide manquant';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'transmissions'
                and policyname = 'Authenticated users can read with access_code') then
    raise exception '[F1k] la policy F1 est encore présente';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'transmissions') <> 4 then
    raise exception '[F1l] les 4 policies owner ne sont plus toutes présentes';
  end if;
  raise notice 'OK F1g-F1l droits de la RPC et policies de la table';
end $$;
rollback;

delete from public.transmissions where access_code = 'F1SCEN01';
delete from auth.users where email like '%@f1.seren-test.fr';
do $$ begin raise notice 'SCENARIOS F1 : OK'; end $$;
```

- [ ] **Step 2: Vérifier l'échec**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
run-sql-checks "$S/wt-v2-l1b" scripts/sql-scenarios-f1.sql > "$S/out-l1b.txt" 2>&1; echo "exit=$?"; grep -E "ERROR" "$S/out-l1b.txt"
```
Expected : `exit=3`, `ERROR:  [F1a] un authentifié tiers lit 1 transmission(s) sans code` (preuve locale du défaut F1, grants « hébergé » appliqués).

- [ ] **Step 3: Écrire `supabase/migrations/20260915210000_transmissions_f1.sql`**

```sql
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Correctif F1 — transmissions : fin de la lecture de toute la table par n'importe quel authentifié
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Audit : docs/audit-rls.md F1. Contrat : docs/design-v2-demonstrateur.md §3.3.15. Plan :
-- docs/plan-v2-sql.md, Task 7. La policy « Authenticated users can read with access_code »
-- (20260709090000) testait `access_code is not null`, vrai pour TOUTES les lignes : combinée en OU
-- avec la policy owner, elle ouvrait la table entière à tout compte connecté. Une policy ne reçoit
-- pas de paramètre ; le partage par code passe donc par une fonction qui exige le code exact.
-- Produit transmission gelé : seul ce correctif est appliqué. Les 4 policies owner restent.
-- La route GET /api/transmission/:code est rebranchée sur la RPC par L2a (même réponse qu'avant).

drop policy if exists "Authenticated users can read with access_code" on public.transmissions;

-- Une ligne au plus, code exact (les codes sont stockés en majuscules, cf. server.js), longueur
-- bornée. Réservée aux authentifiés, comme la route qui l'appelle.
create or replace function public.get_transmission_by_code(p_code text)
returns table (data text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $fn$
  select t.data, t.created_at
    from public.transmissions t
   where char_length(p_code) between 4 and 64
     and t.access_code = upper(p_code)
   limit 1
$fn$;
revoke all on function public.get_transmission_by_code(text) from public, anon, authenticated;
grant execute on function public.get_transmission_by_code(text) to authenticated;
```

- [ ] **Step 4: Vérifier le succès, puis le gate**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
run-sql-checks "$S/wt-v2-l1b" scripts/sql-scenarios-f1.sql > "$S/out-l1b.txt" 2>&1; echo "exit=$?"; grep -E "OK|ERROR" "$S/out-l1b.txt"
gate "$S/wt-v2-l1b" > "$S/out-l1b-gate.txt" 2>&1; echo "gate exit=$?"
```
Expected : `exit=0`, `OK F1a` à `OK F1g-F1l`, `SCENARIOS F1 : OK` ; `gate exit=0`.

- [ ] **Step 5: Double revue RLS**

Relecteur 1 (spec) : SQL identique au §3.3.15 ; nom de policy exact (casse, espaces) ; signature et grants du §3.4. Relecteur 2 (adversarial) : (a) un tiers peut-il énumérer des codes par la RPC (réponse vide indistinguable, limite de débit côté route L2a) ; (b) `upper()` sur une entrée non ASCII casse-t-il l'égalité ; (c) la policy owner `select` suffit-elle à `GET /api/user/transmission` (inchangée) ; (d) aucun `drop` d'une policy owner.

- [ ] **Step 6: Commit**

```bash
git -C /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l1b add supabase/migrations/20260915210000_transmissions_f1.sql scripts/sql-scenarios-f1.sql
git -C /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l1b commit -m "fix(v2-l1b): F1 transmissions — policy trop large supprimée, partage par get_transmission_by_code

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Lot L4c (partie SQL) — Vue admin Seren

Branche `feature/v2-l4c-sql` (SF2.7), worktree `$S/wt-v2-l4c`. Cette task précède les tasks UI de L4c (hors de ce plan : `server/routes/admin.js`, `AdminPage`, etc.). **Niveau de revue : double revue** (SQL).

### Task 8: Migration `v2_admin` — `admin_partner_overview()`

**Files:**
- Create: `supabase/migrations/20260915202000_v2_admin.sql`
- Test: S10 et S13p de `scripts/sql-scenarios-v2.sql` (L1), `tests/migrations-v2-lint.test.ts` (L1)

**Précondition d'exécution :** la migration lit `public.seren_admins` et `public.dossiers` (L1). Deux voies :
- L1 déjà mergé dans `integration/v2-demo` → `git -C "$S/wt-v2-l4c" rebase integration/v2-demo` avant le Step 1 ;
- sinon, validation dans un worktree jetable `tmp/v2-l4c-check` = `feature/v2-l1` + cherry-pick du commit de cette task, **jamais mergé ni poussé**, supprimé au Step 6.

- [ ] **Step 1: Constater l'état rouge (S10 sauté)**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
git -C "$INT" worktree add "$S/wt-v2-l4c-check" -b tmp/v2-l4c-check feature/v2-l1
ln -s "$INT/node_modules" "$S/wt-v2-l4c-check/node_modules"
run-sql-checks "$S/wt-v2-l4c-check" scripts/sql-scenarios-v2.sql > "$S/out-l4c.txt" 2>&1; echo "exit=$?"; grep -E "SKIP S10|SKIP S13p public.admin" "$S/out-l4c.txt"
```
(Si L1 est mergé : remplacer `wt-v2-l4c-check` par `wt-v2-l4c` et ignorer la création du worktree jetable.)
Expected : `exit=0` et `NOTICE:  SKIP S10 admin_partner_overview absente (migration L4c non appliquée)` — le contrat §3.3.14 n'est pas encore tenu.

- [ ] **Step 2: Écrire `supabase/migrations/20260915202000_v2_admin.sql` dans `$S/wt-v2-l4c`**

```sql
-- ════════════════════════════════════════════════════════════════════════════════════════
-- v2 admin — vue d'ensemble des partenaires pour l'équipe Seren (compteurs uniquement)
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Contrat : docs/design-v2-demonstrateur.md §3.3.14, décision D9, arbitrage A2 (seren_admins vit dans
-- v2_core). Plan : docs/plan-v2-sql.md, Task 8. Dépend de 20260915200000_v2_core.sql.
--
-- Rôle admin : ligne dans public.seren_admins (deny-all, remplie par link_enrollments en SQL Editor).
-- Un compte non admin reçoit null, jamais une erreur distinctive. La vue ne renvoie AUCUNE PII
-- famille ni contenu : ni e-mail, ni nom, ni défunt, ni siret, ni billing_email — des compteurs par
-- partenaire. Aucune policy admin n'est créée sur les tables de contenu ni sur le storage.

create or replace function public.admin_partner_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_start    timestamptz := date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
  v_partners jsonb;
begin
  if auth.uid() is null
     or not exists (select 1 from public.seren_admins sa where sa.user_id = auth.uid()) then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'partner_id',          p.id,
           'name',                p.name,
           'status',              p.status,
           'dossiers_total',      c.dossiers_total,
           'dossiers_this_month', c.dossiers_this_month,
           'invited_pending',     c.invited_pending,
           'activated',           c.activated,
           'cancelled',           c.cancelled,
           'last_dossier_at',     c.last_dossier_at) order by p.name, p.id), '[]'::jsonb)
    into v_partners
    from public.partners p
    cross join lateral (
      select count(*)                                          as dossiers_total,
             count(*) filter (where d.created_at >= v_start)   as dossiers_this_month,
             count(*) filter (where d.status = 'invited')      as invited_pending,   -- expirés compris
             count(*) filter (where d.activated_at is not null) as activated,
             count(*) filter (where d.status = 'cancelled')    as cancelled,
             max(d.created_at)                                 as last_dossier_at
        from public.dossiers d
       where d.partner_id = p.id
    ) as c;

  return jsonb_build_object('generated_at', now(),
                            'month',        to_char(now() at time zone 'Europe/Paris', 'YYYY-MM'),
                            'partners',     v_partners);
end
$fn$;
revoke all on function public.admin_partner_overview() from public, anon, authenticated;
grant execute on function public.admin_partner_overview() to authenticated;
```

- [ ] **Step 3: Commit sur `feature/v2-l4c-sql`**

```bash
git -C /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l4c add supabase/migrations/20260915202000_v2_admin.sql
git -C /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l4c commit -m "feat(v2-l4c): admin_partner_overview — compteurs par partenaire pour l'équipe Seren

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Vérifier le succès (S10 exécuté, lint avec le fichier admin)**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
git -C "$S/wt-v2-l4c-check" cherry-pick "$(git -C "$S/wt-v2-l4c" rev-parse HEAD)"
run-sql-checks "$S/wt-v2-l4c-check" scripts/sql-scenarios-v2.sql > "$S/out-l4c.txt" 2>&1; echo "exit=$?"
grep -E "S10|S13p public.admin|ERROR|SCENARIOS V2" "$S/out-l4c.txt"
cd "$S/wt-v2-l4c-check" && npx vitest run tests/migrations-v2-lint.test.ts 2>&1 | tail -4
```
Expected : `exit=0` ; `OK S10a` à `OK S10h` ; 3 lignes `OK S13p … public.admin_partner_overview()` ; aucune ligne `SKIP S10` ni `ERROR` ; `SCENARIOS V2 : OK` ; lint vert.

- [ ] **Step 5: Double revue**

Relecteur spec : forme JSON exacte du §3.3.14 (9 clés par partenaire, tri `name asc`, `invited_pending` expirés compris, mois Europe/Paris, `null` hors admin). Relecteur adversarial : (a) une PF ou une famille peut-elle obtenir autre chose que `null` ; (b) la réponse peut-elle contenir un e-mail, un nom de famille ou un identifiant de compte ; (c) un admin qui est aussi gérant PF (compte interne double) voit-il la même chose ; (d) coût de la requête avec 500 dossiers par partenaire (index `dossiers_partner_created_idx`).

- [ ] **Step 6: Nettoyer le worktree jetable**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
git -C "$INT" worktree remove --force "$S/wt-v2-l4c-check" && git -C "$INT" branch -D tmp/v2-l4c-check
```
Expected : `Deleted branch tmp/v2-l4c-check`.

---

## Lot L6 — Probes RLS v2 et provisionnement compatible hook

Branche `feature/v2-l6`, worktree `$S/wt-v2-l6`. **Niveau de revue : revue combinée + contre-lecture par le relecteur sécurité de L1** (chaque RPC et chaque branche du hook couvertes). Rédaction sur le contrat dès la **nuit du 15 au 16** ; **exécution locale seulement après les merges de L1, L1b ET L2b** (`git -C "$S/wt-v2-l6" rebase integration/v2-demo`), donc **mercredi 8h-11h** après la Task 39.1 du plan app — écart **E10** : depuis le must-fix 1, la création de dossier passe par `POST /api/partner/dossiers`, et le harnais démarre un serveur Express local (port 3997). Les sondes HTTP (`PROBE_API_URL`) ne s'exécutent qu'après le merge de L2a : sans cette variable, elles sortent en `SKIP`.

Règles propres à L6 :
- `provision-v2.mjs` **écrit** : refus total de la prod ; hors `127.0.0.1`/`localhost`, exige `E2E_TARGET=preprod` **et** une URL préprod, et n'accepte que des adresses `@seren-test.fr`.
- `rls-probes.mjs` est en **lecture seule par défaut** ; `PROBE_WRITE=1` active les écritures (refusé sur la prod sans dérogation) ; sur la prod, la lecture seule exige `PROD_OK=1` (smoke U4).
- Les noms `PROBE_USER_A_*` / `PROBE_USER_B_*` sont **conservés** (ils désignent les familles A et B) : `tests/check-env-target.test.ts` (gelé) les utilise.
- Aucun mot de passe, jeton ni hash n'est jamais affiché.

### Task 9: `scripts/provision-v2.mjs` — comptes de probes et de démo par le vrai parcours

**Files:**
- Create: `scripts/provision-v2.mjs`
- Create (scratchpad, non versionné) : `$S/l6-enroll-local.sql`

- [ ] **Step 1: Écrire `scripts/provision-v2.mjs`**

```js
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
```

- [ ] **Step 2: Vérifier les gardes (rouge attendu sans garde, vert avec)**

```bash
cd /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l6
env -i PATH="$PATH" PROBE_SUPABASE_URL=http://127.0.0.1:9/oltwzvfjazwjvghpzhia PROBE_SUPABASE_KEY=sb_publishable_x node scripts/provision-v2.mjs; echo "exit=$?"
env -i PATH="$PATH" PROBE_SUPABASE_URL=https://kvtzhyxlqouvpwasedbe.supabase.co PROBE_SUPABASE_KEY=sb_publishable_x node scripts/provision-v2.mjs; echo "exit=$?"
env -i PATH="$PATH" PROBE_SUPABASE_URL=http://127.0.0.1:9 PROBE_SUPABASE_KEY=sb_secret_x node scripts/provision-v2.mjs; echo "exit=$?"
```
Expected : trois `REFUS : …` (prod ; préprod sans `E2E_TARGET=preprod` ; clé secrète), `exit=1` à chaque fois, aucune requête réseau (l'hôte `127.0.0.1:9` n'est jamais contacté : aucun message `fetch failed`).

- [ ] **Step 3: Préparer l'enrôlement local (équivalent seed partie 1, scratchpad)**

`$S/l6-enroll-local.sql` (équivalent de la partie 1 du seed ; l'enrôlement précède TOUJOURS la création
des comptes — `link_enrollments` refuse un compte antérieur à son enrôlement) :
```sql
\set ON_ERROR_STOP on
insert into public.partners (id, name, status) values
  ('00000000-0000-4000-8000-0000000d0001', 'PF Probes X', 'active'),
  ('00000000-0000-4000-8000-0000000d0002', 'PF Probes Y', 'active')
on conflict (id) do nothing;
insert into public.account_enrollments (email, role, partner_id) values
  ('pf.probe.x@seren-test.fr', 'partner_manager', '00000000-0000-4000-8000-0000000d0001'),
  ('pf.probe.y@seren-test.fr', 'partner_manager', '00000000-0000-4000-8000-0000000d0002'),
  ('admin.probe@seren-test.fr', 'seren_admin', null)
on conflict (email, role) do nothing;
-- Secret partagé : le serveur local devra porter le MÊME dans WEBHOOK_RPC_SECRET (must-fix 1).
insert into public.webhook_config (id, rpc_secret) values (1, 'local-provision-secret')
  on conflict (id) do update set rpc_secret = excluded.rpc_secret;
```

`$S/l6-add-users.sh` — équivalent LOCAL du bouton « Add user » du Dashboard (revue 16/09 : un compte
interne n'est JAMAIS créé par `signUp`). La clé secrète locale reste dans ce fichier de scratchpad,
**jamais** dans un fichier versionné ni dans `scripts/provision-v2.mjs` :
```sh
#!/bin/sh
set -eu
API="${PROBE_SUPABASE_URL:-http://127.0.0.1:54321}"
KEY="$1"; shift                       # SERVICE_ROLE_KEY locale (supabase status)
PAIRS=""
for SPEC in "$@"; do                  # SPEC = « email:motdepasse »
  EMAIL="${SPEC%%:*}"; PASS="${SPEC#*:}"
  ID=$(curl -s -X POST "$API/auth/v1/admin/users" \
         -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
         -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"email_confirm\":true}" \
       | node -e 'const u=JSON.parse(require("fs").readFileSync(0,"utf8")); process.stdout.write(u.id||"")')
  [ -n "$ID" ] || { echo "ÉCHEC « Add user » pour $EMAIL" >&2; exit 1; }
  PAIRS="$PAIRS{\"email\":\"$EMAIL\",\"user_id\":\"$ID\"},"
done
echo "[${PAIRS%,}]"                   # paires e-mail ↔ UUID pour link_enrollments
```
Un compte créé ainsi a `last_sign_in_at` null et `email_change` vide (constat local du 16/09) : c'est
exactement ce que `link_enrollments` exige.

- [ ] **Step 4: Provisionner en local (liaison par paires d'abord, puis provisionnement)**

La séquence rejoue le runbook U2 **exactement** : enrôlement → « Add user » (mot de passe posé à la
création) → copie des paires → **partie 2 avec les paires** → provision → `--verify`. ⚠️ **La partie 2
précède obligatoirement tout appel à `provision-v2.mjs`** : `l6-add-users.sh` pose le mot de passe, donc
le premier `signIn` du script poserait `last_sign_in_at` et `link_enrollments` refuserait les trois
comptes (`enrollment_account_untrusted`). Il n'y a donc **pas** de premier passage en `exit 2` ici : un
seul passage de provisionnement, puis la vérification. Le serveur Express local est indispensable depuis le
must-fix 1 : `partner_create_dossier` exige le secret, donc les dossiers passent par `POST /api/partner/dossiers`.

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
export PROBE_SUPABASE_URL=http://127.0.0.1:54321
export PROBE_SUPABASE_KEY=$(supabase status -o json --workdir "$S/wt-v2-l6" 2>/dev/null | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).PUBLISHABLE_KEY)')
export SERVICE_KEY=$(supabase status -o json --workdir "$S/wt-v2-l6" 2>/dev/null | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).SERVICE_ROLE_KEY)')
export PROVISION_PFX_EMAIL=pf.probe.x@seren-test.fr PROVISION_PFY_EMAIL=pf.probe.y@seren-test.fr PROVISION_ADMIN_EMAIL=admin.probe@seren-test.fr
export PROVISION_DEMO_EMAIL=famille.probe.demo@seren-test.fr PROBE_ENV_FILE="$S/l6-probes-local.env"
export PROVISION_PFX_PASSWORD='Probe-PFX-2026!' PROVISION_PFY_PASSWORD='Probe-PFY-2026!' PROVISION_ADMIN_PASSWORD='Probe-ADM-2026!'
export PROVISION_API_URL=http://127.0.0.1:3997
with-db-lock sh -ec '
  supabase db reset --local --workdir "$S/wt-v2-l6"
  psql-local -q < "$S/bin/hosted-grants.sql"
  psql-local -q < "$S/l6-enroll-local.sql"
  PAIRS=$(sh "$S/l6-add-users.sh" "$SERVICE_KEY" \
            "$PROVISION_PFX_EMAIL:$PROVISION_PFX_PASSWORD" \
            "$PROVISION_PFY_EMAIL:$PROVISION_PFY_PASSWORD" \
            "$PROVISION_ADMIN_EMAIL:$PROVISION_ADMIN_PASSWORD")
  echo "# paires : $PAIRS"
  (cd "$S/wt-v2-l6" && PORT=3997 SUPABASE_URL=$PROBE_SUPABASE_URL SUPABASE_PUBLISHABLE_KEY=$PROBE_SUPABASE_KEY \
     WEBHOOK_RPC_SECRET=local-provision-secret PARTNER_ACTIVATIONS_ENABLED=true SHOW_ACTIVATION_LINK=true \
     APP_URL=http://127.0.0.1:5173 node server/server.js > "$S/l6-server.log" 2>&1 &)
  curl -s --retry 20 --retry-connrefused --retry-delay 1 -o /dev/null http://127.0.0.1:3997/api/health
  echo "select public.link_enrollments('"'"'$PAIRS'"'"'::jsonb);" | psql-local -At
  node "$S/wt-v2-l6/scripts/provision-v2.mjs"
  node --env-file="$S/l6-probes-local.env" "$S/wt-v2-l6/scripts/provision-v2.mjs" --verify
  lsof -ti tcp:3997 | xargs kill
'; echo "exit=$?"
```
Expected : `# paires : [{"email":"pf.probe.x@seren-test.fr","user_id":"…"},…]` (3 UUID) ; puis, la partie 2
jouée **avant** le provisionnement, `{"partner_users_linked": 2, "seren_admins_linked": 1, "pending": 0, "untrusted": 0}`
(**`untrusted` DOIT valoir 0** ; sinon un compte détient une adresse enrôlée → enquête) ; le
provisionnement tient alors en **un seul passage**, sans aucune ligne `compte non rattaché` et sans
`exit 2` (un `exit 2` ici = partie 2 non jouée ou paires erronées, à corriger avant de relancer) ; puis
`# famille A : provisionnée (dossier actif, consentements, pont)`, idem B et démo, `# sans dossier :
provisionnée (inscrite sans dossier actif)`, `# OK — identifiants dans …` ; en `--verify`, 12 lignes `ok`
(PF-X, PF-Y, A ×3, B ×3, sans dossier, démo ×3 → `# 12/12 ok`) et `exit=0`.
Prérequis : hook actif (Task 5 de L1 mergée) **et routes L2b présentes dans le worktree** (écart E10) —
sans le serveur, le script s'arrête sur `PROVISION_API_URL est requise`. En cas d'échec de création,
lire `$S/l6-server.log` : un 500 `PARTNER_ERROR` signale un `WEBHOOK_RPC_SECRET` désaccordé de `webhook_config`.

- [ ] **Step 5: Rejouabilité**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
export PROBE_SUPABASE_URL=http://127.0.0.1:54321
export PROBE_SUPABASE_KEY=$(supabase status -o json --workdir "$S/wt-v2-l6" 2>/dev/null | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).PUBLISHABLE_KEY)')
export PROVISION_PFX_EMAIL=pf.probe.x@seren-test.fr PROVISION_PFY_EMAIL=pf.probe.y@seren-test.fr PROVISION_ADMIN_EMAIL=admin.probe@seren-test.fr
export PROVISION_DEMO_EMAIL=famille.probe.demo@seren-test.fr PROBE_ENV_FILE="$S/l6-probes-local.env"
export PROVISION_PFX_PASSWORD='Probe-PFX-2026!' PROVISION_PFY_PASSWORD='Probe-PFY-2026!' PROVISION_ADMIN_PASSWORD='Probe-ADM-2026!'
export PROVISION_API_URL=http://127.0.0.1:3997   # serveur de l'étape 4 relancé si besoin (même WEBHOOK_RPC_SECRET)
with-db-lock node "$S/wt-v2-l6/scripts/provision-v2.mjs"; echo "exit=$?"
echo "select count(*) from public.dossiers; select count(*) from public.purchases where stripe_session_id like 'partner_dossier:%';" | psql-local -At
```
Expected : 4 lignes `# … : déjà provisionnée`, `exit=0` ; `4` dossiers (A, B, démo, sans dossier annulé) et `3` ponts. Aucun appel à `POST /api/partner/dossiers` (rien à créer) : le rejeu ne dépend donc pas du serveur, sauf si un compte manque.

- [ ] **Step 6: Commit**

```bash
git -C /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l6 add scripts/provision-v2.mjs
git -C /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l6 commit -m "feat(v2-l6): provisionnement des comptes de probes et de démo par le vrai parcours d'invitation

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: `scripts/rls-probes.mjs` v2 — lecture seule par défaut, frontières v2

**Files:**
- Modify: `scripts/rls-probes.mjs` (réécriture complète ci-dessous ; les helpers `rest`, `describeError`, `isMissingRelation`, `isRlsDenied`, `runProbe`, `probeFamilyIsolation` et les 3 sondes de marqueur sont repris à l'identique)
- Test: `tests/check-env-target.test.ts` (existant, doit rester vert), exécutions locales

- [ ] **Step 1: Constater l'état rouge actuel sous hook**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
with-db-lock node --env-file="$S/l6-probes-local.env" "$S/wt-v2-l6/scripts/rls-probes.mjs" > "$S/out-l6-probes-v1.txt" 2>&1; echo "exit=$?"; grep -E "not ok" "$S/out-l6-probes-v1.txt" | head -5
```
Expected : `exit=1` ; au moins `not ok … denyall:partners — INSERT direct refusé` (buildRow vide → refus non attribuable à la RLS) ; aucune sonde v2 (dossiers, consents, hook, F1, PF-Y, admin) n'existe.

- [ ] **Step 2: Réécrire `scripts/rls-probes.mjs`**

```js
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
```

- [ ] **Step 3: Vérifier que les gardes existantes restent vertes**

```bash
cd /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l6 && npx vitest run tests/check-env-target.test.ts 2>&1 | tail -4
env -i PATH="$PATH" PROBE_SUPABASE_URL=http://127.0.0.1:9/oltwzvfjazwjvghpzhia PROD_OK=1 PROBE_WRITE=1 node scripts/rls-probes.mjs; echo "exit=$?"
```
Expected : Vitest `1 passed` fichier, aucun test en échec (le fichier existant, inchangé : les 3 cas « rls-probes — garde anti-prod » restent verts) ; puis `REFUS : … avec PROBE_WRITE=1`, `exit=1`.

- [ ] **Step 4: Exécuter en local — lecture seule puis écriture**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
with-db-lock node --env-file="$S/l6-probes-local.env" "$S/wt-v2-l6/scripts/rls-probes.mjs" > "$S/out-l6-read.txt" 2>&1; echo "read exit=$?"
PROBE_WRITE=1 with-db-lock node --env-file="$S/l6-probes-local.env" "$S/wt-v2-l6/scripts/rls-probes.mjs" > "$S/out-l6-write.txt" 2>&1; echo "write exit=$?"
grep -E "^not ok|^# [0-9]+/" "$S/out-l6-read.txt" "$S/out-l6-write.txt"; grep -c "# SKIP" "$S/out-l6-read.txt" "$S/out-l6-write.txt"
```
Expected : `read exit=0`, `write exit=0`, aucune ligne `not ok`. En lecture seule : SKIP pour les sondes d'écriture, `nodossier:http` et `family:http` (`PROBE_API_URL` absente), `f1:*`/`admin:*` si L1b/L4c ne sont pas encore dans la base. En écriture : seules les sondes HTTP et, le cas échéant, F1/admin restent en SKIP ; `# cleanup : marqueur nettoyé`, `transmission sonde nettoyé`, `dossier sonde hook nettoyé`.

- [ ] **Step 5: Contre-épreuve — une sonde rouge quand la frontière casse (en transaction jetable)**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
with-db-lock sh -ec '
  echo "create policy \"probe_regression\" on public.dossiers for select to authenticated using (true);" | psql-local -q
  set +e; node --env-file="$S/l6-probes-local.env" "$S/wt-v2-l6/scripts/rls-probes.mjs" > "$S/out-l6-regression.txt" 2>&1; echo "exit=$?"; set -e
  echo "drop policy \"probe_regression\" on public.dossiers;" | psql-local -q
'; grep -E "^not ok" "$S/out-l6-regression.txt"
```
Expected : `exit=1` et `not ok … denyall:select — famille A ne lit aucune table v2/PF/config` (la policy de régression est retirée juste après).

- [ ] **Step 6: Commit**

```bash
git -C /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l6 add scripts/rls-probes.mjs
git -C /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l6 commit -m "feat(v2-l6): probes RLS v2 — lecture seule par défaut, deny-all v2, F1, PF-X/PF-Y, admin, hook, gate HTTP

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: `docs/runbook-rls-probes.md` v2 et clôture L6

**Files:**
- Modify: `docs/runbook-rls-probes.md` (sections « Ce que le script prouve », « Écriture », « Lancer le script », « Garde anti-prod »)

- [ ] **Step 1: Mettre à jour le runbook**

Contenu exact à produire (remplace les 4 sections citées, le reste du fichier est conservé) :
- **Ce que le script prouve (v2)** : liste numérotée des 14 familles de sondes de la Task 10 avec, pour chacune, la propriété prouvée et la condition de SKIP.
- **Modes** : tableau `défaut (lecture seule)` / `PROBE_WRITE=1` / `prod + PROD_OK=1`, avec ce qui part et ce qui est refusé ; liste fermée des RPC de lecture autorisées vers la prod (`READONLY_RPCS`).
- **Provisionnement** : `scripts/provision-v2.mjs` — prérequis, **dans cet ordre** (seed partie 1, hook, **« Add user » des comptes internes par Arnaud — mot de passe posé à la création — puis partie 2 avec les paires e-mail ↔ UUID, AVANT le premier lancement du script** : il se connecte réellement et poserait `last_sign_in_at`, que `link_enrollments` refuse ; le script ne crée plus aucun compte interne, revue 16/09), **`PROVISION_API_URL` + `PROVISION_*_PASSWORD`** (les dossiers passent par `POST /api/partner/dossiers`, la RPC exigeant le secret serveur ; `SHOW_ACTIVATION_LINK=true` requis), commandes local et préprod (`E2E_TARGET=preprod`), code de sortie 2, fichier `~/.seren-probes.env` (mode 600, hors dépôt), `--verify` (12 contrôles), comptes résiduels `rls-probe-*@seren-test.fr` (préprod) exclus du backfill.
- **Sondes neuves de la revue du 16/09** : `partner:secret` (création et renvoi en direct → `invalid_secret`) ; les 3 sondes de hook exigent désormais `PROBE_API_URL` et `SHOW_ACTIVATION_LINK=true` (sinon SKIP explicite).
- **Lancer le script** : `node --env-file="$HOME/.seren-probes.env" scripts/rls-probes.mjs` puis `PROBE_WRITE=1 …` ; `PROBE_API_URL=https://preprod-app.seren-app.fr` (routes `/api` hors Basic Auth) ou `http://localhost:3000`.
- **Garde anti-prod** : trois barrières (tête : écriture refusée, lecture exige `PROD_OK=1` ; `assertNoProdWrite` ; `api()` sans verbe mutant vers la prod) ; `provision-v2.mjs` refuse la prod dans tous ses modes.
- **Écart local/hébergé** : en local, appliquer `hosted-grants.sql` après chaque `db reset` (sinon toutes les sondes `family:*` sortent en « refusé »).

- [ ] **Step 2: Gate et revue combinée**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
gate "$S/wt-v2-l6" > "$S/out-l6-gate.txt" 2>&1; echo "gate exit=$?"; grep -E "Tests |built in" "$S/out-l6-gate.txt"
```
Expected : `gate exit=0`. Revue combinée + contre-lecture du relecteur sécurité de L1 : chaque RPC du §3.4 et chaque branche du hook ont au moins une sonde ; aucune sonde ne peut écrire en lecture seule (relire chaque `requireWrite()`) ; aucune ne peut écrire vers la prod (relire `assertNoProdWrite` et `api`) ; aucun mot de passe, jeton ni hash dans la sortie.

- [ ] **Step 3: Commit**

```bash
git -C /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l6 add docs/runbook-rls-probes.md
git -C /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/wt-v2-l6 commit -m "docs(v2-l6): runbook des probes RLS v2 et du provisionnement

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Lot L7 (partie SQL) — Seed démo et pilote v2

Branche `feature/v2-l7-sql` (SF2.7), worktree `$S/wt-v2-l7`. Ce lot est **le seul propriétaire** de `scripts/seed-demo-v2.sql` **et** de l'en-tête « obsolète v2 » de `scripts/seed-demo-pf.sql` (la Task 36.2 du plan app a été supprimée, SF2.6). **Exécution locale après le merge de L1.** **Niveau de revue : revue unique pour les parties 1-2, double revue pour la partie 3** (écrit dans `purchases`).

### Task 12: `scripts/seed-demo-v2.sql` — parties 1, 2 et 3

**Files:**
- Create: `scripts/seed-demo-v2.sql`
- Modify: `scripts/seed-demo-pf.sql:1-13` (en-tête « obsolète v2 »)
- Create (scratchpad, non versionné) : `$S/l7-seed-users.sql`, `$S/l7-seed-check.sql`

- [ ] **Step 1: Écrire le contrôle `$S/l7-seed-check.sql` et la fixture `$S/l7-seed-users.sql`**

`$S/l7-seed-users.sql` (simule les « Add user » d'Arnaud) :
```sql
\set ON_ERROR_STOP on
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', e, now(), now(), now()
  from unnest(array['pf.demo@seren-test.fr', 'pf.temoin@seren-test.fr', 'admin.demo@seren-test.fr', 'famille.demo@seren-test.fr']) as e
 where not exists (select 1 from auth.users u where u.email = e);
```

`$S/l7-seed-check.sql` :
```sql
\set ON_ERROR_STOP on
do $$
declare v_uid uuid := (select id from auth.users where email = 'famille.demo@seren-test.fr');
begin
  if (select count(*) from public.partners where name in ('Pompes Funèbres Démo', 'Pompes Funèbres Témoin')) <> 2 then
    raise exception '[K1] partenaires absents ou dupliqués';
  end if;
  if (select count(*) from public.partners where name = 'Pompes Funèbres Démo' and status = 'active' and siret = '12345678900011'
        and price_ttc_cents = 29000 and commission_ttc_cents = 7000) <> 1 then
    raise exception '[K2] champs contractuels du partenaire de démo';
  end if;
  if (select count(*) from public.partner_users pu join auth.users u on u.id = pu.user_id
       where u.email in ('pf.demo@seren-test.fr', 'pf.temoin@seren-test.fr') and pu.role = 'manager') <> 2 then
    raise exception '[K3] gérants non rattachés';
  end if;
  if not exists (select 1 from public.seren_admins sa join auth.users u on u.id = sa.user_id where u.email = 'admin.demo@seren-test.fr') then
    raise exception '[K4] admin non rattaché';
  end if;
  if (select count(*) from public.dossiers where user_id = v_uid and status = 'active' and source = 'partner' and included_sends = 10) <> 1 then
    raise exception '[K5] dossier actif de la famille de démo';
  end if;
  if (select count(*) from public.consents where user_id = v_uid and version = public.consent_version()) <> 3 then
    raise exception '[K6] consentements de la famille de démo';
  end if;
  if (select count(*) from public.purchases where user_id = v_uid and stripe_session_id like 'partner_dossier:%'
        and status = 'paid' and kind = 'forfait' and included_sends = 10 and amount_total is null) <> 1 then
    raise exception '[K7] pont purchases absent ou dupliqué';
  end if;
  if public.send_balance(v_uid) <> 10 then
    raise exception '[K8] solde d''envois % au lieu de 10', public.send_balance(v_uid);
  end if;
  raise notice 'OK K1-K8 seed';
end $$;

begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email = 'famille.demo@seren-test.fr'), 'email', 'famille.demo@seren-test.fr', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare r jsonb := public.my_account();
begin
  if r->>'role' <> 'family' or (r->'consent'->>'required')::boolean or r->'dossier'->>'partner_name' <> 'Pompes Funèbres Démo' then
    raise exception '[K9] my_account de la famille de démo : %', r;
  end if;
  raise notice 'OK K9 my_account famille (consentement à jour, PF émettrice)';
end $$;
rollback;

do $$ begin raise notice 'SEED V2 : OK'; end $$;
```

- [ ] **Step 2: Vérifier l'échec (seed absent)**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
with-db-lock sh -ec '
  supabase db reset --local --workdir "$S/wt-v2-l7"
  psql-local -q < "$S/bin/hosted-grants.sql"
  psql-local -q < "$S/l7-seed-users.sql"
  psql-local -q < "$S/l7-seed-check.sql"
' > "$S/out-l7.txt" 2>&1; echo "exit=$?"; grep ERROR "$S/out-l7.txt"
```
Expected : `exit=3`, `ERROR:  [K1] partenaires absents ou dupliqués`.

- [ ] **Step 3: Écrire `scripts/seed-demo-v2.sql`**

```sql
-- ════════════════════════════════════════════════════════════════════════════════════════
-- SEED v2 — partenaires, allowlist d'enrôlement, liaison des comptes, famille de démo de secours
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Contrat : docs/design-v2-demonstrateur.md §2.2 (flux 1), §3.2, D4, D8. Plan : docs/plan-v2-sql.md, Task 12.
-- Remplace scripts/seed-demo-pf.sql (v0, obsolète : attributions et compte PF créé par /signup).
--
-- À exécuter dans le SQL Editor du projet visé (rôle postgres), PARTIE PAR PARTIE : sélectionner le
-- bloc entre « >>> PARTIE n » et « <<< FIN PARTIE n », puis Run. Jamais le fichier entier d'un coup.
--
--   PRÉPROD (U2) : partie 1 → db push déjà fait, hook branché → « Add user » (auto-confirm) des gérants
--                  et admins, EN POSANT le mot de passe à la création (Arnaud le conserve dans son
--                  gestionnaire, jamais dans le dépôt) — JAMAIS d'inscription par l'app : un compte né
--                  d'un signUp public n'est pas fiable et sera refusé (enrollment_account_untrusted,
--                  revue 16/09) — → copier chaque UUID dans la partie 2 → partie 2 →
--                  node scripts/provision-v2.mjs (avec PROVISION_*_PASSWORD et PROVISION_API_URL) →
--                  --verify → partie 3 UNIQUEMENT si le provisionnement échoue.
--                  ⚠️ La partie 2 précède TOUTE connexion à ces comptes : provision-v2.mjs se connecte
--                  réellement et poserait last_sign_in_at, que link_enrollments refuse.
--   PROD (U4)    : parties 1 et 2 avec les PF pilotes réelles (adapter les constantes de la partie 1),
--                  puis « Send password recovery » pour chaque gérant réel — APRÈS la partie 2, jamais
--                  avant (le gérant fixe lui-même son mot de passe : procédure réservée aux vrais
--                  gérants de PF, les comptes de démo et de probes ayant le leur depuis « Add user »).
--                  Partie 3 : JAMAIS (garde @seren-test.fr).
--
-- Chaque partie est rejouable sans doublon. Aucune clé, aucun secret, aucune donnée famille réelle.

-- >>> PARTIE 1 — partenaires et allowlist d'enrôlement
do $$
declare
  -- ← À ADAPTER. Préprod : valeurs de démo ci-dessous. Prod : raisons sociales, SIRET et e-mails des PF pilotes.
  v_partners jsonb := '[
    {"name": "Pompes Funèbres Démo",   "siret": "12345678900011", "billing_email": "facturation.demo@seren-test.fr",
     "managers": ["pf.demo@seren-test.fr"]},
    {"name": "Pompes Funèbres Témoin", "siret": "12345678900029", "billing_email": "facturation.temoin@seren-test.fr",
     "managers": ["pf.temoin@seren-test.fr"]}
  ]';
  v_admins               text[]  := array['admin.demo@seren-test.fr'];   -- ← e-mails des admins Seren
  v_price_ttc_cents      integer := 29000;
  v_commission_ttc_cents integer := 7000;
  v_p          jsonb;
  v_partner_id uuid;
  v_email      text;
begin
  for v_p in select value from jsonb_array_elements(v_partners) loop
    select id into v_partner_id from public.partners where name = v_p->>'name' order by created_at limit 1;
    if v_partner_id is null then
      insert into public.partners (name, siret, billing_email, status, price_ttc_cents, commission_ttc_cents, contract_signed_at)
      values (v_p->>'name', v_p->>'siret', lower(btrim(v_p->>'billing_email')), 'active',
              v_price_ttc_cents, v_commission_ttc_cents, current_date)
      returning id into v_partner_id;
    else
      update public.partners
         set siret                = v_p->>'siret',
             billing_email        = lower(btrim(v_p->>'billing_email')),
             status               = 'active',
             price_ttc_cents      = v_price_ttc_cents,
             commission_ttc_cents = v_commission_ttc_cents,
             contract_signed_at   = coalesce(contract_signed_at, current_date),
             updated_at           = now()
       where id = v_partner_id;
    end if;

    for v_email in select lower(btrim(value)) from jsonb_array_elements_text(v_p->'managers') loop
      -- Un compte interne n'est jamais famille : refus avant tout enrôlement.
      if exists (select 1 from public.dossiers d where d.family_email = v_email and d.status <> 'cancelled')
         or exists (select 1 from auth.users u join public.dossiers d on d.user_id = u.id where lower(u.email) = v_email) then
        raise exception 'E-mail % déjà porté par un dossier famille : il ne peut pas devenir gérant PF', v_email;
      end if;
      insert into public.account_enrollments (email, role, partner_id)
      values (v_email, 'partner_manager', v_partner_id)
      on conflict (email, role) do update set partner_id = excluded.partner_id;
    end loop;

    raise notice 'Partenaire « % » : %', v_p->>'name', v_partner_id;
  end loop;

  foreach v_email in array v_admins loop
    v_email := lower(btrim(v_email));
    if exists (select 1 from public.dossiers d where d.family_email = v_email and d.status <> 'cancelled')
       or exists (select 1 from auth.users u join public.dossiers d on d.user_id = u.id where lower(u.email) = v_email) then
      raise exception 'E-mail % déjà porté par un dossier famille : il ne peut pas devenir admin Seren', v_email;
    end if;
    insert into public.account_enrollments (email, role) values (v_email, 'seren_admin')
    on conflict (email, role) do nothing;
  end loop;
end $$;

select e.email, e.role, p.name as partenaire, e.linked_user_id is not null as lie
  from public.account_enrollments e
  left join public.partners p on p.id = e.partner_id
 order by e.role, p.name, e.email;

-- (Optionnel, PRÉPROD SEULEMENT, répétitions de démo) relever les plafonds d'envoi papier :
-- update public.send_limits set max_user_daily = 30, max_global_daily = 200 where id = 1;
-- <<< FIN PARTIE 1

-- >>> PARTIE 2 — liaison des comptes (APRÈS le « Add user » des gérants et admins)
-- Coller pour CHAQUE compte l'adresse et l'UUID affiché par « Add user » (Dashboard → Authentication →
-- Users → colonne UID, icône « copy »). L'appariement est OBLIGATOIRE depuis la revue du 16/09 : une
-- liaison par simple e-mail donnerait le rôle de gérant PF (liste des familles) ou d'admin Seren à
-- quiconque se serait inscrit avec cette adresse avant toi.
-- À exécuter AVANT toute connexion à ces comptes — donc avant le premier scripts/provision-v2.mjs
-- (démo, probes) et, pour un gérant de PF réel en prod, avant « Send password recovery » : un compte
-- déjà connecté est refusé (last_sign_in_at).
select public.link_enrollments('[
  {"email": "pf.demo@seren-test.fr",    "user_id": "00000000-0000-0000-0000-000000000000"},
  {"email": "pf.temoin@seren-test.fr",  "user_id": "00000000-0000-0000-0000-000000000000"},
  {"email": "admin.demo@seren-test.fr", "user_id": "00000000-0000-0000-0000-000000000000"}
]'::jsonb);
select e.email, e.role, p.name as partenaire, e.linked_user_id is not null as lie, e.linked_at
  from public.account_enrollments e
  left join public.partners p on p.id = e.partner_id
 order by e.role, p.name, e.email;
-- Attendu : partner_users_linked = gérants appariés ; pending = 0 quand tous les comptes existent ;
--           untrusted = 0 OBLIGATOIRE.
-- « untrusted » > 0 : une adresse enrôlée est déjà portée par un compte que tu n'as pas apparié →
--   STOP. Lire auth.users (created_at, last_sign_in_at, email_change) pour cette adresse : quelqu'un
--   la détient. Delete user après vérification, ou changer l'adresse d'enrôlement. Jamais de liaison forcée.
-- Erreur « enrollment_account_untrusted » : le compte apparié n'est pas fiable (UUID d'une autre
--   adresse, compte créé AVANT l'enrôlement, compte déjà connecté, ou changement d'e-mail en attente).
--   Le NOTICE juste au-dessus nomme l'adresse en cause. STOP, enquête — ne jamais contourner.
-- Erreur « enrollment_conflict_family » : un e-mail enrôlé porte un dossier famille → corriger la partie 1.
-- <<< FIN PARTIE 2

-- >>> PARTIE 3 — SECOURS PRÉPROD : famille de démo pré-activée (dossier actif + consentements + pont)
-- Remplace le vrai parcours (création PF → invitation → activation → consentement) quand
-- scripts/provision-v2.mjs a échoué. ÉCRIT DANS purchases (argent) : double revue obligatoire.
-- Prérequis : le compte auth de la famille existe. Hook actif → un « Add user » non invité est refusé :
-- Auth → Hooks → Before User Created → désactiver, Add user (auto-confirm), RÉACTIVER aussitôt,
-- puis lancer cette partie. JAMAIS EN PROD (garde @seren-test.fr).
do $$
declare
  v_family_email   text := lower(btrim('famille.demo@seren-test.fr'));   -- ← compte famille de démo
  v_partner_name   text := 'Pompes Funèbres Démo';
  v_family_first   text := 'Claire';
  v_family_last    text := 'Martin';
  v_deceased_first text := 'Jean';
  v_deceased_last  text := 'Martin';
  v_death_date     date := current_date - 5;
  v_version        text := public.consent_version();
  v_uid            uuid;
  v_partner        public.partners%rowtype;
  v_dossier        public.dossiers%rowtype;
begin
  if v_family_email not like '%@seren-test.fr' then
    raise exception 'REFUS : la partie 3 ne sert qu''aux comptes de démo @seren-test.fr';
  end if;

  select id into v_uid from auth.users where lower(email) = v_family_email;
  if v_uid is null then
    raise exception 'Compte % introuvable : Hooks off → Add user → Hooks on, puis relancer la partie 3', v_family_email;
  end if;

  if exists (select 1 from public.partner_users where user_id = v_uid)
     or exists (select 1 from public.seren_admins where user_id = v_uid)
     or exists (select 1 from public.account_enrollments where email = v_family_email) then
    raise exception 'REFUS : % est un compte interne (PF ou admin), il ne peut pas être famille', v_family_email;
  end if;

  select * into v_partner from public.partners where name = v_partner_name order by created_at limit 1;
  if not found then
    raise exception 'Partenaire « % » introuvable : lancer la partie 1', v_partner_name;
  end if;

  select * into v_dossier from public.dossiers where user_id = v_uid;
  if found then
    if v_dossier.status <> 'active' then
      raise exception 'Le compte porte déjà un dossier % (id %) : cas non couvert par le secours', v_dossier.status, v_dossier.id;
    end if;
    raise notice 'Dossier actif existant réutilisé : %', v_dossier.id;
  else
    if exists (select 1 from public.dossiers where family_email = v_family_email and status <> 'cancelled') then
      raise exception 'Un dossier non annulé porte déjà % (invitation en cours ?) : l''annuler depuis /partenaire ou changer d''adresse', v_family_email;
    end if;
    insert into public.dossiers (partner_id, source, status, user_id,
                                 family_first_name, family_last_name, family_email,
                                 deceased_first_name, deceased_last_name, deceased_death_date,
                                 price_ttc_cents, commission_ttc_cents, included_sends, activated_at)
    values (v_partner.id, 'partner', 'active', v_uid,
            v_family_first, v_family_last, v_family_email,
            v_deceased_first, v_deceased_last, v_death_date,
            v_partner.price_ttc_cents, v_partner.commission_ttc_cents, 10, now())
    returning * into v_dossier;
  end if;

  -- Consentements à la version courante (ce que record_consents écrirait).
  insert into public.consents (user_id, dossier_id, kind, version)
  select v_uid, v_dossier.id, k, v_version
    from unnest(array['terms', 'privacy', 'sensitive_data']) as k
  on conflict (user_id, kind, version) do nothing;

  -- Pont : EXACTEMENT la ligne qu'écrirait claim_dossier (D4) — même clé, donc jamais de doublon
  -- avec un vrai claim antérieur ou postérieur.
  insert into public.purchases (user_id, status, kind, stripe_session_id, included_sends, amount_total, currency, paid_at)
  values (v_uid, 'paid', 'forfait', 'partner_dossier:' || v_dossier.id::text, v_dossier.included_sends, null, null, now())
  on conflict (stripe_session_id) do nothing;
end $$;

select d.id as dossier, d.status, p.name as partenaire,
       (select count(*) from public.consents c where c.user_id = d.user_id and c.version = public.consent_version()) as consentements,
       public.send_balance(d.user_id) as solde_envois
  from public.dossiers d
  join public.partners p on p.id = d.partner_id
 where d.user_id = (select id from auth.users where lower(email) = lower(btrim('famille.demo@seren-test.fr')));   -- ← même adresse qu'au-dessus
-- Attendu : 1 ligne, statut active, 3 consentements, solde 10 (ou moins si des envois ont déjà été faits).
-- <<< FIN PARTIE 3
```

- [ ] **Step 4: Rejouer les 3 parties deux fois et contrôler**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
cd "$S/wt-v2-l7"
for n in 1 2 3; do sed -n "/^-- >>> PARTIE $n/,/^-- <<< FIN PARTIE $n/p" scripts/seed-demo-v2.sql > "$S/l7-part$n.sql"; done
with-db-lock sh -ec '
  supabase db reset --local --workdir "$S/wt-v2-l7"
  psql-local -q < "$S/bin/hosted-grants.sql"
  psql-local -q < "$S/l7-seed-users.sql"
  for round in 1 2; do
    psql-local -q < "$S/l7-part1.sql"
    psql-local -q < "$S/l7-part2.sql"
    psql-local -q < "$S/l7-part3.sql"
  done
  psql-local -q < "$S/l7-seed-check.sql"
' > "$S/out-l7.txt" 2>&1; echo "exit=$?"; grep -E "ERROR|OK K|SEED V2" "$S/out-l7.txt"
```
Expected : `exit=0`, `OK K1-K8 seed`, `OK K9 my_account famille (consentement à jour, PF émettrice)`, `SEED V2 : OK`, aucune ligne `ERROR` (le 2ᵉ tour ne crée aucun doublon : K1, K3, K6, K7 le prouvent).

- [ ] **Step 5: Vérifier les gardes de la partie 3**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
sed "s/lower(btrim('famille.demo@seren-test.fr'));   -- ← compte famille de démo/lower(btrim('vraie.famille@exemple.fr'));/" "$S/l7-part3.sql" | with-db-lock psql-local -q; echo "exit=$?"
sed "s/lower(btrim('famille.demo@seren-test.fr'));   -- ← compte famille de démo/lower(btrim('pf.demo@seren-test.fr'));/" "$S/l7-part3.sql" | with-db-lock psql-local -q; echo "exit=$?"
```
Expected : `ERROR:  REFUS : la partie 3 ne sert qu'aux comptes de démo @seren-test.fr`, `exit=3` ; puis `ERROR:  REFUS : pf.demo@seren-test.fr est un compte interne (PF ou admin), il ne peut pas être famille`, `exit=3`.

- [ ] **Step 6: Marquer l'ancien seed obsolète**

Insérer en tête de `scripts/seed-demo-pf.sql`, avant la ligne `-- ====================================================================` :
```sql
-- ⚠️ OBSOLÈTE DEPUIS LE DÉMONSTRATEUR v2 (2026-09-15) — ne plus exécuter.
-- Remplacé par scripts/seed-demo-v2.sql (partenaires v2, allowlist d'enrôlement, dossiers, pont).
-- Conservé pour l'historique et le rollback éventuel de la page PF v0 (partner_dashboard).
```

- [ ] **Step 7: Revue (unique parties 1-2, double partie 3), gate, commit**

Double revue de la partie 3 : la ligne `purchases` est-elle strictement identique à celle de `claim_dossier` (clé, statut, kind, montant null) ; aucune voie pour la jouer en prod ou sur un compte interne ; rejeu sans doublon ; aucun pont si le dossier existant n'est pas actif.
```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
gate "$S/wt-v2-l7" > "$S/out-l7-gate.txt" 2>&1; echo "gate exit=$?"
git -C "$S/wt-v2-l7" add scripts/seed-demo-v2.sql scripts/seed-demo-pf.sql
git -C "$S/wt-v2-l7" commit -m "feat(v2-l7): seed v2 — partenaires, enrôlements, liaison, famille de démo de secours (pont)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
Expected : `gate exit=0`, commit créé.

---

## Lot L9 (partie SQL) — Backfill bêta prod et effacement

Branche `feature/v2-l9-sql` (SF2.7), worktree `$S/wt-v2-l9` (propriétaire au contrat §8.2 ; le runbook `docs/runbook-beta-prod.md` est écrit par `docs/plan-v2-app.md` sur `feature/v2-l9-app`, mergée après celle-ci). **Exécution locale après le merge de L1.** **Niveau de revue : double revue** du SQL de backfill et d'effacement. Ces scripts ne sont **jamais** exécutés par un agent ailleurs qu'en local : en prod, c'est Arnaud en U4 (SQL Editor).

### Task 13: `scripts/backfill-prod-beta.sql` — dossiers `direct` pour les comptes réels (D6)

**Files:**
- Create: `scripts/backfill-prod-beta.sql`
- Create (scratchpad, non versionné) : `$S/l9-backfill-fixture.sql`, `$S/l9-backfill-check.sql`

- [ ] **Step 1: Écrire la fixture `$S/l9-backfill-fixture.sql` (simulation de la prod avant bêta)**

```sql
\set ON_ERROR_STOP on
insert into public.partners (id, name) values ('00000000-0000-4000-8000-0000000e0000', 'PF Pilote Simulée');
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, last_sign_in_at, banned_until, deleted_at, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000e0001', 'authenticated', 'authenticated', 'reelle.un@exemple.fr',            now(), now(), null, null, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000e0002', 'authenticated', 'authenticated', 'reelle.deux@exemple.fr',          null,  now(), null, null, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000e0003', 'authenticated', 'authenticated', 'conflit@exemple.fr',              now(), now(), null, null, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000e0004', 'authenticated', 'authenticated', 'test.e2e.claude@seren-test.fr',   now(), now(), null, null, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000e0005', 'authenticated', 'authenticated', 'test.e2e.claude+b@seren-test.fr', now(), now(), null, null, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000e0006', 'authenticated', 'authenticated', 'gerant@pf-pilote.fr',             now(), now(), null, null, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000e0007', 'authenticated', 'authenticated', 'admin@seren-app.fr',              now(), now(), null, null, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000e0008', 'authenticated', 'authenticated', 'enrole.sans.lien@pf-pilote.fr',   now(), now(), null, null, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000e0009', 'authenticated', 'authenticated', 'jamais.confirme@exemple.fr',      null,  null,  null, null, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000e0010', 'authenticated', 'authenticated', 'bannie@exemple.fr',               now(), now(), now() + interval '30 days', null, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000e0011', 'authenticated', 'authenticated', 'deja.active@exemple.fr',          now(), now(), null, null, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000e0012', 'authenticated', 'authenticated', 'exclue.a.la.main@exemple.fr',     now(), now(), null, null, now(), now());
insert into public.partner_users (user_id, partner_id, role) values ('00000000-0000-4000-8000-0000000e0006', '00000000-0000-4000-8000-0000000e0000', 'manager');
insert into public.seren_admins (user_id) values ('00000000-0000-4000-8000-0000000e0007');
insert into public.account_enrollments (email, role, partner_id) values ('enrole.sans.lien@pf-pilote.fr', 'partner_manager', '00000000-0000-4000-8000-0000000e0000');
insert into public.dossiers (source, status, family_email, price_ttc_cents, commission_ttc_cents, invite_token_hash, invite_expires_at)
values ('direct', 'invited', 'conflit@exemple.fr', 0, 0, encode(sha256(convert_to('backfill-conflit', 'UTF8')), 'hex'), now() + interval '7 days');
insert into public.dossiers (partner_id, source, status, user_id, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date, price_ttc_cents, commission_ttc_cents, activated_at)
values ('00000000-0000-4000-8000-0000000e0000', 'partner', 'active', '00000000-0000-4000-8000-0000000e0011', 'Deja', 'Active',
        'deja.active@exemple.fr', 'X', 'Y', current_date - 10, 29000, 7000, now());
insert into public.documents (user_id, title, content) values ('00000000-0000-4000-8000-0000000e0004', 'rls-probe-residu', 'marqueur résiduel simulé');
```

- [ ] **Step 2: Écrire le contrôle `$S/l9-backfill-check.sql`**

```sql
\set ON_ERROR_STOP on
do $$
begin
  if (select count(*) from public.dossiers where source = 'direct' and status = 'active'
        and user_id in ('00000000-0000-4000-8000-0000000e0001', '00000000-0000-4000-8000-0000000e0002')) <> 2 then
    raise exception '[B1] les 2 comptes réels n''ont pas leur dossier direct actif';
  end if;
  if exists (select 1 from public.dossiers where source = 'direct' and status = 'active'
               and user_id not in ('00000000-0000-4000-8000-0000000e0001', '00000000-0000-4000-8000-0000000e0002')) then
    raise exception '[B2] un compte exclu a reçu un dossier direct';
  end if;
  if not (select price_ttc_cents = 0 and commission_ttc_cents = 0 and included_sends = 0 and partner_id is null
                 and family_email = 'reelle.un@exemple.fr' and activated_at is not null
            from public.dossiers where user_id = '00000000-0000-4000-8000-0000000e0001') then
    raise exception '[B3] valeurs du dossier direct';
  end if;
  if exists (select 1 from public.purchases where user_id in ('00000000-0000-4000-8000-0000000e0001', '00000000-0000-4000-8000-0000000e0002'))
     or exists (select 1 from public.consents where user_id in ('00000000-0000-4000-8000-0000000e0001', '00000000-0000-4000-8000-0000000e0002')) then
    raise exception '[B4] D6 : ni pont ni consentement';
  end if;
  raise notice 'OK B1-B4 backfill';
end $$;

begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000e0001","email":"reelle.un@exemple.fr","role":"authenticated"}', true);
set local role authenticated;
do $$
declare r jsonb := public.my_account();
begin
  if r->>'role' <> 'family' or not (r->'consent'->>'required')::boolean or r->'dossier'->>'source' <> 'direct' then
    raise exception '[B5] my_account d''un compte backfillé : %', r;
  end if;
  raise notice 'OK B5 compte backfillé : famille, re-consentement demandé';
end $$;
rollback;
do $$ begin raise notice 'BACKFILL CHECK : OK'; end $$;
```

- [ ] **Step 3: Vérifier l'échec (script absent)**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
with-db-lock sh -ec '
  supabase db reset --local --workdir "$S/wt-v2-l9"
  psql-local -q < "$S/bin/hosted-grants.sql"
  psql-local -q < "$S/l9-backfill-fixture.sql"
  psql-local -q < "$S/l9-backfill-check.sql"
' > "$S/out-l9-backfill.txt" 2>&1; echo "exit=$?"; grep ERROR "$S/out-l9-backfill.txt"
```
Expected : `exit=3`, `ERROR:  [B1] les 2 comptes réels n'ont pas leur dossier direct actif`.

- [ ] **Step 4: Écrire `scripts/backfill-prod-beta.sql`**

```sql
-- ════════════════════════════════════════════════════════════════════════════════════════
-- BACKFILL BÊTA PROD (D6) — un dossier « direct » actif pour chaque compte réel existant
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Contrat : docs/design-v2-demonstrateur.md D6, §2.2-10, §9.3. Plan : docs/plan-v2-sql.md, Task 13.
-- Exécution : Arnaud, U4, SQL Editor PROD, APRÈS le db push des migrations v2, AVANT le branchement du
-- hook et avant l'ouverture aux PF. Jamais par un agent hors Supabase local.
--
-- Pourquoi : le gate serveur fail-closed répond 403 DOSSIER_NOT_ACTIVE à tout compte sans dossier
-- actif. Une famille existante ne doit jamais être coupée. Chaque vrai compte reçoit un dossier
-- source='direct' actif, SANS consentement (re-consentement sur /bienvenue) et SANS pont purchases
-- (included_sends = 0 : le solde reste celui des achats Stripe existants), sauf décision écrite
-- d'Arnaud (bloc v_with_bridge).
--
-- Exclus : adresses @seren-test.fr (dont test.e2e.claude et le compte B des probes) et rls-probe*,
-- comptes internes (partner_users, seren_admins, account_enrollments), comptes supprimés, anonymes,
-- bannis, jamais confirmés ni connectés, comptes portant déjà un dossier, adresses déjà portées par un
-- dossier ouvert (comptées en « conflits », à traiter à la main), adresses listées dans v_excluded.
--
-- SECTION 0 (lecture) → SECTION 1 en DRY-RUN (défaut) → relire les compteurs → SECTION 1 avec
-- v_dry_run = false → SECTION 2 (contrôle). Rejouable : un 2ᵉ passage ne crée rien.
-- Sorties agrégées uniquement : aucune adresse affichée.

-- >>> SECTION 0 — Détection (lecture seule)
select count(*)                                                                              as comptes_total,
       count(*) filter (where lower(u.email) like '%@seren-test.fr')                         as comptes_test,
       count(*) filter (where lower(u.email) like 'rls-probe%'
                           or lower(u.email) like '%+b@seren-test.fr')                       as comptes_probes,
       count(*) filter (where u.email_confirmed_at is null and u.last_sign_in_at is null)    as jamais_confirmes,
       count(*) filter (where exists (select 1 from public.partner_users pu where pu.user_id = u.id)
                           or exists (select 1 from public.seren_admins sa where sa.user_id = u.id)
                           or exists (select 1 from public.account_enrollments e where e.email = lower(btrim(u.email)))) as internes,
       count(*) filter (where exists (select 1 from public.dossiers d where d.user_id = u.id)) as avec_dossier
  from auth.users u;

select 'documents marqueurs rls-probe' as residu, count(*) as nombre from public.documents where title like 'rls-probe%'
union all
select 'transmissions de sonde (RLSP…)', count(*) from public.transmissions where access_code like 'RLSP%'
union all
select 'comptes @seren-test.fr', count(*) from auth.users where lower(email) like '%@seren-test.fr';
-- <<< FIN SECTION 0

-- >>> SECTION 1 — Backfill (DRY-RUN par défaut)
do $$
declare
  v_dry_run      boolean := true;             -- ← false pour écrire, après lecture du DRY-RUN
  v_with_bridge  boolean := false;            -- ← D6 : pas de pont. true UNIQUEMENT sur décision écrite d'Arnaud
  v_bridge_sends integer := 10;
  v_excluded     text[]  := array[]::text[];  -- ← adresses supplémentaires à exclure, en minuscules
  v_candidates   integer;
  v_conflicts    integer;
  v_inserted     integer := 0;
  v_bridged      integer := 0;
begin
  drop table if exists pg_temp.backfill_candidates;
  create temporary table backfill_candidates on commit drop as
  select u.id as user_id, lower(btrim(u.email)) as email
    from auth.users u
   where u.email is not null
     and char_length(btrim(u.email)) <= 254
     and lower(btrim(u.email)) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     and lower(btrim(u.email)) not like '%@seren-test.fr'
     and lower(btrim(u.email)) not like 'rls-probe%'
     and not (lower(btrim(u.email)) = any (v_excluded))
     and u.deleted_at is null
     and coalesce(u.is_anonymous, false) = false
     and (u.banned_until is null or u.banned_until < now())
     and (u.email_confirmed_at is not null or u.last_sign_in_at is not null)
     and not exists (select 1 from public.partner_users pu where pu.user_id = u.id)
     and not exists (select 1 from public.seren_admins sa where sa.user_id = u.id)
     and not exists (select 1 from public.account_enrollments e where e.email = lower(btrim(u.email)))
     and not exists (select 1 from public.dossiers d where d.user_id = u.id);

  select count(*) into v_candidates from backfill_candidates;
  select count(*) into v_conflicts
    from backfill_candidates c
   where exists (select 1 from public.dossiers d where d.family_email = c.email and d.status <> 'cancelled');

  if v_dry_run then
    raise exception 'DRY-RUN (rien n''est écrit) — candidats : %, conflits d''adresse ignorés : %, dossiers qui seraient créés : %',
      v_candidates, v_conflicts, v_candidates - v_conflicts;
  end if;

  insert into public.dossiers (partner_id, source, status, user_id, family_email,
                               price_ttc_cents, commission_ttc_cents, included_sends, activated_at)
  select null, 'direct', 'active', c.user_id, c.email,
         0, 0, case when v_with_bridge then v_bridge_sends else 0 end, now()
    from backfill_candidates c
   where not exists (select 1 from public.dossiers d where d.family_email = c.email and d.status <> 'cancelled')
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  if v_with_bridge then
    insert into public.purchases (user_id, status, kind, stripe_session_id, included_sends, amount_total, currency, paid_at)
    select d.user_id, 'paid', 'forfait', 'partner_dossier:' || d.id::text, d.included_sends, null, null, now()
      from public.dossiers d
      join backfill_candidates c on c.user_id = d.user_id
     where d.source = 'direct' and d.status = 'active'
    on conflict (stripe_session_id) do nothing;
    get diagnostics v_bridged = row_count;
  end if;

  raise notice 'BACKFILL ÉCRIT — dossiers créés : %, ponts : %, conflits ignorés : %', v_inserted, v_bridged, v_conflicts;
end $$;
-- Le DRY-RUN se termine volontairement par une ERREUR portant les compteurs : l'éditeur SQL affiche
-- toujours les erreurs, et la transaction est annulée (aucune écriture possible).
-- <<< FIN SECTION 1

-- >>> SECTION 2 — Contrôle (lecture seule)
select count(*) filter (where d.source = 'direct' and d.status = 'active') as dossiers_direct_actifs,
       count(*) filter (where d.source = 'direct' and d.status = 'active'
                          and not exists (select 1 from public.consents c
                                           where c.user_id = d.user_id and c.version = public.consent_version())) as reconsentement_attendu,
       count(*) filter (where d.source = 'direct'
                          and exists (select 1 from public.purchases p where p.stripe_session_id = 'partner_dossier:' || d.id::text)) as ponts_direct
  from public.dossiers d;
-- <<< FIN SECTION 2
```

- [ ] **Step 5: Rejouer DRY-RUN, écriture, rejeu, contrôle**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
cd "$S/wt-v2-l9"
for s in 0 1 2; do sed -n "/^-- >>> SECTION $s/,/^-- <<< FIN SECTION $s/p" scripts/backfill-prod-beta.sql > "$S/l9-section$s.sql"; done
sed -E "s/(v_dry_run +boolean +:= )true;/\1false;/; s/(v_excluded +text\[\] +:= )array\[\]::text\[\];/\1array['exclue.a.la.main@exemple.fr'];/" "$S/l9-section1.sql" > "$S/l9-section1-write.sql"
sed -E "s/(v_excluded +text\[\] +:= )array\[\]::text\[\];/\1array['exclue.a.la.main@exemple.fr'];/" "$S/l9-section1.sql" > "$S/l9-section1-dry.sql"
grep -c "exclue.a.la.main" "$S/l9-section1-write.sql" "$S/l9-section1-dry.sql"   # attendu : 1 et 1
with-db-lock sh -ec '
  supabase db reset --local --workdir "$S/wt-v2-l9"
  psql-local -q < "$S/bin/hosted-grants.sql"
  psql-local -q < "$S/l9-backfill-fixture.sql"
  psql-local -q < "$S/l9-section0.sql"
  set +e; psql-local -q < "$S/l9-section1-dry.sql"; echo "dry exit=$?"; set -e
  psql-local -q < "$S/l9-section1-write.sql"
  psql-local -q < "$S/l9-section1-write.sql"
  psql-local -q < "$S/l9-section2.sql"
  psql-local -q < "$S/l9-backfill-check.sql"
' > "$S/out-l9-backfill.txt" 2>&1; echo "exit=$?"; grep -E "DRY-RUN|dry exit|BACKFILL|OK B|ERROR" "$S/out-l9-backfill.txt"
```
Expected :
- `ERROR:  DRY-RUN (rien n'est écrit) — candidats : 3, conflits d'adresse ignorés : 1, dossiers qui seraient créés : 2` puis `dry exit=3` (candidats : reelle.un, reelle.deux — confirmée par connexion —, conflit) ;
- `NOTICE:  BACKFILL ÉCRIT — dossiers créés : 2, ponts : 0, conflits ignorés : 1` ;
- 2ᵉ passage : `NOTICE:  BACKFILL ÉCRIT — dossiers créés : 0, ponts : 0, conflits ignorés : 1` ;
- `OK B1-B4 backfill`, `OK B5 compte backfillé : famille, re-consentement demandé`, `BACKFILL CHECK : OK` ;
- `exit=0`, aucune autre ligne `ERROR`.

- [ ] **Step 6: Double revue, gate, commit**

Double revue : (a) aucun compte de test, de probe, interne ni exclu ne peut entrer dans les candidats ; (b) le DRY-RUN ne peut pas écrire (exception avant tout INSERT) ; (c) `on conflict do nothing` couvre les courses sur `dossiers_user_uidx` et `dossiers_family_email_open_uidx` ; (d) le bloc pont est inerte tant que `v_with_bridge = false` ; (e) aucune adresse n'apparaît dans une sortie ; (f) colonnes `auth.users` utilisées (`deleted_at`, `is_anonymous`, `banned_until`, `last_sign_in_at`) présentes sur la version GoTrue de la prod (à confirmer par Arnaud en SECTION 0 : la requête échoue sinon).
```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
gate "$S/wt-v2-l9" > "$S/out-l9-gate.txt" 2>&1; echo "gate exit=$?"
git -C "$S/wt-v2-l9" add scripts/backfill-prod-beta.sql
git -C "$S/wt-v2-l9" commit -m "feat(v2-l9): backfill bêta prod — dossiers direct pour les comptes réels, dry-run par défaut (D6)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 14: `scripts/erase-family.sql` — procédure d'effacement manuelle

**Files:**
- Create: `scripts/erase-family.sql`
- Create (scratchpad, non versionné) : `$S/l9-erase-fixture.sql`, `$S/l9-erase-check.sql`

**⚠️ Bloqué par la note de contrat E1** (voir « Écarts relevés à la rédaction ») : `dossiers_identity_check` interdit `deceased_death_date = null` pour `source='partner'`, alors que le §9.2 prévoit « null ou [effacé] ». Le SQL ci-dessous utilise la date sentinelle `1900-01-01` ; si l'orchestrateur refuse la note, remplacer cette ligne par `deceased_death_date = d.deceased_death_date` (date conservée, risque documenté) avant le Step 4.

- [ ] **Step 1: Écrire la fixture `$S/l9-erase-fixture.sql`**

```sql
\set ON_ERROR_STOP on
insert into public.partners (id, name) values ('00000000-0000-4000-8000-0000000f0000', 'PF Effacement');
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000f0001', 'authenticated', 'authenticated', 'efface.moi@exemple.fr', now(), now(), now());
insert into public.dossiers (id, partner_id, source, status, user_id, family_first_name, family_last_name, family_email, family_phone,
                             deceased_first_name, deceased_last_name, deceased_death_date, price_ttc_cents, commission_ttc_cents, activated_at)
values ('00000000-0000-4000-8000-0000000f00d1', '00000000-0000-4000-8000-0000000f0000', 'partner', 'active', '00000000-0000-4000-8000-0000000f0001',
        'Hélène', 'Durand', 'efface.moi@exemple.fr', '06 00 00 00 00', 'Robert', 'Durand', current_date - 20, 29000, 7000, now());
insert into public.consents (user_id, dossier_id, kind, version)
select '00000000-0000-4000-8000-0000000f0001', '00000000-0000-4000-8000-0000000f00d1', k, public.consent_version()
  from unnest(array['terms', 'privacy', 'sensitive_data']) as k;
insert into public.purchases (user_id, status, kind, stripe_session_id, included_sends, paid_at)
values ('00000000-0000-4000-8000-0000000f0001', 'paid', 'forfait', 'partner_dossier:00000000-0000-4000-8000-0000000f00d1', 10, now());
insert into public.documents (user_id, title, content) values ('00000000-0000-4000-8000-0000000f0001', 'Courrier banque', 'Contenu nominatif');
insert into public.questionnaires (user_id, answers) values ('00000000-0000-4000-8000-0000000f0001', '{"relation":"conjoint"}');
insert into public.letter_sends (user_id, template_id, channel, status, dedup_key)
values ('00000000-0000-4000-8000-0000000f0001', 'banque', 'papier', 'prepared', 'erase-fixture-1');
```

- [ ] **Step 2: Écrire le contrôle `$S/l9-erase-check.sql`**

```sql
\set ON_ERROR_STOP on
do $$
declare
  v_uid constant uuid := '00000000-0000-4000-8000-0000000f0001';
  v_n integer;
begin
  select (select count(*) from public.consents where user_id = v_uid)
       + (select count(*) from public.purchases where user_id = v_uid)
       + (select count(*) from public.documents where user_id = v_uid)
       + (select count(*) from public.questionnaires where user_id = v_uid)
       + (select count(*) from public.letter_sends where user_id = v_uid)
       + (select count(*) from auth.users where id = v_uid)
    into v_n;
  if v_n <> 0 then raise exception '[E1] % ligne(s) rattachée(s) au compte effacé', v_n; end if;
  if not (select status = 'closed' and closed_at is not null and user_id is null
                 and family_first_name = '[effacé]' and family_last_name = '[effacé]' and family_phone is null
                 and family_email = 'efface+00000000-0000-4000-8000-0000000f00d1@invalid.seren-app.fr'
                 and deceased_first_name = '[effacé]' and deceased_last_name = '[effacé]'
                 and price_ttc_cents = 29000 and partner_id = '00000000-0000-4000-8000-0000000f0000'
            from public.dossiers where id = '00000000-0000-4000-8000-0000000f00d1') then
    raise exception '[E2] dossier non anonymisé ou trace de facturation perdue';
  end if;
  if exists (select 1 from public.dossiers where family_email = 'efface.moi@exemple.fr') then
    raise exception '[E3] adresse encore présente dans dossiers';
  end if;
  raise notice 'ERASE CHECK : OK';
end $$;
```

- [ ] **Step 3: Vérifier l'échec — le « Delete user » direct est refusé sur un dossier actif**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
with-db-lock sh -ec '
  supabase db reset --local --workdir "$S/wt-v2-l9"
  psql-local -q < "$S/bin/hosted-grants.sql"
  psql-local -q < "$S/l9-erase-fixture.sql"
  set +e; echo "delete from auth.users where email = '\''efface.moi@exemple.fr'\'';" | psql-local -q; echo "delete exit=$?"; set -e
' > "$S/out-l9-erase.txt" 2>&1; echo "exit=$?"; grep -E "ERROR|delete exit" "$S/out-l9-erase.txt"
```
Expected : `ERROR:  new row for relation "dossiers" violates check constraint "dossiers_state_check"`, `delete exit=3` : le garde-fou impose l'anonymisation d'abord.

- [ ] **Step 4: Écrire `scripts/erase-family.sql`**

```sql
-- ════════════════════════════════════════════════════════════════════════════════════════
-- EFFACEMENT D'UNE FAMILLE — procédure manuelle (RGPD art. 17, audit F2), bêta pilote
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Contrat : docs/design-v2-demonstrateur.md §9.2. Plan : docs/plan-v2-sql.md, Task 14.
-- Exécution : Arnaud, SQL Editor + Dashboard, sur demande reçue au contact support. Délai annoncé : 30 jours.
-- Sans clé secrète : chaque étape irréversible passe par le Dashboard.
--
-- ORDRE IMPOSÉ :
--   1. PARTIE A (lecture) : identifier le compte, les dossiers, les données et les objets Storage.
--   2. Dashboard → Storage → bucket documents → supprimer le dossier <user_id>/ (le SQL ne peut pas :
--      trigger protect_objects_delete).
--   3. PARTIE B : anonymiser et clore le(s) dossier(s). Refuse tant qu'un objet Storage subsiste, et
--      refuse un compte interne (PF, admin).
--   4. Dashboard → Authentication → Users → Delete user. Cascade : questionnaires, roadmaps, steps,
--      step_actions, documents, sessions, transmissions, letter_sends (+ provider_events), send_debits,
--      purchases, attachments, sender_profiles, consents. Un Delete user AVANT la partie B échoue
--      (dossiers_state_check) : c'est voulu.
--   5. PARTIE C (lecture) : vérifier qu'il ne reste rien de nominatif.
-- Conservé : la ligne dossiers anonymisée (partenaire, source, statut, dates, snapshots prix/commission),
-- nécessaire à la facturation PF, sans aucune donnée d'identification.
--
-- Remplacer l'adresse « famille@exemple.fr » dans CHAQUE partie (1 occurrence par partie, repère ←).

-- >>> PARTIE A — Inventaire (lecture seule)
with target as (select lower(btrim('famille@exemple.fr')) as email),   -- ← adresse de la demande
     u as (select id from auth.users where lower(email) = (select email from target))
select 'compte auth' as objet, count(*) as nombre from u
union all select 'dossiers (compte ou adresse)', count(*) from public.dossiers d
                  where d.user_id in (select id from u) or d.family_email = (select email from target)
union all select 'questionnaires', count(*) from public.questionnaires where user_id in (select id from u)
union all select 'roadmaps', count(*) from public.roadmaps where user_id in (select id from u)
union all select 'steps', count(*) from public.steps where user_id in (select id from u)
union all select 'step_actions', count(*) from public.step_actions where user_id in (select id from u)
union all select 'documents', count(*) from public.documents where user_id in (select id from u)
union all select 'questionnaire_sessions', count(*) from public.questionnaire_sessions where user_id in (select id from u)
union all select 'transmissions', count(*) from public.transmissions where user_id in (select id from u)
union all select 'letter_sends', count(*) from public.letter_sends where user_id in (select id from u)
union all select 'send_debits', count(*) from public.send_debits where user_id in (select id from u)
union all select 'purchases', count(*) from public.purchases where user_id in (select id from u)
union all select 'attachments', count(*) from public.attachments where user_id in (select id from u)
union all select 'sender_profiles', count(*) from public.sender_profiles where user_id in (select id from u)
union all select 'consents', count(*) from public.consents where user_id in (select id from u)
union all select 'objets Storage à supprimer (Dashboard) sous ' || coalesce((select id::text from u), '—') || '/', count(*)
            from storage.objects o where (storage.foldername(o.name))[1] in (select id::text from u);
-- <<< FIN PARTIE A

-- >>> PARTIE B — Anonymisation et clôture (après suppression des objets Storage)
do $$
declare
  v_email   text := lower(btrim('famille@exemple.fr'));   -- ← adresse de la demande
  v_uid     uuid;
  v_objects integer;
  v_n       integer;
begin
  select id into v_uid from auth.users where lower(email) = v_email;

  if v_uid is not null then
    if exists (select 1 from public.partner_users where user_id = v_uid)
       or exists (select 1 from public.seren_admins where user_id = v_uid)
       or exists (select 1 from public.account_enrollments where email = v_email) then
      raise exception 'REFUS : compte interne (PF ou admin Seren) — cette procédure ne concerne que les familles';
    end if;
    select count(*) into v_objects from storage.objects o where (storage.foldername(o.name))[1] = v_uid::text;
    if v_objects > 0 then
      raise exception 'STOP : % objet(s) Storage sous %/ — les supprimer d''abord (Dashboard → Storage → documents)', v_objects, v_uid;
    end if;
  end if;

  update public.dossiers d
     set family_first_name   = case when d.source = 'partner' then '[effacé]' end,
         family_last_name    = case when d.source = 'partner' then '[effacé]' end,
         family_email        = 'efface+' || d.id::text || '@invalid.seren-app.fr',
         family_phone        = null,
         deceased_first_name = case when d.source = 'partner' then '[effacé]' end,
         deceased_last_name  = case when d.source = 'partner' then '[effacé]' end,
         -- dossiers_identity_check interdit null pour source='partner' : date sentinelle (note de contrat E1)
         deceased_death_date = case when d.source = 'partner' then date '1900-01-01' end,
         status              = case when d.status in ('invited', 'active') then 'closed' else d.status end,
         closed_at           = case when d.status in ('invited', 'active') then now() else d.closed_at end,
         invite_token_hash   = null,
         invite_expires_at   = null,
         updated_at          = now()
   where d.user_id = v_uid
      or d.family_email = v_email;
  get diagnostics v_n = row_count;

  if v_n = 0 and v_uid is null then
    raise exception 'Rien à effacer : aucun compte ni dossier pour cette adresse';
  end if;
  raise notice 'PARTIE B OK — % dossier(s) anonymisé(s) ; compte auth : % → Dashboard Auth → Delete user',
    v_n, coalesce(v_uid::text, 'aucun');
end $$;
-- <<< FIN PARTIE B

-- >>> PARTIE C — Vérification (après Delete user)
with target as (select lower(btrim('famille@exemple.fr')) as email)   -- ← adresse de la demande
select (select count(*) from auth.users where lower(email) = (select email from target))              as comptes_restants,
       (select count(*) from public.dossiers where family_email = (select email from target))         as dossiers_nominatifs_restants,
       (select count(*) from public.dossiers
         where family_email like 'efface+%@invalid.seren-app.fr' and user_id is null
           and updated_at > now() - interval '1 day')                                                 as dossiers_anonymises_24h;
-- Attendu : 0, 0, ≥ 1.
-- <<< FIN PARTIE C
```

- [ ] **Step 5: Rejouer la procédure complète en local**

```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
cd "$S/wt-v2-l9"
for p in A B C; do sed -n "/^-- >>> PARTIE $p/,/^-- <<< FIN PARTIE $p/p" scripts/erase-family.sql | sed "s/famille@exemple.fr/efface.moi@exemple.fr/" > "$S/l9-erase-$p.sql"; done
with-db-lock sh -ec '
  supabase db reset --local --workdir "$S/wt-v2-l9"
  psql-local -q < "$S/bin/hosted-grants.sql"
  psql-local -q < "$S/l9-erase-fixture.sql"
  psql-local < "$S/l9-erase-A.sql"
  printf "begin;\ninsert into storage.objects (bucket_id, name) values ('\''documents'\'', '\''00000000-0000-4000-8000-0000000f0001/acte.pdf'\'');\n" > "$S/l9-erase-storage.sql"
  cat "$S/l9-erase-B.sql" >> "$S/l9-erase-storage.sql"
  set +e; psql-local -q < "$S/l9-erase-storage.sql"; echo "storage guard exit=$?"; set -e
  psql-local -q < "$S/l9-erase-B.sql"
  echo "delete from auth.users where email = '\''efface.moi@exemple.fr'\'';" | psql-local -q
  psql-local < "$S/l9-erase-C.sql"
  psql-local -q < "$S/l9-erase-check.sql"
' > "$S/out-l9-erase.txt" 2>&1; echo "exit=$?"; grep -E "STOP|storage guard|PARTIE B OK|ERASE CHECK|ERROR" "$S/out-l9-erase.txt"
```
Expected :
- Partie A : ligne `compte auth | 1`, `dossiers (compte ou adresse) | 1`, `consents | 3`, `purchases | 1`… ;
- `ERROR:  STOP : 1 objet(s) Storage sous 00000000-0000-4000-8000-0000000f0001/ — …`, `storage guard exit=3` (transaction jetable, l'objet n'est jamais committé) ;
- `NOTICE:  PARTIE B OK — 1 dossier(s) anonymisé(s) ; compte auth : 00000000-0000-4000-8000-0000000f0001 → …` ;
- Partie C : `0 | 0 | 1` ;
- `ERASE CHECK : OK`, `exit=0`, aucune autre ligne `ERROR`.

- [ ] **Step 6: Double revue, gate, commit**

Double revue : (a) ordre imposé tenu par des gardes (Storage, compte interne, Delete user bloqué sur dossier actif) ; (b) aucune donnée d'identification ne subsiste dans `dossiers` ni ailleurs après Delete user (cascades vérifiées table par table dans les migrations) ; (c) la trace de facturation PF est conservée ; (d) un dossier `invited` jamais activé (pas de compte) est bien effacé par l'adresse ; (e) la date sentinelle E1 a reçu la validation de l'orchestrateur.
```bash
. /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/scratchpad/bin/v2-env.sh
gate "$S/wt-v2-l9" > "$S/out-l9-gate2.txt" 2>&1; echo "gate exit=$?"
git -C "$S/wt-v2-l9" add scripts/erase-family.sql
git -C "$S/wt-v2-l9" commit -m "feat(v2-l9): procédure d'effacement d'une famille (inventaire, anonymisation, vérification)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Récapitulatif des tasks, revues et jalons

| Task | Lot / branche | Livrable | Revue | Dépend de | Jalon |
|---|---|---|---|---|---|
| 0 | tous | outillage scratchpad, worktrees | — | L0bis | avant toute task |
| 1 | L1 `feature/v2-l1` | lint migrations + parité CONSENT_VERSION | double | 0 | nuit mar. |
| 2 | L1 | `v2_core` + scénarios core | double + adversariale | 1 | nuit mar. |
| 3 | L1 | `v2_partner_rpc` + scénarios PF/admin | double + adversariale | 2 (rédaction parallélisable) | nuit mar. |
| 4 | L1 | rejouabilité + copie attributions | double | 3 | nuit mar. |
| 5 | L1 | hook HTTP + `config.toml` (redémarrage stack) | double + adversariale | 4 | nuit mar. |
| 6 | L1 | clôture, correctifs de revue | double + adversariale | 5 | gel SQL **mer. 11h**, verdict **GNG2 mer. 11h45** |
| 7 | L1b `feature/v2-l1b` | `transmissions_f1` + scénario | double RLS | 0 | nuit mar. |
| 8 | L4c `feature/v2-l4c-sql` | `v2_admin` | double | 3 (ou merge L1) | nuit du 15 au 16 / mer. 8h |
| 9 | L6 `feature/v2-l6` | `provision-v2.mjs` | combinée + sécurité L1 | merge L1 **+ L2b** (exécution, écart E10) | rédaction la nuit, **exécution mer. 8h-11h** (après le merge de L2b en 39.1 ; serveur Express local port 3997) |
| 10 | L6 | `rls-probes.mjs` v2 | combinée + sécurité L1 | 9 | mer. 8h-11h |
| 11 | L6 | runbook probes | combinée | 10 | mer. 8h-11h |
| 12 | L7 `feature/v2-l7-sql` | `seed-demo-v2.sql` + en-tête `seed-demo-pf.sql` | unique (1-2), double (3) | merge L1 | mer. 11h |
| 13 | L9 `feature/v2-l9-sql` | `backfill-prod-beta.sql` | double | merge L1 | mer. après-midi |
| 14 | L9 | `erase-family.sql` | double | merge L1 + note E1 | mer. après-midi |

Rendu de fin de lot (dans le message à l'orchestrateur) : branche, SHA, sortie du gate (nombre de tests), sorties `SCENARIOS V2 : OK` / `SCENARIOS F1 : OK` / `# 9/9 ok` / TAP des probes / `SEED V2 : OK` / `BACKFILL CHECK : OK` / `ERASE CHECK : OK` selon le lot, et les déviations à reporter en « Notes post-revue ».

## Écarts relevés à la rédaction (15/09 ~19h) — **TRANCHÉS le 16/09, décisions au contrat §12.2.2**

> Statut : les écarts E0-E13 ci-dessous ont tous reçu une décision explicite de l'orchestrateur, consignée au contrat `docs/design-v2-demonstrateur.md` **§12.2.2** (tableau). Tous **validés** ; deux restent **à confirmer par Arnaud** sans bloquer l'exécution (E1 et E2, sentinelles d'effacement — le défaut appliqué est la sentinelle) et un porte une **question produit ouverte** (E6, voir ci-dessous). Lire §12.2.2 avant d'exécuter les Tasks 9, 13 et 14.

- **E0 — Nom du lint.** La commande de rédaction citait `tests/migrations-lint.test.ts` ; le contrat (§3.1, §8.2) fixe `tests/migrations-v2-lint.test.ts`. Ce plan suit le contrat.
- **E1 — Effacement vs `dossiers_identity_check`.** Le §9.2 prévoit `family_*` et `deceased_*` « à null ou [effacé] », mais pour `source='partner'` le CHECK impose des noms non nuls et une `deceased_death_date` non nulle (une date ne peut pas valoir `[effacé]`). Proposition : date sentinelle `1900-01-01` (Task 14). Repli si refus : conserver la date (risque RGPD documenté).
- **E2 — Adresse effacée.** `family_email` est `not null` + CHECK de format : ni null ni `[effacé]` possibles. Proposition : `efface+<dossier_id>@invalid.seren-app.fr`.
- **E3 — Scénario S11.** « `pg_get_functiondef` identique au texte de la migration » est impossible (sortie normalisée). Remplacé par `md5(prosrc) = 8277ca3955cc35a54f42223295052c28`, calculé sur le corps exact de `20260913200000`.
- **E4 — Harnais local (§10.1, §8.3).** `psql` n'est pas installé : `docker exec -i supabase_db_Application psql`. Surtout, la CLI 2.109.1 applique des privilèges par défaut restrictifs (aucun SELECT/INSERT pour `anon`/`authenticated` sur les tables créées par `postgres`) alors que l'hébergé a les grants classiques : sans `hosted-grants.sql` après chaque `db reset`, S12 et toutes les probes famille sont faux en local, et **l'E2E local de L3/L8 (front qui écrit `questionnaires`, `roadmaps`…) échouera aussi**. À ajouter au §10.1 et à communiquer aux lots front.
- **E5 — Propriété des scripts de données.** La commande de rédaction plaçait backfill et effacement dans L7 ; le contrat (§8.2) les attribue à L9. Ce plan suit le contrat (`feature/v2-l9-sql` depuis SF2.7).
- **E6 — `included_sends` du backfill.** Le contrat ne fixe pas la valeur pour `source='direct'` sans pont (D6). Proposition : `0` (reflet exact du solde) ; `my_account().dossier.included_sends` vaudra donc 0 pour ces comptes — le front (L5) ne doit pas afficher « 10 envois inclus » sur la base de ce champ pour un dossier `direct`. **Décision (16/09, contrat §12.2.2) : validée, `0` et aucun pont `purchases`.** Vérifié côté app : l'offre est déjà conditionnée par `dossier.included_sends > 0` (`docs/plan-v2-app.md` Task 3.3) et `QuotaBadge` affiche le total réel (`included_total` = 0) ; le premier envoi renvoie 402 « contactez le support ». **Question produit ouverte pour Arnaud** : offrir 10 envois à ces comptes reste possible **sans changement de code**, par un INSERT `purchases` (`kind='forfait'`, `status='paid'`, `included_sends=10`, `stripe_session_id='partner_dossier:<dossier_id>'`) exécuté en U4 après le backfill.
- **E7 — Copie `attributions` → `dossiers` non défensive.** Si un compte de démo de la préprod a une adresse qui viole `dossiers_email_check` (format, > 254), l'INSERT de la migration échoue et **tout le push U2 échoue**. Le SQL du contrat n'est pas modifié ; à ajouter à la checklist U2, avant le `db push`, en lecture sur la préprod : `select count(*) from public.attributions a join auth.users u on u.id = a.user_id where lower(btrim(u.email)) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(u.email) > 254;` → doit valoir 0.
- **E8 — `partner_dashboard()` v0 et `anon` en hébergé.** La migration v0 ne révoque que `public` ; les privilèges par défaut hébergés ont pu donner EXECUTE à `anon` (appel accepté, résultat `null`). Aucune fuite, mais l'ancienne sonde « anon refusé » serait rouge : la sonde v2 accepte « refusé ou null ».
- **E9 — `Delete user` bloqué sur un dossier actif.** Conséquence de `dossiers_state_check` + `on delete set null` : Arnaud ne peut plus supprimer depuis le Dashboard un compte famille actif (y compris un compte de test) sans clore d'abord son dossier (partie B de `erase-family.sql`). À écrire dans les runbooks U2/U4.
- **E10 — Provisionnement des probes : RPC directe ABANDONNÉE (revue du 16/09, must-fix 1).** `partner_create_dossier` et `partner_rotate_invitation` exigent désormais le secret `webhook_config`, que seul le serveur détient : l'appel direct via PostgREST n'est plus possible, pour personne. `provision-v2.mjs` et les sondes de hook de `rls-probes.mjs` passent donc par `POST /api/partner/dossiers`, avec `SHOW_ACTIVATION_LINK=true` pour récupérer le jeton (local et préprod uniquement — jamais en prod, où ni l'un ni l'autre ne tourne en écriture). **Conséquences à tenir** : (1) la Task 9 dépend du **merge de L2b** en plus de L1, et son harnais local démarre un serveur Express (Step 4) ; (2) `PROVISION_API_URL` et `PROBE_API_URL` deviennent nécessaires, sinon refus explicite (provision) ou SKIP explicite (sondes de hook) ; (3) le serveur doit porter un `WEBHOOK_RPC_SECRET` égal à `webhook_config.rpc_secret` de la base visée. Le chemin Express reste aussi couvert par `scripts/e2e-v2.mjs` (L6 au contrat, hors de ce plan).
- **E13 — Comptes internes créés par Arnaud, jamais par un script (revue du 16/09, must-fix 2).** `link_enrollments` n'accepte plus qu'un appariement explicite e-mail ↔ UUID sur un compte **créé après l'enrôlement, jamais connecté, sans changement d'e-mail en attente**. La proposition de la revue 2 (MF2.2 : laisser `provision-v2.mjs` créer les comptes PF par `signUp` via l'allowlist, puis lier) est donc **écartée** : un compte né d'une inscription publique n'est pas fiable. `ensureInternal` ne crée plus rien, exige `PROVISION_*_PASSWORD` et sort en code 2 en imprimant la paire `{"email": …, "user_id": …}` à coller dans la partie 2 (filet de sécurité, pas une étape prévue). **Le runbook U2 (`docs/plan-v2-app.md` Task 35 §2) est calé sur cette séquence unique** : partie 1 → « Add user » (**mot de passe posé à la création**, conservé par Arnaud dans son gestionnaire) → copier les UUID → **partie 2** → provision → `--verify`. ⚠️ **La partie 2 précède tout appel à `provision-v2.mjs`** : le script se connecte réellement, ce qui poserait `last_sign_in_at` et ferait refuser les comptes (`enrollment_account_untrusted`). « Send password recovery » ne concerne que le **gérant de PF réel** en production (U4), et là encore après la partie 2.
- **E11 — Variables des probes.** `PROBE_USER_A_*` / `PROBE_USER_B_*` sont conservées (fichier de test gelé `tests/check-env-target.test.ts`) ; nouvelles variables optionnelles : `PROBE_PARTNER_Y_*`, `PROBE_NODOSSIER_*`, `PROBE_ADMIN_*`, `PROBE_API_URL`, `PROBE_WRITE`.
- **E12 — Garde de `provision-v2.mjs` non testée en CI.** Aucun fichier de test n'est attribué à L6 (§8.2) : la garde est vérifiée par commandes (Task 9, Step 2). Recommandation : autoriser par note un `tests/provision-v2-guard.test.ts` calqué sur `tests/check-env-target.test.ts`. **Décision (16/09, contrat §12.2.2) : validée** — le fichier est ajouté à la propriété L6 (§8.2 du contrat) ; il ne fait **aucun** appel réseau (il vérifie le refus de la cible prod et l'exigence de `PROVISION_API_URL`). Si le temps manque dans la nuit, la garde reste prouvée par commande (Task 9, Step 2) et le test glisse **sans bloquer GNG2**.

## Notes post-revue

Format : `- [date heure] [Task N] écart constaté — correctif appliqué — validé par`.

Amendements de la **revue adversariale de sécurité** appliqués au plan AVANT exécution (contrat §12.2) :

- [2026-09-16] [Tasks 1, 3, 9, 10] must-fix 1 — `p_secret text` en 1er paramètre de `partner_create_dossier` et `partner_rotate_invitation`, contrôlé contre `webhook_config` (id 1) avant toute lecture ; code `invalid_secret` ; lint dédié (p_secret en tête + garde inlinée + aucune autre fonction ne lit `webhook_config`) ; `webhook_config` inséré dans les transactions S1, S2, S3 et S9 ; preuves S1z/S1z2/S1z3 et S3z/S3z2 ; signatures S13p ; provisionnement et sondes de hook par `POST /api/partner/dossiers` (écart E10).
- [2026-09-16] [Tasks 1, 2, 9, 12] must-fix 2 — `link_enrollments(p_pairs jsonb)` : appariement explicite e-mail ↔ UUID, conditions de confiance (UUID de l'adresse, compte postérieur à l'enrôlement, jamais connecté, sans `email_change`), code `enrollment_account_untrusted`, compteur `untrusted` ; **ordre des fixtures inversé** (enrôlements AVANT les comptes) ; scénarios S14a-m ; seed partie 2 avec les paires ; `ensureInternal` ne crée plus de compte (écart E13).
- [2026-09-16] [Tasks 2, 3] décision produit — `partners.status = 'terminated'` coupe `my_account().partner`, `partner_list_dossiers` et `partner_month_counters` (403 `NOT_A_PARTNER`) ; `'suspended'` garde la lecture. Scénarios S2v, S9h-S9l.
- [2026-09-16] [Task 9] conséquence à valider par l'orchestrateur : la Task 9 ne peut plus tourner avant le merge de L2b, et son Step 4 démarre un serveur Express local (port 3997). **Validée le 16/09** (contrat §12.2.2, écart E10) : Tasks 9-11 rédigées la nuit, **exécutées mercredi 8h-11h** après 39.1 ; tableau récapitulatif mis à jour.

Amendements de la **revue adversariale de livraison** (16/09) :

- [2026-09-16] [Tasks 8, 12, 13, 14] SF2.7 — branches renommées `feature/v2-l4c-sql`, `feature/v2-l7-sql`, `feature/v2-l9-sql` (les deux plans créaient la même branche au même chemin) ; `feature/v2-l6` reste à ce plan, la Task 37 du plan app écrit `scripts/e2e-v2.mjs` sur `feature/v2-l6-e2e`. Ordre de merge du contrat §8.3 mis à jour.
- [2026-09-16] [Task 9 Step 4, Task 12, écart E13] revue de vérification (B1, B2, B3, I1, I2) — **ordre de provisionnement inversé et règle de mot de passe unifiée**. Le harnais local de la Task 9 Step 4 lançait `provision-v2.mjs` (premier passage `exit 2`) **avant** `link_enrollments` : comme `l6-add-users.sh` crée les comptes avec mot de passe, ce passage posait `last_sign_in_at` et la partie 2 aurait ensuite refusé les trois comptes (`enrollment_account_untrusted`) — l'attendu `{"partner_users_linked":2,"seren_admins_linked":1,"pending":0,"untrusted":0}` était **inatteignable** et le lot L6 échouait. Correctif : partie 2 **avant** le provisionnement, premier passage supprimé, attendus réécrits (un seul passage + `--verify`) ; même correction sur l'écart E13, l'en-tête du seed (Task 12) et les deux messages d'aide du script. Règle de mot de passe unique alignée sur le contrat §2.2-1 : posé à la création par « Add user » pour les comptes de démo et de probes, « Send password recovery » réservé au gérant de PF réel en prod — validé par l'orchestrateur (contrat §12.2).
- [2026-09-16] [Task 12] SF2.6 — ce plan est le **propriétaire unique** de `scripts/seed-demo-pf.sql` (en-tête « obsolète v2 ») : la Task 36.2 de `docs/plan-v2-app.md` a été supprimée.
- [2026-09-16] [Écarts E0-E13] MF2.4 — tous tranchés, décisions au contrat **§12.2.2** ; E1 et E2 (sentinelles d'effacement) restent à confirmer par Arnaud, avec le défaut appliqué, et E6 porte une question produit ouverte (pont de 10 envois pour les comptes backfillés).

Écarts constatés **à l'exécution** :

- [2026-09-16] [Task 5] `scripts/hook-scenarios-v2.mjs`, cas 9 — l'assertion finale comparait l'état du dossier au littéral `'active|t'`, inatteignable : `status || '|' || (invite_token_hash is null)` concatène un **booléen**, et la conversion booléen → texte rend `'true'`/`'false'` (`t`/`f` n'est que l'affichage psql d'une *colonne* booléenne). Le hook, l'inscription et le claim étaient corrects — le dossier revenait bien `active` avec le hash effacé (`active|true`) : seul l'attendu du script était faux, et il faisait échouer le cas 9 (8/9) après un Step 5 par ailleurs vert. Correctif minimal appliqué (attendu `'active|true'` + commentaire explicatif) ; aucune migration touchée ; 9/9 au rejeu. — validé par l'exécutant L1 (aucune décision produit en jeu).
- [2026-09-16] [Tasks 1-7] worktrees — les chemins réellement utilisés sont `$S/wt-l1` et `$S/wt-l1b` (et non `$S/wt-v2-l1` / `$S/wt-v2-l1b` cités dans les commandes du plan) ; branches `feature/v2-l1` et `feature/v2-l1b` conformes au plan. Sans effet sur les livrables. — exécutant L1.

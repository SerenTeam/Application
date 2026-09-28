# Personnalisation v2 — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** les courriers se remplissent tout seuls (dossier PF + coordonnées saisies une fois), le questionnaire personnalise la roadmap (abonnements, aides perçues, EHPAD) sous le plafond de 15 questions vues, puis une vidéo démo v3 filme le vrai produit.

**Architecture :** `sender_profiles` devient le profil courrier unique (prénom/nom séparés) ; une RPC en lecture seule `my_dossier_identity()` expose au seul titulaire 5 champs d'identité de son dossier PF ; le serveur pré-remplit la session du questionnaire au `/start` ; un module client pur `letter-autofill.ts` calcule les valeurs des courriers, diffusées par un contexte React depuis `DashboardPage`. Le moteur accepte les conditions « au moins une valeur commune » sur les questions à cocher (2 copies, parité testée).

**Tech Stack :** React 18 + TypeScript + Vite, Tailwind v4 (tokens `@theme`), Express (JS), Supabase (Postgres, RLS, RPC security definer), Vitest (environnement node, pas de rendu de composants), Playwright + ffmpeg pour la vidéo.

**Spec :** `docs/design-personnalisation-v2.md` (validée par Arnaud le 2026-09-28). Toute déviation est consignée en « note post-revue » à la fin de la tâche concernée.

---

## Contexte d'exécution (à lire par chaque sous-agent)

- **Worktree** : `/private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/de650efd-f650-47c9-a468-03ee8cd66a83/scratchpad/wt-perso`, branche `feature/v2-personnalisation` (= `integration/v2-demo` rc3 + refonte sidebar). **Ne jamais travailler dans `/Users/arnaudgay/Documents/git/Seren/Application`** (c'est `main`, la prod).
- **Tests** (toujours depuis le worktree) — sans `.env`, 2 variables factices sont obligatoires :
  ```bash
  export VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci_dummy
  npx vitest run            # suite complète — référence de départ : 796 tests / 47 fichiers
  npx tsc --noEmit          # contrôle de types (src + tests), exactement comme la CI
  npm run build             # tsc -b + vite build ; puis : git checkout -- tsconfig.tsbuildinfo
  ```
  `npm run build` réécrit `tsconfig.tsbuildinfo` (fichier suivi) : le restaurer après chaque build, ne jamais le commiter.
- **Conventions** : code en anglais, commentaires en français ; UI bilingue — toute chaîne visible passe par `src/i18n/strings.{fr,en}.ts` (parité des clés imposée par tsc) ; courriers **toujours en français** ; tokens Tailwind du `@theme`, jamais de hex ; primitives `src/components/ui/` ; alias `@/` → `src/`.
- **Base de données** : aucune écriture sur une base distante. `supabase db reset --local` (via `run-sql-checks`) est réservé au contrôleur : Task 1 Step 7 si le harnais existe déjà, Tasks 11 et 13. Le fichier `/Users/arnaudgay/Documents/git/Seren/Application/.env.prod-NE-PAS-UTILISER` ne doit **jamais** être lu, copié ni sourcé.
- **Commits** : un commit par tâche minimum, message au format du dépôt (`feat(perso-v2): …`, `test(perso-v2): …`, `docs(perso-v2): …`), terminé par :
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

## Carte des fichiers

| Fichier | Rôle | Tâche |
|---|---|---|
| `supabase/migrations/20260928120000_sender_profiles_names.sql` (créé) | `first_name`, `last_name` sur `sender_profiles` | 1 |
| `supabase/migrations/20260928121000_v2_dossier_identity.sql` (créé) | RPC `my_dossier_identity()` | 1 |
| `tests/migrations-v2-lint.test.ts` | lint étendu à la nouvelle RPC | 1 |
| `scripts/sql-scenarios-v2.sql` | scénarios d'isolation de la RPC | 1 |
| `server/lib/questionnaire-engine.js`, `src/lib/roadmap-generator.ts` | sémantique « au moins une valeur commune » | 2 |
| `tests/invariants.test.ts` | parité + sémantique des matchers, invariants courriers | 2, 5 |
| `src/types/questionnaire.ts` | contrat : `ehpad`, `aides_percues`, `abonnements`, `deceased_dob` | 3, 4 |
| `server/lib/questions-catalog.js` | 2 questions, option `ehpad`, ordres | 3, 4 |
| `src/data/steps-catalog.{fr,en}.ts`, `src/data/steps-catalog.ts` | 9 étapes créées, 5 modifiées, thème `abonnements` | 3, 4, 5 |
| `src/components/documents/DocumentCard.tsx`, `src/pages/DocumentsPage.tsx` | thème `abonnements` | 4 |
| `src/data/letter-templates.ts`, `server/lib/letter-templates.js`, `server/lib/letter-channels.js` | 5 courriers, `subscriber_number`, ville auto | 5 |
| `server/lib/dossier-prefill.js` (créé), `server/routes/questionnaire.js` | pré-remplissage au `/start`, exclusion rédacteur | 6 |
| `src/lib/relation-labels.ts`, `src/lib/letter-profile.ts`, `src/lib/letter-autofill.ts` (créés) | logique pure + accès Supabase du profil courrier | 7 |
| `src/hooks/useLetterGenerator.ts` | cas `city`, resynchronisation des champs auto | 7 |
| `src/hooks/useLetterProfileContext.ts` (créé) | contexte profil courrier | 8 |
| `src/components/letter/LetterProfileForm.tsx` (créé, remplace `SenderProfileForm.tsx`) | formulaire unique | 8 |
| `src/components/letter/PaperSendPanel.tsx` | branchement du formulaire unique et du contexte | 8 |
| `src/i18n/strings.{fr,en}.ts` | espace `letterProfile`, retrait des clés `paperSend.sender*` | 8 |
| `src/components/questionnaire/CoordinatesScreen.tsx` (créé), `src/pages/QuestionnairePage.tsx` | écran de coordonnées | 9 |
| `src/pages/DashboardPage.tsx`, `src/components/dashboard/RoadmapView.tsx`, `src/pages/ProfilePage.tsx` | branchement, carte de rappel, carte Profil | 10 |
| `$S/bin/*` (scratchpad, hors dépôt), `$WT/.env` (local, ignoré) | harnais SQL local, environnement de recette | 11 |
| `CLAUDE.md`, `docs/design-personnalisation-v2.md` | état du projet, notes post-implémentation | 12 |
| `~/Documents/git/Seren/demo-video/` (hors dépôt) | vidéo v3, chapitres, voix-off | 13 |

---

### Task 0 : Préparation du worktree

**Files :** aucun.

- [ ] **Step 1 : vérifier la branche et l'état**

```bash
cd /private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/de650efd-f650-47c9-a468-03ee8cd66a83/scratchpad/wt-perso
git branch --show-current     # attendu : feature/v2-personnalisation
git status --short            # attendu : vide
git log --oneline -3          # attendu : spec (docs(perso-v2)…), refonte sidebar, merge rc3
```

- [ ] **Step 2 : dépendances (déjà installées au cadrage ; à refaire seulement si `node_modules` manque)**

```bash
test -d node_modules || npm ci --prefer-offline --no-audit --no-fund
```

- [ ] **Step 3 : référence de départ**

```bash
export VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci_dummy
npx vitest run 2>&1 | tail -4
npx tsc --noEmit && echo TSC_OK
```
Attendu : `Test Files  47 passed (47)`, `Tests  796 passed (796)`, `TSC_OK`.

---

### Task 1 : Données — prénom/nom du profil courrier et RPC `my_dossier_identity()`

**Note de conception (déviation de la spec §4.2, technique) :** deux fichiers au lieu d'un. Le lint `tests/migrations-v2-lint.test.ts` interdit à ses fichiers toute mention d'une table de contenu famille — dont `sender_profiles` (règle « RPC PF, admin et core ne lisent aucune table de contenu famille »). La RPC va donc dans un fichier lint-é, l'ajout de colonnes dans un fichier à part (comme les migrations du chantier 2a).

**Files :**
- Create : `supabase/migrations/20260928120000_sender_profiles_names.sql`
- Create : `supabase/migrations/20260928121000_v2_dossier_identity.sql`
- Modify : `tests/migrations-v2-lint.test.ts` (constantes, `FILES`, `EXPECTED_GRANTS`, `EXPECTED_BY_FILE`, 2 tests)
- Modify : `scripts/sql-scenarios-v2.sql` (scénario S15, liste S13p)

- [ ] **Step 1 : lint — tests qui échouent**

Dans `tests/migrations-v2-lint.test.ts` :

1. Après `const F1 = '20260915210000_transmissions_f1.sql'`, ajouter :

```ts
const IDENTITY = '20260928121000_v2_dossier_identity.sql' // personnalisation v2 (docs/design-personnalisation-v2.md §4.2)
```

2. Remplacer `const FILES: SqlFile[] = [CORE, PARTNER, ADMIN, F1].map(load)…` par :

```ts
const FILES: SqlFile[] = [CORE, PARTNER, ADMIN, F1, IDENTITY].map(load).filter((f): f is SqlFile => f !== null)
```

3. Dans `EXPECTED_GRANTS`, ajouter la ligne `'public.my_dossier_identity': ['authenticated'],` ; dans `EXPECTED_BY_FILE`, ajouter `[IDENTITY]: ['public.my_dossier_identity'],`.

4. Dans le describe « migrations v2 — présence », ajouter :

```ts
  it('le fichier de la personnalisation v2 (my_dossier_identity) existe', () => {
    expect(file(IDENTITY), IDENTITY).toBeDefined()
  })
```

5. À la fin du describe « migrations v2 — fonctions », ajouter :

```ts
  it('my_dossier_identity : 5 champs d’identité exactement, jamais e-mail, téléphone, montant ni jeton', () => {
    const fn = FUNCTIONS.find((f) => f.name === 'public.my_dossier_identity')
    expect(fn, 'my_dossier_identity absente').toBeDefined()
    const body = squash(fn!.body)
    const built = body.match(/jsonb_build_object\(([\s\S]*?)\);/)
    expect(built, 'jsonb_build_object introuvable').not.toBeNull()
    const keys = [...built![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
    expect(keys).toEqual(['deceased_death_date', 'deceased_first_name', 'deceased_last_name', 'family_first_name', 'family_last_name'])
    expect(body).not.toMatch(/family_email|family_phone|price_ttc|commission_ttc|invite_token|included_sends/)
    expect(fn!.params.trim(), 'aucun paramètre : identité = auth.uid()').toBe('')
    expect(body).toContain('auth.uid()')
  })
```

- [ ] **Step 2 : lancer — échec attendu**

```bash
npx vitest run tests/migrations-v2-lint.test.ts 2>&1 | tail -8
```
Attendu : 2 échecs (fichier absent ; fonction absente).

- [ ] **Step 3 : migration des colonnes**

Créer `supabase/migrations/20260928120000_sender_profiles_names.sql` :

```sql
-- Personnalisation v2 (spec docs/design-personnalisation-v2.md §4.2) : prénom et nom séparés dans
-- le profil courrier. `full_name` reste NOT NULL et reste la donnée lue par l'envoi papier
-- (server/routes/letters.js) : le client l'écrit « prénom nom » à chaque enregistrement.
-- Colonnes nullables : les profils saisis au panneau d'envoi du chantier 2a n'ont que full_name —
-- le pré-remplissage des courriers retombe alors sur les noms du dossier PF.
-- Fichier séparé de la RPC my_dossier_identity (20260928121000) : le lint des migrations v2
-- interdit à ses fichiers toute mention d'une table de contenu famille, dont sender_profiles.
-- RLS inchangée (policy owner du chantier 2a) ; mêmes bornes de 45 caractères que les lignes d'adresse.
alter table public.sender_profiles
  add column if not exists first_name text check (char_length(first_name) <= 45),
  add column if not exists last_name  text check (char_length(last_name) <= 45);
```

- [ ] **Step 4 : migration de la RPC**

Créer `supabase/migrations/20260928121000_v2_dossier_identity.sql` :

```sql
-- ════════════════════════════════════════════════════════════════════════════════════════
-- my_dossier_identity — identité saisie par la PF, relue par la famille (personnalisation v2)
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Spec : docs/design-personnalisation-v2.md §4.2. Pré-remplit le questionnaire (prénom, nom et date
-- de décès du défunt — POST /api/questionnaire/start) et l'écran de coordonnées (prénom et nom de la
-- famille). Mêmes règles que 20260915200000_v2_core.sql : security definer, search_path vide, noms
-- qualifiés, aucune identité venue d'un paramètre (auth.uid() seul), revoke puis grant nominatif.
-- dossiers reste deny-all : cette fonction n'expose que 5 colonnes d'identité du dossier de
-- l'appelant — jamais e-mail, téléphone, partenaire, montants, quota ni jeton.
-- Rôle exclusif comme my_account() : un compte PF (partenaire non résilié) n'obtient rien.
-- Un compte porte au plus un dossier (index dossiers_user_uidx) : pas d'ambiguïté de sélection.
create or replace function public.my_dossier_identity()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_d   record;
begin
  if v_uid is null then
    return null;
  end if;

  if exists (select 1
               from public.partner_users pu
               join public.partners p on p.id = pu.partner_id
              where pu.user_id = v_uid
                and p.status <> 'terminated') then
    return null;
  end if;

  select d.family_first_name, d.family_last_name,
         d.deceased_first_name, d.deceased_last_name, d.deceased_death_date
    into v_d
    from public.dossiers d
   where d.user_id = v_uid
     and d.status in ('active','closed');

  if not found then
    return null;
  end if;

  return jsonb_build_object('family_first_name',   v_d.family_first_name,
                            'family_last_name',    v_d.family_last_name,
                            'deceased_first_name', v_d.deceased_first_name,
                            'deceased_last_name',  v_d.deceased_last_name,
                            'deceased_death_date', v_d.deceased_death_date);
end
$fn$;
revoke all on function public.my_dossier_identity() from public, anon, authenticated;
grant execute on function public.my_dossier_identity() to authenticated;
```

- [ ] **Step 5 : lint vert, suite complète**

```bash
npx vitest run tests/migrations-v2-lint.test.ts 2>&1 | tail -4
npx vitest run 2>&1 | tail -4
```
Attendu : lint vert (dont les règles existantes : security definer, `search_path = ''`, revoke/grant exacts, aucune table de contenu, aucun `raise exception` hors contrat) ; suite complète sans échec.

- [ ] **Step 6 : scénarios SQL**

Dans `scripts/sql-scenarios-v2.sql` :

1. Dans le bloc S13p, ajouter `'public.my_dossier_identity()'` à la fin du tableau de signatures (après `'public.get_transmission_by_code(text)'`), et remplacer dans son commentaire d'en-tête « les 7 fonctions » par « les 8 fonctions ».

2. Insérer, juste avant la ligne `-- ── Nettoyage des fixtures (committé) ──…`, le scénario suivant :

```sql
-- ════════════════════════════════════════════════════════════════════════════════════════
-- S15 — my_dossier_identity (personnalisation v2) : la famille relit 5 champs de SON dossier ;
-- sans dossier actif ou clos, en compte PF ou sans identité : null.
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;
insert into public.dossiers (partner_id, source, status, user_id, family_first_name, family_last_name, family_email,
                             deceased_first_name, deceased_last_name, deceased_death_date,
                             price_ttc_cents, commission_ttc_cents, activated_at) values
  ('00000000-0000-4000-8000-00000000a001', 'partner', 'active', '00000000-0000-4000-8000-00000000b006', 'Camille', 'Roussel',
   'fam1@scenario.seren-test.fr', 'Bernard', 'Roussel', current_date - 5, 29000, 7000, now()),
  ('00000000-0000-4000-8000-00000000a002', 'partner', 'active', '00000000-0000-4000-8000-00000000b007', 'Paul', 'Roy',
   'fam2@scenario.seren-test.fr', 'Luc', 'Roy', current_date - 30, 29000, 7000, now());

select scenario_v2.claims('00000000-0000-4000-8000-00000000b006', 'fam1@scenario.seren-test.fr');
set local role authenticated;
do $$
declare r jsonb := public.my_dossier_identity();
begin
  perform scenario_v2.ok('S15a famille : son dossier et seulement le sien',
    r->>'family_first_name' = 'Camille' and r->>'family_last_name' = 'Roussel'
    and r->>'deceased_first_name' = 'Bernard' and r->>'deceased_last_name' = 'Roussel'
    and r->>'deceased_death_date' = (current_date - 5)::text, r::text);
  perform scenario_v2.ok('S15b 5 clés exactes, ni e-mail, ni montant, ni jeton, ni autre famille',
    (select array_agg(k order by k) from jsonb_object_keys(r) as k)
      = array['deceased_death_date', 'deceased_first_name', 'deceased_last_name', 'family_first_name', 'family_last_name']
    and r::text !~ '(@scenario|invite_token|price_ttc|commission_ttc|Roy)', r::text);
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b008', 'nobody@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.ok('S15c compte sans dossier → null', public.my_dossier_identity() is null);
end $$;

reset role;
select scenario_v2.claims('00000000-0000-4000-8000-00000000b001', 'pfx.manager@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.ok('S15d compte PF → null (rôle exclusif, comme my_account)', public.my_dossier_identity() is null);
end $$;

reset role;
select scenario_v2.claims(null, null);
set local role authenticated;
do $$ begin
  perform scenario_v2.ok('S15e sans identité → null', public.my_dossier_identity() is null);
end $$;

reset role;
update public.dossiers set status = 'closed', closed_at = now() where family_email = 'fam1@scenario.seren-test.fr';
select scenario_v2.claims('00000000-0000-4000-8000-00000000b006', 'fam1@scenario.seren-test.fr');
set local role authenticated;
do $$ begin
  perform scenario_v2.ok('S15f dossier clos : la famille relit toujours son identité',
    public.my_dossier_identity()->>'deceased_first_name' = 'Bernard');
end $$;
rollback;
```

- [ ] **Step 7 : rejouer les scénarios (base LOCALE uniquement)**

Si Docker tourne (`docker info` sans erreur) et que le harnais de la Task 11 Step 1 existe déjà (`$S/bin/run-sql-checks`) :

```bash
S=/private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/de650efd-f650-47c9-a468-03ee8cd66a83/scratchpad
. "$S/bin/v2-env.sh"
run-sql-checks "$INT" scripts/sql-scenarios-f1.sql scripts/sql-scenarios-v2.sql 2>&1 | grep -E '^== |ERROR|S15|SCENARIOS V2'
```
Attendu : 8 lignes `NOTICE:  OK S15…` (S15a, S15b, S15b2, S15c, S15d, S15d2, S15e, S15f — voir la note post-revue ci-dessous), les lignes `OK S13p … my_dossier_identity()`, puis `NOTICE:  SCENARIOS V2 : OK`, aucune `ERROR`.

**Sinon, ne pas démarrer Docker ici** : le rejeu est fait par le contrôleur à la Task 11 Step 4 (il le consigne dans la note post-revue de cette tâche). Ne jamais utiliser `supabase link`, `--linked` ni `db push`.

- [ ] **Step 8 : commit**

```bash
git add supabase/migrations/20260928120000_sender_profiles_names.sql supabase/migrations/20260928121000_v2_dossier_identity.sql tests/migrations-v2-lint.test.ts scripts/sql-scenarios-v2.sql
git commit -m "feat(perso-v2): données — prénom/nom du profil courrier, RPC my_dossier_identity (lecture seule)

sender_profiles reçoit first_name/last_name (nullables, 45 car.). my_dossier_identity() rend au seul
titulaire les 5 champs d'identité de son dossier PF (security definer, search_path vide, grant
authenticated, rôle exclusif PF) ; lint étendu, scénarios S15 + droits S13p.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

> **Note post-revue (Task 1, 2026-09-28)** — Commits `0881e53` (tâche) puis `1709fb3` (correctifs de la revue qualité). Revue de spec : conforme. Revue qualité : 2 points importants et 6 mineurs corrigés, sans question produit.
> - **Lint verrouillé.** Le test « 5 champs » laissait passer 5 mutants de la RPC, dont la suppression de la garde PF et celle du filtre `d.user_id = v_uid`. Il pose désormais des verrous exacts sur le corps normalisé : lecture de `auth.uid()`, garde PF placée avant la lecture, SELECT, filtre titulaire + statut, et la liste exhaustive des `return`. Preuve : 6 mutants passent au rouge.
> - **S15 à 8 assertions.** Les ajouts :
>   - S15d donne un vrai dossier à b004, gérant de la PF **suspendue** a003 : c'est la garde qui renvoie `null`, et non l'absence de dossier ;
>   - S15d2 : une fois a003 résiliée, b004 redevient famille, comme avec `my_account()` ;
>   - S15b2 : sonde symétrique de la famille B ;
>   - S15a compare la date en `::date`, ce qui la rend robuste au `DateStyle`.
> - **Prénom et nom non vides en base.** Le CHECK devient `char_length(btrim(...)) between 1 and 45`, comme `dossiers_names_check`.
> - **En-têtes documentés.** Un dossier `direct`/`demo` peut renvoyer un objet à valeurs nulles, et les consommateurs sont cités.
> - **Écarts de spec consignés**, avec la correction du §4.2 et du user step §9 prévue en Task 12 :
>   - 2 fichiers de migration au lieu d'un ;
>   - pas d'`order by` : l'index unique `dossiers_user_uidx` et `dossiers_state_check` garantissent au plus un dossier `active`/`closed` par compte ;
>   - **rejeu SQL réel reporté à la Task 11 Step 4.**

---

### Task 2 : Moteur — condition « au moins une valeur commune » sur les réponses à cocher

**Pourquoi :** les nouvelles questions `aides_percues` et `abonnements` sont des multiselect ; une étape conditionnée par `{ abonnements: ['presse'] }` doit s'afficher dès que la réponse (un tableau) contient `presse`. Aujourd'hui `cond.includes(val)` compare un tableau à une chaîne : toujours faux.

**Files :**
- Modify : `server/lib/questionnaire-engine.js:9-24` (`matchesWhen`)
- Modify : `src/lib/roadmap-generator.ts:22-37` (`isApplicable`)
- Test : `tests/invariants.test.ts` (describe « parité des matchers » + nouveau describe)

- [ ] **Step 1 : écrire les tests qui échouent**

Dans `tests/invariants.test.ts`, ajouter ces 4 cas à la fin du tableau `CASES` du describe « parité des matchers isApplicable (TS) ↔ matchesWhen (JS) » (juste avant `]`) :

```ts
    // Réponse à cocher (multiselect) : une condition en tableau matche s'il y a au moins une valeur commune.
    { when: { abonnements: ['presse', 'telephonie'] }, answers: { abonnements: ['email', 'presse'] } },
    { when: { abonnements: ['presse'] }, answers: { abonnements: ['email'] } },
    { when: { abonnements: ['presse'] }, answers: { abonnements: [] } },
    { when: { abonnements: ['presse'], has_vehicle: true }, answers: { abonnements: ['presse'], has_vehicle: false } },
```

Puis ajouter, en fin de fichier, ce nouveau describe (la parité seule ne suffit pas : deux matchers faux de la même façon seraient « à parité ») :

```ts
describe('matchers : condition en tableau sur une réponse à cocher (multiselect)', () => {
  const when = { abonnements: ['presse', 'telephonie'] }
  const CASES: Array<[unknown, boolean]> = [
    [['presse'], true],
    [['email', 'telephonie'], true],
    [['presse', 'telephonie'], true],
    [['email'], false],
    [[], false],
    [undefined, false],
    ['presse', true], // réponse scalaire : appartenance, comportement historique inchangé
  ]
  for (const [value, expected] of CASES) {
    it(`réponse ${JSON.stringify(value)} → ${expected} (TS et JS)`, () => {
      const answers: Record<string, unknown> = value === undefined ? {} : { abonnements: value }
      expect(matchesWhen(when, answers)).toBe(expected)
      expect(
        isApplicable({ applicable_when: when } as unknown as StepTemplate, answers as unknown as QuestionnaireAnswersV2)
      ).toBe(expected)
    })
  }
})
```

- [ ] **Step 2 : lancer les tests — ils doivent échouer**

```bash
npx vitest run tests/invariants.test.ts 2>&1 | tail -15
```
Attendu : échecs sur `réponse ["presse"] → true`, `réponse ["email","telephonie"] → true`, `réponse ["presse","telephonie"] → true` (les deux matchers renvoient `false`). Les cas de parité passent (les deux sont faux à l'identique) — c'est précisément pourquoi le nouveau describe existe.

- [ ] **Step 3 : implémenter dans le moteur serveur**

Remplacer dans `server/lib/questionnaire-engine.js` le commentaire et la fonction `matchesWhen` (lignes 9 à 24) par :

```js
/**
 * Une condition matche si chaque clé correspond :
 *  - condition en tableau + réponse en tableau (question à cocher) : au moins une valeur commune ;
 *  - condition en tableau + réponse scalaire : appartenance ;
 *  - condition scalaire : égalité stricte.
 * ⚠ Dupliqué avec isApplicable() dans src/lib/roadmap-generator.ts (le serveur JS ne peut pas
 * importer de TS) — toute évolution ici doit y être répercutée. Parité testée par tests/invariants.test.ts.
 */
export function matchesWhen(when, answers) {
  for (const [key, cond] of Object.entries(when ?? {})) {
    const val = answers[key]
    if (Array.isArray(cond)) {
      const hit = Array.isArray(val) ? val.some((v) => cond.includes(v)) : cond.includes(val)
      if (!hit) return false
    } else if (val !== cond) {
      return false
    }
  }
  return true
}
```

- [ ] **Step 4 : implémenter le miroir TypeScript**

Remplacer dans `src/lib/roadmap-generator.ts` le bloc commentaire + `isApplicable` (lignes 22 à 37) par :

```ts
// Matcher générique : tableau = appartenance (ou, si la réponse est elle-même un tableau — question
// à cocher —, au moins une valeur commune), booléen = égalité stricte.
// Même sémantique que matchesWhen() dans server/lib/questionnaire-engine.js (dupliqué :
// le serveur JS ne peut pas importer ce module TS — garder les deux alignés).
// Exportée pour le test de parité tests/invariants.test.ts.
export function isApplicable(step: StepTemplate, answers: QuestionnaireAnswersV2): boolean {
  for (const [key, cond] of Object.entries(step.applicable_when)) {
    const val = (answers as unknown as Record<string, unknown>)[key]
    if (Array.isArray(cond)) {
      const accepted = cond as readonly unknown[]
      const hit = Array.isArray(val) ? val.some((v) => accepted.includes(v)) : accepted.includes(val)
      if (!hit) return false
    } else if (val !== cond) {
      return false
    }
  }
  return true
}
```

- [ ] **Step 5 : relancer — tout doit passer**

```bash
npx vitest run tests/invariants.test.ts 2>&1 | tail -4
npx vitest run 2>&1 | tail -4
npx tsc --noEmit && echo TSC_OK
```
Attendu : invariants verts ; suite complète `803 passed` (796 + 7 nouveaux cas) ; `TSC_OK`.

- [ ] **Step 6 : commit**

```bash
git add server/lib/questionnaire-engine.js src/lib/roadmap-generator.ts tests/invariants.test.ts
git commit -m "feat(perso-v2): moteur — condition « au moins une valeur commune » pour les questions à cocher

Les deux matchers (serveur JS, client TS) acceptent une réponse tableau : une condition en
tableau matche dès qu'une valeur est commune. Parité étendue + sémantique explicite testée.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3 : Question « aides perçues », option EHPAD et leurs étapes

**Files :**
- Modify : `src/types/questionnaire.ts`
- Modify : `server/lib/questions-catalog.js` (option `ehpad`, question `aides_percues`, ordres)
- Modify : `server/routes/questionnaire.js` (`WRITER_EXCLUDED_IDS`)
- Modify : `src/data/steps-catalog.fr.ts`, `src/data/steps-catalog.en.ts` (4 étapes créées, étape énergie conditionnelle)
- Test : `tests/questions-catalog.test.ts`, `tests/questionnaire-engine.test.ts`, `tests/questionnaire-routes.test.ts`, `tests/roadmap-generator.test.ts`

- [ ] **Step 1 : tests qui échouent**

1. `tests/questions-catalog.test.ts` : ajouter `'aides_percues'` à `CONTRACT_KEYS` ; dans le test « 16 questions… », remplacer le titre par `'17 questions, ids uniques, tous dans le contrat'` et les deux `16` par `17` ; ajouter à la fin du describe :

```ts
  it('aides_percues : multiselect universel, 5 aides, textes {fr,en}', () => {
    const q = QUESTIONS_CATALOG.find((x: { id: string }) => x.id === 'aides_percues')
    expect(q, 'question aides_percues absente').toBeDefined()
    expect(q.type).toBe('multiselect')
    expect(q.applicable_when).toEqual({})
    expect(q.options.map((o: { value: string }) => o.value)).toEqual(['apa', 'ash', 'aspa', 'handicap', 'aides_logement'])
  })
  it('logement : option ehpad proposée avant « hébergement chez un proche ou autre »', () => {
    const q = QUESTIONS_CATALOG.find((x: { id: string }) => x.id === 'logement')
    expect(q.options.map((o: { value: string }) => o.value)).toEqual(['locataire', 'proprietaire', 'ehpad', 'heberge_ou_autre'])
  })
```

2. `tests/questionnaire-engine.test.ts` : dans `canned` de `runProfile`, ajouter `aides_percues: [],` ; dans les deux tests de séquence, remplacer `16 questions` par `17 questions` dans les titres et `toHaveLength(16)` par `toHaveLength(17)` ; dans le test `progress`, remplacer les deux `toBe(16)` par `toBe(17)`.

3. `tests/questionnaire-routes.test.ts` :
   - dans `CANNED`, ajouter `aides_percues: ['apa', 'ash'],` ;
   - lignes ~96 et ~131 : `total: 16` → `total: 17` ;
   - dans `makeApp`, faire enregistrer les contextes transmis au rédacteur : déclarer `const contexts: Array<Record<string, unknown>> = []` en tête de la fonction, remplacer la signature du `writeText` par `async ({ spec, context, lang }: { spec: { fallback_text: { question: unknown; aide?: unknown } }; context: Record<string, unknown>; lang: 'fr' | 'en' }) => {` suivie de `contexts.push(context)` puis du `return { question: …, aide: …, source: 'fallback' as const }` existant, et ajouter `contexts` à l'objet retourné par `makeApp` ;
   - à la fin du describe « PII : rédacteur Mistral (chantier 2a) », ajouter :

```ts
  it('les aides perçues ne sont jamais transmises au rédacteur (données de santé)', async () => {
    const { app, contexts } = makeApp()
    await runToRecap(app)
    expect(contexts.length).toBeGreaterThan(0)
    for (const ctx of contexts) {
      const dump = JSON.stringify(ctx)
      expect(dump).not.toMatch(/\bAPA\b|\bASH\b|\bASPA\b|\bAAH\b|\bPCH\b|autonomie|handicap|Parmi ces aides/)
    }
  })
```

4. `tests/roadmap-generator.test.ts` : dans `base`, ajouter `aides_percues: [],` ; dans `maximal` (describe « atteignabilité »), ajouter `aides_percues: ['apa', 'ash', 'aspa', 'handicap', 'aides_logement'],` ; dans le `new Set([...])` de ce test, ajouter la ligne `...ids({ ...maximal, logement: 'ehpad' }),` ; puis ajouter à la fin du fichier :

```ts
describe('personnalisation v2 — EHPAD et aides perçues', () => {
  it('EHPAD : contrat de séjour, pas d’étape énergie ; locataire : énergie, pas d’EHPAD', () => {
    expect(ids({ ...base, logement: 'ehpad' })).toContain('logement-ehpad')
    expect(ids({ ...base, logement: 'ehpad' })).not.toContain('logement-resiliation-energies')
    expect(ids({ ...base, logement: 'locataire' })).toContain('logement-resiliation-energies')
    expect(ids({ ...base, logement: 'proprietaire' })).toContain('logement-resiliation-energies')
    expect(ids({ ...base, logement: 'locataire' })).not.toContain('logement-ehpad')
    expect(ids({ ...base, logement: 'heberge_ou_autre' })).not.toContain('logement-resiliation-energies')
  })
  it('aides : APA, ASH ou PCH → département ; ASPA ou ASH → récupération ; aide au logement → CAF', () => {
    expect(ids({ ...base, aides_percues: ['apa'] })).toContain('aides-departement')
    expect(ids({ ...base, aides_percues: ['handicap'] })).toContain('aides-departement')
    expect(ids({ ...base, aides_percues: ['apa'] })).not.toContain('aides-recuperation-succession')
    expect(ids({ ...base, aides_percues: ['aspa'] })).toContain('aides-recuperation-succession')
    expect(ids({ ...base, aides_percues: ['aspa'] })).not.toContain('aides-departement')
    expect(ids({ ...base, aides_percues: ['ash'] })).toEqual(
      expect.arrayContaining(['aides-departement', 'aides-recuperation-succession'])
    )
    expect(ids({ ...base, aides_percues: ['aides_logement'] })).toContain('aides-logement')
    expect(ids(base)).not.toContain('aides-departement')
  })
})
```

- [ ] **Step 2 : lancer — échecs attendus**

```bash
npx vitest run tests/questions-catalog.test.ts tests/questionnaire-engine.test.ts tests/questionnaire-routes.test.ts tests/roadmap-generator.test.ts 2>&1 | tail -15
npx tsc --noEmit 2>&1 | head -5
```
Attendu : échecs (question absente, séquences à 16, étapes absentes) et erreurs tsc (`aides_percues` / `'ehpad'` inconnus du contrat).

- [ ] **Step 3 : contrat de données**

Dans `src/types/questionnaire.ts` :

1. Remplacer `export type Logement = 'locataire' | 'proprietaire' | 'heberge_ou_autre'` par :

```ts
export type Logement = 'locataire' | 'proprietaire' | 'ehpad' | 'heberge_ou_autre'
```

2. Après le type `Enfants`, ajouter :

```ts
// Personnalisation v2 : aides que percevait le défunt (question à cocher — réponse vide = aucune).
export type AidePercue = 'apa' | 'ash' | 'aspa' | 'handicap' | 'aides_logement'
```

3. Dans `QuestionnaireAnswersV2`, après `deceased_department?: string …`, ajouter :

```ts
  // Personnalisation v2 : saisie une fois à l'écran de coordonnées (pas une question du catalogue) ;
  // sert au « né(e) le … » des courriers. Absente si la famille ne l'a pas renseignée.
  deceased_dob?: string // YYYY-MM-DD
```
et, après `contrat_obseques: TriState`, ajouter `aides_percues: AidePercue[]`.

4. Dans `ApplicableWhenV2`, après `employait_aide_domicile?: boolean`, ajouter `aides_percues?: AidePercue[]`.

- [ ] **Step 4 : catalogue de questions**

Dans `server/lib/questions-catalog.js` :

1. Question `logement` : remplacer le tableau `options` et l'`aide` par :

```js
    options: [
      { value: 'locataire', label: { fr: 'Locataire de son logement', en: 'Renting their home' } },
      { value: 'proprietaire', label: { fr: 'Propriétaire de son logement', en: 'Owned their home' } },
      { value: 'ehpad', label: { fr: 'En EHPAD ou en résidence pour personnes âgées', en: 'In a care home or a residence for older people' } },
      { value: 'heberge_ou_autre', label: { fr: 'Hébergement chez un proche ou autre situation', en: 'Living with someone else, or another situation' } },
    ],
```
et
```js
      aide: {
        fr: 'Locataire : le bail peut être résilié avec un préavis réduit à 1 mois. Propriétaire : le notaire établira une attestation immobilière. En EHPAD : la chambre est à libérer rapidement.',
        en: 'Renting: the lease can be terminated with a reduced 1-month notice period. Owner: the notaire will draw up a property certificate. In a care home: the room must be vacated quickly.',
      },
```

2. Question `contrat_obseques` : `order: 15` → `order: 16`. Question `organismes_contactes` : `order: 16` → `order: 18` (le 17 est réservé à `abonnements`, Task 4).

3. Insérer, entre `employait_aide_domicile` et `contrat_obseques` :

```js
  {
    // Personnalisation v2 (spec §5.2). Question sensible (autonomie, handicap) : exclue du contexte
    // du rédacteur Mistral (WRITER_EXCLUDED_IDS, server/routes/questionnaire.js).
    id: 'aides_percues',
    type: 'multiselect',
    options: [
      { value: 'apa', label: { fr: 'APA (allocation personnalisée d\'autonomie)', en: 'APA (personalised autonomy allowance)' } },
      { value: 'ash', label: { fr: 'Aide sociale à l\'hébergement (ASH), en EHPAD', en: 'Social accommodation assistance (ASH), in a care home' } },
      { value: 'aspa', label: { fr: 'Minimum vieillesse (ASPA)', en: 'Minimum old-age pension (ASPA)' } },
      { value: 'handicap', label: { fr: 'AAH ou PCH (aides liées au handicap)', en: 'AAH or PCH (disability benefits)' } },
      { value: 'aides_logement', label: { fr: 'Aide au logement (APL, ALS)', en: 'Housing benefit (APL, ALS)' } },
    ],
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: { fr: 'Parmi ces aides, lesquelles {prenom} percevait ?', en: 'Which of these benefits did {prenom} receive?' },
      aide: {
        fr: 'Les signaler évite d\'avoir à rembourser des sommes versées après le décès ; certaines peuvent aussi être récupérées sur la succession. Ne cochez rien si aucune ne correspond.',
        en: 'Reporting them avoids having to repay amounts paid after the death; some may also be recovered from the estate. Leave everything unchecked if none applies.',
      },
    },
    writer_hints: {
      fr: 'Sujet sensible (autonomie, handicap) : ton factuel et doux, ne jamais supposer de réponse.',
      en: 'Sensitive topic (loss of autonomy, disability): factual and gentle tone, never assume an answer.',
    },
    categorie: { fr: 'Aides', en: 'Benefits' },
    order: 15,
  },
```

- [ ] **Step 5 : minimisation Mistral**

Dans `server/routes/questionnaire.js`, remplacer la ligne `const WRITER_EXCLUDED_IDS = ['deceased_department']` par :

```js
// aides_percues (personnalisation v2) : APA, AAH/PCH, ASH révèlent perte d'autonomie ou handicap —
// données de santé, jamais transmises au rédacteur, même comme « dernière réponse ».
const WRITER_EXCLUDED_IDS = ['deceased_department', 'aides_percues']
```

- [ ] **Step 6 : étapes FR**

Dans `src/data/steps-catalog.fr.ts` :

1. Étape `logement-resiliation-energies` : remplacer `applicable_when: {},` par `applicable_when: { logement: ['locataire', 'proprietaire'] },` (pas de contrat d'énergie au nom d'une personne en EHPAD ou hébergée).

2. Ajouter, à la fin du tableau (après `famille-aides-enfants-orphelins`), un bloc commenté `// ── PERSONNALISATION V2 : EHPAD ET AIDES PERÇUES ──…` contenant ces 4 étapes (textes vérifiés sur les sources officielles citées, le 2026-09-28) :

Sources vérifiées le 2026-09-28 : CASF art. L314-10-1 et R314-149 (EHPAD), fiche F763 ; CASF art. L232-19 (APA non récupérable), L245-7 (PCH non récupérable), L132-8 (ASH récupérable sur l'actif net), L344-5 (exception handicap) ; CSS art. L815-13 et circulaire Cnav 2025-29 (seuil ASPA 2026 : 108 585,14 € en métropole) ; CCH art. R823-12 et R822-11 (aides au logement) ; fiches F10009, F14202, F12242, F16871, F2444. **Ne rien affirmer au-delà** : aucun texte ne dit que le décès « résilie » le contrat de séjour, ni ne fixe de délai pour libérer la chambre.

```ts
  // ── PERSONNALISATION V2 : EHPAD ET AIDES PERÇUES ──────────────────────
  // Textes vérifiés le 2026-09-28 (Légifrance, service-public) — relecture juridique à venir.
  {
    id: 'logement-ehpad',
    title: 'Libérer la chambre de l\'EHPAD et vérifier la facture finale',
    description: 'Après le décès, l\'EHPAD ne peut plus facturer que des sommes limitées. Organisez rapidement le retrait des affaires personnelles et vérifiez la facture de clôture.',
    theme: 'logement',
    urgency: 'week',
    urgency_label: 'Dans la semaine',
    when_to_do: 'Dans les jours qui suivent le décès : le retrait des affaires met fin à la facturation de l\'hébergement.',
    why_to_do: 'Une fois les objets personnels retirés, seules les prestations d\'hébergement délivrées avant le décès et non encore payées peuvent être facturées. Tant que les objets ne sont pas retirés, l\'établissement peut facturer le socle de prestations, au plus pendant 6 jours après le décès et déduction faite des frais de restauration. Les sommes payées d\'avance sont restituées dans les 30 jours suivant le décès ; le dépôt de garantie, dans les 30 jours suivant l\'état des lieux de sortie.',
    what_you_do: [
      'Convenir avec la direction d\'une date pour retirer les affaires personnelles et faire l\'état des lieux de sortie',
      'Retirer les affaires au plus vite : le socle de prestations ne peut plus être facturé au-delà de 6 jours après le décès',
      'Vérifier la facture de clôture : prestations délivrées avant le décès, socle limité à 6 jours, restauration déduite',
      'Réclamer les sommes payées d\'avance (sous 30 jours après le décès) et le dépôt de garantie (sous 30 jours après l\'état des lieux)',
    ],
    responsable: 'vous',
    requires_notary: false,
    applicable_when: { logement: ['ehpad'] },
    source_url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F763',
    display_order: 52,
  },
  {
    id: 'aides-departement',
    title: 'Prévenir le département des aides versées au défunt',
    description: 'L\'APA, l\'aide sociale à l\'hébergement (ASH) et, le plus souvent, la PCH sont versées par le conseil départemental. Signalez-lui le décès pour arrêter les versements.',
    theme: 'administratif',
    urgency: 'week',
    urgency_label: 'Dans la semaine',
    when_to_do: 'Dès que possible après le décès.',
    why_to_do: 'Les sommes versées après le décès sont indues et le département peut les réclamer. L\'APA et la PCH déjà perçues n\'ont pas à être remboursées par les héritiers ; l\'aide sociale à l\'hébergement, en revanche, peut être récupérée sur la succession.',
    what_you_do: [
      'Écrire au conseil départemental (service autonomie ou aide sociale), avec une copie de l\'acte de décès',
      'Demander l\'arrêt des versements et, le cas échéant, le montant à régulariser',
      'Si une aide sociale à l\'hébergement était versée : demander le relevé des sommes versées, à remettre au notaire',
      'Si l\'APA finançait une aide à domicile ou un service, prévenir aussi ce prestataire',
      'Si le défunt percevait l\'AAH : elle est versée par la CAF ou la MSA, qu\'il faut aussi prévenir',
    ],
    responsable: 'vous',
    requires_notary: false,
    applicable_when: { aides_percues: ['apa', 'ash', 'handicap'] },
    source_url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F10009',
    display_order: 53,
  },
  {
    id: 'aides-recuperation-succession',
    title: 'Anticiper la récupération de l\'ASPA ou de l\'aide sociale sur la succession',
    description: 'Le minimum vieillesse (ASPA) et l\'aide sociale à l\'hébergement (ASH) peuvent être récupérés sur la succession. Mieux vaut le savoir avant de décider d\'accepter ou non la succession.',
    theme: 'succession',
    urgency: 'month',
    urgency_label: 'Dans le mois',
    when_to_do: 'Avant de décider d\'accepter ou de refuser la succession, avec le notaire.',
    why_to_do: 'La caisse de retraite qui versait l\'ASPA peut récupérer les sommes versées sur la part de l\'actif net de la succession qui dépasse un seuil (108 585,14 € en métropole en 2026), dans la limite d\'un montant maximal par année de versement ; ce recouvrement peut être différé tant que vit le conjoint ou le partenaire survivant. Le département peut récupérer l\'aide sociale à l\'hébergement sur l\'actif net de la succession, sauf exceptions prévues pour les personnes handicapées.',
    what_you_do: [
      'Signaler au notaire que le défunt percevait l\'ASPA ou l\'aide sociale à l\'hébergement',
      'ASPA : se renseigner auprès de la caisse de retraite qui la versait (Carsat, MSA…) sur le montant récupérable',
      'Aide sociale à l\'hébergement : demander au département le relevé des sommes versées',
      'Tenir compte de ces montants avant de décider d\'accepter ou de refuser la succession',
    ],
    responsable: 'vous',
    requires_notary: false,
    applicable_when: { aides_percues: ['aspa', 'ash'] },
    source_url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F16871',
    display_order: 54,
  },
  {
    id: 'aides-logement',
    title: 'Signaler le décès pour l\'aide au logement',
    description: 'Si le défunt percevait une aide au logement (APL, ALS ou ALF), signalez le décès à la CAF ou à la MSA.',
    theme: 'administratif',
    urgency: 'month',
    urgency_label: 'Dans le mois',
    when_to_do: 'Dans le mois suivant le décès.',
    why_to_do: 'Le droit à l\'aide au logement s\'arrête le 1er jour du mois qui suit le décès : l\'aide du mois du décès reste due, mais les montants versés ensuite devront être remboursés. Si vous viviez en couple avec le défunt et restez dans le logement, vos droits sont réexaminés : ses ressources ne sont plus prises en compte à partir du mois suivant le décès.',
    what_you_do: [
      'Déclarer le décès à la CAF (espace « Mon Compte », rubrique des changements de situation) ou à la MSA',
      'Si vous restez dans le logement, vérifier que vos droits ont bien été réexaminés',
      'Contrôler les versements reçus après le décès et rembourser un éventuel trop-perçu',
    ],
    responsable: 'vous',
    requires_notary: false,
    applicable_when: { aides_percues: ['aides_logement'] },
    source_url: 'https://www.caf.fr/allocataires/aides-et-demarches/ma-situation/accident-de-vie/j-ai-perdu-un-proche',
    display_order: 55,
  },
```

- [ ] **Step 7 : étapes EN (jumelles : même ordre, mêmes champs structurels, `what_you_do` de même longueur)**

Dans `src/data/steps-catalog.en.ts` : même modification de `logement-resiliation-energies`, puis même bloc en fin de tableau :

```ts
  // ── V2 PERSONALIZATION: CARE HOME AND BENEFITS RECEIVED ──────────────
  {
    id: 'logement-ehpad',
    title: 'Vacate the care home room and check the final invoice',
    description: 'After the death, the care home (EHPAD) may only charge limited amounts. Arrange for personal belongings to be removed quickly and check the closing invoice.',
    theme: 'logement',
    urgency: 'week',
    urgency_label: 'Within the week',
    when_to_do: 'In the days following the death: removing the belongings ends the accommodation charges.',
    why_to_do: 'Once personal belongings have been removed, only accommodation services provided before the death and not yet paid can be invoiced. Until they are removed, the care home may charge the core accommodation package for at most 6 days after the death, minus catering costs. Amounts paid in advance are refunded within 30 days of the death; the security deposit, within 30 days of the exit inspection.',
    what_you_do: [
      'Agree with the management on a date to remove personal belongings and carry out the exit inspection',
      'Remove the belongings as soon as possible: the core package cannot be charged beyond 6 days after the death',
      'Check the closing invoice: services provided before the death, core package limited to 6 days, catering deducted',
      'Claim the amounts paid in advance (within 30 days of the death) and the security deposit (within 30 days of the exit inspection)',
    ],
    responsable: 'vous',
    requires_notary: false,
    applicable_when: { logement: ['ehpad'] },
    source_url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F763',
    display_order: 52,
  },
  {
    id: 'aides-departement',
    title: 'Notify the département of the benefits paid to the deceased',
    description: 'APA, social accommodation assistance (ASH) and, in most cases, PCH are paid by the département council (conseil départemental). Report the death to stop the payments.',
    theme: 'administratif',
    urgency: 'week',
    urgency_label: 'Within the week',
    when_to_do: 'As soon as possible after the death.',
    why_to_do: 'Amounts paid after the death are not due and the département may claim them back. APA and PCH already received do not have to be repaid by the heirs; social accommodation assistance, however, may be recovered from the estate.',
    what_you_do: [
      'Write to the conseil départemental (autonomy or social assistance department), enclosing a copy of the death certificate',
      'Ask for the payments to stop and, where applicable, for the amount to be settled',
      'If social accommodation assistance was paid: ask for the statement of amounts paid, to give to the notaire',
      'If APA funded home help or a service, notify that provider too',
      'If the deceased received AAH: it is paid by the CAF or the MSA, which must also be notified',
    ],
    responsable: 'vous',
    requires_notary: false,
    applicable_when: { aides_percues: ['apa', 'ash', 'handicap'] },
    source_url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F10009',
    display_order: 53,
  },
  {
    id: 'aides-recuperation-succession',
    title: 'Anticipate the recovery of ASPA or social assistance from the estate',
    description: 'The minimum old-age pension (ASPA) and social accommodation assistance (ASH) may be recovered from the estate. It is best to know this before deciding whether to accept the estate.',
    theme: 'succession',
    urgency: 'month',
    urgency_label: 'Within the month',
    when_to_do: 'Before deciding whether to accept or refuse the estate, with the notaire.',
    why_to_do: 'The pension fund that paid ASPA may recover the amounts paid from the part of the net estate above a threshold (€108,585.14 in mainland France in 2026), within a maximum amount per year of payment; recovery may be deferred while the surviving spouse or partner is alive. The département may recover social accommodation assistance from the net estate, with exceptions for people with disabilities.',
    what_you_do: [
      'Tell the notaire that the deceased received ASPA or social accommodation assistance',
      'ASPA: ask the pension fund that paid it (Carsat, MSA…) about the recoverable amount',
      'Social accommodation assistance: ask the département for the statement of amounts paid',
      'Take these amounts into account before deciding whether to accept or refuse the estate',
    ],
    responsable: 'vous',
    requires_notary: false,
    applicable_when: { aides_percues: ['aspa', 'ash'] },
    source_url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F16871',
    display_order: 54,
  },
  {
    id: 'aides-logement',
    title: 'Report the death for the housing benefit',
    description: 'If the deceased received a housing benefit (APL, ALS or ALF), report the death to the CAF or the MSA.',
    theme: 'administratif',
    urgency: 'month',
    urgency_label: 'Within the month',
    when_to_do: 'Within the month following the death.',
    why_to_do: 'Entitlement to the housing benefit ends on the 1st day of the month following the death: the benefit for the month of death is still due, but amounts paid afterwards will have to be repaid. If you lived as a couple with the deceased and stay in the home, your entitlement is reassessed: their income is no longer taken into account from the month following the death.',
    what_you_do: [
      'Report the death to the CAF (“Mon Compte” area, change-of-situation section) or to the MSA',
      'If you stay in the home, check that your entitlement has been reassessed',
      'Check the payments received after the death and repay any overpayment',
    ],
    responsable: 'vous',
    requires_notary: false,
    applicable_when: { aides_percues: ['aides_logement'] },
    source_url: 'https://www.caf.fr/allocataires/aides-et-demarches/ma-situation/accident-de-vie/j-ai-perdu-un-proche',
    display_order: 55,
  },
```

- [ ] **Step 8 : tout doit passer**

```bash
npx tsc --noEmit && echo TSC_OK
npx vitest run 2>&1 | tail -4
```
Attendu : `TSC_OK` ; 0 échec (invariants : chaque valeur `apa`, `ash`, `aspa`, `handicap`, `aides_logement`, `ehpad` déclenche au moins une étape ; parité FR/EN ; atteignabilité).

- [ ] **Step 9 : commit**

```bash
git add src/types/questionnaire.ts server/lib/questions-catalog.js server/routes/questionnaire.js src/data/steps-catalog.fr.ts src/data/steps-catalog.en.ts tests/questions-catalog.test.ts tests/questionnaire-engine.test.ts tests/questionnaire-routes.test.ts tests/roadmap-generator.test.ts
git commit -m "feat(perso-v2): question « aides perçues » et option EHPAD — 4 étapes sourcées, énergie conditionnelle

APA/ASH/PCH → prévenir le département ; ASPA/ASH → anticiper la récupération sur la succession ;
aide au logement → CAF ; EHPAD → libérer la chambre et clore le contrat de séjour. Les aides ne sont
jamais transmises au rédacteur Mistral (données de santé).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4 : Question « abonnements et comptes », étapes d'abonnements et thème `abonnements`

**Files :**
- Modify : `src/types/questionnaire.ts`, `server/lib/questions-catalog.js`
- Modify : `src/data/steps-catalog.ts` (union `theme`), `src/data/steps-catalog.fr.ts`, `src/data/steps-catalog.en.ts`
- Modify : `src/components/documents/DocumentCard.tsx`, `src/pages/DocumentsPage.tsx`, `src/i18n/strings.fr.ts`, `src/i18n/strings.en.ts` (thème)
- Test : `tests/questions-catalog.test.ts`, `tests/questionnaire-engine.test.ts`, `tests/questionnaire-routes.test.ts`, `tests/roadmap-generator.test.ts`

- [ ] **Step 1 : tests qui échouent**

1. `tests/questions-catalog.test.ts` : ajouter `'abonnements'` à `CONTRACT_KEYS` ; test « 17 questions… » → `'18 questions, ids uniques, tous dans le contrat'`, `17` → `18` (deux fois) ; ajouter :

```ts
  it('abonnements : multiselect universel, 8 choix, textes {fr,en}', () => {
    const q = QUESTIONS_CATALOG.find((x: { id: string }) => x.id === 'abonnements')
    expect(q, 'question abonnements absente').toBeDefined()
    expect(q.type).toBe('multiselect')
    expect(q.applicable_when).toEqual({})
    expect(q.options.map((o: { value: string }) => o.value)).toEqual([
      'presse', 'telephonie', 'sport_loisirs', 'streaming', 'services_en_ligne', 'reseaux_sociaux', 'email', 'photos_documents',
    ])
  })
```

2. `tests/questionnaire-engine.test.ts` :
   - `runProfile` accepte un état initial : remplacer `function runProfile(fixed: Answers): { sequence: string[]; answers: Answers } {` par `function runProfile(fixed: Answers, initial: Answers = {}): { sequence: string[]; answers: Answers } {` et `let answers: Answers = {}` par `let answers: Answers = { ...initial }` ;
   - dans `canned`, ajouter `abonnements: [],` ;
   - séquences : `17 questions` → `18 questions` (titres) et `toHaveLength(17)` → `toHaveLength(18)` ; `progress` : `toBe(17)` → `toBe(18)` ;
   - ajouter à la fin du fichier :

```ts
describe('plafond UX (spec personnalisation v2 §5.1)', () => {
  it('identité du défunt pré-remplie par le dossier PF : aucun profil ne voit plus de 15 questions', () => {
    const prefilled = { deceased_firstname: 'Pierre', deceased_lastname: 'Dupont', deceased_dod: '2026-04-10' }
    for (const relation of ['conjoint_marie', 'pacse', 'concubin', 'parent', 'enfant', 'frere_soeur', 'autre']) {
      const { sequence } = runProfile({ relation }, prefilled)
      expect(sequence.length, relation).toBeLessThanOrEqual(15)
      expect(sequence).not.toContain('deceased_firstname')
      expect(sequence).not.toContain('deceased_dod')
    }
  })
})
```

3. `tests/questionnaire-routes.test.ts` : dans `CANNED`, ajouter `abonnements: ['presse', 'telephonie'],` ; `total: 17` → `total: 18` (deux lignes).

4. `tests/roadmap-generator.test.ts` : dans `base`, ajouter `abonnements: [],` ; dans `maximal`, ajouter `abonnements: ['presse', 'telephonie', 'sport_loisirs', 'streaming', 'services_en_ligne', 'reseaux_sociaux', 'email', 'photos_documents'],` ; ajouter :

```ts
describe('personnalisation v2 — abonnements et comptes', () => {
  it('chaque case cochée ajoute sa démarche, et seulement elle', () => {
    const CASES: Array<[string, string]> = [
      ['presse', 'abonnements-presse'],
      ['telephonie', 'logement-resiliation-telecom'],
      ['sport_loisirs', 'abonnements-sport-association'],
      ['streaming', 'abonnements-streaming'],
      ['services_en_ligne', 'abonnements-services-en-ligne'],
      ['reseaux_sociaux', 'numerique-reseaux-sociaux'],
      ['email', 'numerique-boite-email'],
      ['photos_documents', 'numerique-photos-documents'],
    ]
    for (const [value, stepId] of CASES) {
      expect(ids({ ...base, abonnements: [value] as QuestionnaireAnswersV2['abonnements'] }), value).toContain(stepId)
      expect(ids(base), `${stepId} sans case cochée`).not.toContain(stepId)
    }
  })
  it('le filet « repérer les prélèvements encore actifs » reste proposé à tous', () => {
    expect(ids(base)).toContain('numerique-abonnements')
  })
})
```

- [ ] **Step 2 : lancer — échecs attendus**

```bash
npx vitest run tests/questions-catalog.test.ts tests/questionnaire-engine.test.ts tests/questionnaire-routes.test.ts tests/roadmap-generator.test.ts 2>&1 | tail -15
```

- [ ] **Step 3 : contrat de données**

Dans `src/types/questionnaire.ts` : après `AidePercue`, ajouter

```ts
// Personnalisation v2 : abonnements et comptes du défunt (question à cocher — réponse vide = aucun connu).
export type Abonnement =
  | 'presse' | 'telephonie' | 'sport_loisirs' | 'streaming'
  | 'services_en_ligne' | 'reseaux_sociaux' | 'email' | 'photos_documents'
```
puis `abonnements: Abonnement[]` dans `QuestionnaireAnswersV2` (après `aides_percues`) et `abonnements?: Abonnement[]` dans `ApplicableWhenV2` (après `aides_percues`).

- [ ] **Step 4 : question**

Dans `server/lib/questions-catalog.js`, insérer entre `contrat_obseques` (order 16) et `organismes_contactes` (order 18) :

```js
  {
    // Personnalisation v2 (spec §5.3) : chaque case déclenche sa démarche (condition « au moins une
    // valeur commune », server/lib/questionnaire-engine.js). Réponse vide = aucun abonnement connu :
    // l'étape filet « repérer les prélèvements encore actifs » reste proposée à tous.
    id: 'abonnements',
    type: 'multiselect',
    options: [
      { value: 'presse', label: { fr: 'Journaux ou magazines', en: 'Newspapers or magazines' } },
      { value: 'telephonie', label: { fr: 'Téléphone mobile ou box internet', en: 'Mobile phone or home internet' } },
      { value: 'sport_loisirs', label: { fr: 'Salle de sport, club ou association', en: 'Gym, club or association' } },
      { value: 'streaming', label: { fr: 'Streaming, musique ou vidéo (Netflix, Spotify, Canal+…)', en: 'Streaming, music or video (Netflix, Spotify, Canal+…)' } },
      { value: 'services_en_ligne', label: { fr: 'Logiciels ou services en ligne payants (cloud, antivirus, applications)', en: 'Paid software or online services (cloud storage, antivirus, apps)' } },
      { value: 'reseaux_sociaux', label: { fr: 'Réseaux sociaux (Facebook, Instagram, LinkedIn…)', en: 'Social networks (Facebook, Instagram, LinkedIn…)' } },
      { value: 'email', label: { fr: 'Boîte e-mail', en: 'Email account' } },
      { value: 'photos_documents', label: { fr: 'Photos ou documents stockés en ligne (iCloud, Google Photos…)', en: 'Photos or documents stored online (iCloud, Google Photos…)' } },
    ],
    applicable_when: {},
    obligatoire: true,
    fallback_text: {
      question: { fr: 'Parmi ces abonnements et comptes, lesquels étaient au nom de {prenom} ?', en: 'Which of these subscriptions and accounts were in {prenom}\'s name?' },
      aide: {
        fr: 'Cochez ce que vous connaissez : chaque choix ajoute la démarche correspondante. Pour le reste, une démarche vous aidera à repérer les prélèvements encore actifs.',
        en: 'Check what you know about: each choice adds the matching step. For anything else, a step will help you spot the direct debits still running.',
      },
    },
    writer_hints: {
      fr: 'Ton pratique et rassurant : inutile de tout savoir maintenant.',
      en: 'Practical, reassuring tone: there is no need to know everything right now.',
    },
    categorie: { fr: 'Abonnements', en: 'Subscriptions' },
    order: 17,
  },
```

- [ ] **Step 5 : thème `abonnements`**

1. `src/data/steps-catalog.ts` : dans l'union `theme`, ajouter `| 'abonnements'`.
2. `src/components/documents/DocumentCard.tsx` : ajouter `Newspaper,` à l'import `lucide-react` et la ligne `abonnements: Newspaper,` dans `THEME_ICONS`.
3. `src/pages/DocumentsPage.tsx` : ajouter `| 'abonnements'` au type `ThemeFilter`.
4. `src/i18n/strings.fr.ts` → `lettersPage.themeLabels` : ajouter `abonnements: 'Abonnements',` après `numerique` ; `src/i18n/strings.en.ts` : `abonnements: 'Subscriptions',`.

- [ ] **Step 6 : étapes FR**

Dans `src/data/steps-catalog.fr.ts` :

Sources vérifiées le 2026-09-28 : guide service-public « Un proche est décédé » (F37096 — courrier rappelant le numéro de contrat + copie de l'acte de décès ; rien sur les frais ni le prorata) ; modèle R64939 ; code de la consommation L224-39 (préavis ≤ 10 jours) et L224-35 (avances restituées ≤ 10 jours après la dernière facture) ; loi Informatique et Libertés art. 85 et fiche CNIL « mort numérique » ; pages d'aide officielles Netflix, Apple, Google, Microsoft, Amazon (paraphrasées). **Correction factuelle incluse** : l'étape existante `logement-resiliation-telecom` affirmait « Motif de décès = résiliation sans frais et sans préavis » — aucun texte ne l'établit (la gratuité relève du contrat) ; son texte est corrigé ici.

1. Remplacer l'objet entier `logement-resiliation-telecom` par :

```ts
  {
    id: 'logement-resiliation-telecom',
    title: 'Résilier les abonnements internet et téléphone',
    description: 'Les abonnements internet, téléphone fixe et mobile du défunt doivent être résiliés.',
    theme: 'logement',
    urgency: 'month',
    urgency_label: 'Dans le mois',
    when_to_do: 'Dans le mois suivant le décès.',
    why_to_do: 'Aucune règle générale n\'impose une résiliation sans frais en cas de décès : cela dépend des conditions générales du contrat. La résiliation prend effet au plus tard 10 jours après réception de la demande, et les sommes versées d\'avance sont restituées au plus tard 10 jours après le paiement de la dernière facture.',
    what_you_do: [
      'Contacter les opérateurs (internet, mobile, fixe) en rappelant le numéro de client',
      'Demander la résiliation pour motif de décès, sans frais si les conditions générales le prévoient',
      'Fournir une copie de l\'acte de décès',
      'Restituer les équipements (box, décodeur) si demandé',
    ],
    responsable: 'vous',
    requires_notary: false,
    applicable_when: { abonnements: ['telephonie'] },
    source_url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/R64939',
    display_order: 21,
  },
```

2. `numerique-reseaux-sociaux` : `applicable_when: {},` → `applicable_when: { abonnements: ['reseaux_sociaux'] },`.
3. `numerique-boite-email` : `applicable_when: {},` → `applicable_when: { abonnements: ['email'] },`.
4. Remplacer l'objet entier `numerique-abonnements` (reste universel, devient le filet de sécurité) par :

```ts
  {
    id: 'numerique-abonnements',
    title: 'Repérer les prélèvements encore actifs',
    description: 'Parcourez les derniers relevés bancaires et de carte du défunt pour repérer les abonnements et prélèvements qui courent encore.',
    theme: 'numerique',
    urgency: 'month',
    urgency_label: 'Dans le mois',
    when_to_do: 'Dans le mois suivant le décès.',
    why_to_do: 'Un abonnement payé par carte ou par prélèvement sur un compte encore actif (un compte joint, par exemple) continue d\'être débité tant qu\'il n\'est pas résilié. Les relevés révèlent aussi les abonnements oubliés.',
    what_you_do: [
      'Relire les relevés des derniers mois : prélèvements et paiements par carte qui reviennent chaque mois',
      'Lister chaque prestataire avec son montant et sa référence de contrat',
      'Écrire à chacun pour demander la résiliation, avec une copie de l\'acte de décès',
    ],
    responsable: 'vous',
    requires_notary: false,
    applicable_when: {},
    source_url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F37096',
    display_order: 23,
  },
```

5. Ajouter à la fin du tableau (après le bloc de la Task 3) :

```ts
  // ── PERSONNALISATION V2 : ABONNEMENTS ET COMPTES ──────────────────────
  // Textes vérifiés le 2026-09-28 (service-public, CNIL, aides officielles des plateformes).
  {
    id: 'abonnements-presse',
    title: 'Résilier les abonnements presse',
    description: 'Les abonnements aux journaux et magazines restent prélevés tant qu\'ils ne sont pas résiliés.',
    theme: 'abonnements',
    urgency: 'month',
    urgency_label: 'Dans le mois',
    when_to_do: 'Dans le mois suivant le décès.',
    why_to_do: 'Pour chaque contrat, le guide officiel conseille un courrier rappelant le numéro de contrat, accompagné d\'une copie de l\'acte de décès. Le remboursement des numéros payés d\'avance dépend des conditions de l\'abonnement.',
    what_you_do: [
      'Retrouver le numéro d\'abonné (sur l\'étiquette d\'envoi, une facture ou un e-mail de l\'éditeur)',
      'Envoyer la demande de résiliation au service abonnements, avec une copie de l\'acte de décès',
      'Demander l\'arrêt des prélèvements et, si les conditions le prévoient, le remboursement des numéros non servis',
    ],
    responsable: 'vous',
    requires_notary: false,
    applicable_when: { abonnements: ['presse'] },
    source_url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F37096',
    display_order: 56,
  },
  {
    id: 'abonnements-sport-association',
    title: 'Mettre fin à un abonnement sportif ou à une adhésion',
    description: 'Salle de sport, club ou association : signalez le décès pour mettre fin à l\'abonnement ou à l\'adhésion et arrêter les prélèvements.',
    theme: 'abonnements',
    urgency: 'month',
    urgency_label: 'Dans le mois',
    when_to_do: 'Dans le mois suivant le décès.',
    why_to_do: 'Les conditions (préavis, remboursement éventuel) dépendent du contrat ou des statuts de l\'association : un courrier rappelant les références de l\'abonnement, avec une copie de l\'acte de décès, permet de demander la résiliation.',
    what_you_do: [
      'Retrouver le contrat ou la carte d\'adhérent (références de l\'abonnement)',
      'Envoyer la demande de résiliation, avec une copie de l\'acte de décès',
      'Demander l\'arrêt des prélèvements et, s\'il y a lieu, le remboursement de la période non utilisée',
    ],
    responsable: 'vous',
    requires_notary: false,
    applicable_when: { abonnements: ['sport_loisirs'] },
    source_url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F37096',
    display_order: 57,
  },
  {
    id: 'abonnements-streaming',
    title: 'Résilier les abonnements de streaming et de musique',
    description: 'Netflix, Spotify, Deezer, Canal+… : ces abonnements se résilient en ligne ou auprès du service client de chaque plateforme.',
    theme: 'abonnements',
    urgency: 'month',
    urgency_label: 'Dans le mois',
    when_to_do: 'Dans le mois suivant le décès.',
    why_to_do: 'Un abonnement payé par carte ou par prélèvement sur un compte encore actif continue d\'être débité tant qu\'il n\'est pas résilié. Les héritiers peuvent demander la clôture des comptes du défunt.',
    what_you_do: [
      'Repérer les plateformes sur les relevés bancaires et de carte',
      'Netflix : annuler depuis la page Compte si vous y avez accès ; sinon, contacter le service client avec l\'e-mail ou le téléphone du compte et les informations de paiement',
      'Spotify, Deezer et les autres plateformes : contacter leur service client en signalant le décès',
      'Conserver la confirmation de chaque résiliation',
    ],
    responsable: 'vous',
    requires_notary: false,
    applicable_when: { abonnements: ['streaming'] },
    source_url: 'https://www.cnil.fr/fr/mort-numerique-effacement-informations-personne-decedee',
    display_order: 58,
  },
  {
    id: 'abonnements-services-en-ligne',
    title: 'Résilier les logiciels et services en ligne payants',
    description: 'Stockage en ligne, antivirus, suites bureautiques, applications, Amazon Prime… : ces abonnements continuent d\'être débités tant qu\'ils ne sont pas résiliés.',
    theme: 'abonnements',
    urgency: 'month',
    urgency_label: 'Dans le mois',
    when_to_do: 'Dans le mois suivant le décès.',
    why_to_do: 'La loi Informatique et Libertés (article 85) permet aux héritiers de faire clôturer les comptes du défunt. Chaque service a sa propre procédure, souvent décrite dans son aide en ligne.',
    what_you_do: [
      'Repérer les services payés sur les relevés, y compris les abonnements pris dans les boutiques d\'applications',
      'Amazon : suivre la démarche prévue par l\'aide Amazon en cas de décès (acte de décès demandé ; la fermeture du compte est définitive)',
      'Microsoft : interrompre le moyen de paiement des abonnements ; le compte expire après 2 ans d\'inactivité',
      'Autres services : contacter leur service client en signalant le décès, avec une copie de l\'acte de décès',
    ],
    responsable: 'vous',
    requires_notary: false,
    applicable_when: { abonnements: ['services_en_ligne'] },
    source_url: 'https://www.cnil.fr/fr/mort-numerique-effacement-informations-personne-decedee',
    display_order: 59,
  },
  {
    id: 'numerique-photos-documents',
    title: 'Récupérer les photos et documents stockés en ligne',
    description: 'Photos, vidéos et documents du défunt peuvent se trouver dans un espace en ligne (iCloud, Google Photos, OneDrive…). Récupérez-les avant toute clôture de compte.',
    theme: 'numerique',
    urgency: 'later',
    urgency_label: 'Quand vous le souhaitez',
    when_to_do: 'Quand vous le souhaitez, avant de demander la clôture des comptes.',
    why_to_do: 'Les héritiers peuvent obtenir la communication des données qui s\'apparentent à des souvenirs de famille (loi Informatique et Libertés, article 85). Une clôture de compte peut entraîner la suppression définitive des contenus.',
    what_you_do: [
      'Apple (iCloud) : si le défunt vous a désigné contact légataire, faire la demande sur le site Héritage numérique d\'Apple, avec votre clé d\'accès et l\'acte de décès',
      'Google (Google Photos, Drive) : utiliser le formulaire de Google pour le compte d\'un utilisateur décédé ; Google ne communique jamais le mot de passe',
      'Microsoft (OneDrive) : les contenus ne sont communiqués que sur décision de justice ; le compte expire après 2 ans d\'inactivité',
      'Télécharger ce que vous souhaitez garder avant de demander la clôture des comptes',
    ],
    responsable: 'vous',
    requires_notary: false,
    applicable_when: { abonnements: ['photos_documents'] },
    source_url: 'https://www.cnil.fr/fr/mort-numerique-effacement-informations-personne-decedee',
    display_order: 60,
  },
```

- [ ] **Step 7 : étapes EN (jumelles)**

Dans `src/data/steps-catalog.en.ts`, mêmes 5 opérations, avec ces textes :

1. Objet entier `logement-resiliation-telecom` :

```ts
  {
    id: 'logement-resiliation-telecom',
    title: 'Cancel the internet and phone subscriptions',
    description: 'The deceased\'s internet, landline and mobile subscriptions must be cancelled.',
    theme: 'logement',
    urgency: 'month',
    urgency_label: 'Within the month',
    when_to_do: 'Within the month following the death.',
    why_to_do: 'No general rule requires cancellation free of charge on death: it depends on the contract\'s terms and conditions. Cancellation takes effect no later than 10 days after the request is received, and amounts paid in advance are refunded no later than 10 days after the final bill is paid.',
    what_you_do: [
      'Contact the providers (internet, mobile, landline), quoting the customer number',
      'Request cancellation on the grounds of death, free of charge if the terms and conditions provide for it',
      'Provide a copy of the death certificate',
      'Return the equipment (router, set-top box) if requested',
    ],
    responsable: 'vous',
    requires_notary: false,
    applicable_when: { abonnements: ['telephonie'] },
    source_url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/R64939',
    display_order: 21,
  },
```

2 et 3. Mêmes conditions sur `numerique-reseaux-sociaux` et `numerique-boite-email`.

4. Objet entier `numerique-abonnements` :

```ts
  {
    id: 'numerique-abonnements',
    title: 'Spot the direct debits still running',
    description: 'Go through the deceased\'s latest bank and card statements to spot the subscriptions and direct debits that are still running.',
    theme: 'numerique',
    urgency: 'month',
    urgency_label: 'Within the month',
    when_to_do: 'Within the month following the death.',
    why_to_do: 'A subscription paid by card or by direct debit from an account that is still active (a joint account, for example) keeps being charged until it is cancelled. Statements also reveal forgotten subscriptions.',
    what_you_do: [
      'Review the statements of the last few months: direct debits and card payments that recur every month',
      'List each provider with its amount and contract reference',
      'Write to each one to request cancellation, enclosing a copy of the death certificate',
    ],
    responsable: 'vous',
    requires_notary: false,
    applicable_when: {},
    source_url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F37096',
    display_order: 23,
  },
```

5. Fin du tableau :

```ts
  // ── V2 PERSONALIZATION: SUBSCRIPTIONS AND ACCOUNTS ───────────────────
  {
    id: 'abonnements-presse',
    title: 'Cancel newspaper and magazine subscriptions',
    description: 'Newspaper and magazine subscriptions keep being charged until they are cancelled.',
    theme: 'abonnements',
    urgency: 'month',
    urgency_label: 'Within the month',
    when_to_do: 'Within the month following the death.',
    why_to_do: 'For each contract, the official guide recommends a letter quoting the contract number, with a copy of the death certificate. Whether issues paid in advance are refunded depends on the subscription terms.',
    what_you_do: [
      'Find the subscriber number (on the mailing label, an invoice or an email from the publisher)',
      'Send the cancellation request to the subscriptions department, with a copy of the death certificate',
      'Ask for the direct debits to stop and, if the terms provide for it, for undelivered issues to be refunded',
    ],
    responsable: 'vous',
    requires_notary: false,
    applicable_when: { abonnements: ['presse'] },
    source_url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F37096',
    display_order: 56,
  },
  {
    id: 'abonnements-sport-association',
    title: 'End a gym subscription or a membership',
    description: 'Gym, club or association: report the death to end the subscription or membership and stop the direct debits.',
    theme: 'abonnements',
    urgency: 'month',
    urgency_label: 'Within the month',
    when_to_do: 'Within the month following the death.',
    why_to_do: 'The terms (notice period, possible refund) depend on the contract or the association\'s statutes: a letter quoting the subscription references, with a copy of the death certificate, lets you request cancellation.',
    what_you_do: [
      'Find the contract or membership card (subscription references)',
      'Send the cancellation request, with a copy of the death certificate',
      'Ask for the direct debits to stop and, where applicable, for the unused period to be refunded',
    ],
    responsable: 'vous',
    requires_notary: false,
    applicable_when: { abonnements: ['sport_loisirs'] },
    source_url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F37096',
    display_order: 57,
  },
  {
    id: 'abonnements-streaming',
    title: 'Cancel streaming and music subscriptions',
    description: 'Netflix, Spotify, Deezer, Canal+…: these subscriptions are cancelled online or through each platform\'s customer service.',
    theme: 'abonnements',
    urgency: 'month',
    urgency_label: 'Within the month',
    when_to_do: 'Within the month following the death.',
    why_to_do: 'A subscription paid by card or by direct debit from an account that is still active keeps being charged until it is cancelled. Heirs can ask for the deceased\'s accounts to be closed.',
    what_you_do: [
      'Identify the platforms from the bank and card statements',
      'Netflix: cancel from the Account page if you have access; otherwise, contact customer service with the account\'s email or phone number and the payment details',
      'Spotify, Deezer and other platforms: contact their customer service, reporting the death',
      'Keep the confirmation of each cancellation',
    ],
    responsable: 'vous',
    requires_notary: false,
    applicable_when: { abonnements: ['streaming'] },
    source_url: 'https://www.cnil.fr/fr/mort-numerique-effacement-informations-personne-decedee',
    display_order: 58,
  },
  {
    id: 'abonnements-services-en-ligne',
    title: 'Cancel paid software and online services',
    description: 'Cloud storage, antivirus, office suites, apps, Amazon Prime…: these subscriptions keep being charged until they are cancelled.',
    theme: 'abonnements',
    urgency: 'month',
    urgency_label: 'Within the month',
    when_to_do: 'Within the month following the death.',
    why_to_do: 'The French Data Protection Act (article 85) allows heirs to have the deceased\'s accounts closed. Each service has its own procedure, often described in its online help.',
    what_you_do: [
      'Identify the paid services from the statements, including subscriptions taken out in app stores',
      'Amazon: follow the procedure described in Amazon\'s help in the event of a death (death certificate required; closing the account is permanent)',
      'Microsoft: stop the payment method for subscriptions; the account expires after 2 years of inactivity',
      'Other services: contact their customer service, reporting the death, with a copy of the death certificate',
    ],
    responsable: 'vous',
    requires_notary: false,
    applicable_when: { abonnements: ['services_en_ligne'] },
    source_url: 'https://www.cnil.fr/fr/mort-numerique-effacement-informations-personne-decedee',
    display_order: 59,
  },
  {
    id: 'numerique-photos-documents',
    title: 'Retrieve photos and documents stored online',
    description: 'The deceased\'s photos, videos and documents may be stored online (iCloud, Google Photos, OneDrive…). Retrieve them before any account is closed.',
    theme: 'numerique',
    urgency: 'later',
    urgency_label: 'Whenever you feel ready',
    when_to_do: 'Whenever you wish, before requesting that the accounts be closed.',
    why_to_do: 'Heirs can obtain data that amounts to family memories (French Data Protection Act, article 85). Closing an account may permanently delete its content.',
    what_you_do: [
      'Apple (iCloud): if the deceased named you as a Legacy Contact, make the request on Apple\'s Digital Legacy site with your access key and the death certificate',
      'Google (Google Photos, Drive): use Google\'s form for a deceased user\'s account; Google never provides the password',
      'Microsoft (OneDrive): content is only released under a court decision; the account expires after 2 years of inactivity',
      'Download what you want to keep before requesting that the accounts be closed',
    ],
    responsable: 'vous',
    requires_notary: false,
    applicable_when: { abonnements: ['photos_documents'] },
    source_url: 'https://www.cnil.fr/fr/mort-numerique-effacement-informations-personne-decedee',
    display_order: 60,
  },
```

- [ ] **Step 8 : tout doit passer**

```bash
npx tsc --noEmit && echo TSC_OK
npx vitest run 2>&1 | tail -4
```
Attendu : `TSC_OK`, 0 échec (dont le nouveau plafond ≤ 15 questions vues avec pré-remplissage).

- [ ] **Step 9 : commit**

```bash
git add src/types/questionnaire.ts server/lib/questions-catalog.js src/data/steps-catalog.ts src/data/steps-catalog.fr.ts src/data/steps-catalog.en.ts src/components/documents/DocumentCard.tsx src/pages/DocumentsPage.tsx src/i18n/strings.fr.ts src/i18n/strings.en.ts tests/questions-catalog.test.ts tests/questionnaire-engine.test.ts tests/questionnaire-routes.test.ts tests/roadmap-generator.test.ts
git commit -m "feat(perso-v2): question « abonnements et comptes » — 5 étapes, 3 étapes devenues conditionnelles, thème Abonnements

Presse, téléphonie, sport/association, streaming, services en ligne, réseaux sociaux, e-mail,
photos : chaque case ajoute sa démarche. « Repérer les prélèvements encore actifs » reste proposé à
tous. 15 questions vues au plus avec l'identité pré-remplie (test d'invariant).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5 : Cinq courriers de résiliation / information, ville et numéro d'abonné

**Files :**
- Modify : `src/data/letter-templates.ts` (variable `subscriber_number`, 5 modèles)
- Modify : `server/lib/letter-templates.js` (5 jumeaux serveur, `recipient_kind: 'user_specific'`)
- Modify : `server/lib/letter-channels.js` (5 entrées `papier`)
- Modify : `src/data/steps-catalog.fr.ts`, `src/data/steps-catalog.en.ts` (`letter_template_id` sur 5 étapes)
- Test : `tests/invariants.test.ts`, `tests/letter-templates-server.test.ts`

- [ ] **Step 1 : tests qui échouent**

1. `tests/invariants.test.ts` — ajouter l'import `import { LETTER_TEMPLATES } from '@/data/letter-templates'` puis, en fin de fichier :

```ts
describe('invariant : étapes ↔ courriers', () => {
  it('chaque letter_template_id d’étape existe', () => {
    for (const s of STEPS_CATALOG) {
      if (!s.letter_template_id) continue
      expect(LETTER_TEMPLATES.some((t) => t.id === s.letter_template_id), `${s.id} → ${s.letter_template_id}`).toBe(true)
    }
  })
  it('chaque courrier est rattaché à une étape qui le propose', () => {
    for (const t of LETTER_TEMPLATES) {
      const step = STEPS_CATALOG.find((s) => s.id === t.step_id)
      expect(step, `${t.id} : étape ${t.step_id} introuvable`).toBeDefined()
      expect(step!.letter_template_id, `${t.id} : l’étape ${t.step_id} ne le propose pas`).toBe(t.id)
    }
  })
  it('personnalisation v2 : les 5 nouvelles démarches proposent leur courrier', () => {
    const expected: Record<string, string> = {
      'abonnements-presse': 'resiliation-presse',
      'logement-resiliation-telecom': 'resiliation-telecom',
      'abonnements-sport-association': 'resiliation-sport-association',
      'logement-ehpad': 'ehpad-fin-contrat',
      'aides-departement': 'aides-departement',
    }
    for (const [stepId, templateId] of Object.entries(expected)) {
      expect(STEPS_CATALOG.find((s) => s.id === stepId)?.letter_template_id, stepId).toBe(templateId)
    }
  })
})
```

2. `tests/letter-templates-server.test.ts` — ajouter en fin de fichier (réutiliser l'import de `renderLetter` déjà présent en tête) :

```ts
describe('personnalisation v2 — 5 courriers papier, destinataire saisi par la famille', () => {
  const VALUES: Record<string, string> = {
    organisme_name: 'La Gazette des Chartrons',
    subscriber_number: 'AB-204518',
    user_firstname: 'Camille',
    user_lastname: 'Roussel',
    user_relation: 'fille',
    user_address: '18 rue des Tanneurs, 33000 Bordeaux',
    city: 'Bordeaux',
    deceased_firstname: 'Bernard',
    deceased_lastname: 'Roussel',
    deceased_dob: '1941-03-14',
    deceased_dod: '2026-09-12',
    today_date: '28 septembre 2026',
  }
  const IDS = ['resiliation-presse', 'resiliation-telecom', 'resiliation-sport-association', 'ehpad-fin-contrat', 'aides-departement']
  for (const id of IDS) {
    it(`${id} : canal papier, destinataire propre à la famille, rendu complet sans résidu`, () => {
      const t = SERVER_TEMPLATES.find((x: { id: string }) => x.id === id)
      expect(t, id).toBeDefined()
      expect(t.channel).toBe('papier')
      expect(t.recipient_kind).toBe('user_specific')
      const { subject, body, missingVariables } = renderLetter(id, VALUES)
      expect(missingVariables).toEqual([])
      expect(`${subject}\n${body}`).not.toMatch(/\{\{|\[[A-Z_]+\]/)
      expect(body).toContain('Camille Roussel')
      expect(body).toContain('fille de Bernard Roussel')
      expect(body).toContain('Bordeaux, le 28 septembre 2026')
    })
  }
  it('presse et télécom exigent le numéro d’abonné ou de client', () => {
    for (const id of ['resiliation-presse', 'resiliation-telecom']) {
      const partial = { ...VALUES }
      delete partial.subscriber_number
      expect(renderLetter(id, partial).missingVariables, id).toContain('subscriber_number')
    }
  })
})
```
(`SERVER_TEMPLATES` et `renderLetter` sont déjà importés en tête de ce fichier — vérifié.)

- [ ] **Step 2 : lancer — échecs attendus**

```bash
npx vitest run tests/invariants.test.ts tests/letter-templates-server.test.ts tests/letter-templates.test.ts 2>&1 | tail -12
```

- [ ] **Step 3 : modèles côté client**

Dans `src/data/letter-templates.ts` :

1. Après `VAR_ACCOUNT_NUMBER`, ajouter :

```ts
// Personnalisation v2 : identifiant indispensable à l'éditeur ou à l'opérateur pour retrouver le
// contrat — REQUIS (une variable facultative vide laisserait « [LIBELLÉ] » dans un courrier envoyé).
const VAR_SUBSCRIBER_NUMBER: LetterVariable = { key: 'subscriber_number', label: 'Numéro d\'abonné ou de client', type: 'text', auto_filled: false, required: true }
```

2. Ajouter à la fin de `LETTER_TEMPLATES` (après `impots-notification`) les 5 modèles ci-dessous. Les corps sont reproduits **à l'identique** côté serveur (Step 4) : la parité est testée caractère pour caractère.

Règles de rédaction appliquées (recherche du 2026-09-28) : « acte de décès » (état civil), jamais « certificat de décès » ; le courrier télécom **demande** la résiliation sans frais sans affirmer que la loi l'impose ; le courrier EHPAD cite les articles L. 314-10-1 (sommes perçues d'avance restituées sous 30 jours) et R. 314-149 (socle de prestations facturable 6 jours au plus, dépôt de garantie) du CASF.

**Vérification obligatoire avant le commit** : ouvrir https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032226650 et https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032226641 (via WebFetch) et confirmer que l'article **L. 224-35** du code de la consommation prévoit bien la restitution des sommes versées d'avance « au plus tard dans un délai de dix jours à compter du paiement de la dernière facture ». Si ce n'est pas L. 224-35, corriger le numéro d'article dans le courrier télécom (client ET serveur) ; si la règle est introuvable, retirer la dernière phrase du 3ᵉ paragraphe de ce courrier. Consigner le résultat dans la note post-revue.

```ts
  // ── Personnalisation v2 : courriers papier, destinataire saisi par la famille ──

  // 11. Presse — Résiliation d'abonnement
  {
    id: 'resiliation-presse',
    step_id: 'abonnements-presse',
    organisme: 'Presse',
    subject: 'Résiliation de l\'abonnement de {{deceased_firstname}} {{deceased_lastname}} à la suite de son décès',
    recipient_label: 'Au Service Abonnements de {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}
Abonnement n° {{subscriber_number}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, vous informe de son décès survenu le {{deceased_dod}}.

Je vous demande de bien vouloir résilier l'abonnement n° {{subscriber_number}} souscrit à son nom, à compter de la réception de ce courrier, et de mettre fin aux prélèvements correspondants.

Je vous remercie de me confirmer cette résiliation par écrit et de procéder, le cas échéant, au remboursement des numéros payés d'avance et non servis.

Vous trouverez ci-joint une copie de l'acte de décès.

${SIGNATURE}`,
    variables: [
      VAR_ORGANISME_NAME,
      VAR_SUBSCRIBER_NUMBER,
      VAR_USER_FIRSTNAME,
      VAR_USER_LASTNAME,
      VAR_USER_RELATION,
      VAR_DECEASED_FIRSTNAME,
      VAR_DECEASED_LASTNAME,
      VAR_DECEASED_DOD,
      VAR_USER_ADDRESS,
      VAR_CITY,
      VAR_TODAY_DATE,
    ],
    tone: 'formel',
    notes: 'Seren l\'envoie pour vous par courrier ; joindre l\'acte de décès.',
    channel: 'papier',
  },

  // 12. Opérateur télécom — Résiliation des contrats
  {
    id: 'resiliation-telecom',
    step_id: 'logement-resiliation-telecom',
    organisme: 'Opérateur télécom',
    subject: 'Résiliation des contrats de {{deceased_firstname}} {{deceased_lastname}} à la suite de son décès',
    recipient_label: 'Au Service Clients de {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}
Numéro client : {{subscriber_number}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, vous informe de son décès survenu le {{deceased_dod}}.

Je vous demande de bien vouloir résilier l'ensemble des contrats souscrits à son nom et rattachés au numéro client {{subscriber_number}} (ligne mobile, box internet, ligne fixe).

Je vous remercie de procéder à cette résiliation sans frais, au motif du décès du titulaire, de m'adresser la facture de clôture et de m'indiquer les modalités de restitution du matériel éventuel (box, décodeur). Les sommes versées d'avance devront m'être restituées au plus tard dix jours après le paiement de la dernière facture, conformément à l'article L. 224-35 du code de la consommation.

Vous trouverez ci-joint une copie de l'acte de décès.

${SIGNATURE}`,
    variables: [
      VAR_ORGANISME_NAME,
      VAR_SUBSCRIBER_NUMBER,
      VAR_USER_FIRSTNAME,
      VAR_USER_LASTNAME,
      VAR_USER_RELATION,
      VAR_DECEASED_FIRSTNAME,
      VAR_DECEASED_LASTNAME,
      VAR_DECEASED_DOD,
      VAR_USER_ADDRESS,
      VAR_CITY,
      VAR_TODAY_DATE,
    ],
    tone: 'formel',
    notes: 'Seren l\'envoie pour vous par courrier ; joindre l\'acte de décès.',
    channel: 'papier',
  },

  // 13. Club, salle de sport ou association — Fin d'abonnement ou d'adhésion
  {
    id: 'resiliation-sport-association',
    step_id: 'abonnements-sport-association',
    organisme: 'Club ou association',
    subject: 'Fin de l\'abonnement ou de l\'adhésion de {{deceased_firstname}} {{deceased_lastname}} à la suite de son décès',
    recipient_label: 'À {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, vous informe de son décès survenu le {{deceased_dod}}.

Je vous demande de bien vouloir mettre fin à son abonnement ou à son adhésion à compter de la réception de ce courrier, et d'arrêter les prélèvements correspondants.

Je vous remercie de me confirmer cette résiliation par écrit et de m'indiquer si un remboursement de la période non utilisée est prévu.

Vous trouverez ci-joint une copie de l'acte de décès.

${SIGNATURE}`,
    variables: [
      VAR_ORGANISME_NAME,
      VAR_USER_FIRSTNAME,
      VAR_USER_LASTNAME,
      VAR_USER_RELATION,
      VAR_DECEASED_FIRSTNAME,
      VAR_DECEASED_LASTNAME,
      VAR_DECEASED_DOD,
      VAR_USER_ADDRESS,
      VAR_CITY,
      VAR_TODAY_DATE,
    ],
    tone: 'formel',
    notes: 'Seren l\'envoie pour vous par courrier ; joindre l\'acte de décès.',
    channel: 'papier',
  },

  // 14. EHPAD — Fin du séjour après le décès du résident
  {
    id: 'ehpad-fin-contrat',
    step_id: 'logement-ehpad',
    organisme: 'EHPAD',
    subject: 'Décès de {{deceased_firstname}} {{deceased_lastname}} — fin du séjour et facture de clôture',
    recipient_label: 'À la Direction de {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, né(e) le {{deceased_dob}}, résident(e) de votre établissement, vous confirme son décès survenu le {{deceased_dod}}.

Je souhaite convenir avec vous, dans les meilleurs délais, d'une date pour retirer ses effets personnels et réaliser l'état des lieux de sortie.

Je vous remercie de m'adresser la facture de clôture, établie conformément aux articles L. 314-10-1 et R. 314-149 du code de l'action sociale et des familles, et de restituer les sommes perçues d'avance ainsi que le dépôt de garantie dans les délais prévus par ces textes.

Vous trouverez ci-joint une copie de l'acte de décès.

${SIGNATURE}`,
    variables: [
      VAR_ORGANISME_NAME,
      VAR_USER_FIRSTNAME,
      VAR_USER_LASTNAME,
      VAR_USER_RELATION,
      VAR_DECEASED_FIRSTNAME,
      VAR_DECEASED_LASTNAME,
      VAR_DECEASED_DOB,
      VAR_DECEASED_DOD,
      VAR_USER_ADDRESS,
      VAR_CITY,
      VAR_TODAY_DATE,
    ],
    tone: 'formel',
    notes: 'Seren l\'envoie pour vous par courrier ; joindre l\'acte de décès.',
    channel: 'papier',
  },

  // 15. Conseil départemental — Aides versées au défunt
  {
    id: 'aides-departement',
    step_id: 'aides-departement',
    organisme: 'Conseil départemental',
    subject: 'Décès de {{deceased_firstname}} {{deceased_lastname}} — aides versées par le département',
    recipient_label: 'À l\'attention du service autonomie — {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, né(e) le {{deceased_dob}}, vous informe de son décès survenu le {{deceased_dod}}.

{{deceased_firstname}} {{deceased_lastname}} bénéficiait d'une ou de plusieurs aides versées par votre département (allocation personnalisée d'autonomie, aide sociale à l'hébergement ou prestation de compensation du handicap). Je vous demande de bien vouloir mettre fin à leur versement et de m'indiquer, le cas échéant, les sommes à régulariser.

Si une aide sociale à l'hébergement lui était accordée, je vous remercie de m'adresser le relevé des sommes versées, afin que je puisse le transmettre au notaire chargé de la succession.

Vous trouverez ci-joint une copie de l'acte de décès.

${SIGNATURE}`,
    variables: [
      VAR_ORGANISME_NAME,
      VAR_USER_FIRSTNAME,
      VAR_USER_LASTNAME,
      VAR_USER_RELATION,
      VAR_DECEASED_FIRSTNAME,
      VAR_DECEASED_LASTNAME,
      VAR_DECEASED_DOB,
      VAR_DECEASED_DOD,
      VAR_USER_ADDRESS,
      VAR_CITY,
      VAR_TODAY_DATE,
    ],
    tone: 'formel',
    notes: 'Seren l\'envoie pour vous par courrier ; joindre l\'acte de décès.',
    channel: 'papier',
  },
```

- [ ] **Step 4 : jumeaux serveur et canaux**

1. `server/lib/letter-templates.js` : ajouter à la fin de `RAW_TEMPLATES` les 5 entrées ci-dessous (mêmes `subject`, `recipient_label`, `body` verbatim ; `variables` est dérivé automatiquement) :

```js
  // ── Personnalisation v2 : courriers papier (spec docs/design-personnalisation-v2.md §6.4) ──

  // 11. Presse — Résiliation d'abonnement
  {
    id: 'resiliation-presse',
    channel: 'papier',
    // Éditeur propre à l'abonnement du défunt : aucun annuaire réseau → adresse saisie par la famille.
    recipient_kind: 'user_specific',
    subject: 'Résiliation de l\'abonnement de {{deceased_firstname}} {{deceased_lastname}} à la suite de son décès',
    recipient_label: 'Au Service Abonnements de {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}
Abonnement n° {{subscriber_number}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, vous informe de son décès survenu le {{deceased_dod}}.

Je vous demande de bien vouloir résilier l'abonnement n° {{subscriber_number}} souscrit à son nom, à compter de la réception de ce courrier, et de mettre fin aux prélèvements correspondants.

Je vous remercie de me confirmer cette résiliation par écrit et de procéder, le cas échéant, au remboursement des numéros payés d'avance et non servis.

Vous trouverez ci-joint une copie de l'acte de décès.

${SIGNATURE}`,
  },

  // 12. Opérateur télécom — Résiliation des contrats
  {
    id: 'resiliation-telecom',
    channel: 'papier',
    // Opérateur choisi par le défunt : aucun annuaire réseau → adresse saisie par la famille.
    recipient_kind: 'user_specific',
    subject: 'Résiliation des contrats de {{deceased_firstname}} {{deceased_lastname}} à la suite de son décès',
    recipient_label: 'Au Service Clients de {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}
Numéro client : {{subscriber_number}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, vous informe de son décès survenu le {{deceased_dod}}.

Je vous demande de bien vouloir résilier l'ensemble des contrats souscrits à son nom et rattachés au numéro client {{subscriber_number}} (ligne mobile, box internet, ligne fixe).

Je vous remercie de procéder à cette résiliation sans frais, au motif du décès du titulaire, de m'adresser la facture de clôture et de m'indiquer les modalités de restitution du matériel éventuel (box, décodeur). Les sommes versées d'avance devront m'être restituées au plus tard dix jours après le paiement de la dernière facture, conformément à l'article L. 224-35 du code de la consommation.

Vous trouverez ci-joint une copie de l'acte de décès.

${SIGNATURE}`,
  },

  // 13. Club, salle de sport ou association — Fin d'abonnement ou d'adhésion
  {
    id: 'resiliation-sport-association',
    channel: 'papier',
    // Club ou association propre au défunt : aucun annuaire réseau → adresse saisie par la famille.
    recipient_kind: 'user_specific',
    subject: 'Fin de l\'abonnement ou de l\'adhésion de {{deceased_firstname}} {{deceased_lastname}} à la suite de son décès',
    recipient_label: 'À {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, vous informe de son décès survenu le {{deceased_dod}}.

Je vous demande de bien vouloir mettre fin à son abonnement ou à son adhésion à compter de la réception de ce courrier, et d'arrêter les prélèvements correspondants.

Je vous remercie de me confirmer cette résiliation par écrit et de m'indiquer si un remboursement de la période non utilisée est prévu.

Vous trouverez ci-joint une copie de l'acte de décès.

${SIGNATURE}`,
  },

  // 14. EHPAD — Fin du séjour après le décès du résident
  {
    id: 'ehpad-fin-contrat',
    channel: 'papier',
    // Établissement du défunt : aucun annuaire réseau → adresse saisie par la famille.
    recipient_kind: 'user_specific',
    subject: 'Décès de {{deceased_firstname}} {{deceased_lastname}} — fin du séjour et facture de clôture',
    recipient_label: 'À la Direction de {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, né(e) le {{deceased_dob}}, résident(e) de votre établissement, vous confirme son décès survenu le {{deceased_dod}}.

Je souhaite convenir avec vous, dans les meilleurs délais, d'une date pour retirer ses effets personnels et réaliser l'état des lieux de sortie.

Je vous remercie de m'adresser la facture de clôture, établie conformément aux articles L. 314-10-1 et R. 314-149 du code de l'action sociale et des familles, et de restituer les sommes perçues d'avance ainsi que le dépôt de garantie dans les délais prévus par ces textes.

Vous trouverez ci-joint une copie de l'acte de décès.

${SIGNATURE}`,
  },

  // 15. Conseil départemental — Aides versées au défunt
  {
    id: 'aides-departement',
    channel: 'papier',
    // Conseil départemental : hors des 4 réseaux de l'annuaire (caf/cpam/carsat/impots) → adresse saisie.
    recipient_kind: 'user_specific',
    subject: 'Décès de {{deceased_firstname}} {{deceased_lastname}} — aides versées par le département',
    recipient_label: 'À l\'attention du service autonomie — {{organisme_name}}',
    body: `{{recipient_label}}

Objet : {{subject}}

Madame, Monsieur,

Je soussigné(e) {{user_firstname}} {{user_lastname}}, {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}}, né(e) le {{deceased_dob}}, vous informe de son décès survenu le {{deceased_dod}}.

{{deceased_firstname}} {{deceased_lastname}} bénéficiait d'une ou de plusieurs aides versées par votre département (allocation personnalisée d'autonomie, aide sociale à l'hébergement ou prestation de compensation du handicap). Je vous demande de bien vouloir mettre fin à leur versement et de m'indiquer, le cas échéant, les sommes à régulariser.

Si une aide sociale à l'hébergement lui était accordée, je vous remercie de m'adresser le relevé des sommes versées, afin que je puisse le transmettre au notaire chargé de la succession.

Vous trouverez ci-joint une copie de l'acte de décès.

${SIGNATURE}`,
  },
```

2. `server/lib/letter-channels.js` : ajouter à `LETTER_CHANNELS` :

```js
  // Personnalisation v2 : courriers papier, destinataire saisi par la famille (user_specific).
  'resiliation-presse': 'papier',
  'resiliation-telecom': 'papier',
  'resiliation-sport-association': 'papier',
  'ehpad-fin-contrat': 'papier',
  'aides-departement': 'papier',
```

- [ ] **Step 5 : rattacher les courriers aux étapes (FR et EN, valeurs identiques)**

Dans `src/data/steps-catalog.fr.ts` **et** `src/data/steps-catalog.en.ts`, ajouter la ligne `letter_template_id: '<id>',` juste avant `display_order` dans les étapes : `abonnements-presse` → `resiliation-presse` ; `logement-resiliation-telecom` → `resiliation-telecom` ; `abonnements-sport-association` → `resiliation-sport-association` ; `logement-ehpad` → `ehpad-fin-contrat` ; `aides-departement` → `aides-departement`.

- [ ] **Step 6 : tout doit passer**

```bash
npx tsc --noEmit && echo TSC_OK
npx vitest run 2>&1 | tail -4
```
Attendu : `TSC_OK`, 0 échec (parités client/serveur et canaux, invariant étapes ↔ courriers, rendu des 5 courriers).

- [ ] **Step 7 : commit**

```bash
git add src/data/letter-templates.ts server/lib/letter-templates.js server/lib/letter-channels.js src/data/steps-catalog.fr.ts src/data/steps-catalog.en.ts tests/invariants.test.ts tests/letter-templates-server.test.ts
git commit -m "feat(perso-v2): 5 courriers papier — presse, téléphonie, sport/association, EHPAD, département

Modèles client + jumeaux serveur (destinataire saisi par la famille) + canaux ; numéro d'abonné
requis pour presse et télécom ; invariant étapes ↔ courriers dans les deux sens.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6 : Pré-remplissage du questionnaire depuis le dossier PF (serveur) + dates lisibles au récapitulatif

**Pourquoi :** la PF a déjà saisi prénom, nom et date de décès du défunt (champs obligatoires de son formulaire). Au `/start`, le serveur les lit par `my_dossier_identity()` (Task 1) avec le client au jeton de l'utilisateur et les enregistre dans la session : le moteur saute ces 3 questions, le récapitulatif les affiche, modifiables. Au passage, le récapitulatif affiche les dates en JJ/MM/AAAA au lieu de l'ISO brut (défaut relevé dans `demo-video/chapitres.md` de la vidéo v2 — l'identité pré-remplie y devient visible, d'où ce correctif de 4 lignes, hors spec, noté ici).

**Files :**
- Create : `server/lib/dossier-prefill.js`
- Modify : `server/routes/questionnaire.js` (import, `/start`, `displayValue`)
- Test : `tests/dossier-prefill.test.ts` (créé), `tests/questionnaire-routes.test.ts`

- [ ] **Step 1 : tests unitaires du module (échouent : module absent)**

Créer `tests/dossier-prefill.test.ts` :

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
// @ts-expect-error — module JS serveur
import { prefillFromDossier } from '../server/lib/dossier-prefill.js'

const IDENTITY = {
  family_first_name: 'Camille',
  family_last_name: 'Roussel',
  deceased_first_name: 'Bernard',
  deceased_last_name: 'Roussel',
  deceased_death_date: '2026-09-12',
}

function fakeClient(result: { data?: unknown; error?: unknown } | Error) {
  return {
    rpc: vi.fn(async () => {
      if (result instanceof Error) throw result
      return { data: result.data ?? null, error: result.error ?? null }
    }),
  }
}

describe('prefillFromDossier', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('appelle my_dossier_identity et remplit les 3 questions d’identité du défunt', async () => {
    const client = fakeClient({ data: IDENTITY })
    const out = await prefillFromDossier(client, {})
    expect(client.rpc).toHaveBeenCalledWith('my_dossier_identity')
    expect(out).toEqual({ deceased_firstname: 'Bernard', deceased_lastname: 'Roussel', deceased_dod: '2026-09-12' })
  })

  it('ne reprend jamais les noms de la famille : ce ne sont pas des questions', async () => {
    const out = await prefillFromDossier(fakeClient({ data: IDENTITY }), {})
    expect(Object.keys(out)).not.toContain('family_first_name')
    expect(Object.keys(out)).not.toContain('family_last_name')
  })

  it('n’écrase jamais une réponse déjà présente', async () => {
    const out = await prefillFromDossier(fakeClient({ data: IDENTITY }), { deceased_firstname: 'Bernie' })
    expect(out.deceased_firstname).toBe('Bernie')
    expect(out.deceased_lastname).toBe('Roussel')
  })

  it('ignore une valeur invalide (date future, texte blanc) : la question sera posée', async () => {
    const out = await prefillFromDossier(
      fakeClient({ data: { ...IDENTITY, deceased_death_date: '2999-01-01', deceased_last_name: '   ' } }),
      {}
    )
    expect(out).toEqual({ deceased_firstname: 'Bernard' })
  })

  it('trime les textes comme une vraie réponse', async () => {
    const out = await prefillFromDossier(fakeClient({ data: { ...IDENTITY, deceased_first_name: '  Bernard ' } }), {})
    expect(out.deceased_firstname).toBe('Bernard')
  })

  it('aucun dossier (null) : réponses inchangées, même référence', async () => {
    const answers = {}
    expect(await prefillFromDossier(fakeClient({ data: null }), answers)).toBe(answers)
  })

  it('erreur Supabase ou exception : réponses inchangées, jamais de throw', async () => {
    const answers = { relation: 'parent' }
    expect(await prefillFromDossier(fakeClient({ error: { message: 'boom' } }), answers)).toBe(answers)
    expect(await prefillFromDossier(fakeClient(new Error('réseau')), answers)).toBe(answers)
  })
})
```

- [ ] **Step 2 : lancer — échec attendu**

```bash
npx vitest run tests/dossier-prefill.test.ts 2>&1 | tail -6
```
Attendu : FAIL, `Failed to load url ../server/lib/dossier-prefill.js` (module inexistant).

- [ ] **Step 3 : créer le module**

Créer `server/lib/dossier-prefill.js` :

```js
// Pré-remplissage du questionnaire depuis le dossier ouvert par la PF (personnalisation v2,
// spec docs/design-personnalisation-v2.md §4.3). La PF a saisi prénom, nom et date de décès du
// défunt (champs obligatoires de son formulaire) : la famille ne les retape pas, elle les retrouve
// au récapitulatif, modifiables. Lecture par la RPC my_dossier_identity() avec le client AU JETON
// de l'utilisateur (security definer bornée à auth.uid() — migration 20260928121000).
import * as Sentry from '@sentry/node'
import { QUESTIONS_CATALOG } from './questions-catalog.js'
import { validateAnswer, setAnswer } from './questionnaire-engine.js'

// Colonne renvoyée par my_dossier_identity() → question d'identité du catalogue. Les noms de la
// famille (family_*) ne sont PAS des questions : ils servent à l'écran de coordonnées (client).
export const DOSSIER_PREFILL = [
  ['deceased_first_name', 'deceased_firstname'],
  ['deceased_last_name', 'deceased_lastname'],
  ['deceased_death_date', 'deceased_dod'],
]

/**
 * Retourne les réponses enrichies des champs d'identité connus du dossier. Une valeur absente ou
 * invalide est ignorée (la question sera posée) ; une réponse déjà présente n'est jamais écrasée.
 * Un échec de lecture ne bloque pas le démarrage (dégradation, pas un contrôle d'accès) : log sans
 * PII + capture Sentry, et les réponses reviennent inchangées (même référence).
 */
export async function prefillFromDossier(client, answers) {
  let identity
  try {
    const { data, error } = await client.rpc('my_dossier_identity')
    if (error) throw new Error(error.message ?? 'my_dossier_identity')
    identity = data
  } catch (error) {
    console.error('⚠️ questionnaire/start : identité du dossier indisponible, questions posées normalement')
    Sentry.captureException(error)
    return answers
  }
  if (!identity || typeof identity !== 'object') return answers
  let next = answers
  for (const [column, questionId] of DOSSIER_PREFILL) {
    const spec = QUESTIONS_CATALOG.find((q) => q.id === questionId)
    const value = identity[column]
    if (!spec || value == null || next[questionId] !== undefined) continue
    if (!validateAnswer(spec, value).ok) continue
    next = setAnswer(next, spec, value)
  }
  return next
}
```

- [ ] **Step 4 : relancer les tests unitaires**

```bash
npx vitest run tests/dossier-prefill.test.ts 2>&1 | tail -4
```
Attendu : `7 passed`.

- [ ] **Step 5 : tests de route (échouent : route non branchée)**

Dans `tests/questionnaire-routes.test.ts` :

1. Remplacer la signature et le `requireAuth` de `makeApp` pour injecter un faux `rpc` (sans lui, le pré-remplissage lèverait sur `{}.rpc`) :

```ts
function makeApp(opts: { identity?: unknown; rpcError?: boolean } = {}) {
```
et, dans cette même fonction, remplacer le bloc `const requireAuth = … }` par :

```ts
  const rpcCalls: string[] = []
  const requireAuth = (req: express.Request & { user?: unknown; supabaseClient?: unknown }, _res: express.Response, next: express.NextFunction) => {
    req.user = { id: 'user-1' }
    req.supabaseClient = {
      rpc: async (fn: string) => {
        rpcCalls.push(fn)
        return opts.rpcError
          ? { data: null, error: { message: 'boom' } }
          : { data: opts.identity ?? null, error: null }
      },
    }
    next()
  }
```
et ajouter `rpcCalls` à l'objet retourné par `makeApp` (qui contient déjà `app`, `sessions` et `contexts` depuis la Task 3).

2. Partout ailleurs dans ce fichier où un `requireAuth` pose `req.supabaseClient = {}` (3 occurrences hors `makeApp`, vers les lignes 169, 297 et 352 : describe « PII : rédacteur Mistral », « FEATURE_LLM fermé » et leur voisin), remplacer `{}` par un faux client qui répond « aucun dossier » — sans lui, chaque `/start` journaliserait une erreur de pré-remplissage :

```ts
req.supabaseClient = { rpc: async () => ({ data: null, error: null }) }
```
(`tests/flags.test.ts` et `tests/active-dossier-gate.test.ts` montent aussi ce routeur : s'ils appellent `/start` jusqu'au handler, appliquer le même remplacement ; sinon ne rien changer.)

3. Ajouter à la fin du fichier :

```ts
describe('POST /api/questionnaire/start — pré-remplissage depuis le dossier PF', () => {
  const IDENTITY = {
    family_first_name: 'Camille',
    family_last_name: 'Roussel',
    deceased_first_name: 'Bernard',
    deceased_last_name: 'Roussel',
    deceased_death_date: '2026-09-12',
  }

  it('les 3 champs d’identité sont enregistrés dans la session et ne sont pas posés', async () => {
    const { app, sessions, rpcCalls } = makeApp({ identity: IDENTITY })
    const start = await request(app).post('/api/questionnaire/start')
    expect(start.status).toBe(200)
    expect(rpcCalls).toEqual(['my_dossier_identity'])
    expect(start.body.data.question_id).toBe('relation')
    expect(sessions.get(start.body.session_id)!.answers).toEqual({
      deceased_firstname: 'Bernard',
      deceased_lastname: 'Roussel',
      deceased_dod: '2026-09-12',
    })
    const next = await request(app)
      .post('/api/questionnaire/answer')
      .send({ session_id: start.body.session_id, question_id: 'relation', value: 'parent' })
    expect(next.body.data.question_id).toBe('deceased_department')
  })

  it('la progression compte les réponses pré-remplies', async () => {
    const { app } = makeApp({ identity: IDENTITY })
    const start = await request(app).post('/api/questionnaire/start')
    const { current, total } = start.body.data.progress
    expect(current).toBe(3)
    expect(total - current).toBeLessThanOrEqual(15)
  })

  it('le récapitulatif affiche l’identité pré-remplie, date en JJ/MM/AAAA', async () => {
    const { app } = makeApp({ identity: IDENTITY })
    const { recap } = await runToRecap(app)
    const byId = Object.fromEntries(
      recap.recap.map((e: { question_id: string; display: string }) => [e.question_id, e.display])
    )
    expect(byId.deceased_firstname).toBe('Bernard')
    expect(byId.deceased_lastname).toBe('Roussel')
    expect(byId.deceased_dod).toBe('12/09/2026')
  })

  it('RPC en échec : le questionnaire démarre et pose les questions d’identité', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { app } = makeApp({ rpcError: true })
    const start = await request(app).post('/api/questionnaire/start')
    expect(start.status).toBe(200)
    const next = await request(app)
      .post('/api/questionnaire/answer')
      .send({ session_id: start.body.session_id, question_id: 'relation', value: 'parent' })
    expect(next.body.data.question_id).toBe('deceased_firstname')
  })

  it('aucun dossier : session vide, comportement historique', async () => {
    const { app, sessions } = makeApp({ identity: null })
    const start = await request(app).post('/api/questionnaire/start')
    expect(sessions.get(start.body.session_id)!.answers).toEqual({})
    expect(start.body.data.progress.current).toBe(0)
  })
})
```
et ajouter `vi` à l'import vitest en tête de fichier : `import { describe, it, expect, beforeEach, vi } from 'vitest'`.

- [ ] **Step 6 : lancer — échecs attendus**

```bash
npx vitest run tests/questionnaire-routes.test.ts 2>&1 | tail -12
```
Attendu : échecs sur « les 3 champs d'identité… » (`rpcCalls` vide), « la progression… », « le récapitulatif… » (question `deceased_firstname` posée / date `2026-09-12`). Les autres tests passent.

- [ ] **Step 7 : brancher la route et le format de date**

Dans `server/routes/questionnaire.js` :

1. Ajouter l'import après celui de `FAIL_CLOSED_GATE` :

```js
import { prefillFromDossier } from '../lib/dossier-prefill.js'
```

2. Dans `/start`, remplacer la ligne `const session = await store.createSession(req.supabaseClient, req.user.id, lang)` par :

```js
      const session = await store.createSession(req.supabaseClient, req.user.id, lang)
      // Personnalisation v2 (spec §4.3) : identité du défunt reprise du dossier PF — les 3
      // questions sont sautées par le moteur, et restent modifiables au récapitulatif.
      const answers = session.answers ?? {}
      const prefilled = await prefillFromDossier(req.supabaseClient, answers)
      if (prefilled !== answers) {
        session.answers = prefilled
        await store.saveAnswers(req.supabaseClient, session.id, prefilled)
      }
```

3. Dans `displayValue`, ajouter ce cas juste avant `default:` :

```js
    case 'date': {
      // Récapitulatif lisible : AAAA-MM-JJ → JJ/MM/AAAA (même rendu que les courriers).
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value))
      return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value)
    }
```

- [ ] **Step 8 : suite complète + types**

```bash
npx vitest run 2>&1 | tail -4
npx tsc --noEmit && echo TSC_OK
```
Attendu : 0 échec ; `TSC_OK`. Si un test existant vérifiait l'affichage ISO d'une date au récapitulatif, le mettre à jour vers `JJ/MM/AAAA` et le noter dans le message de commit.

- [ ] **Step 9 : commit**

```bash
git add server/lib/dossier-prefill.js server/routes/questionnaire.js tests/dossier-prefill.test.ts tests/questionnaire-routes.test.ts
git commit -m "feat(perso-v2): questionnaire pré-rempli depuis le dossier PF (identité du défunt), dates lisibles au récap

POST /start lit my_dossier_identity() au jeton de l'utilisateur et enregistre prénom, nom et date
de décès du défunt dans la session : le moteur saute ces questions, le récapitulatif les montre
(modifiables). Échec de lecture = dégradation silencieuse (log sans PII + Sentry).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7 : Logique client pure — libellés de lien, profil courrier, pré-remplissage, générateur

**Files :**
- Create : `src/lib/relation-labels.ts`, `src/lib/letter-profile.ts`, `src/lib/letter-autofill.ts`
- Modify : `src/hooks/useLetterGenerator.ts` (cas `city`, export de 2 fonctions pures, resynchronisation)
- Modify : `src/data/letter-templates.ts:33` (`VAR_CITY` → `auto_filled: true`)
- Test : `tests/relation-labels.test.ts`, `tests/letter-profile.test.ts`, `tests/letter-autofill.test.ts`, `tests/letter-generator.test.ts` (créés), `tests/letter-templates.test.ts`

- [ ] **Step 1 : tests des libellés de lien**

Créer `tests/relation-labels.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { relationLabelOptions, defaultRelationLabel } from '@/lib/relation-labels'

describe('relationLabelOptions — ce qu’est l’utilisateur pour le défunt', () => {
  const values = (r: Parameters<typeof relationLabelOptions>[0]) => relationLabelOptions(r)?.map((o) => o.value)

  it('inverse la relation : le défunt était « mon père ou ma mère » → fils / fille', () => {
    expect(values('parent')).toEqual(['fils', 'fille'])
    expect(values('enfant')).toEqual(['père', 'mère'])
  })
  it('couples et fratrie', () => {
    expect(values('conjoint_marie')).toEqual(['époux', 'épouse'])
    expect(values('pacse')).toEqual(['partenaire de PACS'])
    expect(values('concubin')).toEqual(['concubin', 'concubine'])
    expect(values('frere_soeur')).toEqual(['frère', 'sœur'])
  })
  it('« autre » ou relation inconnue → saisie libre (null)', () => {
    expect(relationLabelOptions('autre')).toBeNull()
    expect(relationLabelOptions(undefined)).toBeNull()
  })
  it('libellé FR = le mot seul ; libellé EN = le mot français suivi d’une glose', () => {
    const [fils] = relationLabelOptions('parent')!
    expect(fils.label.fr).toBe('fils')
    expect(fils.label.en).toBe('fils — son')
  })
})

describe('defaultRelationLabel', () => {
  it('seule la forme sans ambiguïté de genre est choisie d’office (PACS)', () => {
    expect(defaultRelationLabel('pacse')).toBe('partenaire de PACS')
    expect(defaultRelationLabel('parent')).toBe('')
    expect(defaultRelationLabel('autre')).toBe('')
    expect(defaultRelationLabel(undefined)).toBe('')
  })
})
```

- [ ] **Step 2 : lancer — échec attendu (module absent)**

```bash
npx vitest run tests/relation-labels.test.ts 2>&1 | tail -4
```

- [ ] **Step 3 : créer `src/lib/relation-labels.ts`**

```ts
import type { RelationV2 } from '@/types/questionnaire'

// Lien écrit dans les courriers — toujours en français (les courriers vont à des organismes
// français). `relation` (questionnaire) dit qui était le défunt POUR l'utilisateur ; le courrier
// écrit ce qu'est l'utilisateur POUR le défunt : « parent » (mon père ou ma mère) → « fils / fille ».
// Le genre n'est jamais deviné : la personne choisit (spec docs/design-personnalisation-v2.md §4.6).
export interface RelationLabelOption {
  value: string // mot français enregistré (sender_profiles.relationship) et écrit dans le courrier
  label: { fr: string; en: string } // FR : le mot seul ; EN : le mot suivi d'une glose
}

function option(value: string, gloss: string): RelationLabelOption {
  return { value, label: { fr: value, en: `${value} — ${gloss}` } }
}

const OPTIONS: Record<Exclude<RelationV2, 'autre'>, RelationLabelOption[]> = {
  conjoint_marie: [option('époux', 'husband'), option('épouse', 'wife')],
  pacse: [option('partenaire de PACS', 'PACS partner')],
  concubin: [option('concubin', 'partner (man)'), option('concubine', 'partner (woman)')],
  parent: [option('fils', 'son'), option('fille', 'daughter')],
  enfant: [option('père', 'father'), option('mère', 'mother')],
  frere_soeur: [option('frère', 'brother'), option('sœur', 'sister')],
}

/** Choix « Vous signez en tant que ». null = saisie libre (relation « autre » ou inconnue). */
export function relationLabelOptions(relation: RelationV2 | undefined): RelationLabelOption[] | null {
  if (!relation || relation === 'autre') return null
  return OPTIONS[relation] ?? null
}

/** Valeur retenue sans intervention : seule une forme unique, donc sans ambiguïté de genre (PACS). */
export function defaultRelationLabel(relation: RelationV2 | undefined): string {
  const options = relationLabelOptions(relation)
  return options && options.length === 1 ? options[0].value : ''
}
```

- [ ] **Step 4 : tests du profil courrier**

Créer `tests/letter-profile.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import {
  fullNameOf,
  validateLetterProfile,
  saveLetterProfile,
  fetchLetterProfile,
  fetchDossierIdentity,
  fetchLatestQuestionnaire,
  saveDeceasedDob,
  type LetterProfileInput,
} from '@/lib/letter-profile'

// Colonnes réelles de sender_profiles : table du chantier 2a + colonnes de la personnalisation v2.
const MIGRATIONS = path.resolve(__dirname, '../supabase/migrations')
const CREATE = readFileSync(path.join(MIGRATIONS, '20260914100000_sender_profiles_organisations.sql'), 'utf8')
const ADD = readFileSync(path.join(MIGRATIONS, '20260928120000_sender_profiles_names.sql'), 'utf8')
const SENDER_COLUMNS = new Set<string>([
  ...[...CREATE.match(/create table if not exists sender_profiles \(([\s\S]*?)\n\);/)![1].matchAll(/^\s+([a-z_0-9]+)\s/gm)].map((m) => m[1]),
  ...[...ADD.matchAll(/add column if not exists ([a-z_0-9]+)/g)].map((m) => m[1]),
])

const VALID: LetterProfileInput = {
  first_name: 'Camille',
  last_name: 'Roussel',
  address_line1: '12 rue des Lilas',
  address_line2: '',
  postal_code: '33000',
  city: 'Bordeaux',
  relationship: 'fille',
}

interface Call { table?: string; rpc?: string; op?: string; payload?: unknown; options?: unknown; filters: Array<[string, unknown]> }

function fakeClient(responses: Array<{ data?: unknown; error?: unknown }> = []) {
  const calls: Call[] = []
  const settle = () => {
    const r = responses.shift() ?? {}
    return Promise.resolve({ data: r.data ?? null, error: r.error ?? null })
  }
  const client = {
    from(table: string) {
      const call: Call = { table, filters: [] }
      calls.push(call)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select(cols: string) { call.op = call.op ?? 'select'; call.payload = cols; return b },
        upsert(payload: unknown, options: unknown) { call.op = 'upsert'; call.payload = payload; call.options = options; return b },
        update(payload: unknown) { call.op = 'update'; call.payload = payload; return b },
        eq(col: string, val: unknown) { call.filters.push([col, val]); return b },
        order() { return b },
        limit() { return b },
        maybeSingle() { return b },
        then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return settle().then(res, rej) },
      }
      return b
    },
    rpc(fn: string) {
      calls.push({ rpc: fn, filters: [] })
      return settle()
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, calls }
}

describe('fullNameOf', () => {
  it('« prénom nom », espaces superflus retirés', () => {
    expect(fullNameOf({ first_name: ' Camille ', last_name: 'Roussel ' })).toBe('Camille Roussel')
  })
})

describe('validateLetterProfile', () => {
  it('profil complet : aucune erreur', () => {
    expect(validateLetterProfile(VALID)).toEqual({})
  })
  it('champs obligatoires', () => {
    const errors = validateLetterProfile({ ...VALID, first_name: ' ', last_name: '', address_line1: '', city: '', relationship: '' })
    expect(errors).toMatchObject({
      first_name: 'firstNameRequired',
      last_name: 'lastNameRequired',
      address_line1: 'addressRequired',
      city: 'cityRequired',
      relationship: 'relationshipRequired',
    })
  })
  it('code postal à 5 chiffres', () => {
    expect(validateLetterProfile({ ...VALID, postal_code: '3300' }).postal_code).toBe('postalCodeInvalid')
    expect(validateLetterProfile({ ...VALID, postal_code: '2A004' }).postal_code).toBe('postalCodeInvalid')
  })
  it('45 caractères par ligne, et « prénom nom » tient sur l’enveloppe', () => {
    expect(validateLetterProfile({ ...VALID, address_line1: 'x'.repeat(46) }).address_line1).toBe('lineTooLong')
    expect(validateLetterProfile({ ...VALID, address_line2: 'x'.repeat(46) }).address_line2).toBe('lineTooLong')
    expect(validateLetterProfile({ ...VALID, first_name: 'x'.repeat(23), last_name: 'y'.repeat(23) }).last_name).toBe('fullNameTooLong')
  })
  it('date de naissance facultative, réelle, antérieure au décès', () => {
    expect(validateLetterProfile(VALID, { value: '', max: '2026-09-12' })).toEqual({})
    expect(validateLetterProfile(VALID, { value: '1941-03-14', max: '2026-09-12' })).toEqual({})
    expect(validateLetterProfile(VALID, { value: '1941-02-30', max: '2026-09-12' }).deceased_dob).toBe('dobInvalid')
    expect(validateLetterProfile(VALID, { value: '2026-09-13', max: '2026-09-12' }).deceased_dob).toBe('dobOutOfRange')
    expect(validateLetterProfile(VALID, { value: '1899-12-31', max: null }).deceased_dob).toBe('dobOutOfRange')
  })
})

describe('accès Supabase du profil courrier', () => {
  it('saveLetterProfile : upsert sur user_id, colonnes du schéma seulement, full_name calculé', async () => {
    const { client, calls } = fakeClient()
    const row = await saveLetterProfile(client, 'user-1', { ...VALID, address_line2: '  ' })
    expect(calls[0].table).toBe('sender_profiles')
    expect(calls[0].op).toBe('upsert')
    expect(calls[0].options).toEqual({ onConflict: 'user_id' })
    const payload = calls[0].payload as Record<string, unknown>
    for (const key of Object.keys(payload)) expect(SENDER_COLUMNS.has(key), `colonne « ${key} » absente`).toBe(true)
    expect(payload).toMatchObject({ user_id: 'user-1', full_name: 'Camille Roussel', address_line2: null })
    expect(row.full_name).toBe('Camille Roussel')
  })
  it('saveLetterProfile : une erreur Supabase remonte', async () => {
    const { client } = fakeClient([{ error: { message: 'rls' } }])
    await expect(saveLetterProfile(client, 'user-1', VALID)).rejects.toThrow('rls')
  })
  it('fetchLetterProfile : lecture par user_id, colonnes du schéma', async () => {
    const { client, calls } = fakeClient([{ data: { full_name: 'Camille Roussel' } }])
    const row = await fetchLetterProfile(client, 'user-1')
    expect(calls[0].filters).toEqual([['user_id', 'user-1']])
    for (const col of String(calls[0].payload).split(',').map((c) => c.trim())) expect(SENDER_COLUMNS.has(col), col).toBe(true)
    expect(row).toEqual({ full_name: 'Camille Roussel' })
  })
  it('fetchDossierIdentity : RPC my_dossier_identity, null si aucun dossier', async () => {
    const { client, calls } = fakeClient([{ data: null }])
    expect(await fetchDossierIdentity(client)).toBeNull()
    expect(calls[0].rpc).toBe('my_dossier_identity')
  })
  it('fetchLatestQuestionnaire : dernière roadmap puis son questionnaire', async () => {
    const { client, calls } = fakeClient([{ data: { questionnaire_id: 'q-1' } }, { data: { id: 'q-1', answers: { relation: 'parent' } } }])
    expect(await fetchLatestQuestionnaire(client, 'user-1')).toEqual({ id: 'q-1', answers: { relation: 'parent' } })
    expect(calls.map((c) => c.table)).toEqual(['roadmaps', 'questionnaires'])
  })
  it('saveDeceasedDob : fusionne ou retire deceased_dob sans toucher au reste', async () => {
    const { client, calls } = fakeClient()
    const next = await saveDeceasedDob(client, 'q-1', { relation: 'parent' }, '1941-03-14')
    expect(next).toEqual({ relation: 'parent', deceased_dob: '1941-03-14' })
    expect(calls[0]).toMatchObject({ table: 'questionnaires', op: 'update', filters: [['id', 'q-1']] })
    const cleared = await saveDeceasedDob(client, 'q-1', next, null)
    expect(cleared).toEqual({ relation: 'parent' })
  })
})
```

- [ ] **Step 5 : lancer — échec attendu**

```bash
npx vitest run tests/letter-profile.test.ts 2>&1 | tail -4
```
Attendu : échec de chargement (`@/lib/letter-profile` absent). La migration `20260928120000_sender_profiles_names.sql` existe depuis la Task 1.

- [ ] **Step 6 : créer `src/lib/letter-profile.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

// Profil courrier (personnalisation v2, spec docs/design-personnalisation-v2.md §4) : identité et
// adresse de la famille, saisies une fois, lues par le pré-remplissage des courriers ET par l'envoi
// papier. Stocké dans `sender_profiles` (RLS owner : lecture/écriture directes depuis le client,
// sans route serveur, comme au chantier 2a). `full_name` reste la donnée lue par l'envoi papier
// (server/routes/letters.js) : il est recalculé « prénom nom » à chaque enregistrement.

export const LINE_MAX = 45
const POSTAL_CODE_RE = /^[0-9]{5}$/
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const DOB_MIN = '1900-01-01'

const PROFILE_COLUMNS = 'first_name, last_name, full_name, address_line1, address_line2, postal_code, city, relationship'

export interface LetterProfileRow {
  first_name: string | null
  last_name: string | null
  full_name: string
  address_line1: string
  address_line2: string | null
  postal_code: string
  city: string
  relationship: string | null
}

export interface LetterProfileInput {
  first_name: string
  last_name: string
  address_line1: string
  address_line2: string
  postal_code: string
  city: string
  relationship: string
}

/** Identité saisie par la PF, relue par my_dossier_identity() (migration 20260928121000). */
export interface DossierIdentity {
  family_first_name: string | null
  family_last_name: string | null
  deceased_first_name: string | null
  deceased_last_name: string | null
  deceased_death_date: string | null
}

export type LetterProfileError =
  | 'firstNameRequired'
  | 'lastNameRequired'
  | 'fullNameTooLong'
  | 'addressRequired'
  | 'lineTooLong'
  | 'postalCodeInvalid'
  | 'cityRequired'
  | 'relationshipRequired'
  | 'dobInvalid'
  | 'dobOutOfRange'

export type LetterProfileField = keyof LetterProfileInput | 'deceased_dob'
export type LetterProfileErrors = Partial<Record<LetterProfileField, LetterProfileError>>

/** Nom écrit sur l'enveloppe (sender_profiles.full_name). */
export function fullNameOf(input: Pick<LetterProfileInput, 'first_name' | 'last_name'>): string {
  return `${input.first_name.trim()} ${input.last_name.trim()}`.trim()
}

function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false
  const t = Date.parse(value)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === value
}

/**
 * Validation pure, mêmes bornes que les CHECK de sender_profiles (45 caractères par ligne, code
 * postal à 5 chiffres). `dob` : date de naissance du défunt, facultative (vide = pas d'erreur).
 */
export function validateLetterProfile(
  input: LetterProfileInput,
  dob?: { value: string; max: string | null }
): LetterProfileErrors {
  const errors: LetterProfileErrors = {}
  const first = input.first_name.trim()
  const last = input.last_name.trim()
  if (!first) errors.first_name = 'firstNameRequired'
  else if (first.length > LINE_MAX) errors.first_name = 'lineTooLong'
  if (!last) errors.last_name = 'lastNameRequired'
  else if (last.length > LINE_MAX) errors.last_name = 'lineTooLong'
  if (!errors.first_name && !errors.last_name && fullNameOf(input).length > LINE_MAX) {
    errors.last_name = 'fullNameTooLong'
  }
  const line1 = input.address_line1.trim()
  if (!line1) errors.address_line1 = 'addressRequired'
  else if (line1.length > LINE_MAX) errors.address_line1 = 'lineTooLong'
  if (input.address_line2.trim().length > LINE_MAX) errors.address_line2 = 'lineTooLong'
  if (!POSTAL_CODE_RE.test(input.postal_code.trim())) errors.postal_code = 'postalCodeInvalid'
  const city = input.city.trim()
  if (!city) errors.city = 'cityRequired'
  else if (city.length > LINE_MAX) errors.city = 'lineTooLong'
  if (!input.relationship.trim()) errors.relationship = 'relationshipRequired'
  if (dob && dob.value) {
    const today = new Date().toISOString().slice(0, 10)
    if (!isRealIsoDate(dob.value)) errors.deceased_dob = 'dobInvalid'
    else if (dob.value < DOB_MIN || dob.value > today || (dob.max !== null && dob.value > dob.max)) {
      errors.deceased_dob = 'dobOutOfRange'
    }
  }
  return errors
}

export async function fetchLetterProfile(client: SupabaseClient, userId: string): Promise<LetterProfileRow | null> {
  const { data, error } = await client.from('sender_profiles').select(PROFILE_COLUMNS).eq('user_id', userId).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as LetterProfileRow | null) ?? null
}

export async function saveLetterProfile(
  client: SupabaseClient,
  userId: string,
  input: LetterProfileInput
): Promise<LetterProfileRow> {
  const row: LetterProfileRow = {
    first_name: input.first_name.trim(),
    last_name: input.last_name.trim(),
    full_name: fullNameOf(input),
    address_line1: input.address_line1.trim(),
    address_line2: input.address_line2.trim() || null,
    postal_code: input.postal_code.trim(),
    city: input.city.trim(),
    relationship: input.relationship.trim() || null,
  }
  const { error } = await client.from('sender_profiles').upsert({ user_id: userId, ...row }, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
  return row
}

export async function fetchDossierIdentity(client: SupabaseClient): Promise<DossierIdentity | null> {
  const { data, error } = await client.rpc('my_dossier_identity')
  if (error) throw new Error(error.message)
  return (data as DossierIdentity | null) ?? null
}

/** Même lecture que DashboardPage : dernière roadmap de l'utilisateur, puis son questionnaire. */
export async function fetchLatestQuestionnaire(
  client: SupabaseClient,
  userId: string
): Promise<{ id: string; answers: Record<string, unknown> } | null> {
  const { data: roadmap, error: rError } = await client
    .from('roadmaps')
    .select('questionnaire_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (rError) throw new Error(rError.message)
  const questionnaireId = (roadmap as { questionnaire_id?: string } | null)?.questionnaire_id
  if (!questionnaireId) return null
  const { data, error } = await client.from('questionnaires').select('id, answers').eq('id', questionnaireId).maybeSingle()
  if (error) throw new Error(error.message)
  const row = data as { id: string; answers: Record<string, unknown> | null } | null
  return row ? { id: row.id, answers: row.answers ?? {} } : null
}

/**
 * Fusionne la date de naissance du défunt dans les réponses (même patron que deceased_department,
 * chantier 2a) ; null retire la clé. Retourne les réponses écrites.
 */
export async function saveDeceasedDob(
  client: SupabaseClient,
  questionnaireId: string,
  answers: Record<string, unknown>,
  dob: string | null
): Promise<Record<string, unknown>> {
  const next: Record<string, unknown> = { ...answers }
  if (dob) next.deceased_dob = dob
  else delete next.deceased_dob
  const { error } = await client.from('questionnaires').update({ answers: next }).eq('id', questionnaireId)
  if (error) throw new Error(error.message)
  return next
}
```

- [ ] **Step 7 : relancer**

```bash
npx vitest run tests/relation-labels.test.ts tests/letter-profile.test.ts 2>&1 | tail -4
```
Attendu : tous verts.

- [ ] **Step 8 : tests du pré-remplissage des courriers**

Créer `tests/letter-autofill.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { buildLetterAutofill, formatSenderAddress } from '@/lib/letter-autofill'
import type { DossierIdentity, LetterProfileRow } from '@/lib/letter-profile'

const PROFILE: LetterProfileRow = {
  first_name: 'Camille',
  last_name: 'Roussel',
  full_name: 'Camille Roussel',
  address_line1: '12 rue des Lilas',
  address_line2: null,
  postal_code: '33000',
  city: 'Bordeaux',
  relationship: 'fille',
}
const DOSSIER: DossierIdentity = {
  family_first_name: 'Camille',
  family_last_name: 'Martin',
  deceased_first_name: 'Bernard',
  deceased_last_name: 'Roussel',
  deceased_death_date: '2026-09-12',
}
const ANSWERS = {
  relation: 'parent',
  deceased_firstname: 'Bernard',
  deceased_lastname: 'Roussel',
  deceased_dod: '2026-09-12',
  deceased_dob: '1941-03-14',
}

describe('formatSenderAddress', () => {
  it('une seule ligne, complément omis quand il est vide', () => {
    expect(formatSenderAddress(PROFILE)).toBe('12 rue des Lilas, 33000 Bordeaux')
  })
  it('avec complément d’adresse', () => {
    expect(formatSenderAddress({ ...PROFILE, address_line2: 'Bât. B' })).toBe('12 rue des Lilas, Bât. B, 33000 Bordeaux')
  })
})

describe('buildLetterAutofill', () => {
  it('profil complet : identité et adresse du profil, défunt des réponses', () => {
    const a = buildLetterAutofill({ profile: PROFILE, dossier: DOSSIER, answers: ANSWERS })
    expect(a.userProfile).toEqual({
      firstname: 'Camille',
      lastname: 'Roussel',
      address: '12 rue des Lilas, 33000 Bordeaux',
      city: 'Bordeaux',
      relation: 'fille',
    })
    expect(a.questionnaireData).toEqual({
      deceased_firstname: 'Bernard',
      deceased_lastname: 'Roussel',
      deceased_dob: '1941-03-14',
      deceased_dod: '2026-09-12',
    })
  })
  it('sans profil : prénom et nom viennent du dossier PF ; adresse, ville et lien restent vides', () => {
    const a = buildLetterAutofill({ profile: null, dossier: DOSSIER, answers: ANSWERS })
    expect(a.userProfile).toEqual({ firstname: 'Camille', lastname: 'Martin', address: undefined, city: undefined, relation: undefined })
  })
  it('profil hérité du 2a (sans first_name/last_name) : repli sur le dossier pour les noms', () => {
    const legacy = { ...PROFILE, first_name: null, last_name: null }
    const a = buildLetterAutofill({ profile: legacy, dossier: DOSSIER, answers: ANSWERS })
    expect(a.userProfile.firstname).toBe('Camille')
    expect(a.userProfile.lastname).toBe('Martin')
    expect(a.userProfile.address).toBe('12 rue des Lilas, 33000 Bordeaux')
  })
  it('lien par défaut : « partenaire de PACS » sans profil, rien pour une relation à deux formes', () => {
    expect(buildLetterAutofill({ profile: null, dossier: null, answers: { relation: 'pacse' } }).userProfile.relation).toBe('partenaire de PACS')
    expect(buildLetterAutofill({ profile: null, dossier: null, answers: { relation: 'parent' } }).userProfile.relation).toBeUndefined()
  })
  it('réponses sans identité (dossier ancien) : repli sur le dossier PF', () => {
    const a = buildLetterAutofill({ profile: null, dossier: DOSSIER, answers: {} })
    expect(a.questionnaireData).toEqual({
      deceased_firstname: 'Bernard',
      deceased_lastname: 'Roussel',
      deceased_dob: undefined,
      deceased_dod: '2026-09-12',
    })
  })
  it('chaînes vides ou blanches traitées comme absentes', () => {
    const a = buildLetterAutofill({ profile: { ...PROFILE, relationship: '  ' }, dossier: null, answers: { relation: 'parent', deceased_dob: '' } })
    expect(a.userProfile.relation).toBeUndefined()
    expect(a.questionnaireData.deceased_dob).toBeUndefined()
  })
})
```

- [ ] **Step 9 : créer `src/lib/letter-autofill.ts`**

```ts
import type { LetterGeneratorOptions } from '@/hooks/useLetterGenerator'
import type { RelationV2 } from '@/types/questionnaire'
import { defaultRelationLabel } from '@/lib/relation-labels'
import type { DossierIdentity, LetterProfileRow } from '@/lib/letter-profile'

// Pré-remplissage des courriers (personnalisation v2, spec docs/design-personnalisation-v2.md
// §4.1) : priorités profil courrier → dossier PF → réponses. Fonction pure, sans réseau.
export interface LetterAutofill {
  userProfile: NonNullable<LetterGeneratorOptions['userProfile']>
  questionnaireData: NonNullable<LetterGeneratorOptions['questionnaireData']>
}

interface LetterAutofillSources {
  profile: LetterProfileRow | null
  dossier: DossierIdentity | null
  answers: Record<string, unknown>
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** Adresse sur une ligne, telle qu'écrite sous la signature : « 12 rue X, Bât. B, 33000 Bordeaux ». */
export function formatSenderAddress(
  profile: Pick<LetterProfileRow, 'address_line1' | 'address_line2' | 'postal_code' | 'city'>
): string {
  return [profile.address_line1, profile.address_line2, `${profile.postal_code} ${profile.city}`]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(', ')
}

export function buildLetterAutofill({ profile, dossier, answers }: LetterAutofillSources): LetterAutofill {
  const relation = text(answers.relation) as RelationV2 | undefined
  const address = profile ? formatSenderAddress(profile) : ''
  return {
    userProfile: {
      firstname: text(profile?.first_name) ?? text(dossier?.family_first_name),
      lastname: text(profile?.last_name) ?? text(dossier?.family_last_name),
      address: address || undefined,
      city: text(profile?.city),
      relation: text(profile?.relationship) ?? (defaultRelationLabel(relation) || undefined),
    },
    questionnaireData: {
      deceased_firstname: text(answers.deceased_firstname) ?? text(dossier?.deceased_first_name),
      deceased_lastname: text(answers.deceased_lastname) ?? text(dossier?.deceased_last_name),
      deceased_dob: text(answers.deceased_dob),
      deceased_dod: text(answers.deceased_dod) ?? text(dossier?.deceased_death_date),
    },
  }
}
```

- [ ] **Step 10 : tests du générateur (échouent : `city` non géré, fonctions non exportées)**

Créer `tests/letter-generator.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { buildInitialValues, mergeAutoFilled } from '@/hooks/useLetterGenerator'
import { getLetterTemplate } from '@/data/letter-templates'

describe('buildInitialValues', () => {
  const template = getLetterTemplate('banque-declaration-deces')!

  it('remplit la ville et l’adresse depuis le profil courrier', () => {
    const values = buildInitialValues(template, {
      firstname: 'Camille',
      lastname: 'Roussel',
      address: '12 rue des Lilas, 33000 Bordeaux',
      relation: 'fille',
      city: 'Bordeaux',
    })
    expect(values.city).toBe('Bordeaux')
    expect(values.user_address).toBe('12 rue des Lilas, 33000 Bordeaux')
    expect(values.user_relation).toBe('fille')
  })
  it('date de naissance du défunt rédigée en toutes lettres', () => {
    const values = buildInitialValues(template, undefined, { deceased_dob: '1941-03-14' })
    expect(values.deceased_dob).toBe('14 mars 1941')
  })
})

describe('mergeAutoFilled', () => {
  it('les valeurs auto non vides remplacent, les vides n’effacent pas une saisie', () => {
    const prev = { organisme_name: 'Banque X', user_address: '', deceased_dob: '1941-03-14' }
    const auto = { user_address: '12 rue des Lilas, 33000 Bordeaux', deceased_dob: '' }
    expect(mergeAutoFilled(prev, auto)).toEqual({
      organisme_name: 'Banque X',
      user_address: '12 rue des Lilas, 33000 Bordeaux',
      deceased_dob: '1941-03-14',
    })
  })
  it('rien à changer : même référence (pas de rendu inutile)', () => {
    const prev = { city: 'Bordeaux' }
    expect(mergeAutoFilled(prev, { city: 'Bordeaux' })).toBe(prev)
  })
})
```

Et dans `tests/letter-templates.test.ts`, ajouter à la fin :

```ts
describe('ville : variable pré-remplie (personnalisation v2)', () => {
  it('city est auto_filled dans tous les modèles qui l’utilisent', () => {
    for (const t of LETTER_TEMPLATES) {
      const city = t.variables.find((v) => v.key === 'city')
      if (city) expect(city.auto_filled, t.id).toBe(true)
    }
  })
})
```
(`LETTER_TEMPLATES` est déjà importé en tête de ce fichier — vérifié.)

- [ ] **Step 11 : lancer — échecs attendus**

```bash
npx vitest run tests/letter-generator.test.ts tests/letter-templates.test.ts 2>&1 | tail -8
```
Attendu : `buildInitialValues`/`mergeAutoFilled` non exportés ; `city` non auto_filled.

- [ ] **Step 12 : modifier `src/hooks/useLetterGenerator.ts`**

1. Ligne 1, importer `useEffect` : `import { useState, useMemo, useCallback, useEffect } from 'react'`
2. Dans `LetterGeneratorOptions.userProfile`, ajouter `city?: string` après `relation?: string`.
3. Rendre `buildInitialValues` exportée (`export function buildInitialValues(`) et ajouter, dans son `switch`, avant `case 'today_date':` :

```ts
      case 'city':
        values[v.key] = userProfile?.city ?? ''
        break
```

4. Ajouter, juste après la fonction `buildInitialValues` :

```ts
/**
 * Fusionne des valeurs auto-remplies dans l'état courant : une valeur auto NON VIDE remplace, une
 * valeur vide n'efface jamais une saisie manuelle. Même référence si rien ne change.
 */
export function mergeAutoFilled(prev: Record<string, string>, auto: Record<string, string>): Record<string, string> {
  let next = prev
  for (const [key, value] of Object.entries(auto)) {
    if (value && prev[key] !== value) {
      if (next === prev) next = { ...prev }
      next[key] = value
    }
  }
  return next
}
```

5. Dans `useLetterGenerator`, juste après la déclaration `const [values, setValues] = useState…`, ajouter :

```ts
  // Personnalisation v2 : resynchronise les champs auto-remplis quand leurs sources changent (profil
  // courrier enregistré depuis le panneau d'envoi, chargement tardif) — l'adresse sous la signature
  // suit alors celle de l'enveloppe. Les saisies manuelles ne sont jamais effacées.
  const autoSourcesKey = JSON.stringify([options.userProfile ?? null, options.questionnaireData ?? null])
  useEffect(() => {
    if (!template) return
    const auto = buildInitialValues(template, options.userProfile, options.questionnaireData)
    setValues((prev) => mergeAutoFilled(prev, auto))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSourcesKey, template])
```

- [ ] **Step 13 : `VAR_CITY` pré-remplie**

Dans `src/data/letter-templates.ts`, remplacer la ligne de `VAR_CITY` par :

```ts
const VAR_CITY: LetterVariable = { key: 'city', label: 'Votre ville', type: 'text', auto_filled: true, required: true }
```

- [ ] **Step 14 : suite complète + types**

```bash
npx vitest run 2>&1 | tail -4
npx tsc --noEmit && echo TSC_OK
```
Attendu : 0 échec, `TSC_OK`. Le test existant « un champ manuel (non auto_filled) reste toujours éditable » de `tests/letter-templates.test.ts` utilise une variable `city` **locale** (fixture déclarée `auto_filled: false` dans le test) : il reste valide tel quel, ne pas le modifier.

- [ ] **Step 15 : commit**

```bash
git add src/lib/relation-labels.ts src/lib/letter-profile.ts src/lib/letter-autofill.ts src/hooks/useLetterGenerator.ts src/data/letter-templates.ts tests/relation-labels.test.ts tests/letter-profile.test.ts tests/letter-autofill.test.ts tests/letter-generator.test.ts tests/letter-templates.test.ts
git commit -m "feat(perso-v2): logique du pré-remplissage des courriers — profil courrier, lien de parenté, ville

Modules purs testés : libellés « Vous signez en tant que » (relation inversée, genre choisi),
validation et accès Supabase du profil courrier (sender_profiles, my_dossier_identity, date de
naissance du défunt), calcul des valeurs de courrier (profil → dossier PF → réponses). Le
générateur remplit la ville et resynchronise les champs auto sans effacer une saisie.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8 : Formulaire unique `LetterProfileForm`, contexte profil courrier, panneau d'envoi

**Files :**
- Create : `src/components/letter/LetterProfileForm.tsx`, `src/hooks/useLetterProfileContext.ts`
- Delete : `src/components/letter/SenderProfileForm.tsx`
- Modify : `src/components/letter/PaperSendPanel.tsx` (import l.13, état l.108-109, effet l.143-157, rendu l.460)
- Modify : `src/i18n/strings.fr.ts`, `src/i18n/strings.en.ts` (espace `letterProfile`, retrait de 14 clés `paperSend.sender*`)

Pas de test unitaire de rendu (Vitest tourne en environnement node) : la vérification est `tsc` + build + la recette navigateur de la Task 11.

- [ ] **Step 1 : chaînes FR**

Dans `src/i18n/strings.fr.ts` :

1. Supprimer, dans `paperSend`, le commentaire `// Profil expéditeur (sender_profiles)` et les 14 clés `senderTitle` … `senderMissingFields` (lignes 422 à 436 ; **garder** `lineCounter` et `invalidPostalCode`, utilisées par `RecipientAddressForm`).
2. Insérer, juste avant la ligne `  // v2:ns-l5` (fin du dictionnaire) :

```ts
  // Personnalisation v2 : profil courrier saisi une fois (fin du questionnaire, panneau d’envoi,
  // Profil) et repris dans tous les courriers — spec docs/design-personnalisation-v2.md §4.
  letterProfile: {
    title: 'Vos coordonnées pour les courriers',
    hint: 'Elles figurent dans chacun de vos courriers et servent d’adresse de retour. Vous pouvez les modifier à tout moment dans votre profil.',
    firstNameLabel: 'Prénom',
    lastNameLabel: 'Nom',
    relationshipLabel: 'Vous signez en tant que',
    relationshipFreeLabel: 'Votre lien avec la personne décédée',
    relationshipFreePlaceholder: 'Par exemple : neveu, petite-fille, ami',
    relationshipPreview: 'Vos courriers indiqueront : « {relationship} de {name} ».',
    addressLine1Label: 'Adresse',
    addressLine2Label: 'Complément d’adresse (facultatif)',
    postalCodeLabel: 'Code postal',
    cityLabel: 'Ville',
    lineCounter: '{count}/45 caractères',
    dobLabel: 'Date de naissance de {name} (facultatif)',
    dobHint: 'Elle figure dans certains courriers (banque, assurances, caisses de retraite).',
    saveCta: 'Enregistrer',
    saving: 'Enregistrement...',
    savedHint: 'Coordonnées enregistrées.',
    saveError: 'Impossible d’enregistrer vos coordonnées, réessayez.',
    editCta: 'Modifier',
    errors: {
      firstNameRequired: 'Indiquez votre prénom.',
      lastNameRequired: 'Indiquez votre nom.',
      fullNameTooLong: 'Prénom et nom ensemble : 45 caractères au maximum (contrainte de l’enveloppe).',
      addressRequired: 'Indiquez votre adresse.',
      lineTooLong: '45 caractères au maximum.',
      postalCodeInvalid: 'Code postal à 5 chiffres.',
      cityRequired: 'Indiquez votre ville.',
      relationshipRequired: 'Indiquez votre lien avec la personne décédée.',
      dobInvalid: 'Date invalide.',
      dobOutOfRange: 'La date de naissance doit précéder la date du décès.',
    },
    screenTitle: 'Dernière étape : vos coordonnées pour les courriers',
    screenLead: 'Remplies une seule fois, elles pré-remplissent tous vos courriers.',
    screenSubmit: 'Enregistrer et voir mon parcours',
    screenSkip: 'Plus tard',
    screenLoading: 'Préparation de vos coordonnées...',
    reminderTitle: 'Pré-remplissez vos courriers',
    reminderBody: 'Indiquez vos coordonnées une seule fois : elles seront reprises dans chacun de vos courriers.',
    reminderCta: 'Compléter mes coordonnées',
  },
```

- [ ] **Step 2 : chaînes EN (mêmes clés, sinon tsc échoue)**

Dans `src/i18n/strings.en.ts` : supprimer les mêmes 14 clés `paperSend.sender*` (et leur commentaire s'il existe), puis insérer avant `  // v2:ns-l5` :

```ts
  // v2 personalization: letter profile entered once (end of questionnaire, send panel, Profile)
  // and reused in every letter. Letters themselves stay in French.
  letterProfile: {
    title: 'Your details for letters',
    hint: 'They appear in each of your letters and serve as the return address. You can change them at any time in your profile.',
    firstNameLabel: 'First name',
    lastNameLabel: 'Last name',
    relationshipLabel: 'You sign as',
    relationshipFreeLabel: 'Your relationship with the deceased (in French)',
    relationshipFreePlaceholder: 'For example: neveu, petite-fille, ami',
    relationshipPreview: 'Your letters will read: “{relationship} de {name}”.',
    addressLine1Label: 'Address',
    addressLine2Label: 'Address line 2 (optional)',
    postalCodeLabel: 'Postal code',
    cityLabel: 'City',
    lineCounter: '{count}/45 characters',
    dobLabel: 'Date of birth of {name} (optional)',
    dobHint: 'It appears in some letters (bank, insurers, pension funds).',
    saveCta: 'Save',
    saving: 'Saving...',
    savedHint: 'Details saved.',
    saveError: 'Unable to save your details, please try again.',
    editCta: 'Edit',
    errors: {
      firstNameRequired: 'Enter your first name.',
      lastNameRequired: 'Enter your last name.',
      fullNameTooLong: 'First and last name together: 45 characters maximum (envelope constraint).',
      addressRequired: 'Enter your address.',
      lineTooLong: '45 characters maximum.',
      postalCodeInvalid: '5-digit postal code.',
      cityRequired: 'Enter your city.',
      relationshipRequired: 'Enter your relationship with the deceased.',
      dobInvalid: 'Invalid date.',
      dobOutOfRange: 'The date of birth must be before the date of death.',
    },
    screenTitle: 'Last step: your details for letters',
    screenLead: 'Entered once, they pre-fill all your letters.',
    screenSubmit: 'Save and see my journey',
    screenSkip: 'Later',
    screenLoading: 'Preparing your details...',
    reminderTitle: 'Pre-fill your letters',
    reminderBody: 'Enter your details once: they will be reused in each of your letters.',
    reminderCta: 'Complete my details',
  },
```

- [ ] **Step 3 : contexte — créer `src/hooks/useLetterProfileContext.ts`**

```ts
import { createContext, useContext } from 'react'
import type { LetterAutofill } from '@/lib/letter-autofill'
import type { LetterProfileRow } from '@/lib/letter-profile'
import type { RelationV2 } from '@/types/questionnaire'

// Profil courrier partagé par le tableau de bord (personnalisation v2, spec §4.7) : une seule source
// pour le pré-remplissage des courriers (StepLetterSection) et pour l'expéditeur de l'envoi papier
// (PaperSendPanel). Enregistrer le profil depuis le panneau d'envoi met aussitôt à jour les courriers
// ouverts : l'adresse sous la signature et celle de l'enveloppe ne peuvent plus diverger.
export interface LetterProfileContextValue {
  profile: LetterProfileRow | null
  relation: RelationV2 | undefined
  deceasedFirstName: string | undefined
  autofill: LetterAutofill
  onProfileSaved: (profile: LetterProfileRow) => void
}

export const LetterProfileContext = createContext<LetterProfileContextValue | null>(null)

/** null hors du tableau de bord : les consommateurs gardent alors leur comportement autonome. */
export function useLetterProfileContext(): LetterProfileContextValue | null {
  return useContext(LetterProfileContext)
}
```

- [ ] **Step 4 : créer `src/components/letter/LetterProfileForm.tsx`**

```tsx
import { useId, useState } from 'react'
import { Loader2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useT } from '@/i18n/useT'
import { useLang } from '@/i18n/LanguageContext'
import { fmt } from '@/i18n'
import { defaultRelationLabel, relationLabelOptions } from '@/lib/relation-labels'
import {
  LINE_MAX,
  saveLetterProfile,
  validateLetterProfile,
  type LetterProfileErrors,
  type LetterProfileField,
  type LetterProfileInput,
  type LetterProfileRow,
} from '@/lib/letter-profile'
import type { RelationV2 } from '@/types/questionnaire'

/** Champ « date de naissance du défunt » : affiché seulement quand l'appelant le fournit. */
export interface DeceasedDobField {
  value: string | null
  max: string | null // date du décès (AAAA-MM-JJ) ; la naissance doit la précéder
  save: (dob: string | null) => Promise<void>
}

interface LetterProfileFormProps {
  userId: string
  profile: LetterProfileRow | null
  // Pré-remplissage quand aucun profil n'existe encore (noms saisis par la PF).
  defaults?: { firstName?: string; lastName?: string }
  // Réponse `relation` du questionnaire : propose les formes exactes (fils / fille…).
  relation?: RelationV2
  deceasedFirstName?: string
  deceasedDob?: DeceasedDobField
  // panel : lecture puis « Modifier » (panneau d'envoi, Profil) ; screen : édition directe.
  variant?: 'panel' | 'screen'
  submitLabel?: string
  onSaved: (profile: LetterProfileRow) => void
  onSkip?: () => void
}

function initialInput(
  profile: LetterProfileRow | null,
  defaults: LetterProfileFormProps['defaults'],
  relation: RelationV2 | undefined
): LetterProfileInput {
  return {
    first_name: profile?.first_name ?? defaults?.firstName ?? '',
    last_name: profile?.last_name ?? defaults?.lastName ?? '',
    address_line1: profile?.address_line1 ?? '',
    address_line2: profile?.address_line2 ?? '',
    postal_code: profile?.postal_code ?? '',
    city: profile?.city ?? '',
    relationship: profile?.relationship ?? defaultRelationLabel(relation),
  }
}

// Formulaire unique du profil courrier (personnalisation v2, spec §4.5) — remplace SenderProfileForm
// (chantier 2a). Plusieurs instances peuvent coexister (un panneau d'envoi par étape dépliée) :
// `useId()` garantit des ids DOM uniques pour les associations <label htmlFor>.
export function LetterProfileForm({
  userId,
  profile,
  defaults,
  relation,
  deceasedFirstName,
  deceasedDob,
  variant = 'panel',
  submitLabel,
  onSaved,
  onSkip,
}: LetterProfileFormProps) {
  const t = useT()
  const { lang } = useLang()
  const uid = useId()
  const [editing, setEditing] = useState(variant === 'screen' || !profile)
  const [form, setForm] = useState<LetterProfileInput>(() => initialInput(profile, defaults, relation))
  const [dob, setDob] = useState(deceasedDob?.value ?? '')
  const [errors, setErrors] = useState<LetterProfileErrors>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [saved, setSaved] = useState(false)

  const relationOptions = relationLabelOptions(relation)

  const setField = (key: keyof LetterProfileInput, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
    setSaved(false)
  }

  const errorText = (field: LetterProfileField) => {
    const key = errors[field]
    return key ? <p className="text-xs text-warning">{t.letterProfile.errors[key]}</p> : null
  }

  const handleSave = async () => {
    const found = validateLetterProfile(form, deceasedDob ? { value: dob, max: deceasedDob.max } : undefined)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setSaving(true)
    setSaveError(false)
    try {
      const row = await saveLetterProfile(supabase, userId, form)
      if (deceasedDob) await deceasedDob.save(dob || null)
      setSaved(true)
      if (variant === 'panel') setEditing(false)
      onSaved(row)
    } catch {
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }

  if (!editing && profile) {
    return (
      <div className="space-y-1 rounded-xl border border-border-soft bg-surface p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm text-text-secondary">
            <p className="font-medium text-text">{profile.full_name}</p>
            <p>{profile.address_line1}</p>
            {profile.address_line2 && <p>{profile.address_line2}</p>}
            <p>
              {profile.postal_code} {profile.city}
            </p>
            {profile.relationship && deceasedFirstName && (
              <p className="text-text-muted">
                {fmt(t.letterProfile.relationshipPreview, { relationship: profile.relationship, name: deceasedFirstName })}
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="shrink-0 gap-1.5">
            <Pencil className="h-3.5 w-3.5" />
            {t.letterProfile.editCta}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', variant === 'panel' && 'rounded-xl border border-border-soft bg-surface p-3')}>
      {variant === 'panel' && (
        <div>
          <h4 className="font-body text-sm font-medium text-text">{t.letterProfile.title}</h4>
          <p className="text-xs text-text-muted">{t.letterProfile.hint}</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-first`} className="text-sm">{t.letterProfile.firstNameLabel}</Label>
          <Input id={`${uid}-first`} value={form.first_name} maxLength={LINE_MAX} autoComplete="given-name" onChange={(e) => setField('first_name', e.target.value)} />
          {errorText('first_name')}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-last`} className="text-sm">{t.letterProfile.lastNameLabel}</Label>
          <Input id={`${uid}-last`} value={form.last_name} maxLength={LINE_MAX} autoComplete="family-name" onChange={(e) => setField('last_name', e.target.value)} />
          {errorText('last_name')}
        </div>

        {relationOptions ? (
          <fieldset className="space-y-1.5 sm:col-span-2">
            <legend className="mb-1.5 text-sm font-medium text-text">{t.letterProfile.relationshipLabel}</legend>
            <div className="flex flex-wrap gap-2">
              {relationOptions.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    'cursor-pointer rounded-full border px-4 py-1.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40',
                    form.relationship === option.value
                      ? 'border-primary bg-primary-light text-primary'
                      : 'border-border bg-white text-text-secondary hover:border-primary'
                  )}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name={`${uid}-relationship`}
                    value={option.value}
                    checked={form.relationship === option.value}
                    onChange={() => setField('relationship', option.value)}
                  />
                  {option.label[lang]}
                </label>
              ))}
            </div>
            {form.relationship && deceasedFirstName && (
              <p className="text-xs text-text-muted">
                {fmt(t.letterProfile.relationshipPreview, { relationship: form.relationship, name: deceasedFirstName })}
              </p>
            )}
            {errorText('relationship')}
          </fieldset>
        ) : (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${uid}-relationship`} className="text-sm">{t.letterProfile.relationshipFreeLabel}</Label>
            <Input
              id={`${uid}-relationship`}
              value={form.relationship}
              placeholder={t.letterProfile.relationshipFreePlaceholder}
              onChange={(e) => setField('relationship', e.target.value)}
            />
            {errorText('relationship')}
          </div>
        )}

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${uid}-address1`} className="text-sm">{t.letterProfile.addressLine1Label}</Label>
          <Input id={`${uid}-address1`} value={form.address_line1} maxLength={LINE_MAX} autoComplete="address-line1" onChange={(e) => setField('address_line1', e.target.value)} />
          <p className="text-xs text-text-muted">{fmt(t.letterProfile.lineCounter, { count: form.address_line1.length })}</p>
          {errorText('address_line1')}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${uid}-address2`} className="text-sm">{t.letterProfile.addressLine2Label}</Label>
          <Input id={`${uid}-address2`} value={form.address_line2} maxLength={LINE_MAX} autoComplete="address-line2" onChange={(e) => setField('address_line2', e.target.value)} />
          {errorText('address_line2')}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-postal`} className="text-sm">{t.letterProfile.postalCodeLabel}</Label>
          <Input id={`${uid}-postal`} value={form.postal_code} maxLength={5} inputMode="numeric" autoComplete="postal-code" onChange={(e) => setField('postal_code', e.target.value)} />
          {errorText('postal_code')}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-city`} className="text-sm">{t.letterProfile.cityLabel}</Label>
          <Input id={`${uid}-city`} value={form.city} maxLength={LINE_MAX} autoComplete="address-level2" onChange={(e) => setField('city', e.target.value)} />
          {errorText('city')}
        </div>

        {deceasedDob && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${uid}-dob`} className="text-sm">
              {fmt(t.letterProfile.dobLabel, { name: deceasedFirstName ?? '' })}
            </Label>
            <Input
              id={`${uid}-dob`}
              type="date"
              value={dob}
              max={deceasedDob.max ?? undefined}
              onChange={(e) => {
                setDob(e.target.value)
                setErrors((prev) => ({ ...prev, deceased_dob: undefined }))
              }}
            />
            <p className="text-xs text-text-muted">{t.letterProfile.dobHint}</p>
            {errorText('deceased_dob')}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button size={variant === 'panel' ? 'sm' : 'default'} onClick={handleSave} disabled={saving} className="gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? t.letterProfile.saving : (submitLabel ?? t.letterProfile.saveCta)}
        </Button>
        {onSkip && (
          <Button variant="ghost" onClick={onSkip} disabled={saving}>
            {t.letterProfile.screenSkip}
          </Button>
        )}
      </div>
      {saved && variant === 'panel' && <p className="text-xs text-success">{t.letterProfile.savedHint}</p>}
      {saveError && <p className="text-xs text-warning">{t.letterProfile.saveError}</p>}
    </div>
  )
}
```

(`Button` accepte `size="default" | "sm" | "icon"` — vérifié dans `src/components/ui/button.tsx`.)

- [ ] **Step 5 : brancher `PaperSendPanel`**

Dans `src/components/letter/PaperSendPanel.tsx` :

1. Remplacer l'import `import { SenderProfileForm, type SenderProfile } from './SenderProfileForm'` par :

```ts
import { LetterProfileForm } from './LetterProfileForm'
import { fetchLetterProfile, type LetterProfileRow } from '@/lib/letter-profile'
import { useLetterProfileContext } from '@/hooks/useLetterProfileContext'
```

2. Remplacer les deux lignes d'état `senderProfile` / `senderLoading` par :

```ts
  // Personnalisation v2 : dans le tableau de bord, le profil courrier vient du contexte (une seule
  // source pour les courriers et l'enveloppe) ; hors contexte, lecture directe RLS owner (2a).
  const letterProfileCtx = useLetterProfileContext()
  const [ownProfile, setOwnProfile] = useState<LetterProfileRow | null>(null)
  const [ownProfileLoading, setOwnProfileLoading] = useState(!letterProfileCtx)
  const senderProfile = letterProfileCtx ? letterProfileCtx.profile : ownProfile
  const senderLoading = letterProfileCtx ? false : ownProfileLoading
  const handleSenderSaved = (row: LetterProfileRow) => {
    if (letterProfileCtx) letterProfileCtx.onProfileSaved(row)
    else setOwnProfile(row)
  }
```

3. Remplacer l'effet « Profil expéditeur (chantier 2a, spec §3.1) : lecture directe RLS owner. » (le `useEffect` qui lit `sender_profiles`) par :

```ts
  // Profil expéditeur hors tableau de bord : lecture directe RLS owner (chantier 2a, spec §3.1).
  useEffect(() => {
    if (letterProfileCtx) return
    let cancelled = false
    void (async () => {
      const data = await fetchLetterProfile(supabase, userId).catch(() => null)
      if (cancelled) return
      setOwnProfile(data)
      setOwnProfileLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [userId, letterProfileCtx])
```

4. Remplacer la ligne de rendu `{!channelClosed && <SenderProfileForm … />}` par :

```tsx
      {!channelClosed && (
        <LetterProfileForm
          userId={userId}
          profile={senderProfile}
          defaults={{
            firstName: letterProfileCtx?.autofill.userProfile.firstname,
            lastName: letterProfileCtx?.autofill.userProfile.lastname,
          }}
          relation={letterProfileCtx?.relation}
          deceasedFirstName={letterProfileCtx?.deceasedFirstName}
          onSaved={handleSenderSaved}
        />
      )}
```

5. Supprimer l'ancien composant :

```bash
git rm src/components/letter/SenderProfileForm.tsx
grep -rn "SenderProfileForm\|paperSend\.sender" src tests && echo "RESTE DES RÉFÉRENCES" || echo "OK aucune référence"
```
Attendu : `OK aucune référence`.

- [ ] **Step 6 : types, tests, build**

```bash
npx tsc --noEmit && echo TSC_OK
npx vitest run 2>&1 | tail -4
npm run build 2>&1 | tail -2 && git checkout -- tsconfig.tsbuildinfo
```
Attendu : `TSC_OK`, 0 échec, `✓ built`.

- [ ] **Step 7 : commit**

```bash
git add -A src/components/letter src/hooks/useLetterProfileContext.ts src/i18n/strings.fr.ts src/i18n/strings.en.ts
git commit -m "feat(perso-v2): formulaire unique du profil courrier (prénom/nom, lien exact) et contexte partagé

LetterProfileForm remplace SenderProfileForm : prénom et nom séparés, « Vous signez en tant que »
proposé d'après la relation, date de naissance du défunt en option. Dans le tableau de bord, le
panneau d'envoi lit et écrit le profil via un contexte : courriers et enveloppe ne divergent plus.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9 : Écran « Vos coordonnées pour les courriers » à la fin du questionnaire

**Files :**
- Create : `src/components/questionnaire/CoordinatesScreen.tsx`
- Modify : `src/pages/QuestionnairePage.tsx` (type `Phase`, fin de `confirmAndGenerate`, rendu)

- [ ] **Step 1 : créer `src/components/questionnaire/CoordinatesScreen.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useT } from '@/i18n/useT'
import { SectionHeading } from '@/components/ui/section-heading'
import { LetterProfileForm } from '@/components/letter/LetterProfileForm'
import {
  fetchDossierIdentity,
  fetchLetterProfile,
  saveDeceasedDob,
  type DossierIdentity,
  type LetterProfileRow,
} from '@/lib/letter-profile'
import type { QuestionnaireAnswersV2 } from '@/types/questionnaire'

interface CoordinatesScreenProps {
  userId: string
  questionnaireId: string
  answers: QuestionnaireAnswersV2
  onDone: () => void
}

// Personnalisation v2 (spec docs/design-personnalisation-v2.md §4.4) : la roadmap est déjà
// enregistrée quand cet écran s'affiche — « Plus tard » ou un onglet fermé ne perdent rien. Aucune
// de ces données ne passe par la session du questionnaire ni par le rédacteur Mistral.
export function CoordinatesScreen({ userId, questionnaireId, answers, onDone }: CoordinatesScreenProps) {
  const t = useT()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<LetterProfileRow | null>(null)
  const [dossier, setDossier] = useState<DossierIdentity | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // Lectures indépendantes : un échec laisse simplement le champ vide, jamais bloquant.
      const [p, d] = await Promise.all([
        fetchLetterProfile(supabase, userId).catch(() => null),
        fetchDossierIdentity(supabase).catch(() => null),
      ])
      if (cancelled) return
      setProfile(p)
      setDossier(d)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  if (loading) {
    return (
      <div className="px-8 py-16 text-center">
        <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-[3px] border-border border-t-primary" />
        <p className="text-base text-text-secondary">{t.letterProfile.screenLoading}</p>
      </div>
    )
  }

  return (
    <section className="animate-fade-in">
      <SectionHeading as="h1" className="mb-8 max-w-none" title={t.letterProfile.screenTitle} lead={t.letterProfile.screenLead} />
      <div className="rounded-card border border-border-card bg-white p-8 shadow-card-border max-sm:p-5">
        <LetterProfileForm
          userId={userId}
          profile={profile}
          defaults={{ firstName: dossier?.family_first_name ?? undefined, lastName: dossier?.family_last_name ?? undefined }}
          relation={answers.relation}
          deceasedFirstName={answers.deceased_firstname}
          deceasedDob={{
            value: answers.deceased_dob ?? null,
            max: answers.deceased_dod ?? null,
            save: async (dob) => {
              await saveDeceasedDob(supabase, questionnaireId, answers as unknown as Record<string, unknown>, dob)
            },
          }}
          variant="screen"
          submitLabel={t.letterProfile.screenSubmit}
          onSaved={() => onDone()}
          onSkip={onDone}
        />
      </div>
    </section>
  )
}
```

- [ ] **Step 2 : brancher `QuestionnairePage`**

Dans `src/pages/QuestionnairePage.tsx` :

1. Import : `import { CoordinatesScreen } from '@/components/questionnaire/CoordinatesScreen'`
2. Type : `type Phase = 'welcome' | 'loading' | 'question' | 'recap' | 'completing' | 'coordinates' | 'done'`
3. Dans `confirmAndGenerate`, remplacer `setPhase('done')` (après `sessionStorage.removeItem(...)`) par :

```ts
      // Personnalisation v2 : la roadmap est enregistrée — on demande maintenant, une seule fois,
      // les coordonnées qui pré-rempliront les courriers (spec §4.4).
      setPhase('coordinates')
```

4. Dans le rendu, juste avant le bloc `{!sessionExpired && phase === 'done' && (`, ajouter :

```tsx
        {!sessionExpired && phase === 'coordinates' && user && questionnaireId && finalAnswers && (
          <CoordinatesScreen
            userId={user.id}
            questionnaireId={questionnaireId}
            answers={finalAnswers}
            onDone={() => setPhase('done')}
          />
        )}
```

- [ ] **Step 3 : vérifier**

```bash
npx tsc --noEmit && echo TSC_OK
npx vitest run 2>&1 | tail -4
```
Attendu : `TSC_OK`, 0 échec. (La vérification visuelle se fait à la Task 11, navigateur.)

- [ ] **Step 4 : commit**

```bash
git add src/components/questionnaire/CoordinatesScreen.tsx src/pages/QuestionnairePage.tsx
git commit -m "feat(perso-v2): écran « Vos coordonnées pour les courriers » à la fin du questionnaire

Après l'enregistrement de la roadmap : prénom et nom repris du dossier PF, lien exact, adresse,
date de naissance du défunt (facultative). « Plus tard » mène au même écran de fin.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10 : Tableau de bord (pré-remplissage, contexte, carte de rappel) et page Profil

**Files :**
- Modify : `src/pages/DashboardPage.tsx`
- Modify : `src/components/dashboard/RoadmapView.tsx` (`StepLetterSection`)
- Modify : `src/pages/ProfilePage.tsx`

- [ ] **Step 1 : `DashboardPage` — charger le profil et l'identité avec la roadmap**

Dans `src/pages/DashboardPage.tsx` :

1. Imports à ajouter :

```ts
import { fetchDossierIdentity, fetchLetterProfile, type DossierIdentity, type LetterProfileRow } from '@/lib/letter-profile'
import { buildLetterAutofill } from '@/lib/letter-autofill'
import { LetterProfileContext, type LetterProfileContextValue } from '@/hooks/useLetterProfileContext'
import type { RelationV2 } from '@/types/questionnaire'
```

2. États, juste après `const [questionnaireAnswers, setQuestionnaireAnswers] = …` :

```ts
  // Personnalisation v2 : profil courrier et identité du dossier PF, chargés AVANT le premier rendu
  // de la roadmap (useLetterGenerator fige ses valeurs initiales au montage — spec §4.7).
  const [letterProfile, setLetterProfile] = useState<LetterProfileRow | null>(null)
  const [dossierIdentity, setDossierIdentity] = useState<DossierIdentity | null>(null)
```

3. Dans `load()`, juste avant `// Get steps for this roadmap`, ajouter :

```ts
      // Lectures indépendantes et non bloquantes : sans elles, les courriers demandent simplement
      // les champs manquants, comme avant.
      const [profileRow, identity] = await Promise.all([
        fetchLetterProfile(supabase, user!.id).catch(() => null),
        fetchDossierIdentity(supabase).catch(() => null),
      ])
      setLetterProfile(profileRow)
      setDossierIdentity(identity)
```

4. Après `const progress = useMemo(…)`, ajouter :

```ts
  const letterProfileCtx = useMemo<LetterProfileContextValue>(
    () => ({
      profile: letterProfile,
      relation: questionnaireAnswers.relation as RelationV2 | undefined,
      deceasedFirstName:
        (questionnaireAnswers.deceased_firstname as string | undefined) ?? dossierIdentity?.deceased_first_name ?? undefined,
      autofill: buildLetterAutofill({ profile: letterProfile, dossier: dossierIdentity, answers: questionnaireAnswers }),
      onProfileSaved: setLetterProfile,
    }),
    [letterProfile, dossierIdentity, questionnaireAnswers]
  )
```

5. Rendu : envelopper le contenu de `<main …>` dans le fournisseur — remplacer la ligne `<main className="flex-1 p-4 md:p-10 overflow-y-auto max-w-[1200px]">` par :

```tsx
        <LetterProfileContext.Provider value={letterProfileCtx}>
        <main className="flex-1 p-4 md:p-10 overflow-y-auto max-w-[1200px]">
```
et la balise fermante `</main>` correspondante par :

```tsx
        </main>
        </LetterProfileContext.Provider>
```

6. Passer l'indicateur de rappel à `DashboardOverview` : dans son appel, ajouter la prop `showProfileReminder={!letterProfile}` ; dans `DashboardOverviewProps`, ajouter `showProfileReminder: boolean` ; dans la signature de `DashboardOverview`, ajouter `showProfileReminder` ; et insérer, juste après `<ProgressHero … />` :

```tsx
      {showProfileReminder && (
        <div className="mt-8 rounded-card border border-border-card bg-white p-6 shadow-card-border">
          <h3 className="font-display text-xl font-normal text-text">{t.letterProfile.reminderTitle}</h3>
          <p className="mt-2 text-text-secondary">{t.letterProfile.reminderBody}</p>
          <Button asChild className="mt-4">
            <Link to="/profile">{t.letterProfile.reminderCta}</Link>
          </Button>
        </div>
      )}
```
(`Button` et `Link` sont déjà importés dans ce fichier.)

- [ ] **Step 2 : `StepLetterSection` lit le pré-remplissage dans le contexte**

Dans `src/components/dashboard/RoadmapView.tsx` :

1. Import : `import { useLetterProfileContext } from '@/hooks/useLetterProfileContext'`
2. Dans `StepLetterSection`, remplacer l'appel `useLetterGenerator({ templateId, questionnaireData: questionnaireData ? {…} : undefined })` par :

```ts
  // Personnalisation v2 (spec §4.7) : identité, adresse, ville, lien et défunt viennent du profil
  // courrier partagé par le tableau de bord ; hors contexte, repli sur les réponses (comportement 2a).
  const letterProfileCtx = useLetterProfileContext()
  const {
    template,
    values,
    resolvedLetter,
    resolvedSubject,
    isComplete,
    missingVariables,
    setVariable,
  } = useLetterGenerator({
    templateId,
    userProfile: letterProfileCtx?.autofill.userProfile,
    questionnaireData:
      letterProfileCtx?.autofill.questionnaireData ??
      (questionnaireData
        ? {
            deceased_firstname: questionnaireData.deceased_firstname,
            deceased_lastname: questionnaireData.deceased_lastname,
            deceased_dod: questionnaireData.deceased_dod,
          }
        : undefined),
  })
```
(les autres usages de `questionnaireData` — `deceased_department` pour le panneau d'envoi — ne changent pas.)

- [ ] **Step 3 : `ProfilePage` — carte « Vos coordonnées pour les courriers »**

Remplacer le contenu de `src/pages/ProfilePage.tsx` par :

```tsx
import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { ChangePasswordForm } from '@/components/profile/ChangePasswordForm'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AppHeader, HeaderNavLink } from '@/components/layout/AppHeader'
import { SectionHeading } from '@/components/ui/section-heading'
import { LetterProfileForm } from '@/components/letter/LetterProfileForm'
import { supabase } from '@/lib/supabase'
import {
  fetchDossierIdentity,
  fetchLatestQuestionnaire,
  fetchLetterProfile,
  saveDeceasedDob,
  type DossierIdentity,
  type LetterProfileRow,
} from '@/lib/letter-profile'
import type { RelationV2 } from '@/types/questionnaire'
import { useT } from '@/i18n/useT'

export function ProfilePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const t = useT()
  const [loaded, setLoaded] = useState(false)
  const [profile, setProfile] = useState<LetterProfileRow | null>(null)
  const [dossier, setDossier] = useState<DossierIdentity | null>(null)
  const [questionnaire, setQuestionnaire] = useState<{ id: string; answers: Record<string, unknown> } | null>(null)

  // Personnalisation v2 (spec §4.5) : le profil courrier se consulte et se modifie aussi ici.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    void (async () => {
      const [p, d, q] = await Promise.all([
        fetchLetterProfile(supabase, user.id).catch(() => null),
        fetchDossierIdentity(supabase).catch(() => null),
        fetchLatestQuestionnaire(supabase, user.id).catch(() => null),
      ])
      if (cancelled) return
      setProfile(p)
      setDossier(d)
      setQuestionnaire(q)
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  const answers = questionnaire?.answers ?? {}
  const deceasedFirstName = (answers.deceased_firstname as string | undefined) ?? dossier?.deceased_first_name ?? undefined
  const firstName = profile?.first_name ?? dossier?.family_first_name ?? null

  return (
    <div className="min-h-screen bg-bg">
      {/* showEmail=false : l'email est déjà affiché plus bas dans la carte "Informations du compte" */}
      <AppHeader showEmail={false}>
        <HeaderNavLink onClick={() => navigate('/')}>{t.profile.backToQuestionnaire}</HeaderNavLink>
      </AppHeader>

      <main className="mx-auto max-w-[600px] px-6 py-8 sm:py-12">
        <button
          onClick={() => navigate(-1)}
          className="mb-8 flex items-center gap-2 text-sm text-text-secondary hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t.profile.back}
        </button>

        <SectionHeading as="h1" className="mb-8 max-w-none" title={t.profile.title} lead={t.profile.subtitle} />

        {/* User info card */}
        <div className="mb-8 rounded-card border border-border-card bg-white p-10 shadow-card-border max-sm:p-7">
          <h2 className="mb-4 font-display text-[1.5rem] font-normal text-text">{t.profile.infoTitle}</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-text-secondary">Email</p>
              <p className="text-[1.05rem] text-text">{user?.email}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-text-secondary">{t.profile.firstNameLabel}</p>
              <p className="text-[1.05rem] text-text">{firstName || t.profile.notProvided}</p>
            </div>
          </div>
        </div>

        {/* Personnalisation v2 : profil courrier */}
        {user && loaded && (
          <div className="mb-8 rounded-card border border-border-card bg-white p-10 shadow-card-border max-sm:p-7">
            <h2 className="mb-2 font-display text-[1.5rem] font-normal text-text">{t.letterProfile.title}</h2>
            <p className="mb-6 text-sm text-text-muted">{t.letterProfile.hint}</p>
            <LetterProfileForm
              userId={user.id}
              profile={profile}
              defaults={{ firstName: dossier?.family_first_name ?? undefined, lastName: dossier?.family_last_name ?? undefined }}
              relation={answers.relation as RelationV2 | undefined}
              deceasedFirstName={deceasedFirstName}
              deceasedDob={
                questionnaire
                  ? {
                      value: (answers.deceased_dob as string | undefined) ?? null,
                      max: (answers.deceased_dod as string | undefined) ?? null,
                      save: async (dob) => {
                        const next = await saveDeceasedDob(supabase, questionnaire.id, questionnaire.answers, dob)
                        setQuestionnaire({ id: questionnaire.id, answers: next })
                      },
                    }
                  : undefined
              }
              onSaved={setProfile}
            />
          </div>
        )}

        {/* SER-22: Change password form */}
        <ChangePasswordForm />
      </main>
    </div>
  )
}
```

Note : en variante `panel`, la date de naissance n'est éditable qu'en mode édition (après « Modifier ») ; c'est voulu, la carte en lecture reste compacte.

- [ ] **Step 4 : vérifier**

```bash
npx tsc --noEmit && echo TSC_OK
npx vitest run 2>&1 | tail -4
npm run build 2>&1 | tail -2 && git checkout -- tsconfig.tsbuildinfo
```
Attendu : `TSC_OK`, 0 échec, `✓ built`.

- [ ] **Step 5 : commit**

```bash
git add src/pages/DashboardPage.tsx src/components/dashboard/RoadmapView.tsx src/pages/ProfilePage.tsx
git commit -m "feat(perso-v2): courriers pré-remplis dans la roadmap, carte de rappel, coordonnées dans Profil

DashboardPage charge le profil courrier et l'identité du dossier avant la roadmap, calcule les
valeurs des courriers et les partage par contexte ; carte de rappel tant que les coordonnées
manquent ; la page Profil affiche et modifie le profil courrier et la date de naissance.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11 : Environnement local et recette navigateur (exécutée par le contrôleur)

**Pourquoi le contrôleur :** cette tâche démarre Docker sur la machine d'Arnaud, rejoue les migrations sur la base LOCALE et pilote le navigateur intégré (outils `preview_*`, `computer`, `read_page`). Aucune base distante n'est touchée. La même mise en place sert au tournage (Task 13).

Variables utilisées ci-dessous :
```bash
S=/private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/de650efd-f650-47c9-a468-03ee8cd66a83/scratchpad
WT="$S/wt-perso"
```

- [ ] **Step 1 : recréer le harnais SQL dans `$S/bin/` (jamais versionné)**

Source : `docs/plan-v2-sql.md`, Task 0 Step 2 (seules `S` et `INT` changent). Créer les 6 fichiers, puis `chmod +x "$S/bin/psql-local" "$S/bin/with-db-lock" "$S/bin/run-sql-checks" "$S/bin/gate"`.

`$S/bin/v2-env.sh` :
```sh
# Environnement commun des scénarios SQL — à sourcer en tête de chaque bloc de commandes.
export S=/private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/de650efd-f650-47c9-a468-03ee8cd66a83/scratchpad
export INT="$S/wt-perso"
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
-- Réplique LOCALE des privilèges de tables des projets hébergés (la CLI 2.109.1 ne donne plus
-- SELECT/INSERT/UPDATE/DELETE à anon/authenticated sur les tables créées par postgres). Les
-- FONCTIONS ne sont PAS re-grantées (cela annulerait les revoke des migrations).
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

Pièges (consignés au rapport d'outillage du 2026-09-28) : `hosted-grants.sql` après CHAQUE reset (sinon faux verts) ; ne jamais re-granter les fonctions ; ne jamais lancer l'app depuis un shell qui a sourcé `v2-env.sh` (ses `VITE_*` factices priment sur `.env`) ; un reset efface comptes, partenaires et `webhook_config` ; `supabase link`, `--linked`, `db push`, `migration repair` interdits.

- [ ] **Step 2 : Docker et pile Supabase locale**

```bash
docker info >/dev/null 2>&1 || open -a Docker   # prévenir Arnaud : lancement de Docker Desktop
until docker info >/dev/null 2>&1; do sleep 3; done   # via Monitor si long
docker images --format '{{.Repository}}' | grep -c supabase   # > 0 : images en cache, pas de téléchargement
supabase start --workdir "$WT"
docker exec supabase_auth_Application printenv GOTRUE_HOOK_BEFORE_USER_CREATED_ENABLED   # attendu : true
```
Si aucune image Supabase n'est en cache, **s'arrêter et demander l'accord d'Arnaud** avant `supabase start` (téléchargement de plusieurs Go).

- [ ] **Step 3 : garde de localité (à chaque session)**

```bash
supabase status -o env --workdir "$WT" 2>/dev/null | grep -E '^API_URL='   # attendu : API_URL="http://127.0.0.1:54321"
```

- [ ] **Step 4 : migrations + scénarios SQL (dont S15 de la Task 1)**

```bash
. "$S/bin/v2-env.sh"
run-sql-checks "$INT" scripts/sql-scenarios-f1.sql scripts/sql-scenarios-v2.sql 2>&1 | grep -E '^== |ERROR|S15|my_dossier_identity|SCENARIOS V2'
echo "select count(*) from supabase_migrations.schema_migrations;" | psql-local -At   # attendu : 20
eval "$(supabase status -o env --workdir "$INT" 2>/dev/null | grep -E '^(API_URL|PUBLISHABLE_KEY)=')"
HOOK_SUPABASE_KEY="$PUBLISHABLE_KEY" with-db-lock node "$INT/scripts/hook-scenarios-v2.mjs"
```
Attendu : 8 lignes `OK S15…` (S15a, S15b, S15b2, S15c, S15d, S15d2, S15e, S15f), `OK S13p … my_dossier_identity()`, `NOTICE:  SCENARIOS V2 : OK`, aucune `ERROR` ; 20 migrations ; hook : 5 refus et 3 acceptations. Consigner le résultat dans la note post-revue de la Task 1.

- [ ] **Step 5 : données de démo (fictives) — dans un NOUVEAU shell, sans `v2-env.sh`**

```bash
S=/private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/de650efd-f650-47c9-a468-03ee8cd66a83/scratchpad
WT="$S/wt-perso"; export PATH="$S/bin:$PATH"; export S
# 5a. Secret RPC local (même valeur en base et dans .env)
RPC_SECRET=$(openssl rand -hex 32)
echo "insert into public.webhook_config (id, rpc_secret) values (1, '$RPC_SECRET') on conflict (id) do update set rpc_secret = excluded.rpc_secret;" | with-db-lock psql-local -q
# 5b. PF Delmas + enrôlements : copie adaptée de la partie 1 du seed (hors dépôt)
sed -n '/^-- >>> PARTIE 1/,/^-- <<< FIN PARTIE 1/p' "$WT/scripts/seed-demo-v2.sql" > "$S/seed-p1-delmas.sql"
```
Éditer `$S/seed-p1-delmas.sql` : `v_partners` = `'[{"name": "Pompes Funèbres Delmas", "siret": null, "billing_email": "facturation@pf-delmas.example", "managers": ["gerant@pf-delmas.example"]}]'`, `v_admins` = `array['equipe@seren.example']` ; puis `with-db-lock psql-local -q < "$S/seed-p1-delmas.sql"` (attendu : tableau avec `lie = f`).

5c. Comptes du gérant et de l'équipe Seren, par l'API admin GoTrue **locale**, depuis un script du scratchpad (jamais versionné ; la clé de service locale n'entre jamais dans l'app) :
```bash
eval "$(supabase status -o env --workdir "$WT" 2>/dev/null | grep -E '^(API_URL|SERVICE_ROLE_KEY)=')"
case "$API_URL" in http://127.0.0.1:54321) ;; *) echo "REFUS : API non locale"; exit 1 ;; esac
umask 077; : > "$S/demo-accounts.env"
for email in gerant@pf-delmas.example equipe@seren.example; do
  pw=$(openssl rand -base64 18)
  uid=$(curl -s -X POST "$API_URL/auth/v1/admin/users" -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H 'Content-Type: application/json' -d "{\"email\":\"$email\",\"password\":\"$pw\",\"email_confirm\":true}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
  echo "$email $uid $pw" >> "$S/demo-accounts.env"
done
```
(Les mots de passe restent dans `$S/demo-accounts.env`, mode 600, jamais affichés dans le chat.)

5d. Rattachement (aucune connexion avant) :
```bash
G=$(awk '/^gerant@/{print $2}' "$S/demo-accounts.env"); A=$(awk '/^equipe@/{print $2}' "$S/demo-accounts.env")
echo "select public.link_enrollments('[{\"email\": \"gerant@pf-delmas.example\", \"user_id\": \"$G\"}, {\"email\": \"equipe@seren.example\", \"user_id\": \"$A\"}]'::jsonb);" | with-db-lock psql-local -At
```
Attendu : `partner_users_linked: 1`, `seren_admins_linked: 1`, `pending: 0`, `untrusted: 0`.

- [ ] **Step 6 : `.env` LOCAL du worktree (ignoré par git)**

```bash
eval "$(supabase status -o env --workdir "$WT" 2>/dev/null | grep -E '^(API_URL|PUBLISHABLE_KEY)=')"
umask 077; cat > "$WT/.env" <<EOF
SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE_KEY
VITE_SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE_KEY
WEBHOOK_RPC_SECRET=$RPC_SECRET
PARTNER_ACTIVATIONS_ENABLED=true
SHOW_ACTIVATION_LINK=true
PARTNER_BILLING_PREVIEW=true
PAPER_SENDS_ENABLED=true
APP_URL=http://localhost:5173
EOF
git -C "$WT" check-ignore -q .env && echo ENV_IGNORED
node --env-file="$WT/.env" "$WT/scripts/check-env-target.mjs"
grep -cE '^(VITE_)?SUPABASE_URL=http://127\.0\.0\.1:54321$' "$WT/.env"   # attendu : 2
```
Attendu : `ENV_IGNORED`, `OK : …`, `2`. Aucune clé MySendingBox, Resend, Stripe, Mistral ni Sentry.

- [ ] **Step 7 : lancer l'app du worktree dans le navigateur intégré**

Ajouter temporairement à `/Users/arnaudgay/Documents/git/Seren/Application/.claude/launch.json` (fichier du dépôt principal, **restauré au Step 9** par `git -C /Users/arnaudgay/Documents/git/Seren/Application checkout -- .claude/launch.json`) deux configurations qui exécutent le worktree grâce à `npm --prefix` :

```json
    {
      "name": "perso-api",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["--prefix", "/private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/de650efd-f650-47c9-a468-03ee8cd66a83/scratchpad/wt-perso", "run", "dev:server"],
      "port": 3000
    },
    {
      "name": "perso-vite",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["--prefix", "/private/tmp/claude-501/-Users-arnaudgay-Documents-git-Seren-Application/de650efd-f650-47c9-a468-03ee8cd66a83/scratchpad/wt-perso", "run", "dev"],
      "port": 5173
    }
```
Puis `preview_start {name: "perso-api"}`, `preview_start {name: "perso-vite"}` ; contrôle : `preview_logs` sans erreur, `GET http://localhost:3000/api/health` → 200.

- [ ] **Step 8 : recette (preuves = captures d'écran)**

Parcours complet, données fictives, dans le navigateur intégré (un onglet par persona ; la session Supabase vit dans le localStorage de l'origine — se déconnecter entre personas) :

| # | Action | Attendu |
|---|---|---|
| 1 | `/login` gérant (`$S/demo-accounts.env`), `/partenaire`, « Ouvrir un dossier famille » : Camille Roussel, `camille.roussel@famille.example`, défunt Bernard Roussel, décès à J-5 | dossier créé ; « Copier le lien d'activation (préproduction) » donne `http://localhost:5173/activation#t=…` |
| 2 | Déconnexion, lien d'activation, mot de passe, 3 consentements | arrivée sur l'accueil du questionnaire |
| 3 | Démarrer : relation « Mon père ou ma mère » | la question suivante est le **département** (identité non redemandée) |
| 4 | Département 33, retraite, logement **« En EHPAD… »**, enfants majeurs, notaire non, assurance vie « Je ne sais pas », compte joint non, véhicule non, crédits non, aide à domicile non | options EHPAD présente |
| 5 | **Aides** : APA + ASH ; contrat obsèques non ; **abonnements** : presse, téléphone, streaming, réseaux sociaux, photos ; organismes : aucun | 15 questions vues au total |
| 6 | Récapitulatif | prénom « Bernard », nom « Roussel », date « JJ/MM/AAAA » ; relance « Modifier » possible |
| 7 | Confirmer | écran « Dernière étape : vos coordonnées pour les courriers » : Camille / Roussel pré-remplis, pastilles « fils » / « fille » |
| 8 | « fille », 18 rue des Tanneurs, 33000, Bordeaux, naissance 14/03/1941, « Enregistrer et voir mon parcours » | écran « Votre parcours est prêt » |
| 9 | Tableau de bord | **pas** de carte de rappel ; roadmap : EHPAD, département (APA/ASH), récupération sur la succession, presse, téléphone, streaming, photos ; **pas** d'étape énergie |
| 10 | Étape « Résilier les abonnements presse » → générer le courrier | seuls « Nom de l'organisme » et « Numéro d'abonné ou de client » sont à saisir ; l'aperçu contient « Camille Roussel », « fille de Bernard Roussel », l'adresse, « Bordeaux, le … » |
| 11 | Panneau d'envoi papier de ce courrier | expéditeur déjà rempli (lecture seule + « Modifier ») |
| 12 | Étape EHPAD → courrier | complet sauf le nom de l'établissement |
| 13 | Profil | carte « Vos coordonnées pour les courriers » ; prénom affiché (plus « Non renseigné ») |
| 14 | Bascule EN (toggle) sur le tableau de bord puis retour FR | libellés traduits, courriers toujours en français |
| 15 | Nouveau dossier famille, « Plus tard » sur l'écran de coordonnées | carte de rappel visible au tableau de bord ; courriers : champs identité/adresse à saisir |

Tout écart → tâche correctrice confiée à un sous-agent (même double revue), puis rejeu de la ligne concernée.

- [ ] **Step 9 : restauration**

```bash
git -C /Users/arnaudgay/Documents/git/Seren/Application checkout -- .claude/launch.json
git -C /Users/arnaudgay/Documents/git/Seren/Application status --short   # attendu : seul « ?? .env.prod-NE-PAS-UTILISER »
```
Laisser tourner la pile Supabase locale si la Task 13 suit ; sinon `supabase stop --workdir "$WT"`.

---

### Task 12 : Documentation, revue finale de branche, merge local et tag

**Files :**
- Modify : `CLAUDE.md`, `docs/design-personnalisation-v2.md` (notes post-implémentation), ce plan (notes post-revue)

- [ ] **Step 1 : CLAUDE.md (worktree)**

1. Après la puce « **Fait (suite) — démonstrateur v2** », ajouter :

```markdown
- **Fait (suite) — personnalisation v2** (spec `docs/design-personnalisation-v2.md`, plan `docs/plan-personnalisation-v2.md`) : courriers pré-remplis — profil courrier unique (`sender_profiles` + `first_name`/`last_name`), RPC `my_dossier_identity()` (5 champs d'identité du dossier PF, lecture seule), questionnaire pré-rempli au `/start` (identité du défunt), écran « Vos coordonnées pour les courriers » en fin de questionnaire, contexte `LetterProfileContext` (courriers et enveloppe ne divergent plus) ; questionnaire enrichi — `aides_percues` et `abonnements` (multiselect, condition « au moins une valeur commune »), option `ehpad`, 9 étapes sourcées + 5 courriers papier, thème `abonnements` ; **15 questions vues** (18 au catalogue, 3 pré-remplies). Tag `preprod-v2-rc4`. Nouveaux contenus ajoutés à la relecture juridique bloquante. Migrations `20260928120000` + `20260928121000` (USER STEP : `db push` préprod quand la v2 y sera déployée).
```

2. Dans « Points d'attention » → **Tests**, remplacer « **484 sur `integration/v2-demo` après les stubs L0bis** (valeur définitive du démonstrateur v2 consignée par L8 au tag `preprod-v2-rc1`) » par « **796 sur `integration/v2-demo` à rc3, <N> à `preprod-v2-rc4`** » (N = total réel relevé au Step 4).

3. Dans « Flux principal », remplacer « (moteur serveur + rédacteur Mistral, ≤15 questions, récap confirmable) » par « (moteur serveur + rédacteur Mistral, ≤ 15 questions vues — identité du défunt reprise du dossier PF —, récap confirmable, puis coordonnées pour les courriers) ».

- [ ] **Step 2 : notes post-implémentation dans la spec**

Ajouter à la fin de `docs/design-personnalisation-v2.md` une section `## 11. Notes post-implémentation` listant : deux migrations au lieu d'une (lint des migrations v2) ; `aides_percues` exclue du contexte du rédacteur Mistral (`WRITER_EXCLUDED_IDS`, minimisation — données de santé/handicap) ; dates du récapitulatif en JJ/MM/AAAA ; contexte `LetterProfileContext` et resynchronisation des champs auto (`mergeAutoFilled`) ; toute autre déviation consignée dans les notes post-revue du plan.

- [ ] **Step 3 : revue finale de branche**

Invoquer `superpowers:requesting-code-review` sur `integration/v2-demo..feature/v2-personnalisation` (sous-agent `superpowers:code-reviewer`), avec en entrée la spec, ce plan et ce focus : isolation de `my_dossier_identity()` (aucune fuite inter-familles, rôle PF exclu), minimisation Mistral (ni identité ni aides), parité FR/EN et client/serveur, invariants, exactitude juridique sourcée des contenus, accessibilité du formulaire (labels, radios natives), régressions de l'envoi papier. Correctifs techniques appliqués sans re-consulter Arnaud ; toute question produit lui est posée.

- [ ] **Step 4 : porte finale**

```bash
cd "$WT"
export VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci_dummy
npx tsc --noEmit && echo TSC_OK
npx vitest run 2>&1 | tail -4
npm run build 2>&1 | tail -2 && git checkout -- tsconfig.tsbuildinfo
git status --short   # attendu : vide (le .env local est ignoré)
```
Plus le rejeu des scénarios SQL (Task 11 Step 4) si le code SQL a changé depuis.

- [ ] **Step 5 : merge local (fast-forward) et tag**

```bash
cd /Users/arnaudgay/Documents/git/Seren/Application
git worktree prune                                   # retire les worktrees « prunable » (dossiers disparus) qui bloquent integration/v2-demo
git fetch . feature/v2-personnalisation:integration/v2-demo   # fast-forward sans toucher au checkout de main
git tag -a preprod-v2-rc4 integration/v2-demo -m "rc4 — personnalisation v2 : courriers pré-remplis, questionnaire enrichi (abonnements, aides, EHPAD)"
git log --oneline -1 integration/v2-demo
```
Attendu : `integration/v2-demo` = tête de `feature/v2-personnalisation`. **Rien n'est poussé** : Arnaud pushe la branche `integration/v2-demo` et le tag `preprod-v2-rc4`, selon sa checklist habituelle. La branche `feature/v2-personnalisation` est supprimée ensuite (règle 2 branches).

---

### Task 13 : Vidéo démo v3 (exécutée par le contrôleur, sur le code tagué rc4)

**Prérequis :** Task 11 Steps 1 à 6 en place (pile locale, données Delmas, `.env` local) ; **accord d'Arnaud** pour télécharger le paquet npm `playwright@1.57.0` (quelques Mo ; les navigateurs `chromium-1200` et `ffmpeg-1011` sont déjà en cache, aucun navigateur n'est téléchargé) ; facultatif : clé **test** MySendingBox fournie par Arnaud pour filmer le clic « Envoyer ».

- [ ] **Step 1 : outillage dans le scratchpad**

```bash
mkdir -p "$S/video" && cd "$S/video" && npm init -y >/dev/null && npm i playwright@1.57.0
```

- [ ] **Step 2 : reprendre le pipeline éprouvé du 17/09**

Les sources (`run.sh`, `prepare-db.mjs`, `record-demo.mjs`, `lib/local.mjs`, `lib/recorder.mjs`, `lib/overlay.mjs`, `lib/cards.mjs`) sont dans les appels `Write` du transcript `~/.claude/projects/-Users-arnaudgay-Documents-git-Seren-Application/3e6cbbe2-f9f7-470b-acf7-4a10570bc312/subagents/workflows/wf_fdae9785-757/agent-a23dca02683fa7c23.jsonl`, corrigées ensuite dans ce même transcript et dans `agent-acc44622f95ebbf9c.jsonl` (version finale). Les extraire vers `$S/video/` par un script Python qui lit chaque ligne JSON, garde les `tool_use` `Write` (et rejoue les `Edit`/corrections dans l'ordre), et écrit les fichiers — puis relire chaque fichier avant usage.

Technique à conserver :
- capture CDP `Page.startScreencast` (JPEG q92) encodée par ffmpeg en libx264 CRF 16, 30 i/s, yuv420p, `+faststart` (plus net que `recordVideo`) ;
- Chromium complet (pas le headless shell), contexte 1920×1080, `locale: 'fr-FR'`, `timezoneId: 'Europe/Paris'`, permissions presse-papiers ;
- garde réseau `context.route` qui **coupe toute URL non locale** ;
- un contexte par persona ;
- serveur lancé par le script (`npm start`, port 4317, `APP_URL=CORS_ORIGIN=http://localhost:4317`) après `npm run build` avec les clés LOCALES et sans `VITE_POSTHOG_*`/`VITE_SENTRY_DSN` ;
- refus de démarrer si l'URL Supabase n'est pas `http://127.0.0.1:54321`.

Changements par rapport au 17/09 :
- **pas de bandeau de sous-titres** (choix confirmé le 27/09) : garder le curseur simulé et la frappe progressive, supprimer l'overlay de texte ;
- écran-titre et écran de fin conservés (`route.fulfill`), textes ci-dessous ;
- scénario v3 ci-dessous ; aucune donnée réelle.

- [ ] **Step 3 : scénario v3 (≈ 2 min 30, fondu au blanc de 0,4 s entre séquences)**

| Séq. | Persona | Contenu | Durée cible |
|---|---|---|---|
| a | — | Écran-titre : « Seren — courriers pré-remplis, parcours personnalisé » ; mention « Personnes et pompe funèbre fictives » | 5 s |
| b | Gérant PF Delmas | Connexion, espace partenaire, « Ouvrir un dossier famille » : Camille Roussel, défunt Bernard Roussel (J-5) ; copie du lien d'activation | 20 s |
| c | Camille | Lien d'activation, mot de passe, 3 consentements | 10 s |
| d | Camille | Questionnaire : relation « Mon père ou ma mère » → **département** (identité non redemandée) → … → logement **EHPAD** → **aides** APA + ASH → **abonnements** presse, téléphone, streaming, réseaux sociaux, photos → récapitulatif (identité pré-remplie, JJ/MM/AAAA) | 45 s |
| e | Camille | Écran de coordonnées : nom déjà rempli, « fille », 18 rue des Tanneurs, 33000 Bordeaux, naissance 14/03/1941 → « Votre parcours est prêt » | 15 s |
| f | Camille | Roadmap personnalisée : défilement jusqu'aux étapes EHPAD, département, presse, téléphone, streaming, photos | 10 s |
| g | Camille | « Résilier les abonnements presse » → courrier : seuls « La Gazette des Chartrons » et « AB-204518 » sont tapés ; aperçu ; panneau d'envoi : expéditeur déjà rempli ; destinataire « Service Abonnements, 10 quai des Chartrons, 33000 Bordeaux » ; curseur sur « Envoyer ce courrier par la poste » **sans clic** (clic seulement avec une clé test MySendingBox) | 30 s |
| h | Camille | Étape EHPAD → courrier complet d'emblée (seul « Résidence Les Tilleuls » est tapé) | 10 s |
| i | — | Écran de fin : « Ce que la PF sait déjà n'est plus demandé. Chaque courrier part pré-rempli. » | 5 s |

- [ ] **Step 4 : tournage et encodage**

Sous un seul `with-db-lock` : reset de la base locale (`run-sql-checks` sans fichier), grants, secret RPC, seed Delmas, comptes, rattachement (Task 11 Step 5), puis tournage. Sortie : `~/Documents/git/Seren/demo-video/seren-demo-v3.mp4`.

```bash
ffprobe -v error -show_entries format=duration:stream=width,height,codec_name,r_frame_rate -of default=nw=1 ~/Documents/git/Seren/demo-video/seren-demo-v3.mp4
```
Attendu : durée entre 120 et 180 s, `width=1920`, `height=1080`, `codec_name=h264`, `r_frame_rate=30/1`.

- [ ] **Step 5 : contrôle visuel**

Extraire une image par séquence (`ffmpeg -ss <t> -i … -frames:v 1 "$S/video/check-<séq>.png"`) et les regarder une à une : identité non redemandée, écran de coordonnées, étapes personnalisées, courrier pré-rempli, expéditeur rempli, aucune donnée réelle, aucun texte tronqué.

- [ ] **Step 6 : chapitres et voix-off**

Écrire `~/Documents/git/Seren/demo-video/chapitres-v3.md` (même format que `chapitres.md` : fichier, durée exacte, code filmé `preprod-v2-rc4`, table des séquences avec bornes exactes issues du nombre d'images, repères détaillés, « Défauts du produit visibles ») et `voix-off-v3.md` (même format que `voix-off.md` : ≈ 140 mots/min, tops alignés sur `chapitres-v3.md`, chiffres du modèle v2 : 290 € TTC famille, 70 € PF, 220 € TTC Seren, 10 envois inclus). Les fichiers v2 restent intacts.

- [ ] **Step 7 : livraison**

Envoyer les 3 fichiers à Arnaud (`SendUserFile`), puis `supabase stop --workdir "$WT"` si plus rien ne doit tourner.

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

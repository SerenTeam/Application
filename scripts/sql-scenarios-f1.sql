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

-- ====================================================================
-- SEED DÉMO — Espace partenaire PF (PRÉPROD UNIQUEMENT)
-- ====================================================================
-- À exécuter dans le SQL Editor du projet Supabase PRÉPROD
-- (kvtzhyxlqouvpwasedbe) APRÈS :
--   1. le `supabase db push` (tables partners/partner_users/attributions) ;
--   2. la création des comptes via l'app préprod :
--      - le compte « PF démo » (celui qui ouvrira /partenaire) ;
--      - le(s) compte(s) famille de démo (questionnaire + Checkout test).
-- Adapter les emails ci-dessous, puis exécuter tout le bloc.
-- Rejouable : ne crée pas de doublon de partenaire, réaffecte les liaisons.
-- ⚠️ Jamais sur la prod : le dispositif PF v0 est confiné à la préprod.
-- ====================================================================

do $$
declare
  v_pf_email      text   := 'pf.demo@seren-test.fr';        -- ← compte partenaire
  v_family_emails text[] := array[
    'test.e2e.claude@seren-test.fr'                          -- ← familles attribuées (ajouter au besoin)
  ];
  v_partner_id uuid;
  v_pf_user    uuid;
  v_uid        uuid;
  v_email      text;
begin
  select id into v_pf_user from auth.users where email = v_pf_email;
  if v_pf_user is null then
    raise exception 'Compte PF % introuvable — le créer via l''app préprod d''abord', v_pf_email;
  end if;

  -- Partenaire de démo (idempotent par nom)
  select id into v_partner_id from partners where name = 'Pompes Funèbres Démo';
  if v_partner_id is null then
    insert into partners (name, commission_rate)
    values ('Pompes Funèbres Démo', 0.200)
    returning id into v_partner_id;
  end if;

  -- Rattachement du compte PF (réaffecte si déjà lié)
  insert into partner_users (user_id, partner_id)
  values (v_pf_user, v_partner_id)
  on conflict (user_id) do update set partner_id = excluded.partner_id;

  -- Attributions des dossiers famille
  foreach v_email in array v_family_emails loop
    select id into v_uid from auth.users where email = v_email;
    if v_uid is null then
      raise notice 'Famille % introuvable — ignorée (créer le compte puis rejouer)', v_email;
    else
      insert into attributions (user_id, partner_id)
      values (v_uid, v_partner_id)
      on conflict (user_id) do update set partner_id = excluded.partner_id;
    end if;
  end loop;

  raise notice 'Seed OK — partner_id = %', v_partner_id;
end $$;

-- Vérification rapide (agrégats bruts, à comparer avec /partenaire) :
-- select p.name, count(a.user_id) as attribues,
--        count(pur.id) filter (where pur.status = 'paid') as payes
-- from partners p
-- left join attributions a on a.partner_id = p.id
-- left join purchases pur on pur.user_id = a.user_id
-- group by p.name;

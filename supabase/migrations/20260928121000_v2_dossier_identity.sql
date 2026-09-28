-- ════════════════════════════════════════════════════════════════════════════════════════
-- my_dossier_identity — identité saisie par la PF, relue par la famille (personnalisation v2)
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Spec : docs/design-personnalisation-v2.md §4.2. Pré-remplit le questionnaire (prénom, nom et date
-- de décès du défunt — POST /api/questionnaire/start), l'écran de coordonnées (prénom et nom de la
-- famille), le tableau de bord (pré-remplissage des courriers) et la page Profil. Mêmes règles que
-- 20260915200000_v2_core.sql : security definer, search_path vide, noms qualifiés, aucune identité
-- venue d'un paramètre (auth.uid() seul), revoke puis grant nominatif.
-- dossiers reste deny-all : cette fonction n'expose que 5 colonnes d'identité du dossier de
-- l'appelant — jamais e-mail, téléphone, partenaire, montants, quota ni jeton.
-- Rôle exclusif comme my_account() : un compte PF (partenaire non résilié) n'obtient rien.
-- Un compte porte au plus un dossier (index dossiers_user_uidx) : pas d'ambiguïté de sélection.
-- Un dossier source 'direct'/'demo' n'a pas d'identité obligatoire (dossiers_identity_check ne
-- contraint que source = 'partner') : les 5 champs de l'objet renvoyé peuvent alors être null.
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

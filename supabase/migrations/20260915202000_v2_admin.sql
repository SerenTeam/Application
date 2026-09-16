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
      select count(*)                                           as dossiers_total,
             count(*) filter (where d.created_at >= v_start)    as dossiers_this_month,
             count(*) filter (where d.status = 'invited')       as invited_pending,   -- expirés compris
             count(*) filter (where d.activated_at is not null) as activated,
             count(*) filter (where d.status = 'cancelled')     as cancelled,
             max(d.created_at)                                  as last_dossier_at
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

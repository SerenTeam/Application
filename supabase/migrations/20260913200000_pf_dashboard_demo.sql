-- Espace partenaire PF — v0-démo (rendu investisseurs + ouverture bêta le 2026-09-16, J-3).
-- Spec : docs/design-pf-dashboard-demo.md. Périmètre de déploiement : branche `pre-prod`
-- uniquement avant le rendu — cette migration n'est PAS poussée en prod avant le vrai
-- chantier 4 (enrôlement, QR/codes, ledger, reversements... restent hors scope ici).
--
-- 3 tables minimales : une pompe funèbres (PF) partenaire, son rattachement à un compte
-- auth (l'espace partenaire), et l'attribution d'un dossier famille à une PF. AUCUNE policy
-- n'est créée sur ces 3 tables : RLS activée = deny-all, exactement le modèle de `purchases`
-- (migration 20260725120000) et `webhook_config` (migration 20260716120000) — ni les familles
-- ni les partenaires ne peuvent lire ces tables en direct via PostgREST (rôles anon et
-- authenticated y compris). La seule voie de lecture est la RPC `partner_dashboard()`
-- ci-dessous, qui ne renvoie QUE des agrégats — c'est la règle rouge T13 : un partenaire ne
-- voit jamais une famille, pas même un prénom. Seed/administration en v0-démo : SQL Editor
-- par Arnaud (assumé — pas de RPC d'écriture dans cette itération).

-- Une pompe funèbres (PF) partenaire.
create table if not exists partners (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  commission_rate numeric(4,3) not null default 0.200,
  created_at      timestamptz not null default now()
);

-- Rattachement d'un compte auth à une PF : c'est ce qui ouvre l'espace partenaire pour ce
-- compte. PK sur user_id → un compte auth = au plus une PF.
create table if not exists partner_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  partner_id uuid not null references partners(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Attribution d'un dossier famille (compte auth) à une PF. PK sur user_id → un dossier
-- famille = au plus une PF attribuée. Règle « premier code gagne » à formaliser au
-- chantier 4 (hors scope v0-démo : l'attribution est seedée à la main).
create table if not exists attributions (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  partner_id uuid not null references partners(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table partners enable row level security;
alter table partner_users enable row level security;
alter table attributions enable row level security;
-- Volontairement AUCUNE policy ci-dessus (cf. bandeau en tête de fichier) : deny-all.

create index if not exists partner_users_partner_idx on partner_users (partner_id);
create index if not exists attributions_partner_idx on attributions (partner_id);

-- Tableau de bord partenaire — agrégats uniquement, jamais de détail par dossier (règle T13 :
-- pas de user_id, pas d'email, pas de prénom, pas de liste de dossiers dans la réponse).
--
-- Isolation : `v_partner_id` provient EXCLUSIVEMENT de `auth.uid()` (jamais d'un paramètre
-- fourni par l'appelant) — un partenaire ne peut donc jamais obtenir les chiffres d'un autre
-- partenaire en falsifiant un id côté client, même en appelant la RPC en direct via
-- PostgREST. Compte sans PF rattachée (pas de ligne dans `partner_users`) → retourne NULL,
-- le front redirige alors vers le dashboard famille.
--
-- « Payé » = purchases.status = 'paid' UNIQUEMENT (cf. CHECK de la migration
-- 20260725120000_purchases.sql : les valeurs possibles sont 'pending', 'paid', 'refunded',
-- 'expired'). Choix documenté : un achat remboursé ('refunded') ne compte NI dans
-- paid_count NI dans revenue_cents — le chantier 1 (D4) referme l'accès famille au
-- remboursement ; la commission partenaire doit suivre le même sort plutôt que de rester
-- due sur un encaissement annulé. 'pending' et 'expired' ne sont pas des paiements aboutis.
-- `revenue_cents` est la somme de `purchases.amount_total` (déjà en centimes, tel que
-- facturé par Stripe) ; `commission_cents = round(revenue_cents × commission_rate)`.
create or replace function partner_dashboard()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner_id       uuid;
  v_partner_name     text;
  v_commission_rate  numeric(4,3);
  v_attributed_count bigint;
  v_paid_count       bigint;
  v_revenue_cents    bigint;
begin
  select partner_id into v_partner_id
    from partner_users
   where user_id = auth.uid();

  if v_partner_id is null then
    return null;
  end if;

  select name, commission_rate into v_partner_name, v_commission_rate
    from partners
   where id = v_partner_id;

  select count(*) into v_attributed_count
    from attributions
   where partner_id = v_partner_id;

  select count(*), coalesce(sum(pur.amount_total), 0)
    into v_paid_count, v_revenue_cents
    from attributions att
    join purchases pur on pur.user_id = att.user_id and pur.status = 'paid'
   where att.partner_id = v_partner_id;

  return json_build_object(
    'partner_name',     v_partner_name,
    'commission_rate',  v_commission_rate,
    'attributed_count', v_attributed_count,
    'paid_count',       v_paid_count,
    'revenue_cents',    v_revenue_cents,
    'commission_cents', round(v_revenue_cents * v_commission_rate)
  );
end;
$$;

revoke all on function partner_dashboard() from public;
grant execute on function partner_dashboard() to authenticated;

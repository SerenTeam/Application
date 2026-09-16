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

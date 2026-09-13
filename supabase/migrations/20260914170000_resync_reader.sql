-- Voie de lecture serveur pour la resynchronisation périodique du cycle papier (chantier 2a,
-- Task 10). Spec : docs/design-chantier-2a-envoi-papier.md §6. Plan :
-- docs/plan-chantier-2a-envoi-papier.md, Task 10 (décision actée : la resynchronisation est un
-- TIMER SERVEUR, `setInterval` dans server.js — PAS de job pg_cron ni de pg_net, zéro fetch HTTP
-- côté base). Branche `feature/chantier-2a` — AUCUN merge vers `pre-prod`/`main` avant la levée
-- du gel post-rendu (cf. header du plan).
--
-- POURQUOI CETTE MIGRATION. Depuis le durcissement RLS du bloc 3 de
-- 20260914120000_letter_sends_papier.sql, `letter_sends` n'expose plus qu'un SELECT owner : un
-- job serveur SANS token utilisateur (comme le webhook, comme cette resynchronisation) ne peut
-- lire AUCUNE ligne par ce chemin — le SELECT owner exige `auth.uid() = user_id`, qui n'existe
-- pas pour un rôle `anon`. Même dispositif que les écritures (record_provider_event,
-- check_send_limits, …) : une fonction `security definer` gardée par le secret partagé de
-- `webhook_config`, INLINÉ dans le corps (jamais encapsulé dans un helper — un tel helper serait
-- un oracle : n'importe qui pourrait sonder s'il connaît le secret sans toucher à une seule
-- ligne de données).
--
-- PÉRIMÈTRE (les 3 catégories de la Task 10, ET SEULEMENT elles) :
--   • `submitted` en chaîne d'impression depuis PLUS de 24 h, sans limite d'âge haute : un pli
--     qui reste coincé des semaines doit continuer d'être revérifié à chaque passage tant qu'il
--     n'a pas bougé ;
--   • `sent` dont l'expédition remonte à MOINS de 30 jours (couverture NPAI 5-10 j avec marge,
--     spec §6) — au-delà, l'envoi est clos et sort de la resynchronisation. `sent_at` est fiable
--     dans les deux chemins d'écriture (`mark_letter_result` ET `update_letter_send_status`
--     posent tous deux `coalesce(sent_at, now())` à la transition vers `sent`, jamais réécrit
--     ensuite) ; un `sent_at` NULL malgré le statut (anomalie qui ne devrait jamais survenir) est
--     traité en faveur de la resynchronisation plutôt que silencieusement exclu — mieux vaut un
--     passage inutile qu'une ligne qui pourrit sans plus jamais être revérifiée ;
--   • `prepared` porteur d'un `provider_ref` NON NUL, SANS limite d'âge : le cas du serveur mort
--     entre le POST accepté par MySendingBox et l'écriture de `mark_letter_result` (revue
--     Task 4, note (5) de la matrice de transitions) — le pli est réellement parti chez le
--     provider mais notre base l'ignore encore.
-- `channel in ('papier','lre','lrar')` : le cycle papier et ses variantes du lot 2c (aucun
-- template n'utilise encore 'lre'/'lrar' en 2a, mais le CHECK de colonne les autorise déjà et le
-- fold `msb-status.js` leur sera commun) — jamais le canal `email` (webhook Resend séparé) ni
-- `portail` (aucun envoi émis par ce canal).
--
-- ZÉRO PII : seuls id / provider_ref / status / channel sont retournés — jamais `recipient`
-- (adresse postale), `attachment_ids` ni aucune autre colonne. Le job resynchronisation n'a besoin
-- que de savoir QUOI revérifier chez le provider (par provider_ref) et QUOI écrire en retour (par
-- provider_ref, via `update_letter_send_status` — jamais par id) ; `id` n'est renvoyé que pour le
-- logging technique (jamais affiché avec des données personnelles).
create or replace function list_sends_for_resync(p_secret text)
returns table (id uuid, provider_ref text, status text, channel text)
language plpgsql security definer set search_path = public as $fn$
begin
  if not exists (select 1 from webhook_config where id = 1 and rpc_secret = p_secret) then
    raise exception 'invalid_secret';
  end if;

  return query
    select ls.id, ls.provider_ref, ls.status, ls.channel
      from letter_sends ls
     where ls.channel in ('papier', 'lre', 'lrar')
       and (
         (ls.status = 'submitted' and ls.provider_ref is not null
            and ls.updated_at < now() - interval '24 hours')
         or (ls.status = 'sent'
            and (ls.sent_at is null or ls.sent_at > now() - interval '30 days'))
         or (ls.status = 'prepared' and ls.provider_ref is not null)
       );
end
$fn$;

-- Interne : lisible uniquement par un appelant qui présente le secret (comme check_send_limits,
-- record_provider_event…). Le grant ci-dessous n'est PAS la barrière de sécurité — PostgREST
-- expose toute fonction du schéma public à quiconque détient la clé publishable — seul le secret
-- vérifié en base l'est ; le grant est nécessaire pour que le serveur (rôle `anon`, ce job n'a
-- aucun token utilisateur) puisse simplement appeler la fonction.
revoke all on function list_sends_for_resync(text) from public;
grant execute on function list_sends_for_resync(text) to anon, authenticated;

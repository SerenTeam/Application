-- Voie de lecture serveur pour la resynchronisation périodique du cycle papier (chantier 2a,
-- Task 10). Spec : docs/design-chantier-2a-envoi-papier.md §6. Plan :
-- docs/plan-chantier-2a-envoi-papier.md, Task 10 (décision actée : la resynchronisation est un
-- TIMER SERVEUR, `setInterval` dans server.js — PAS de job pg_cron ni de pg_net, zéro fetch HTTP
-- côté base). Branche `feature/chantier-2a` — AUCUN merge vers `pre-prod`/`main` avant la levée
-- du gel post-rendu (cf. header du plan).
--
-- ⚠️ Migration jamais poussée nulle part (préprod ni prod) : la revue finale de la Task 10 l'a
-- donc amendée directement plutôt que d'empiler une migration correctrice — pas de risque de
-- rejouer un `create or replace function` sur une base qui aurait déjà l'ancienne version en
-- production (contrairement à 20260914120000_letter_sends_papier.sql, elle bien réellement figée
-- depuis sa propre revue).
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
--   • `prepared` DÉBITÉ mais SANS provider_ref, depuis PLUS de 2 h (⚠️ REVUE FINALE Task 10, I1 —
--     remplace la formulation initiale « prepared avec provider_ref non nul », qui décrivait un
--     état INATTEIGNABLE : `create_letter_send` ne pose jamais `provider_ref`, et la seule RPC qui
--     l'écrit — `mark_letter_result` — le fait TOUJOURS conjointement avec le passage à
--     `submitted`, jamais en laissant le statut à `prepared`. Le VRAI cas orphelin de la revue
--     Task 9 (§ « 3 régimes d'échec provider », régime INCERTAIN) est l'inverse : le débit a été
--     pris (`consume_send` a réussi), la soumission au provider a peut-être abouti, mais même
--     `provider_ref` n'a jamais pu être écrit (rejet réseau avant toute réponse, ou serveur mort
--     juste après). Signature de cet orphelin : `status = 'prepared'`, `provider_ref is null`, un
--     débit `send_debits` TOUJOURS PRÉSENT (un débit libéré via `release_debit` — régimes CERTAIN
--     — supprime sa ligne : sa seule PRÉSENCE dit déjà « non libéré », inutile de tester une
--     colonne booléenne qui n'existe pas). Le délai de 2 h (contre 120 s pour la fenêtre de claim
--     HTTP de la route, spec Task 9) laisse le temps à une reprise utilisateur normale (bouton
--     « reprendre », garde 7 bis de la route) d'aboutir avant que la resync ne s'en mêle. AUCUN
--     GET n'est possible sans provider_ref (rien à corréler côté provider par id) : ces lignes
--     sont seulement SIGNALÉES (Sentry, tag `orphan_debited_send`, server/lib/paper-resync.js) —
--     la réconciliation par recherche metadata côté MySendingBox est hors périmètre 2a (backlog
--     2b). L'objectif ici est de rendre l'orphelin VISIBLE, pas de le réparer automatiquement.
-- `channel in ('papier','lre','lrar')` pour les deux premières catégories (le cycle papier et ses
-- variantes du lot 2c — aucun template n'utilise encore 'lre'/'lrar' en 2a, mais le CHECK de
-- colonne les autorise déjà et le fold `msb-status.js` leur sera commun) ; `channel = 'papier'`
-- STRICTEMENT pour la troisième (seul ce canal peut produire l'orphelin décrit ci-dessus en 2a).
-- Jamais le canal `email` (webhook Resend séparé) ni `portail` (aucun envoi émis par ce canal).
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
     where (
         (ls.channel in ('papier', 'lre', 'lrar') and ls.status = 'submitted'
            and ls.provider_ref is not null
            and ls.updated_at < now() - interval '24 hours')
         or (ls.channel in ('papier', 'lre', 'lrar') and ls.status = 'sent'
            -- garde défensive (revue finale, mineur) : un `sent` sans provider_ref ne devrait
            -- jamais exister (les deux chemins d'écriture posent status et provider_ref
            -- ensemble), mais la resync ne doit jamais tenter un GET sur une référence absente.
            and ls.provider_ref is not null
            and (ls.sent_at is null or ls.sent_at > now() - interval '30 days'))
         or (ls.channel = 'papier' and ls.status = 'prepared'
            and ls.provider_ref is null
            and ls.updated_at < now() - interval '2 hours'
            and exists (select 1 from send_debits sd where sd.send_id = ls.id))
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

-- ════════════════════════════════════════════════════════════════════════════════════════
-- Redéfinition de record_provider_event (revue finale Task 10, I2)
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Fonction originellement créée dans 20260914120000_letter_sends_papier.sql (bloc 7) — signature
-- INCHANGÉE (`create or replace` suffit, pas de `drop` nécessaire), seule la sémantique du
-- doublon change. Toujours la même table, migration jamais poussée : amendée ici plutôt qu'une
-- 3ᵉ migration pour une seule fonction.
--
-- PROBLÈME CORRIGÉ. La version originale renvoyait `false` pour TOUT doublon (`on conflict (id)
-- do nothing`, 0 ligne affectée), y compris un événement déjà PERSISTÉ mais jamais MARQUÉ TRAITÉ
-- (`processed_at is null` — le GET de vérification avait échoué, ou le process est mort entre la
-- persistance et `mark_provider_event_processed`). Le webhook, sur `false`, n'effectue AUCUN
-- retraitement (`if (!isNew) return`, server/routes/provider-webhook.js) : une relivraison de
-- MySendingBox — précisément le mécanisme qui aurait pu réparer l'échec précédent — était donc
-- avalée sans effet, laissant la seule resynchronisation périodique rattraper l'événement (jusqu'à
-- 24 h de retard pour un `submitted`).
--
-- CORRECTIF. `true` est désormais renvoyé dans DEUX cas : l'INSERT a réellement inséré une ligne
-- (événement neuf), OU l'événement existait déjà mais avec `processed_at is null` (rejeu d'un
-- événement PAS ENCORE traité — rien de plus n'est écrit sur la ligne existante, seul le signal
-- « à retraiter » compte, un upsert du payload serait sans intérêt ici). `false` reste réservé au
-- seul cas où l'événement est un rejeu d'un événement DÉJÀ traité avec succès — rien à refaire.
create or replace function record_provider_event(
  p_secret     text,
  p_id         text,
  p_send_id    uuid  default null,
  p_event_type text  default null,
  p_payload    jsonb default null
) returns boolean language plpgsql security definer set search_path = public as $fn$
declare v_count integer;
begin
  if not exists (select 1 from webhook_config where id = 1 and rpc_secret = p_secret) then
    raise exception 'invalid_secret';
  end if;
  insert into provider_events (id, send_id, event_type, payload)
  values (p_id, p_send_id, p_event_type, p_payload)
  on conflict (id) do nothing;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    return true; -- événement réellement nouveau
  end if;

  -- Doublon : signale « à retraiter » si et seulement si la ligne existante n'a JAMAIS été
  -- marquée traitée (processed_at is null) — sinon c'est un rejeu inoffensif d'un événement déjà
  -- pleinement traité, false comme avant.
  return exists (select 1 from provider_events where id = p_id and processed_at is null);
end
$fn$;

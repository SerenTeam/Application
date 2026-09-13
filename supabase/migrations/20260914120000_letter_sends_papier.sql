-- Cycle de vie papier des envois de courriers (chantier 2a, lot fondations d'envoi papier).
-- Spec : docs/design-chantier-2a-envoi-papier.md §3.5 (statuts + durcissement RLS), §4 (quota et
-- facturation à l'acte), §5 (kill switch et plafonds), §6 (webhook provider), §7 (re-envoi NPAI).
-- Plan : docs/plan-chantier-2a-envoi-papier.md, Task 4 (les 8 blocs ci-dessous, dans l'ordre).
-- Branche `feature/chantier-2a` — AUCUN merge vers `pre-prod`/`main` avant la levée du gel
-- post-rendu (cf. header du plan) ; migration volontairement timestampée après
-- 20260913200000_pf_dashboard_demo et après les deux migrations 2a déjà livrées.
--
-- ⚠️ COUPLAGE AVEC LA TASK 5 — À LIRE AVANT TOUT `supabase db push`.
-- Le bloc 3 supprime la policy `FOR ALL` de letter_sends : à partir de cette migration, un
-- utilisateur (donc aussi le serveur, qui agit avec SON token) ne peut plus écrire la table en
-- direct. `createSend` / `claimRetry` / `markSendResult` de server/lib/letters-store.js sont
-- CASSÉS tant que la Task 5 ne les a pas rebranchés sur les RPC définies ici. Les deux tasks
-- sont commitées séparément mais poussées ENSEMBLE : ne jamais pousser cette migration sur une
-- base dont le serveur tourne encore le store d'avant la Task 5.
--
-- Pourquoi ce durcissement : un statut d'envoi (« expédié », « distribué », « NPAI ») est une
-- pièce probante — il finance des démarches et, au lot 2c, un accusé de réception. Tant que la
-- policy `FOR ALL` existe, son propriétaire peut l'écrire lui-même avec la clé publishable
-- (publique côté front) : `status = 'delivered'` en un appel PostgREST. Même raisonnement, et
-- même dispositif, que la table purchases du chantier 1 (20260725120000_purchases.sql) : la
-- table ne garde qu'un SELECT owner, toutes les mutations passent par des fonctions
-- `security definer` qui vérifient ELLES-MÊMES le secret partagé de la table webhook_config
-- (PostgREST expose toute fonction du schéma public en POST /rest/v1/rpc/<name> à quiconque
-- détient la clé publishable : le grant EXECUTE ne protège rien, seul le secret protège).
--
-- ASYMÉTRIE ASSUMÉE SUR LE SECRET (documentée une fois pour toutes) :
--   • les RPC NOUVELLES lèvent l'exception nommée `invalid_secret` quand le secret est faux ou
--     absent — un no-op silencieux sur une écriture `security definer` qui débite de l'argent
--     réel est un piège de débogage (on croit avoir écrit, rien n'a bougé) ;
--   • `update_letter_send_status`, réécrite ici mais déjà en service sur le canal email v1,
--     CONSERVE le comportement silencieux de sa version v1 (retourne simplement false) : sa
--     route webhook Resend a pour règle de ne jamais renvoyer 500 à un webhook signé valide.
--     Changer ce contrat en cours de route ferait tomber une avalanche Sentry sur une
--     configuration seulement incomplète.
--
-- CODES D'ERREUR LEVÉS PAR LES RPC (traduits par le store en Task 5) :
--   invalid_secret          secret webhook_config faux/absent (toutes les RPC neuves)
--   send_not_found          l'envoi n'existe pas, ou n'appartient pas à l'utilisateur annoncé
--   invalid_initial_status  statut de création incompatible avec le canal
--   invalid_resend_of       `resend_of` pointe un envoi inexistant ou d'un autre utilisateur
--   resend_already_exists   un re-envoi existe déjà pour cet original (un seul par original)
--   quota_exhausted         solde d'envois épuisé → 402 + offre d'achat à l'acte
--   user_daily_exceeded     plafond d'envois papier par utilisateur / 24 h
--   global_daily_exceeded   plafond d'envois papier global / 24 h
-- Une transition de statut refusée n'est PAS une exception : forward-only silencieux, comme en
-- v1 — `update_letter_send_status` retourne false, `mark_letter_result` conserve le statut
-- courant et enregistre quand même les métadonnées (cf. bloc 4).

-- ════════════════════════════════════════════════════════════════════════════════════════
-- Bloc 1 — purchases.kind : distinguer le forfait de l'achat d'envoi supplémentaire
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Un « envoi supplémentaire » (facturation à l'acte, spec §4) est une ligne purchases normale
-- avec `included_sends = 1`. Le défaut 'forfait' garantit la compatibilité : les quatre RPC du
-- chantier 1 (create_pending_purchase / mark_purchase_paid / mark_purchase_refunded /
-- expire_purchase) énumèrent explicitement leurs colonnes et ne mentionnent jamais `kind` —
-- une colonne NOT NULL DEFAULT ne casse ni leurs INSERT ... SELECT ni le `on conflict do update`
-- de mark_purchase_paid. Vérifié ligne à ligne dans 20260725120000_purchases.sql.
--
-- ⚠️ POINT D'ATTENTION POUR LA TASK 9 : aucune RPC existante ne sait ÉCRIRE `kind`. La route
-- Checkout « envoi supplémentaire » devra étendre create_pending_purchase ET mark_purchase_paid
-- avec un paramètre `p_kind text default 'forfait'` (migration dédiée), en respectant deux
-- règles : (a) sur la branche `on conflict do update`, NE PAS réécrire `kind` — la ligne
-- `pending` porte déjà la bonne valeur et un appelant ancien (sans p_kind) rétrograderait un
-- `envoi_sup` en `forfait`, ce qui OUVRIRAIT le gate du produit au prix d'un timbre ; (b) ne
-- jamais écrire le kind en deux temps (paid puis kind) : la fenêtre intermédiaire ouvre le gate.
-- Tant que cette RPC n'existe pas, aucune ligne `envoi_sup` ne peut naître : pas de fenêtre de
-- vulnérabilité ouverte par cette migration.
alter table purchases add column if not exists kind text not null default 'forfait';

do $do$
begin
  alter table purchases add constraint purchases_kind_check check (kind in ('forfait','envoi_sup'));
exception
  when duplicate_object then null;  -- migration rejouée : la contrainte est déjà là
end
$do$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- Bloc 2 — letter_sends : colonnes du cycle papier + CHECK de statut élargi
-- ════════════════════════════════════════════════════════════════════════════════════════
-- resend_of      : re-envoi d'un courrier parti en NPAI (spec §7). Référence l'envoi original.
--                  `on delete cascade` (et non `set null`) pour que la suppression d'un compte
--                  (auth.users → cascade sur letter_sends) ne bute jamais sur une auto-référence.
-- attachment_ids : ids des pièces jointes du coffre (Task 6) transmises au provider.
-- cost_cents     : coût facturé par le provider quand il est connu (jamais garanti).
alter table letter_sends
  add column if not exists resend_of      uuid references letter_sends(id) on delete cascade,
  add column if not exists attachment_ids jsonb,
  add column if not exists cost_cents     integer;

-- Pas d'index simple sur resend_of : l'index unique partiel du bloc 6 sert déjà les recherches
-- par original (un index nommé de plus serait redondant à l'écriture comme à la lecture).

-- Le CHECK de statut v1 était une contrainte de colonne ANONYME : Postgres l'a nommée
-- `letter_sends_status_check` (convention <table>_<colonne>_check). Plutôt que de parier sur ce
-- nom, on supprime TOUTE contrainte CHECK de la table dont la définition porte à la fois sur la
-- colonne `status` et sur la valeur 'sending' — la v1 comme une éventuelle variante renommée à
-- la main. Le CHECK du canal (`channel in (...)`) ne mentionne pas 'sending' : il survit intact.
-- Boucle rejouable : au second passage elle supprime le CHECK réécrit ci-dessous, aussitôt
-- recréé à l'identique.
do $do$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class     rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
     where nsp.nspname = 'public'
       and rel.relname = 'letter_sends'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%status%'
       and pg_get_constraintdef(con.oid) ilike '%sending%'
  loop
    execute format('alter table letter_sends drop constraint %I', c.conname);
  end loop;
end
$do$;

-- Ceinture en plus des bretelles : si la contrainte v1 portait bien le nom de la convention,
-- elle a déjà été supprimée par la boucle ; ce drop explicite couvre le cas d'une base où sa
-- définition aurait échappé au filtre ci-dessus.
alter table letter_sends drop constraint if exists letter_sends_status_check;

-- Union des deux cycles ; c'est `channel` qui discrimine (les transitions autorisées, elles,
-- vivent dans letter_send_transition_allowed au bloc 4 — un CHECK ne sait pas lire l'ancienne
-- valeur d'une ligne). Les statuts email v1 restent valides à l'identique : la préprod, qui
-- porte déjà des lignes email, passe la validation de la contrainte sans une seule exception.
alter table letter_sends add constraint letter_sends_status_check check (status in (
  -- cycle email v1 (Resend)
  'sending',        -- envoi en cours côté serveur
  'sent',           -- remis au provider (email) / EXPÉDIÉ, état final nominal (courrier simple)
  'delivered',      -- distribué — email, et LRAR au lot 2c ; JAMAIS pour un courrier simple
  'failed',         -- échec définitif
  -- cycle papier (MySendingBox — §M du plan)
  'prepared',       -- ligne créée, rien n'est encore parti chez le provider
  'submitted',      -- accepté par le provider (201 du POST /letters), en chaîne d'impression
  'failed_address'  -- NPAI : adresse invalide / pli retourné — peut tomber APRÈS 'sent'
));

-- Le défaut de la colonne reste 'sending' (héritage email v1) : create_letter_send choisit
-- explicitement le statut initial selon le canal, aucune écriture ne s'appuie sur ce défaut.

-- ════════════════════════════════════════════════════════════════════════════════════════
-- Bloc 3 — Durcissement RLS : letter_sends devient une table en LECTURE SEULE pour son owner
-- ════════════════════════════════════════════════════════════════════════════════════════
-- (Voir l'avertissement de couplage Task 5 en tête de fichier.) Le SELECT owner reste la SEULE
-- voie d'accès client : le panneau d'envoi et le compteur de quota lisent, personne n'écrit.
drop policy if exists "own sends"      on letter_sends;
drop policy if exists "own sends read" on letter_sends;
create policy "own sends read" on letter_sends
  for select using (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════════════════════════
-- Bloc 4 — Transitions de statut et RPC d'écriture de letter_sends
-- ════════════════════════════════════════════════════════════════════════════════════════
--
-- MATRICE DES TRANSITIONS (forward-only, par canal). Toute case absente = transition
-- silencieusement ignorée (false), jamais une exception : les événements provider arrivent
-- dans le désordre et sont rejoués — un `letter.sent` relivré en retard ne doit pas rétrograder
-- un `failed_address`, ni un rejeu de webhook réécrire un terminal.
--
-- ┌──────────────────┬──────────────┬────────────────────────────────────────────────────────┐
-- │ canal            │ statut avant │ statut après autorisé                                  │
-- ├──────────────────┼──────────────┼────────────────────────────────────────────────────────┤
-- │ email            │ sending      │ sent, delivered, failed                                │
-- │                  │ sent         │ delivered, failed                                      │
-- │                  │ delivered    │ — (terminal)                                           │
-- │                  │ failed       │ — (terminal ; le retry passe par claim_letter_retry)   │
-- ├──────────────────┼──────────────┼────────────────────────────────────────────────────────┤
-- │ papier           │ prepared     │ submitted, sent, failed, failed_address                │
-- │                  │ submitted    │ sent, failed, failed_address                           │
-- │                  │ sent         │ failed_address            ← NPAI tardif (5-10 j)       │
-- │                  │              │ failed                    ← retour sans NPAI           │
-- │                  │ failed       │ — (terminal ; retry par claim_letter_retry)            │
-- │                  │ failed_addr. │ — (terminal ; le rattrapage est un NOUVEL envoi        │
-- │                  │              │    resend_of, pas une transition)                      │
-- ├──────────────────┼──────────────┼────────────────────────────────────────────────────────┤
-- │ lre / lrar (2c)  │ = papier     │ = papier, PLUS sent → delivered (AR probant)           │
-- ├──────────────────┼──────────────┼────────────────────────────────────────────────────────┤
-- │ portail          │ *            │ — (aucun envoi n'est émis par ce canal)                │
-- └──────────────────┴──────────────┴────────────────────────────────────────────────────────┘
--
-- Trois précisions qui ne tiennent pas dans le tableau :
--  (1) email : `sending → delivered` est hérité de la v1 (Resend peut livrer `email.delivered`
--      avant `email.sent`) — conservé tel quel, non-régression du canal en service.
--  (2) papier : `sent` est l'état FINAL NOMINAL du courrier simple. MySendingBox n'émet aucun
--      événement de distribution en écopli/prioritaire (doc officielle, spec §3.5) : `delivered`
--      n'est atteignable que depuis un canal avec accusé de réception. D'où la restriction
--      `lre`/`lrar` — INATTEIGNABLE EN 2A, aucun template n'utilise ces canaux (la Task 11
--      requalifie au contraire les 5 `lre` restants en `papier`). Le CHECK du canal, lui, n'est
--      PAS touché : il autorise 'lre' et pas 'lrar' ; le lot 2c tranchera le nom définitif, la
--      matrice accepte déjà les deux pour ne pas avoir à la rouvrir.
--  (3) `statut avant = statut après` renvoie false : c'est le cas des événements no-op du
--      mapping §M (`letter.accepted` alors que la ligne est déjà `submitted`).
--  (4) papier `sent → failed` : `letter.returned_to_sender` SANS `wrong_address` (pli retourné
--      pour une autre raison) arrive après l'expédition — sans cette case, un retour réel
--      resterait affiché « Expédié ». `failed_address` couvre l'autre moitié du même événement.
--  (5) papier `prepared → sent` : garde défensive. Si le serveur meurt entre le POST accepté
--      par MySendingBox et l'écriture de `mark_letter_result`, la ligne reste `prepared` alors
--      que le pli est parti ; la resynchronisation (Task 10) doit pouvoir la rattraper d'un
--      coup plutôt que de la laisser bloquée en « préparé » pour toujours.
create or replace function letter_send_transition_allowed(p_channel text, p_from text, p_to text)
returns boolean language sql immutable set search_path = public as $fn$
  select coalesce(
    case
      when p_channel = 'email' then
             (p_to = 'sent'      and p_from = 'sending')
          or (p_to = 'delivered' and p_from in ('sending','sent'))
          or (p_to = 'failed'    and p_from in ('sending','sent'))
      when p_channel in ('papier','lre','lrar') then
             (p_to = 'submitted'      and p_from = 'prepared')
          -- 'prepared' inclus : rattrapage d'un 201 perdu (note 5)
          or (p_to = 'sent'           and p_from in ('prepared','submitted'))
          -- 'sent' inclus : pli retourné sans NPAI (note 4)
          or (p_to = 'failed'         and p_from in ('prepared','submitted','sent'))
          or (p_to = 'failed_address' and p_from in ('prepared','submitted','sent'))
          -- AR probant : réservé aux canaux recommandés (lot 2c), jamais au courrier simple
          or (p_to = 'delivered'      and p_from = 'sent' and p_channel in ('lre','lrar'))
      else false
    end, false);
$fn$;
-- ⚠️ RÉVOCATION NOMINATIVE OBLIGATOIRE (anon ET authenticated, pas seulement public) : sur
-- Supabase, les default privileges du schéma public accordent EXECUTE NOMINATIVEMENT à ces deux
-- rôles à la création de la fonction — un `revoke ... from public` ne leur retire donc RIEN et
-- la fonction resterait appelable en POST /rest/v1/rpc/<name> avec la seule clé publishable
-- (précédent interne : docs/audit-rls.md). Ces helpers sont INTERNES : ils ne sont appelés que
-- depuis les RPC `security definer` de ce fichier, qui s'exécutent avec les droits du
-- propriétaire et gardent donc leur EXECUTE. Aucun grant ne doit leur être rendu.
revoke all on function letter_send_transition_allowed(text, text, text) from public, anon, authenticated;

-- Statut initial légitime d'un envoi, par canal (garde de create_letter_send).
create or replace function letter_send_initial_status(p_channel text)
returns text language sql immutable set search_path = public as $fn$
  select case
           when p_channel = 'email' then 'sending'
           when p_channel in ('papier','lre','lrar') then 'prepared'
           else null
         end;
$fn$;
revoke all on function letter_send_initial_status(text) from public, anon, authenticated;

-- Le secret partagé n'est PAS encapsulé dans une fonction : le test
--   exists (select 1 from webhook_config where id = 1 and rpc_secret = p_secret)
-- est INLINÉ dans chacune des RPC ci-dessous, exactement comme dans
-- 20260725120000_purchases.sql. Une fonction `webhook_secret_ok(text)` serait un oracle : même
-- révoquée, la moindre erreur de grant la transformerait en test « ce secret est-il le bon ? »
-- appelable par quiconque détient la clé publishable. Un peu de répétition vaut mieux qu'un
-- oracle à une ligne.
drop function if exists webhook_secret_ok(text);

-- ─── create_letter_send : INSERT gardé, sémantique `duplicate` de l'ancien store ────────────
-- Remplace `client.from('letter_sends').insert(...)` (impossible depuis le bloc 3). Reproduit à
-- l'identique le contrat de store.createSend : soit l'envoi est créé, soit le dedup_key existe
-- déjà et on renvoie la ligne existante avec `duplicate: true` (l'appelant décide alors :
-- already_sent, claim de retry, ou 409). La formule du dedup_key reste calculée côté serveur
-- (sha256 : email = user|template|corps|destinataire ; papier = user|template|adresse
-- normalisée|coalesce(resend_of,'')) — elle est passée en paramètre, la base ne fait que
-- l'imposer comme unique.
-- Le plafond d'envois papier est vérifié ICI, en dernier ressort (spec §5 : « plafonds vérifiés
-- dans la RPC de création ») : la route appelle check_send_limits en amont pour rendre un 429
-- explicite, mais aucune route ne peut CONTOURNER la garde. Les canaux non payants (email) ne
-- sont jamais comptés ni bloqués.
-- ⚠️ Ce contrôle est un GARDE-FOU BEST-EFFORT, PAS un compteur transactionnel : il n'est protégé
-- par aucun verrou global (en poser un sérialiserait tous les envois de la plateforme). Deux
-- créations simultanées au ras du plafond peuvent donc passer toutes les deux — l'ordre de
-- grandeur est tenu, pas la valeur exacte. Il borne un emballement (boucle, compte compromis) ;
-- la garde qui protège l'ARGENT, elle, est consume_send, et celle-là est bien sérialisée.
-- Résolution plpgsql à l'exécution : send_limits_status (bloc 8) et l'index unique de resend_of
-- (bloc 6) sont créés plus bas dans CE fichier — l'ordre des blocs du plan est donc respecté
-- sans casse, rien n'est résolu au moment du CREATE FUNCTION.
create or replace function create_letter_send(
  p_secret         text,
  p_user_id        uuid,
  p_template_id    text,
  p_channel        text,
  p_dedup_key      text,
  p_step_id        text    default null,
  p_status         text    default null,
  p_provider       text    default null,
  p_recipient      jsonb   default null,
  p_resend_of      uuid    default null,
  p_attachment_ids jsonb   default null,
  p_cost_cents     integer default null
) returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_row     letter_sends%rowtype;
  v_status  text;
  v_limits  text;
begin
  if not exists (select 1 from webhook_config where id = 1 and rpc_secret = p_secret) then
    raise exception 'invalid_secret';
  end if;

  v_status := coalesce(p_status, letter_send_initial_status(p_channel));
  if v_status is null or v_status is distinct from letter_send_initial_status(p_channel) then
    raise exception 'invalid_initial_status';
  end if;

  -- Un re-envoi ne peut viser que SON PROPRE original (garde d'appartenance : le serveur passe
  -- un id venu du client, on ne lui fait pas confiance).
  if p_resend_of is not null
     and not exists (select 1 from letter_sends where id = p_resend_of and user_id = p_user_id) then
    raise exception 'invalid_resend_of';
  end if;

  -- Plafonds (canaux payants uniquement).
  if p_channel in ('papier','lre','lrar') then
    v_limits := send_limits_status(p_user_id);
    if v_limits <> 'ok' then
      raise exception '%', v_limits;   -- user_daily_exceeded | global_daily_exceeded
    end if;
  end if;

  insert into letter_sends (user_id, step_id, template_id, channel, status, provider,
                            recipient, dedup_key, resend_of, attachment_ids, cost_cents)
  values (p_user_id, p_step_id, p_template_id, p_channel, v_status, p_provider,
          p_recipient, p_dedup_key, p_resend_of, p_attachment_ids, p_cost_cents)
  on conflict (dedup_key) do nothing
  returning * into v_row;

  if found then
    return jsonb_build_object('duplicate', false, 'send', to_jsonb(v_row));
  end if;

  -- `on conflict (dedup_key) do nothing` a absorbé le doublon : on recharge la ligne existante.
  -- Filtre `user_id` : le dedup_key intègre déjà l'utilisateur dans son hachage, mais cette RPC
  -- ne renverra JAMAIS la ligne d'un tiers, même si un appelant lui passait une clé forgée.
  select * into v_row from letter_sends where dedup_key = p_dedup_key and user_id = p_user_id;
  if not found then
    -- Le conflit ne venait pas du dedup_key et n'a pourtant rien inséré : anomalie franche.
    raise exception 'send_not_found';
  end if;
  return jsonb_build_object('duplicate', true, 'send', to_jsonb(v_row));

exception
  -- Le SEUL autre index unique de la table est celui de resend_of (bloc 6) : la violation qui
  -- remonte ici signifie qu'un re-envoi existe déjà pour cet original (un seul par original).
  when unique_violation then
    raise exception 'resend_already_exists';
end
$fn$;

-- ─── claim_letter_retry : claim atomique d'une nouvelle tentative (correctif TOCTOU v1) ─────
-- Remplace store.claimRetry. Deux POST identiques concurrents calculent le même dedup_key : le
-- second recharge une ligne encore en vol et, sans verrou, « retenterait » pendant que le
-- premier envoie → courrier reçu deux fois. L'UPDATE conditionnel est atomique côté Postgres :
-- une seule requête voit une ligne modifiée ; l'autre reçoit null et répond 409.
--   • p_allow_stale = false → on ne claime qu'une ligne 'failed' (échec constaté, retentable).
--   • p_allow_stale = true  → on ne claime la ligne EN VOL que si elle est périmée
--     (updated_at plus vieux que p_stale_seconds : crash serveur en plein envoi, ou tentative
--     d'avant la configuration de la clé provider). Fenêtre paramétrable : 60 s suffisent à un
--     appel Resend, un POST MySendingBox avec PDF + pièces jointes demande davantage.
-- Le statut « en vol » dépend du canal ('sending' pour l'email, 'prepared' pour le papier) et
-- le claim REVIENT EN ARRIÈRE volontairement (failed → en vol) : c'est une reprise explicite,
-- pas un événement de cycle de vie — elle ne passe donc pas par la matrice des transitions.
-- 'failed_address' n'est JAMAIS claimable : le rattrapage d'un NPAI est un nouvel envoi
-- (resend_of), avec une adresse corrigée — jamais une nouvelle tentative à l'identique.
-- ⚠️ GARDE D'ARGENT `provider_ref is null` (canaux papier) : dès qu'une ligne porte une
-- référence provider, le pli EXISTE chez MySendingBox — il est peut-être déjà imprimé, affranchi,
-- posté. Une « nouvelle tentative » en ferait partir un SECOND, facturé, vers le même
-- destinataire. Une ligne papier référencée ne se réexpédie donc jamais : elle se
-- RESYNCHRONISE (Task 10, GET /letters/{id} + transition). Le canal email n'a pas ce risque
-- (rien n'est engagé physiquement) et garde le comportement v1 à l'identique.
create or replace function claim_letter_retry(
  p_secret        text,
  p_id            uuid,
  p_allow_stale   boolean default false,
  p_stale_seconds integer default 60
) returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_row letter_sends%rowtype;
begin
  if not exists (select 1 from webhook_config where id = 1 and rpc_secret = p_secret) then
    raise exception 'invalid_secret';
  end if;

  update letter_sends
     set status     = letter_send_initial_status(channel),
         updated_at = now()
   where id = p_id
     and letter_send_initial_status(channel) is not null
     -- jamais de seconde expédition d'un pli déjà pris en charge par le provider
     and (channel = 'email' or provider_ref is null)
     and (
          (p_allow_stale
             and status = letter_send_initial_status(channel)
             -- plancher à 30 s : une fenêtre plus courte (a fortiori 0) déclarerait « périmé »
             -- un envoi simplement lent et le ferait repartir en double
             and updated_at < now() - make_interval(secs => greatest(coalesce(p_stale_seconds, 60), 30)))
          or (not coalesce(p_allow_stale, false) and status = 'failed')
         )
  returning * into v_row;

  if not found then
    return null;   -- claim perdu : un envoi est en cours ailleurs (l'appelant répond 409)
  end if;
  return to_jsonb(v_row);

exception
  -- Cas de bord du re-envoi offert : une ligne `resend_of` en 'failed' sort de l'index unique
  -- partiel (bloc 6) ; si un AUTRE re-envoi du même original a été créé entre-temps, la reprise
  -- la ferait rentrer dans l'index et violerait l'unicité. Le créneau est pris : claim perdu.
  when unique_violation then
    return null;
end
$fn$;

-- ─── mark_letter_result : résultat immédiat d'une tentative d'envoi ─────────────────────────
-- Remplace store.markSendResult (route POST /send, juste après l'appel provider) : email
-- sending → sent (+provider_ref) ou → failed (+error) ; papier prepared → submitted
-- (+provider_ref du 201) ou → failed.
-- Une transition refusée NE LÈVE PAS : elle est possible sans bug, par simple course avec le
-- webhook provider (MySendingBox peut pinguer un `letter.sent` avant que notre écriture
-- synchrone du 201 n'ait abouti — l'événement porte `metadata.seren_send_id`, il n'a pas besoin
-- de notre provider_ref pour retrouver la ligne). Dans ce cas on GARDE le statut le plus avancé
-- et on enregistre quand même les métadonnées (provider_ref, coût) : les perdre couperait la
-- ligne de son suivi provider. Faire échouer la route après un courrier réellement parti serait
-- le pire des deux mondes.
-- ⚠️ CONTRAT D'APPEL : `p_id` est MAÎTRISÉ PAR LE SERVEUR — c'est l'id que create_letter_send /
-- claim_letter_retry viennent de renvoyer dans la même requête. Il ne doit JAMAIS être relayé
-- depuis le client : cette RPC n'a pas de paramètre `user_id` et n'exerce donc AUCUN contrôle
-- d'appartenance (le secret est sa seule garde). Un id venu du corps d'une requête HTTP
-- permettrait d'écrire le statut de l'envoi d'un tiers.
-- Retour : { send: <ligne>, transition_applied: bool } — `transition_applied = false` signale
-- que le statut n'a pas bougé (course avec le webhook), les métadonnées ayant été écrites.
create or replace function mark_letter_result(
  p_secret       text,
  p_id           uuid,
  p_status       text,
  p_provider_ref text        default null,
  p_sent_at      timestamptz default null,
  p_error        text        default null,
  p_cost_cents   integer     default null
) returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_row     letter_sends%rowtype;
  v_allowed boolean;
begin
  if not exists (select 1 from webhook_config where id = 1 and rpc_secret = p_secret) then
    raise exception 'invalid_secret';
  end if;

  -- FOR UPDATE : le verrou tient jusqu'au commit, aucune fenêtre entre la lecture du statut
  -- courant et l'écriture qui en dépend.
  select * into v_row from letter_sends where id = p_id for update;
  if not found then
    raise exception 'send_not_found';
  end if;

  v_allowed := letter_send_transition_allowed(v_row.channel, v_row.status, p_status);

  update letter_sends
     set status       = case when v_allowed then p_status else status end,
         provider_ref = coalesce(p_provider_ref, provider_ref),
         cost_cents   = coalesce(p_cost_cents, cost_cents),
         -- transition refusée : on ne réécrit JAMAIS un sent_at déjà posé (une date tardive ne
         -- doit pas remplacer la date réelle d'expédition), on se contente de combler un trou
         sent_at      = case when v_allowed and p_status = 'sent'
                             then coalesce(p_sent_at, now())
                             else coalesce(sent_at, p_sent_at) end,
         -- une erreur d'une tentative passée ne survit pas à un succès ; à l'inverse on ne
         -- réécrit pas l'erreur d'origine quand la transition a été refusée
         error        = case when v_allowed and p_status in ('sent','submitted','delivered') then null
                             when v_allowed then coalesce(p_error, error)
                             else error end,
         -- transition refusée : on ne touche pas à updated_at — c'est l'horloge que
         -- claim_letter_retry interroge pour décider qu'un envoi est périmé, la rafraîchir
         -- prolongerait indûment la fenêtre « envoi en cours » d'une ligne qui n'a pas bougé
         updated_at   = case when v_allowed then now() else updated_at end
   where id = p_id
  returning * into v_row;

  return jsonb_build_object('send', to_jsonb(v_row), 'transition_applied', v_allowed);
end
$fn$;

-- ─── update_letter_send_status : mise à jour par référence provider (webhooks) ──────────────
-- RÉÉCRITE : même nom, mêmes paramètres qu'en v1 (le webhook Resend l'appelle déjà avec ces
-- noms), mais retour `boolean` au lieu de `void` → un `drop` est indispensable, `create or
-- replace` ne sait pas changer un type de retour. Le store v1 ignore la valeur de retour : la
-- réécriture est transparente pour lui.
-- true  = une ligne a changé de statut ; false = rien (secret faux, référence inconnue, ou
-- transition non autorisée par la matrice ci-dessus). Jamais d'exception : c'est le chemin des
-- webhooks, qui acquittent toujours en 200 (cf. asymétrie documentée en tête de fichier).
drop function if exists update_letter_send_status(text, text, text, timestamptz, text);
create or replace function update_letter_send_status(
  p_secret       text,
  p_provider_ref text,
  p_status       text,
  p_delivered_at timestamptz default null,
  p_error        text        default null
) returns boolean language plpgsql security definer set search_path = public as $fn$
declare v_count integer;
begin
  if not exists (select 1 from webhook_config where id = 1 and rpc_secret = p_secret) then
    return false;
  end if;

  update letter_sends
     set status       = p_status,
         delivered_at = case when p_status = 'delivered'
                             then coalesce(p_delivered_at, delivered_at, now())
                             else coalesce(p_delivered_at, delivered_at) end,
         sent_at      = case when p_status = 'sent' then coalesce(sent_at, now()) else sent_at end,
         error        = case when p_status in ('sent','submitted','delivered') then null
                             else coalesce(p_error, error) end,
         updated_at   = now()
   where provider_ref = p_provider_ref
     and letter_send_transition_allowed(channel, status, p_status);

  get diagnostics v_count = row_count;
  return v_count > 0;
end
$fn$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- Bloc 5 — send_debits : le registre des envois débités
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Idempotence PAR CONSTRUCTION : `send_id` est la clé primaire — un envoi ne peut pas être
-- débité deux fois, quel que soit le nombre de tentatives (claim_letter_retry ne recrée pas de
-- ligne, il réutilise la même). RLS : SELECT owner (le compteur de quota du front lit ses
-- propres débits), AUCUNE policy d'écriture — consume_send / release_debit sont les deux seules
-- portes, et elles exigent le secret.
create table if not exists send_debits (
  send_id    uuid primary key references letter_sends(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  source     text not null check (source in ('included','extra','offert')),
  created_at timestamptz not null default now()
);
alter table send_debits enable row level security;
drop policy if exists "own debits read" on send_debits;
create policy "own debits read" on send_debits
  for select using (auth.uid() = user_id);
create index if not exists send_debits_user_idx on send_debits (user_id);

-- ⚠️ ÉCART DOCUMENTÉ vs le plan (bloc 6 : « débit offert, source `included` ») : une troisième
-- valeur `offert` est nécessaire. Un re-envoi NPAI marqué 'included' serait COMPTÉ dans le
-- solde (solde = Σ crédits − nombre de débits) et consommerait donc bel et bien un envoi — ce
-- que la spec §7 interdit explicitement (« un re-envoi suite à un échec d'adresse n'est pas
-- débité une seconde fois »). 'offert' conserve la trace du marqueur voulue par le plan (la PK
-- porte l'idempotence du re-envoi) tout en le sortant du décompte. Les deux autres valeurs
-- gardent leur sens : 'included' = pris sur le forfait, 'extra' = couvert par un achat à l'acte.

-- ════════════════════════════════════════════════════════════════════════════════════════
-- Bloc 6 — consume_send / release_debit : le débit atomique
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Un seul re-envoi gratuit par original (spec §7, garde anti-abus) : l'index unique partiel est
-- la garde RÉELLE — infalsifiable, puisque les statuts ne s'écrivent plus que par RPC (bloc 3).
-- Le prédicat exclut les lignes 'failed' : un re-envoi dont la SOUMISSION a échoué (provider
-- injoignable, PDF refusé) n'est jamais parti, il ne doit donc pas consommer le droit au geste
-- — l'utilisateur peut en recréer un. Les re-envois réellement engagés (prepared/submitted/sent)
-- et les terminaux qui comptent (failed_address, delivered) occupent bien le créneau.
-- Deuxième borne, portée par consume_send : le droit n'existe que face à un original débité
-- d'un VRAI crédit ('included'/'extra'). Un geste offert ne peut donc pas en engendrer un autre
-- — pas de chaîne A→B→C→… de plis gratuits.
-- Conséquence assumée : si le re-envoi offert repart lui aussi en NPAI, il n'y a pas de second
-- geste — l'utilisateur peut toujours créer un envoi neuf, débité normalement.
create unique index if not exists letter_sends_resend_of_uniq
  on letter_sends (resend_of) where resend_of is not null and status <> 'failed';

-- consume_send : vérifie le solde ET insère le débit DANS LA MÊME TRANSACTION, AVANT toute
-- soumission au provider (spec §4) — deux envois concurrents avec un seul crédit ne passent
-- jamais tous les deux.
--
-- VERROUILLAGE — choix et justification :
-- un `select ... for update` sur les lignes `purchases` de l'utilisateur ne suffit PAS : quand
-- l'utilisateur n'a aucun achat (cas le plus fréquent hors vente ouverte), il n'y a AUCUNE
-- ligne à verrouiller, donc aucune sérialisation, et deux transactions concurrentes liraient
-- toutes deux le même solde. Il verrouillerait par ailleurs des lignes de paiement que le
-- webhook Stripe peut vouloir écrire au même instant (contention croisée inutile).
-- On prend donc un VERROU CONSULTATIF DE TRANSACTION porté par l'utilisateur :
--   pg_advisory_xact_lock(20260914, hashtext(user_id))
-- — sérialise exactement ce qu'il faut (les consume_send d'un même utilisateur, deux
-- utilisateurs différents ne s'attendent jamais), ne dépend d'aucune ligne existante, et se
-- relâche AUTOMATIQUEMENT au commit ou au rollback de la RPC (pas de verrou fuité si une
-- exception remonte). Le premier argument, constant, est l'espace de noms « chantier 2a » :
-- il évite toute collision avec un autre verrou consultatif du projet.
-- Le `for update` sur la ligne d'envoi reste utile en complément : il fige le statut de
-- l'original pendant l'examen de l'éligibilité au re-envoi gratuit.
--
-- Retour : { debited, already_debited, source, free_resend, balance_after }.
create or replace function consume_send(
  p_secret  text,
  p_send_id uuid,
  p_user_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_send      letter_sends%rowtype;
  v_original  letter_sends%rowtype;
  v_existing  text;
  v_free      boolean := false;
  v_source    text;
  v_credits   integer;
  v_forfait   integer;
  v_used      integer;
  v_inserted  integer;
begin
  if not exists (select 1 from webhook_config where id = 1 and rpc_secret = p_secret) then
    raise exception 'invalid_secret';
  end if;

  perform pg_advisory_xact_lock(20260914, hashtext(p_user_id::text));

  select * into v_send from letter_sends where id = p_send_id and user_id = p_user_id for update;
  if not found then
    raise exception 'send_not_found';
  end if;

  -- Idempotence : un retry (claim_letter_retry) rappelle consume_send sur le MÊME envoi.
  select source into v_existing from send_debits where send_id = p_send_id;
  if found then
    return jsonb_build_object(
      'debited', false, 'already_debited', true, 'source', v_existing,
      'free_resend', v_existing = 'offert', 'balance_after', send_balance(p_user_id));
  end if;

  -- Re-envoi offert : l'original est bien à cet utilisateur, il est parti en NPAI, et il a été
  -- débité d'un VRAI crédit — `source in ('included','extra')`, JAMAIS 'offert'. C'est cette
  -- clause qui ferme la chaîne infinie : sans elle, A (payé) → B (offert) → C (offert) → …
  -- donnerait des plis illimités pour un seul crédit, chaque geste gratuit ouvrant droit au
  -- suivant dès qu'il repart en NPAI. Un rattrapage par envoi PAYÉ, pas un par envoi.
  -- L'unicité « un seul re-envoi par original » est portée par l'index partiel ci-dessus, pas
  -- par une lecture concurrente.
  if v_send.resend_of is not null then
    select * into v_original
      from letter_sends
     where id = v_send.resend_of and user_id = p_user_id
       for update;
    if found
       and v_original.status = 'failed_address'
       and exists (select 1 from send_debits
                    where send_id = v_original.id and source in ('included','extra')) then
      v_free := true;
    end if;
  end if;

  if v_free then
    v_source := 'offert';
  else
    -- Solde = Σ des envois inclus de TOUS les achats encaissés (forfait + achats à l'acte)
    -- moins les débits déjà consommés. `status = 'paid'` UNIQUEMENT : un achat remboursé
    -- (status 'refunded') sort du calcul — le solde peut devenir négatif, il est alors
    -- simplement refusé (jamais de créance, jamais d'annulation d'un envoi déjà parti).
    select coalesce(sum(included_sends), 0) into v_credits
      from purchases where user_id = p_user_id and status = 'paid';
    select count(*) into v_used
      from send_debits where user_id = p_user_id and source in ('included','extra');

    if v_credits - v_used <= 0 then
      raise exception 'quota_exhausted';
    end if;

    -- Provenance du crédit, à titre informatif (le solde, lui, est global) : tant que les
    -- envois du forfait ne sont pas tous consommés, le débit est 'included' ; au-delà, il est
    -- couvert par un achat à l'acte → 'extra'.
    select coalesce(sum(included_sends), 0) into v_forfait
      from purchases where user_id = p_user_id and status = 'paid' and kind = 'forfait';
    v_source := case when v_used < v_forfait then 'included' else 'extra' end;
  end if;

  insert into send_debits (send_id, user_id, source)
  values (p_send_id, p_user_id, v_source)
  on conflict (send_id) do nothing;
  -- `debited` dit la VÉRITÉ sur ce que cet appel a écrit : le verrou consultatif rend le cas
  -- « 0 ligne » pratiquement impossible (le pré-contrôle ci-dessus l'aurait vu), mais annoncer
  -- un débit qui n'a pas eu lieu tromperait l'appelant — et l'appelant, ici, décide s'il engage
  -- de l'argent chez le provider.
  get diagnostics v_inserted = row_count;

  return jsonb_build_object(
    'debited', v_inserted > 0, 'already_debited', v_inserted = 0, 'source', v_source,
    'free_resend', v_free, 'balance_after', send_balance(p_user_id));
end
$fn$;

-- Solde exposable (jamais négatif : la spec impose « l'UI affiche 0, pas un négatif »).
-- Fonction interne — le compteur du front lit ses propres lignes purchases + send_debits.
create or replace function send_balance(p_user_id uuid)
returns integer language sql security definer set search_path = public as $fn$
  select greatest(
    0,
    coalesce((select sum(included_sends) from purchases
               where user_id = p_user_id and status = 'paid'), 0)
    - coalesce((select count(*) from send_debits
                 where user_id = p_user_id and source in ('included','extra')), 0)
  )::integer;
$fn$;
-- Interne, jamais exposée : sans la révocation NOMINATIVE (anon, authenticated), ce serait une
-- fonction `security definer` à paramètre libre — n'importe quel porteur de la clé publishable
-- lirait le solde de n'importe quel utilisateur. Le compteur du front, lui, calcule son solde en
-- lisant SES propres lignes purchases + send_debits (policies SELECT owner).
revoke all on function send_balance(uuid) from public, anon, authenticated;

-- release_debit : DELETE compensatoire, appelé quand la soumission au provider échoue — « pas
-- de débit sur échec » reste vrai sans fenêtre de course (le débit a eu lieu AVANT la
-- soumission, exprès). Rend aussi son droit au re-envoi offert quand c'est lui qui a échoué.
--
-- DEUX GARDES, parce que cette RPC REND DE L'ARGENT et que son seul rempart est le secret :
--  • GARDE D'ÉTAT (la plus importante) : on ne libère QUE le débit d'un envoi qui n'est pas
--    parti — 'prepared' / 'sending' (jamais soumis) ou 'failed' (soumission échouée). Un débit
--    d'envoi 'submitted', 'sent', 'delivered' ou 'failed_address' est INTOUCHABLE : le pli est
--    chez l'imprimeur ou dans la boîte, il a coûté, il reste débité. Sans cette garde, un appel
--    mal placé (ou rejoué après coup) rendrait un crédit pour un courrier réellement affranchi.
--  • GARDE D'APPARTENANCE : `p_user_id` (facultatif, mais la Task 5 DOIT le passer) — le débit
--    doit appartenir à l'utilisateur de la requête en cours.
-- true = un débit a été libéré ; false = il n'y en avait pas, ou l'envoi était déjà engagé
-- (double appel sans effet — l'appelant n'a rien à rattraper).
drop function if exists release_debit(text, uuid);
create or replace function release_debit(p_secret text, p_send_id uuid, p_user_id uuid default null)
returns boolean language plpgsql security definer set search_path = public as $fn$
declare v_count integer;
begin
  if not exists (select 1 from webhook_config where id = 1 and rpc_secret = p_secret) then
    raise exception 'invalid_secret';
  end if;

  delete from send_debits d
   using letter_sends s
   where d.send_id = p_send_id
     and s.id      = d.send_id
     and (p_user_id is null or d.user_id = p_user_id)
     and s.status in ('prepared','sending','failed');

  get diagnostics v_count = row_count;
  return v_count > 0;
end
$fn$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- Bloc 7 — provider_events : l'événement brut, persisté AVANT l'acquittement HTTP
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Le webhook MySendingBox n'a pas de signature documentée (spec §6) : il est traité comme un
-- PING NON FIABLE. On persiste l'événement brut, on acquitte, PUIS on va vérifier l'état par un
-- GET authentifié chez le provider — jamais d'écriture de statut depuis le payload seul. La PK
-- (identifiant d'événement du provider) porte l'idempotence : un événement relivré n'est traité
-- qu'une fois. Aucune policy : la table n'est lisible ni écrivable par aucun client.
-- `on delete cascade` sur send_id : la suppression d'un compte (cascade auth.users →
-- letter_sends) emporte les événements associés — un payload provider contient l'adresse
-- postale complète du destinataire, il ne doit pas survivre au dossier.
create table if not exists provider_events (
  id           text primary key,            -- identifiant d'événement du provider (_id MSB)
  send_id      uuid references letter_sends(id) on delete cascade,
  event_type   text,
  payload      jsonb,
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);
alter table provider_events enable row level security;
create index if not exists provider_events_send_idx on provider_events (send_id);
create index if not exists provider_events_unprocessed_idx
  on provider_events (received_at) where processed_at is null;

-- true = événement NOUVEAU (à traiter) ; false = déjà reçu (rejeu → ignorer sans rien refaire).
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
  return v_count > 0;
end
$fn$;

-- Marque l'événement traité (après le GET de vérification et l'éventuelle transition).
-- Aucune policy d'écriture sur la table : c'est la seule porte.
create or replace function mark_provider_event_processed(p_secret text, p_id text)
returns boolean language plpgsql security definer set search_path = public as $fn$
declare v_count integer;
begin
  if not exists (select 1 from webhook_config where id = 1 and rpc_secret = p_secret) then
    raise exception 'invalid_secret';
  end if;
  update provider_events
     set processed_at = now()
   where id = p_id and processed_at is null;
  get diagnostics v_count = row_count;
  return v_count > 0;
end
$fn$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- Bloc 8 — send_limits : plafonds de dépense, modifiables sans redéploiement
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Table de configuration à UNE ligne (même patron que webhook_config) : ajuster un plafond est
-- un UPDATE en base, pas une variable d'environnement et un redéploiement (spec §5). Aucune
-- policy : illisible et inécrivable par PostgREST, quel que soit le rôle.
create table if not exists send_limits (
  id               int primary key default 1 check (id = 1),
  max_user_daily   int not null default 10,
  max_global_daily int not null default 50,
  updated_at       timestamptz not null default now()
);
alter table send_limits enable row level security;
insert into send_limits (id) values (1) on conflict (id) do nothing;

-- Décompte : les envois des canaux PAYANTS créés dans les 24 h glissantes (papier aujourd'hui,
-- LRAR au lot 2c), y compris ceux qui ont échoué APRÈS avoir été soumis — un pli refusé par le
-- provider a quand même mobilisé la chaîne. Les envois email ne sont jamais comptés.
-- EXCLUSION IMPORTANTE : les lignes restées `prepared` SANS provider_ref n'ont jamais rien
-- engagé (quota épuisé, profil expéditeur incomplet, kill switch, adresse refusée…). Les compter
-- punirait l'utilisateur pour des tentatives qui n'ont rien coûté : dix refus « quota épuisé » le
-- verrouilleraient 24 h juste après avoir payé son forfait — exactement le pire moment.
-- C'est un garde-fou anti-emballement (boucle, compte compromis), pas une comptabilité : le
-- plafond est relevable en base sur-le-champ, sans redéploiement.
-- Retour : 'ok' | 'user_daily_exceeded' | 'global_daily_exceeded'.
create or replace function send_limits_status(p_user_id uuid)
returns text language plpgsql security definer set search_path = public as $fn$
declare
  v_limits send_limits%rowtype;
  v_user   integer;
  v_global integer;
begin
  select * into v_limits from send_limits where id = 1;
  if not found then
    return 'ok';   -- table non configurée : on ne bloque pas un envoi pour une config absente
  end if;

  select count(*) into v_user
    from letter_sends
   where user_id = p_user_id
     and channel in ('papier','lre','lrar')
     and created_at > now() - interval '24 hours'
     and not (status = 'prepared' and provider_ref is null);
  if v_user >= v_limits.max_user_daily then
    return 'user_daily_exceeded';
  end if;

  select count(*) into v_global
    from letter_sends
   where channel in ('papier','lre','lrar')
     and created_at > now() - interval '24 hours'
     and not (status = 'prepared' and provider_ref is null);
  if v_global >= v_limits.max_global_daily then
    return 'global_daily_exceeded';
  end if;

  return 'ok';
end
$fn$;
-- Interne (révocation nominative, cf. send_balance) : le décompte GLOBAL des envois de tous les
-- utilisateurs ne doit jamais être interrogeable depuis un client. La façade check_send_limits,
-- elle, exige le secret.
revoke all on function send_limits_status(uuid) from public, anon, authenticated;

-- Façade appelable par le serveur (secret exigé : le compte global des envois de TOUS les
-- utilisateurs ne regarde aucun client). La route d'envoi l'appelle en amont pour rendre un 429
-- explicite + Sentry ; create_letter_send refait le contrôle en dernier ressort.
create or replace function check_send_limits(p_secret text, p_user_id uuid)
returns text language plpgsql security definer set search_path = public as $fn$
begin
  if not exists (select 1 from webhook_config where id = 1 and rpc_secret = p_secret) then
    raise exception 'invalid_secret';
  end if;
  return send_limits_status(p_user_id);
end
$fn$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- Droits d'exécution
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Même dispositif que purchases : le grant n'est PAS la barrière de sécurité (PostgREST expose
-- toute fonction du schéma public à qui détient la clé publishable) — le secret vérifié en base
-- l'est. Le grant est simplement nécessaire pour que le serveur, qui appelle avec le token de
-- l'utilisateur (rôle `authenticated`) ou sans token (rôle `anon`, webhooks), puisse appeler :
-- Seren n'utilise JAMAIS la clé secrète `sb_secret_…` côté serveur, il n'y a donc pas d'autre
-- rôle disponible. Les 9 fonctions ci-dessous SONT la surface d'appel voulue, chacune gardée par
-- le secret inliné. Les 4 helpers internes (letter_send_transition_allowed,
-- letter_send_initial_status, send_balance, send_limits_status) sont à l'inverse révoqués
-- NOMINATIVEMENT de anon et authenticated, sans aucun grant : zéro surface non gardée.
revoke all on function create_letter_send(text, uuid, text, text, text, text, text, text, jsonb, uuid, jsonb, integer) from public;
revoke all on function claim_letter_retry(text, uuid, boolean, integer)                                               from public;
revoke all on function mark_letter_result(text, uuid, text, text, timestamptz, text, integer)                         from public;
revoke all on function update_letter_send_status(text, text, text, timestamptz, text)                                 from public;
revoke all on function consume_send(text, uuid, uuid)                                                                 from public;
revoke all on function release_debit(text, uuid, uuid)                                                                from public;
revoke all on function record_provider_event(text, text, uuid, text, jsonb)                                           from public;
revoke all on function mark_provider_event_processed(text, text)                                                      from public;
revoke all on function check_send_limits(text, uuid)                                                                  from public;

grant execute on function create_letter_send(text, uuid, text, text, text, text, text, text, jsonb, uuid, jsonb, integer) to anon, authenticated;
grant execute on function claim_letter_retry(text, uuid, boolean, integer)                                               to anon, authenticated;
grant execute on function mark_letter_result(text, uuid, text, text, timestamptz, text, integer)                         to anon, authenticated;
grant execute on function update_letter_send_status(text, text, text, timestamptz, text)                                 to anon, authenticated;
grant execute on function consume_send(text, uuid, uuid)                                                                 to anon, authenticated;
grant execute on function release_debit(text, uuid, uuid)                                                                to anon, authenticated;
grant execute on function record_provider_event(text, text, uuid, text, jsonb)                                           to anon, authenticated;
grant execute on function mark_provider_event_processed(text, text)                                                      to anon, authenticated;
grant execute on function check_send_limits(text, uuid)                                                                  to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- EFFACEMENT D'UNE FAMILLE — procédure manuelle (RGPD art. 17, audit F2), bêta pilote
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Contrat : docs/design-v2-demonstrateur.md §9.2. Plan : docs/plan-v2-sql.md, Task 14.
-- Exécution : Arnaud, SQL Editor + Dashboard, sur demande reçue au contact support. Délai annoncé : 30 jours.
-- Sans clé secrète : chaque étape irréversible passe par le Dashboard.
--
-- ORDRE IMPOSÉ :
--   1. PARTIE A (lecture) : identifier le compte, les dossiers, les données et les objets Storage.
--   2. Dashboard → Storage → bucket documents → supprimer le dossier <user_id>/ (le SQL ne peut pas :
--      trigger protect_objects_delete).
--   3. PARTIE B : neutraliser les payloads fournisseur, anonymiser et clore le(s) dossier(s). Refuse
--      tant qu'un objet Storage subsiste, et refuse un compte interne (PF, admin).
--   4. Dashboard → Authentication → Users → Delete user. Cascade : questionnaires, roadmaps, steps,
--      step_actions, documents, sessions, transmissions, letter_sends (+ provider_events), send_debits,
--      purchases, attachments, sender_profiles, consents. Un Delete user AVANT la partie B échoue
--      (dossiers_state_check) : c'est voulu.
--   5. PARTIE C (lecture) : vérifier qu'il ne reste rien de nominatif.
-- Conservé : la ligne dossiers anonymisée (partenaire, source, statut, dates, snapshots prix/commission),
-- nécessaire à la facturation PF, sans aucune donnée d'identification.
-- Statut de clôture : « closed », y compris depuis « invited » — c'est le contrat §9.2-2 qui fait foi
-- (le plan, Task 42.1-5, écrit « cancelled » : écart assumé, tranché en faveur du contrat).
--
-- Remplacer l'adresse « famille@exemple.fr » dans CHAQUE partie (1 occurrence par partie, repère ←).
-- Tant que l'adresse d'exemple n'est pas remplacée, la partie B REFUSE de s'exécuter : garde explicite
-- en tête du bloc (« REFUS : remplacer l'adresse d'exemple »). Ne jamais la retirer — l'arrêt
-- « Rien à effacer » ne protège que si l'adresse est absente de la base, pas si elle existe.

-- >>> PARTIE A — Inventaire (lecture seule)
with target as (select lower(btrim('famille@exemple.fr')) as email),   -- ← adresse de la demande
     u as (select id from auth.users where lower(email) = (select email from target))
select 'compte auth' as objet, count(*) as nombre from u
union all select 'dossiers (compte ou adresse)', count(*) from public.dossiers d
                  where d.user_id in (select id from u) or d.family_email = (select email from target)
union all select 'questionnaires', count(*) from public.questionnaires where user_id in (select id from u)
union all select 'roadmaps', count(*) from public.roadmaps where user_id in (select id from u)
union all select 'steps', count(*) from public.steps where user_id in (select id from u)
union all select 'step_actions', count(*) from public.step_actions where user_id in (select id from u)
union all select 'documents', count(*) from public.documents where user_id in (select id from u)
union all select 'questionnaire_sessions', count(*) from public.questionnaire_sessions where user_id in (select id from u)
union all select 'transmissions', count(*) from public.transmissions where user_id in (select id from u)
union all select 'letter_sends', count(*) from public.letter_sends where user_id in (select id from u)
union all select 'provider_events (payloads fournisseur)', count(*) from public.provider_events e
                  where e.send_id in (select s.id from public.letter_sends s where s.user_id in (select id from u))
union all select 'send_debits', count(*) from public.send_debits where user_id in (select id from u)
union all select 'purchases', count(*) from public.purchases where user_id in (select id from u)
union all select 'attachments', count(*) from public.attachments where user_id in (select id from u)
union all select 'sender_profiles', count(*) from public.sender_profiles where user_id in (select id from u)
union all select 'consents', count(*) from public.consents where user_id in (select id from u)
union all select 'objets Storage à supprimer (Dashboard) sous ' || coalesce((select id::text from u), '—') || '/', count(*)
            from storage.objects o where (storage.foldername(o.name))[1] in (select id::text from u);
-- <<< FIN PARTIE A

-- >>> PARTIE B — Anonymisation et clôture (après suppression des objets Storage)
do $$
declare
  v_email   text := lower(btrim('famille@exemple.fr'));   -- ← adresse de la demande
  v_uid     uuid;
  v_objects integer;
  v_n       integer;
begin
  -- Garde de paramètre : refuse tant que l'adresse d'exemple n'a pas été remplacée. Sans elle, un
  -- lancement « pour voir » anonymiserait et clorait le dossier d'une vraie famille si cette adresse
  -- existait en base — le garde-fou « Rien à effacer » ne joue que sur une adresse absente.
  if v_email = 'famille@exemple.fr' then
    raise exception 'REFUS : remplacer l''adresse d''exemple par celle de la demande';
  end if;

  select id into v_uid from auth.users where lower(email) = v_email;

  if v_uid is not null then
    if exists (select 1 from public.partner_users where user_id = v_uid)
       or exists (select 1 from public.seren_admins where user_id = v_uid)
       or exists (select 1 from public.account_enrollments where email = v_email) then
      raise exception 'REFUS : compte interne (PF ou admin Seren) — cette procédure ne concerne que les familles';
    end if;
    select count(*) into v_objects from storage.objects o where (storage.foldername(o.name))[1] = v_uid::text;
    if v_objects > 0 then
      raise exception 'STOP : % objet(s) Storage sous %/ — les supprimer d''abord (Dashboard → Storage → documents)', v_objects, v_uid;
    end if;

    -- Les payloads fournisseur peuvent contenir l'adresse de l'expéditeur : neutralisés ici, sans
    -- dépendre de la cascade du « Delete user » (qui les supprimerait de toute façon via letter_sends).
    update public.provider_events e
       set payload = '{}'::jsonb
     where e.send_id in (select s.id from public.letter_sends s where s.user_id = v_uid);
  end if;

  update public.dossiers d
     set family_first_name   = case when d.source = 'partner' then '[effacé]' end,
         family_last_name    = case when d.source = 'partner' then '[effacé]' end,
         family_email        = 'efface+' || d.id::text || '@invalid.seren-app.fr',
         family_phone        = null,
         deceased_first_name = case when d.source = 'partner' then '[effacé]' end,
         deceased_last_name  = case when d.source = 'partner' then '[effacé]' end,
         -- dossiers_identity_check interdit null pour source='partner' : date sentinelle (note de contrat E1)
         deceased_death_date = case when d.source = 'partner' then date '1900-01-01' end,
         status              = case when d.status in ('invited', 'active') then 'closed' else d.status end,
         closed_at           = case when d.status in ('invited', 'active') then now() else d.closed_at end,
         invite_token_hash   = null,
         invite_expires_at   = null,
         updated_at          = now()
   where d.user_id = v_uid
      or d.family_email = v_email;
  get diagnostics v_n = row_count;

  if v_n = 0 and v_uid is null then
    raise exception 'Rien à effacer : aucun compte ni dossier pour cette adresse';
  end if;
  raise notice 'PARTIE B OK — % dossier(s) anonymisé(s) ; compte auth : % → Dashboard Auth → Delete user',
    v_n, coalesce(v_uid::text, 'aucun');
end $$;
-- <<< FIN PARTIE B

-- >>> PARTIE C — Vérification (après Delete user)
with target as (select lower(btrim('famille@exemple.fr')) as email)   -- ← adresse de la demande
select (select count(*) from auth.users where lower(email) = (select email from target))              as comptes_restants,
       (select count(*) from public.dossiers where family_email = (select email from target))         as dossiers_nominatifs_restants,
       (select count(*) from public.dossiers
         where family_email like 'efface+%@invalid.seren-app.fr' and user_id is null
           and updated_at > now() - interval '1 day')                                                 as dossiers_anonymises_24h;
-- Attendu : 0, 0, ≥ 1.
-- <<< FIN PARTIE C

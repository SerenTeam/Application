-- ════════════════════════════════════════════════════════════════════════════════════════
-- SEED v2 — partenaires, allowlist d'enrôlement, liaison des comptes, famille de démo de secours
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Contrat : docs/design-v2-demonstrateur.md §2.2 (flux 1), §3.2, D4, D8. Plan : docs/plan-v2-sql.md, Task 12.
-- Remplace scripts/seed-demo-pf.sql (v0, obsolète : attributions et compte PF créé par /signup).
--
-- À exécuter dans le SQL Editor du projet visé (rôle postgres), PARTIE PAR PARTIE : sélectionner le
-- bloc entre « >>> PARTIE n » et « <<< FIN PARTIE n », puis Run. Jamais le fichier entier d'un coup.
--
--   PRÉPROD (U2) : partie 1 → db push déjà fait, hook branché → « Add user » (auto-confirm) des gérants
--                  et admins, EN POSANT le mot de passe à la création (Arnaud le conserve dans son
--                  gestionnaire, jamais dans le dépôt) — JAMAIS d'inscription par l'app : un compte né
--                  d'un signUp public n'est pas fiable et sera refusé (enrollment_account_untrusted,
--                  revue 16/09) — → copier chaque UUID dans la partie 2 → partie 2 →
--                  node scripts/provision-v2.mjs (avec PROVISION_*_PASSWORD et PROVISION_API_URL) →
--                  --verify → partie 3 UNIQUEMENT si le provisionnement échoue.
--                  ⚠️ La partie 2 précède TOUTE connexion à ces comptes : provision-v2.mjs se connecte
--                  réellement et poserait last_sign_in_at, que link_enrollments refuse.
--   PROD (U4)    : parties 1 et 2 avec les PF pilotes réelles (adapter les constantes de la partie 1)
--                  — ou, une PF à la fois, les blocs équivalents du runbook prod §9, qui portent les
--                  mêmes gardes : l'un OU l'autre, jamais les deux —,
--                  puis « Send password recovery » pour chaque gérant réel — APRÈS la partie 2, jamais
--                  avant (le gérant fixe lui-même son mot de passe : procédure réservée aux vrais
--                  gérants de PF, les comptes de démo et de probes ayant le leur depuis « Add user »).
--                  Partie 3 : JAMAIS (garde @seren-test.fr).
--
-- Chaque partie est rejouable sans doublon. Aucune clé, aucun secret, aucune donnée famille réelle.

-- >>> PARTIE 1 — partenaires et allowlist d'enrôlement
do $$
declare
  -- ← À ADAPTER. Préprod : valeurs de démo ci-dessous. Prod : raisons sociales, SIRET et e-mails des PF pilotes.
  v_partners jsonb := '[
    {"name": "Pompes Funèbres Démo",   "siret": "12345678900011", "billing_email": "facturation.demo@seren-test.fr",
     "managers": ["pf.demo@seren-test.fr"]},
    {"name": "Pompes Funèbres Témoin", "siret": "12345678900029", "billing_email": "facturation.temoin@seren-test.fr",
     "managers": ["pf.temoin@seren-test.fr"]}
  ]';
  v_admins               text[]  := array['admin.demo@seren-test.fr'];   -- ← e-mails des admins Seren
  v_price_ttc_cents      integer := 29000;
  v_commission_ttc_cents integer := 7000;
  v_p          jsonb;
  v_partner_id uuid;
  v_email      text;
begin
  for v_p in select value from jsonb_array_elements(v_partners) loop
    select id into v_partner_id from public.partners where name = v_p->>'name' order by created_at limit 1;
    if v_partner_id is null then
      insert into public.partners (name, siret, billing_email, status, price_ttc_cents, commission_ttc_cents, contract_signed_at)
      values (v_p->>'name', v_p->>'siret', lower(btrim(v_p->>'billing_email')), 'active',
              v_price_ttc_cents, v_commission_ttc_cents, current_date)
      returning id into v_partner_id;
    else
      update public.partners
         set siret                = v_p->>'siret',
             billing_email        = lower(btrim(v_p->>'billing_email')),
             status               = 'active',
             price_ttc_cents      = v_price_ttc_cents,
             commission_ttc_cents = v_commission_ttc_cents,
             contract_signed_at   = coalesce(contract_signed_at, current_date),
             updated_at           = now()
       where id = v_partner_id;
    end if;

    for v_email in select lower(btrim(value)) from jsonb_array_elements_text(v_p->'managers') loop
      -- Un compte interne n'est jamais famille : refus avant tout enrôlement.
      if exists (select 1 from public.dossiers d where d.family_email = v_email and d.status <> 'cancelled')
         or exists (select 1 from auth.users u join public.dossiers d on d.user_id = u.id where lower(u.email) = v_email) then
        raise exception 'E-mail % déjà porté par un dossier famille : il ne peut pas devenir gérant PF', v_email;
      end if;
      insert into public.account_enrollments (email, role, partner_id)
      values (v_email, 'partner_manager', v_partner_id)
      on conflict (email, role) do update set partner_id = excluded.partner_id;
    end loop;

    raise notice 'Partenaire « % » : %', v_p->>'name', v_partner_id;
  end loop;

  foreach v_email in array v_admins loop
    v_email := lower(btrim(v_email));
    if exists (select 1 from public.dossiers d where d.family_email = v_email and d.status <> 'cancelled')
       or exists (select 1 from auth.users u join public.dossiers d on d.user_id = u.id where lower(u.email) = v_email) then
      raise exception 'E-mail % déjà porté par un dossier famille : il ne peut pas devenir admin Seren', v_email;
    end if;
    insert into public.account_enrollments (email, role) values (v_email, 'seren_admin')
    on conflict (email, role) do nothing;
  end loop;
end $$;

select e.email, e.role, p.name as partenaire, e.linked_user_id is not null as lie
  from public.account_enrollments e
  left join public.partners p on p.id = e.partner_id
 order by e.role, p.name, e.email;

-- (Optionnel, PRÉPROD SEULEMENT, répétitions de démo) relever les plafonds d'envoi papier :
-- update public.send_limits set max_user_daily = 30, max_global_daily = 200 where id = 1;
-- <<< FIN PARTIE 1

-- >>> PARTIE 2 — liaison des comptes (APRÈS le « Add user » des gérants et admins)
-- Coller pour CHAQUE compte l'adresse et l'UUID affiché par « Add user » (Dashboard → Authentication →
-- Users → colonne UID, icône « copy »). L'appariement est OBLIGATOIRE depuis la revue du 16/09 : une
-- liaison par simple e-mail donnerait le rôle de gérant PF (liste des familles) ou d'admin Seren à
-- quiconque se serait inscrit avec cette adresse avant toi.
-- À exécuter AVANT toute connexion à ces comptes — donc avant le premier scripts/provision-v2.mjs
-- (démo, probes) et, pour un gérant de PF réel en prod, avant « Send password recovery » : un compte
-- déjà connecté est refusé (last_sign_in_at).
select public.link_enrollments('[
  {"email": "pf.demo@seren-test.fr",    "user_id": "00000000-0000-0000-0000-000000000000"},
  {"email": "pf.temoin@seren-test.fr",  "user_id": "00000000-0000-0000-0000-000000000000"},
  {"email": "admin.demo@seren-test.fr", "user_id": "00000000-0000-0000-0000-000000000000"}
]'::jsonb);
select e.email, e.role, p.name as partenaire, e.linked_user_id is not null as lie, e.linked_at
  from public.account_enrollments e
  left join public.partners p on p.id = e.partner_id
 order by e.role, p.name, e.email;
-- Attendu : partner_users_linked = gérants appariés ; pending = 0 quand tous les comptes existent ;
--           untrusted = 0 OBLIGATOIRE.
-- « untrusted » > 0 : une adresse enrôlée est déjà portée par un compte que tu n'as pas apparié →
--   STOP. Lire auth.users (created_at, last_sign_in_at, email_change) pour cette adresse : quelqu'un
--   la détient. Delete user après vérification, ou changer l'adresse d'enrôlement. Jamais de liaison forcée.
-- Erreur « enrollment_account_untrusted » : le compte apparié n'est pas fiable (UUID d'une autre
--   adresse, compte créé AVANT l'enrôlement, compte déjà connecté, ou changement d'e-mail en attente).
--   Le NOTICE juste au-dessus nomme l'adresse en cause. STOP, enquête — ne jamais contourner.
-- Erreur « enrollment_conflict_family » : un e-mail enrôlé porte un dossier famille → corriger la partie 1.
-- <<< FIN PARTIE 2

-- >>> PARTIE 3 — SECOURS PRÉPROD : famille de démo pré-activée (dossier actif + consentements + pont)
-- Remplace le vrai parcours (création PF → invitation → activation → consentement) quand
-- scripts/provision-v2.mjs a échoué. ÉCRIT DANS purchases (argent) : double revue obligatoire.
-- Prérequis : le compte auth de la famille existe. Hook actif → un « Add user » non invité est refusé :
-- Auth → Hooks → Before User Created → désactiver, Add user (auto-confirm), RÉACTIVER aussitôt,
-- puis lancer cette partie. JAMAIS EN PROD (garde @seren-test.fr).
do $$
declare
  v_family_email   text := lower(btrim('famille.demo@seren-test.fr'));   -- ← compte famille de démo
  v_partner_name   text := 'Pompes Funèbres Démo';
  v_family_first   text := 'Claire';
  v_family_last    text := 'Martin';
  v_deceased_first text := 'Jean';
  v_deceased_last  text := 'Martin';
  v_death_date     date := current_date - 5;
  v_version        text := public.consent_version();
  v_uid            uuid;
  v_partner        public.partners%rowtype;
  v_dossier        public.dossiers%rowtype;
begin
  if v_family_email not like '%@seren-test.fr' then
    raise exception 'REFUS : la partie 3 ne sert qu''aux comptes de démo @seren-test.fr';
  end if;

  select id into v_uid from auth.users where lower(email) = v_family_email;
  if v_uid is null then
    raise exception 'Compte % introuvable : Hooks off → Add user → Hooks on, puis relancer la partie 3', v_family_email;
  end if;

  if exists (select 1 from public.partner_users where user_id = v_uid)
     or exists (select 1 from public.seren_admins where user_id = v_uid)
     or exists (select 1 from public.account_enrollments where email = v_family_email) then
    raise exception 'REFUS : % est un compte interne (PF ou admin), il ne peut pas être famille', v_family_email;
  end if;

  select * into v_partner from public.partners where name = v_partner_name order by created_at limit 1;
  if not found then
    raise exception 'Partenaire « % » introuvable : lancer la partie 1', v_partner_name;
  end if;

  select * into v_dossier from public.dossiers where user_id = v_uid;
  if found then
    if v_dossier.status <> 'active' then
      raise exception 'Le compte porte déjà un dossier % (id %) : cas non couvert par le secours', v_dossier.status, v_dossier.id;
    end if;
    raise notice 'Dossier actif existant réutilisé : %', v_dossier.id;
  else
    if exists (select 1 from public.dossiers where family_email = v_family_email and status <> 'cancelled') then
      raise exception 'Un dossier non annulé porte déjà % (invitation en cours ?) : l''annuler depuis /partenaire ou changer d''adresse', v_family_email;
    end if;
    insert into public.dossiers (partner_id, source, status, user_id,
                                 family_first_name, family_last_name, family_email,
                                 deceased_first_name, deceased_last_name, deceased_death_date,
                                 price_ttc_cents, commission_ttc_cents, included_sends, activated_at)
    values (v_partner.id, 'partner', 'active', v_uid,
            v_family_first, v_family_last, v_family_email,
            v_deceased_first, v_deceased_last, v_death_date,
            v_partner.price_ttc_cents, v_partner.commission_ttc_cents, 10, now())
    returning * into v_dossier;
  end if;

  -- Consentements à la version courante (ce que record_consents écrirait).
  insert into public.consents (user_id, dossier_id, kind, version)
  select v_uid, v_dossier.id, k, v_version
    from unnest(array['terms', 'privacy', 'sensitive_data']) as k
  on conflict (user_id, kind, version) do nothing;

  -- Pont : EXACTEMENT la ligne qu'écrirait claim_dossier (D4) — même clé, donc jamais de doublon
  -- avec un vrai claim antérieur ou postérieur.
  insert into public.purchases (user_id, status, kind, stripe_session_id, included_sends, amount_total, currency, paid_at)
  values (v_uid, 'paid', 'forfait', 'partner_dossier:' || v_dossier.id::text, v_dossier.included_sends, null, null, now())
  on conflict (stripe_session_id) do nothing;
end $$;

select d.id as dossier, d.status, p.name as partenaire,
       (select count(*) from public.consents c where c.user_id = d.user_id and c.version = public.consent_version()) as consentements,
       public.send_balance(d.user_id) as solde_envois
  from public.dossiers d
  join public.partners p on p.id = d.partner_id
 where d.user_id = (select id from auth.users where lower(email) = lower(btrim('famille.demo@seren-test.fr')));   -- ← même adresse qu'au-dessus
-- Attendu : 1 ligne, statut active, 3 consentements, solde 10 (ou moins si des envois ont déjà été faits).
-- <<< FIN PARTIE 3

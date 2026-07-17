-- Envois de courriers (v1 : canal email). L'idempotence est portée par dedup_key
-- (hash user+template+corps+destinataire) : un même courrier ne part jamais deux fois.
create table if not exists letter_sends (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  step_id      text,
  template_id  text not null,
  channel      text not null check (channel in ('email','lre','papier','portail')),
  status       text not null default 'sending'
                 check (status in ('sending','sent','delivered','failed')),
  provider     text,
  provider_ref text,
  recipient    jsonb,
  dedup_key    text not null unique,
  error        text,
  sent_at      timestamptz,
  delivered_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table letter_sends enable row level security;
create policy "own sends" on letter_sends
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists letter_sends_user_idx on letter_sends (user_id);
create index if not exists letter_sends_provider_ref_idx on letter_sends (provider_ref);

-- Secret partagé du webhook : table verrouillée (RLS activée, AUCUNE policy → illisible et
-- inaccessible via l'API PostgREST, quel que soit le rôle anon/authenticated). Seule la
-- fonction security definer ci-dessous peut la lire. La valeur est insérée à la main
-- (USER STEP, jamais dans git) :
--   insert into webhook_config (id, rpc_secret) values (1, '<valeur aléatoire forte>');
-- et recopiée dans la variable d'environnement serveur WEBHOOK_RPC_SECRET.
create table if not exists webhook_config (
  id int primary key default 1 check (id = 1),
  rpc_secret text not null
);
alter table webhook_config enable row level security;

-- Le webhook Resend n'a pas de token utilisateur (RLS le bloquerait) : cette fonction
-- security definer expose uniquement une mise à jour de statut par provider_ref, jamais
-- de lecture. Défense en profondeur à DEUX niveaux : la signature Svix est vérifiée côté
-- Express (Task 4), MAIS PostgREST expose toute fonction du schéma public en
-- POST /rest/v1/rpc/<name> à quiconque détient la clé publishable (le grant EXECUTE est la
-- seule barrière) — la vérification Express serait donc contournable en appelant la RPC en
-- direct. D'où p_secret, vérifié PAR LA BASE contre webhook_config : secret absent/faux ou
-- table non configurée → 0 ligne modifiée, silencieusement.
-- Transitions de statut STRICTEMENT avant-only (les webhooks Resend peuvent être relivrés
-- dans le désordre) : delivered et failed sont terminaux — un email.sent relivré en retard
-- ne peut jamais rétrograder un delivered. L'erreur est purgée sur sent/delivered (une
-- erreur d'une tentative passée ne doit pas survivre à un succès).
create or replace function update_letter_send_status(p_secret text, p_provider_ref text, p_status text, p_delivered_at timestamptz default null, p_error text default null)
returns void language sql security definer set search_path = public as $$
  update letter_sends
     set status = p_status,
         delivered_at = coalesce(p_delivered_at, delivered_at),
         error = case when p_status in ('sent','delivered') then null else coalesce(p_error, error) end,
         updated_at = now()
   where provider_ref = p_provider_ref
     and exists (select 1 from webhook_config where id = 1 and rpc_secret = p_secret)
     and (
          (p_status = 'sent'      and status = 'sending')
       or (p_status = 'delivered' and status in ('sending','sent'))
       or (p_status = 'failed'    and status in ('sending','sent'))
     );
$$;
revoke all on function update_letter_send_status from public;
grant execute on function update_letter_send_status to anon, authenticated;

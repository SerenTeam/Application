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

-- Le webhook Resend n'a pas de token utilisateur (RLS le bloquerait) : cette fonction
-- security definer expose uniquement une mise à jour de statut par provider_ref, jamais
-- de lecture. La véracité vient de la signature du webhook, vérifiée côté Express (Task 4).
create or replace function update_letter_send_status(p_provider_ref text, p_status text, p_delivered_at timestamptz default null, p_error text default null)
returns void language sql security definer set search_path = public as $$
  update letter_sends
     set status = p_status,
         delivered_at = coalesce(p_delivered_at, delivered_at),
         error = coalesce(p_error, error),
         updated_at = now()
   where provider_ref = p_provider_ref
     and p_status in ('sent','delivered','failed');
$$;
revoke all on function update_letter_send_status from public;
grant execute on function update_letter_send_status to anon, authenticated;

-- Sessions du questionnaire v2 : remplace la Map() en mémoire pour CE flux.
-- Le produit transmission (/api/demo/*) reste sur la Map en mémoire — hors périmètre.
-- État = uniquement { answers } : le moteur (nextQuestion) reconstruit tout le reste.

create table if not exists questionnaire_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  answers     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '24 hours'
);

alter table questionnaire_sessions enable row level security;

create policy "own sessions" on questionnaire_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists questionnaire_sessions_user_idx
  on questionnaire_sessions (user_id);

-- Table du produit transmission (/api/demo/* et /api/transmission/:code).
-- Historiquement créée à la main dans l'ancien projet (absente de supabase_v1_schema.sql) ;
-- cette migration la rend reproductible et intègre le raccordement Auth + RLS qui vivait
-- dans supabase_auth_setup.sql (fichier racine conservé comme historique v1).
-- L'auth reste 100 % Supabase Auth natif : user_id référence auth.users, policies via auth.uid().

create table if not exists transmissions (
  id           uuid primary key default gen_random_uuid(),
  access_code  text not null unique,
  data         text not null,               -- historique du questionnaire transmission (JSON sérialisé)
  is_complete  boolean not null default true,
  user_id      uuid references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_transmissions_user_id on transmissions(user_id);

-- Une seule transmission complète par utilisateur
create unique index if not exists idx_transmissions_one_per_user
  on transmissions(user_id)
  where is_complete = true;

alter table transmissions enable row level security;

-- Propriétaire : CRUD sur ses propres transmissions
create policy "Users can read own transmissions"
  on transmissions for select using (auth.uid() = user_id);

create policy "Users can create own transmission"
  on transmissions for insert with check (auth.uid() = user_id);

create policy "Users can update own transmission"
  on transmissions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can delete own transmission"
  on transmissions for delete using (auth.uid() = user_id);

-- Partage aux proches : tout utilisateur authentifié muni du code d'accès peut lire
create policy "Authenticated users can read with access_code"
  on transmissions for select
  using (auth.role() = 'authenticated' and access_code is not null);

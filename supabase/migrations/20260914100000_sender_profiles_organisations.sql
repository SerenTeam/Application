-- Profils expéditeur + annuaire des organismes (chantier 2a, lot fondations d'envoi papier).
-- Spec : docs/design-chantier-2a-envoi-papier.md §3.1 (sender_profiles) et §3.3 (organisations).
-- Plan : docs/plan-chantier-2a-envoi-papier.md, Task 1. Branche `feature/chantier-2a` — AUCUN
-- merge vers `pre-prod`/`main` avant la levée du gel post-rendu (2026-09-16 au soir minimum,
-- cf. header du plan). Le mini-dashboard PF (migration 20260913200000_pf_dashboard_demo,
-- branche `pre-prod` séparée) reste la dernière migration de la base préprod tant que ce gel
-- tient ; cette migration est volontairement timestampée après elle.
--
-- sender_profiles : un profil expéditeur par compte (adresse postale de l'utilisateur),
-- consommé par la fusion des courriers (la variable VAR_USER_ADDRESS des templates est
-- éclatée en champs structurés) et par l'envoi papier (adresse expéditeur). Les CHECK de
-- longueur (≤ 45 caractères par ligne) anticipent la contrainte MySendingBox sur le corps
-- postal — refuser côté Seren plutôt que tronquer, cf. §M du plan. RLS owner classique
-- (lecture/écriture réservées à auth.uid()) : ces données ne regardent que leur propriétaire.
--
-- organisations : annuaire des organismes destinataires (caisses locales des 4 réseaux
-- CAF/CPAM/CARSAT/impôts + entrées nationales). Cette migration ne crée que la table et ses
-- policies, sans données — le seed est un import automatisé depuis l'Annuaire de
-- l'administration (DILA, licence ouverte) livré séparément en Task 2
-- (scripts/import-organisations.mjs → migration de seed versionnée). Lecture ouverte à tout
-- authentifié (données publiques) ; AUCUNE policy d'écriture, pour qu'aucune écriture
-- applicative ne puisse altérer l'annuaire — seule une migration versionnée le peut.

-- Profil expéditeur persistant (chantier 2a) : consommé par la fusion des courriers
-- et par l'envoi papier (adresse expéditeur). Un profil par compte.
create table if not exists sender_profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  address_line1 text not null check (char_length(address_line1) <= 45),
  address_line2 text check (char_length(address_line2) <= 45),
  postal_code   text not null check (postal_code ~ '^[0-9]{5}$'),
  city          text not null check (char_length(city) <= 45),
  relationship  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table sender_profiles enable row level security;
create policy "own sender profile" on sender_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Annuaire des organismes (chantier 2a) : caisses locales des 4 réseaux + entrées nationales.
-- Lecture pour tout authentifié (données publiques) ; AUCUNE policy d'écriture (seed par migration).
create table if not exists organisations (
  id            text primary key,               -- slug, ex. 'cpam-75'
  name          text not null,
  kind          text not null check (kind in ('caisse_locale','national')),
  network       text check (network in ('caf','cpam','carsat','impots')),
  department    text check (department ~ '^(2A|2B|[0-9]{2,3})$'),
  address_line1 text not null check (char_length(address_line1) <= 45),
  address_line2 text check (char_length(address_line2) <= 45),
  postal_code   text not null check (postal_code ~ '^[0-9]{5}$'),
  city          text not null check (char_length(city) <= 45),
  verified_at   date not null,
  source_url    text,
  created_at    timestamptz not null default now()
);
alter table organisations enable row level security;
create policy "authenticated read organisations" on organisations
  for select using (auth.role() = 'authenticated');
create index if not exists idx_organisations_network_dept on organisations(network, department);

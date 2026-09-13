-- Coffre minimal : pièces jointes des envois papier (chantier 2a, lot fondations d'envoi
-- papier). Spec : docs/design-chantier-2a-envoi-papier.md §3.4. Plan :
-- docs/plan-chantier-2a-envoi-papier.md, Task 6. Branche `feature/chantier-2a` — AUCUN merge
-- vers `pre-prod`/`main` avant la levée du gel post-rendu (cf. header du plan) ; migration
-- volontairement timestampée après 20260914120000_letter_sends_papier.sql.
--
-- Portée volontairement étroite : stocker un acte de décès ou un justificatif, en lecture/
-- écriture strictement privées à leur propriétaire. Pas d'antivirus ni de politique de
-- rétention en 2a (chantier 3, cf. spec §3.4) — le risque est borné par la combinaison type
-- (magic bytes vérifiés par le serveur, PAS le Content-Type déclaré ni l'extension), taille
-- (5 Mo) et bucket privé (aucun accès anonyme, aucune URL publique).
--
-- Pas de RPC ici, contrairement à letter_sends/purchases : une pièce jointe n'est pas une
-- pièce probante financière ou juridique, son propriétaire peut légitimement l'écrire et la
-- supprimer directement avec son propre token — de vraies policies RLS owner suffisent.

-- ════════════════════════════════════════════════════════════════════════════════════════
-- Table attachments — métadonnées des fichiers déposés dans le bucket Storage `documents`
-- ════════════════════════════════════════════════════════════════════════════════════════
-- size_bytes <= 5242880 (5 Mo) : miroir du plafond appliqué par multer côté serveur (413 avant
-- même d'atteindre cette table) — défense en profondeur si un jour une autre voie d'écriture
-- apparaissait. mime est le type CANONIQUE détecté par magic bytes (server/lib/mime-sniff.js),
-- jamais le Content-Type déclaré par le client. Pas de colonne UPDATE-able : un document ne se
-- corrige pas, il se supprime et se redépose (cf. RLS ci-dessous, pas de policy UPDATE).
create table if not exists attachments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('acte_deces','justificatif')),
  -- Le préfixe du chemin Storage doit être celui du propriétaire : une ligne forgée via
  -- PostgREST (token valide mais storage_path bricolé) ne peut plus pointer vers l'objet d'un
  -- tiers, même en cas d'erreur applicative côté serveur (revue Task 5+6, I7).
  storage_path text not null check (storage_path like user_id::text || '/%'),
  filename     text not null,
  mime         text not null,
  size_bytes   integer not null check (size_bytes <= 5242880),
  created_at   timestamptz not null default now()
);
alter table attachments enable row level security;

-- RLS owner : SELECT/INSERT/DELETE uniquement — PAS d'UPDATE (voir commentaire de colonne
-- ci-dessus). Trois policies dédiées plutôt qu'un unique `for all` : une policy `for all`
-- couvrirait aussi UPDATE, qu'on veut explicitement exclure.
drop policy if exists "own attachments select" on attachments;
create policy "own attachments select" on attachments
  for select using (auth.uid() = user_id);

drop policy if exists "own attachments insert" on attachments;
create policy "own attachments insert" on attachments
  for insert with check (auth.uid() = user_id);

drop policy if exists "own attachments delete" on attachments;
create policy "own attachments delete" on attachments
  for delete using (auth.uid() = user_id);

create index if not exists attachments_user_idx on attachments (user_id);

-- ════════════════════════════════════════════════════════════════════════════════════════
-- Bucket Storage `documents` — privé, aucun accès public
-- ════════════════════════════════════════════════════════════════════════════════════════
-- file_size_limit / allowed_mime_types : garde-fou supplémentaire porté par Storage lui-même,
-- EN PLUS du sniff magic bytes serveur (server/lib/mime-sniff.js) — le serveur ne fait jamais
-- confiance au Content-Type déclaré par le client, mais IMPOSE le mime canonique qu'il a
-- lui-même détecté à l'upload ; Storage revérifie alors ce mime imposé contre l'allowlist.
-- Défense en profondeur, pas une garde suffisante à elle seule (Storage ne lit pas les octets).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 5242880, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do nothing;

-- storage.objects porte DÉJÀ RLS activée par défaut sur tout projet Supabase (table gérée par
-- l'extension Storage) : pas de `alter table storage.objects enable row level security` ici —
-- ce ré-affirmatif ne changerait rien mais exige des droits d'OWNER sur la table que le rôle de
-- migration n'a pas forcément selon le projet, et ferait échouer tout le `db push` en
-- `42501 must be owner of table objects` (revue Task 5+6, I1). Seules les policies ci-dessous,
-- elles, sont bien de notre ressort. Plan B si leur CREATE échouait pour la même raison sur un
-- projet donné : les créer via le dashboard Storage (Supabase Studio → Storage → Policies),
-- cf. note post-revue du plan.

-- Policies par préfixe : un objet du bucket `documents` n'est visible/écrivable/supprimable
-- que par l'utilisateur dont l'uid est le PREMIER segment du chemin (storage_path serveur :
-- `<user_id>/<uuid>.<ext>`, cf. server/routes/attachments.js). `storage.foldername(name)`
-- retourne le tableau des segments de dossier du chemin (tout sauf le nom de fichier final) ;
-- son premier élément est donc bien `<user_id>` avec le format de chemin ci-dessus.
drop policy if exists "documents select own prefix" on storage.objects;
create policy "documents select own prefix" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "documents insert own prefix" on storage.objects;
create policy "documents insert own prefix" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "documents delete own prefix" on storage.objects;
create policy "documents delete own prefix" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

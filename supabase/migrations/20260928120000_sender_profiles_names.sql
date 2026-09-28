-- Personnalisation v2 (spec docs/design-personnalisation-v2.md §4.2) : prénom et nom séparés dans
-- le profil courrier. `full_name` reste NOT NULL et reste la donnée lue par l'envoi papier
-- (server/routes/letters.js) : le client l'écrit « prénom nom » à chaque enregistrement.
-- Colonnes nullables : les profils saisis au panneau d'envoi du chantier 2a n'ont que full_name —
-- le pré-remplissage des courriers retombe alors sur les noms du dossier PF.
-- Fichier séparé de la RPC my_dossier_identity (20260928121000) : le lint des migrations v2
-- interdit à ses fichiers toute mention d'une table de contenu famille, dont sender_profiles.
-- RLS inchangée (policy owner du chantier 2a) ; mêmes bornes de 45 caractères que les lignes d'adresse.
-- Comme dossiers_names_check : la chaîne vide ou blanche est refusée (NULL reste accepté — un CHECK
-- sur une colonne NULL réussit toujours, donc les profils sans prénom/nom ne sont pas bloqués).
alter table public.sender_profiles
  add column if not exists first_name text check (char_length(btrim(first_name)) between 1 and 45),
  add column if not exists last_name  text check (char_length(btrim(last_name)) between 1 and 45);

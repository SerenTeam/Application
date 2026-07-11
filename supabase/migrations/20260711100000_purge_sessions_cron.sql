-- Purge physique des sessions expirées (l'expiration n'était jusqu'ici qu'une invisibilité
-- à la lecture — la table grossissait sans borne). L'index questionnaire_sessions_expires_idx
-- existe déjà pour ce delete. Tourne chaque nuit à 03:17 UTC.
create extension if not exists pg_cron;

select cron.schedule(
  'purge-questionnaire-sessions',
  '17 3 * * *',
  $$ delete from questionnaire_sessions where expires_at < now() $$
);

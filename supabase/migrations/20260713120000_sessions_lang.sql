-- Langue du questionnaire, figée au /start : le rédacteur Mistral écrit dans cette langue
-- pour toute la session (y compris /resume et /reask).
alter table questionnaire_sessions
  add column if not exists lang text not null default 'fr' check (lang in ('fr', 'en'));

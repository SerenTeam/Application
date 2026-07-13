-- ====================================================================
-- SEREN — SCHÉMA COMPLET (schema only, sans données)
-- ====================================================================
-- Consolidation de l'état actuel du produit pour amorcer un nouveau
-- projet Supabase (préprod) : supabase_v1_schema.sql (v1) + migrations
-- supabase/migrations/ (questionnaire_sessions, transmissions, pg_cron).
--
-- À exécuter dans le SQL Editor du projet préprod. Idempotent :
-- ré-exécutable sans erreur (IF NOT EXISTS + DROP POLICY IF EXISTS).
--
-- Prérequis côté Dashboard du projet préprod :
--   1. Authentication → Providers → activer Email/Password
--      (et désactiver la confirmation email si compte de test E2E)
--   2. Database → Extensions → activer pg_cron si la section 8 échoue
-- ====================================================================

-- ====================================================================
-- 1. QUESTIONNAIRES — réponses du questionnaire (résultat confirmé)
-- ====================================================================

CREATE TABLE IF NOT EXISTS questionnaires (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  answers JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_questionnaires_user_id ON questionnaires(user_id);

ALTER TABLE questionnaires ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own questionnaires" ON questionnaires;
CREATE POLICY "Users can read own questionnaires"
  ON questionnaires FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own questionnaire" ON questionnaires;
CREATE POLICY "Users can create own questionnaire"
  ON questionnaires FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own questionnaire" ON questionnaires;
CREATE POLICY "Users can update own questionnaire"
  ON questionnaires FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ====================================================================
-- 2. ROADMAPS — une roadmap par questionnaire complété
-- ====================================================================

CREATE TABLE IF NOT EXISTS roadmaps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  questionnaire_id UUID NOT NULL REFERENCES questionnaires(id) ON DELETE CASCADE,
  total_steps INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roadmaps_user_id ON roadmaps(user_id);
CREATE INDEX IF NOT EXISTS idx_roadmaps_questionnaire_id ON roadmaps(questionnaire_id);

ALTER TABLE roadmaps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own roadmaps" ON roadmaps;
CREATE POLICY "Users can read own roadmaps"
  ON roadmaps FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own roadmap" ON roadmaps;
CREATE POLICY "Users can create own roadmap"
  ON roadmaps FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ====================================================================
-- 3. STEPS — étapes individuelles de la roadmap
-- ====================================================================

CREATE TABLE IF NOT EXISTS steps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  roadmap_id UUID NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  title TEXT NOT NULL,
  theme TEXT NOT NULL,
  urgency TEXT NOT NULL CHECK (urgency IN ('urgent', 'week', 'month', 'later')),
  urgency_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  display_order INTEGER NOT NULL DEFAULT 0,
  letter_template_id TEXT,
  warning_badge TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_steps_roadmap_id ON steps(roadmap_id);
CREATE INDEX IF NOT EXISTS idx_steps_user_id ON steps(user_id);

ALTER TABLE steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own steps" ON steps;
CREATE POLICY "Users can read own steps"
  ON steps FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own steps" ON steps;
CREATE POLICY "Users can create own steps"
  ON steps FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own steps" ON steps;
CREATE POLICY "Users can update own steps"
  ON steps FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ====================================================================
-- 4. STEP_ACTIONS — historique des actions sur chaque étape
-- ====================================================================

CREATE TABLE IF NOT EXISTS step_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  step_id UUID NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('copied', 'downloaded', 'sent')),
  sent_date DATE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_step_actions_step_id ON step_actions(step_id);
CREATE INDEX IF NOT EXISTS idx_step_actions_user_id ON step_actions(user_id);

ALTER TABLE step_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own step_actions" ON step_actions;
CREATE POLICY "Users can read own step_actions"
  ON step_actions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own step_actions" ON step_actions;
CREATE POLICY "Users can create own step_actions"
  ON step_actions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ====================================================================
-- 5. DOCUMENTS — courriers générés et sauvegardés
-- ====================================================================

CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_id UUID REFERENCES steps(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  theme TEXT,
  letter_template_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_step_id ON documents(step_id);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own documents" ON documents;
CREATE POLICY "Users can read own documents"
  ON documents FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own documents" ON documents;
CREATE POLICY "Users can create own documents"
  ON documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own documents" ON documents;
CREATE POLICY "Users can update own documents"
  ON documents FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own documents" ON documents;
CREATE POLICY "Users can delete own documents"
  ON documents FOR DELETE
  USING (auth.uid() = user_id);

-- ====================================================================
-- 6. TRANSMISSIONS — produit transmission (/api/demo/*), distinct
--    du questionnaire (migration 20260709090000)
-- ====================================================================

CREATE TABLE IF NOT EXISTS transmissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_code  TEXT NOT NULL UNIQUE,
  data         TEXT NOT NULL,               -- historique du questionnaire transmission (JSON sérialisé)
  is_complete  BOOLEAN NOT NULL DEFAULT true,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transmissions_user_id ON transmissions(user_id);

-- Une seule transmission complète par utilisateur
CREATE UNIQUE INDEX IF NOT EXISTS idx_transmissions_one_per_user
  ON transmissions(user_id)
  WHERE is_complete = true;

ALTER TABLE transmissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own transmissions" ON transmissions;
CREATE POLICY "Users can read own transmissions"
  ON transmissions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own transmission" ON transmissions;
CREATE POLICY "Users can create own transmission"
  ON transmissions FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own transmission" ON transmissions;
CREATE POLICY "Users can update own transmission"
  ON transmissions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own transmission" ON transmissions;
CREATE POLICY "Users can delete own transmission"
  ON transmissions FOR DELETE USING (auth.uid() = user_id);

-- Partage aux proches : tout utilisateur authentifié muni du code d'accès peut lire
DROP POLICY IF EXISTS "Authenticated users can read with access_code" ON transmissions;
CREATE POLICY "Authenticated users can read with access_code"
  ON transmissions FOR SELECT
  USING (auth.role() = 'authenticated' AND access_code IS NOT NULL);

-- ====================================================================
-- 7. QUESTIONNAIRE_SESSIONS — sessions du questionnaire v2, TTL 24 h
--    (migration 20260708120000)
-- ====================================================================

CREATE TABLE IF NOT EXISTS questionnaire_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  answers     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours'
);

ALTER TABLE questionnaire_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own sessions" ON questionnaire_sessions;
CREATE POLICY "own sessions" ON questionnaire_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS questionnaire_sessions_user_idx
  ON questionnaire_sessions (user_id);

-- Utilisé par le job de purge pg_cron (section 8)
CREATE INDEX IF NOT EXISTS questionnaire_sessions_expires_idx
  ON questionnaire_sessions (expires_at);

-- ====================================================================
-- 8. PG_CRON — purge nocturne des sessions expirées à 03:17 UTC
--    (migration 20260711100000). Si cette section échoue, activer
--    l'extension via Dashboard → Database → Extensions → pg_cron.
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'purge-questionnaire-sessions',
  '17 3 * * *',
  $$ delete from questionnaire_sessions where expires_at < now() $$
);

-- ====================================================================
-- VÉRIFICATION
-- ====================================================================

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('questionnaires', 'roadmaps', 'steps', 'step_actions',
                     'documents', 'transmissions', 'questionnaire_sessions')
ORDER BY table_name;

-- Attendu : les 7 tables listées, puis :
--   select jobname, schedule from cron.job;  → purge-questionnaire-sessions | 17 3 * * *

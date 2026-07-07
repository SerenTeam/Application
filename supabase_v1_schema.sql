-- ====================================================================
-- SCHEMA V1 - SEREN : QUESTIONNAIRE + ROADMAP + COURRIERS
-- ====================================================================
-- A executer dans le SQL Editor de Supabase
-- Prerequis : l'authentification Supabase doit etre activee
-- ====================================================================

-- 1. TABLE QUESTIONNAIRES
-- Stocke les reponses du questionnaire deterministe
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

CREATE POLICY "Users can read own questionnaires"
  ON questionnaires FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own questionnaire"
  ON questionnaires FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own questionnaire"
  ON questionnaires FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. TABLE ROADMAPS
-- Une roadmap par questionnaire complete
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

CREATE POLICY "Users can read own roadmaps"
  ON roadmaps FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own roadmap"
  ON roadmaps FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 3. TABLE STEPS
-- Etapes individuelles de la roadmap
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

CREATE POLICY "Users can read own steps"
  ON steps FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own steps"
  ON steps FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own steps"
  ON steps FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. TABLE STEP_ACTIONS
-- Historique des actions sur chaque etape (copie, telechargement, envoi)
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

CREATE POLICY "Users can read own step_actions"
  ON step_actions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own step_actions"
  ON step_actions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 5. TABLE DOCUMENTS
-- Courriers generes et sauvegardes
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

CREATE POLICY "Users can read own documents"
  ON documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own documents"
  ON documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents"
  ON documents FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents"
  ON documents FOR DELETE
  USING (auth.uid() = user_id);

-- ====================================================================
-- VERIFICATION
-- ====================================================================

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('questionnaires', 'roadmaps', 'steps', 'step_actions', 'documents')
ORDER BY table_name;

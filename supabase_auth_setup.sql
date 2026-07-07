-- ====================================================================
-- CONFIGURATION SUPABASE AUTH POUR TRANSMISSION
-- ====================================================================
-- Ce script configure la base de données pour l'authentification
-- À exécuter dans le SQL Editor de Supabase
-- ====================================================================

-- 1. AJOUTER COLONNE USER_ID À LA TABLE TRANSMISSIONS
-- ====================================================================

ALTER TABLE transmissions
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Créer un index pour améliorer les performances des requêtes
CREATE INDEX IF NOT EXISTS idx_transmissions_user_id
ON transmissions(user_id);

COMMENT ON COLUMN transmissions.user_id IS 'Référence vers l''utilisateur propriétaire de la transmission';

-- 2. CONTRAINTE : UNE SEULE TRANSMISSION COMPLÈTE PAR UTILISATEUR
-- ====================================================================

-- Cette contrainte empêche un utilisateur d'avoir plusieurs transmissions complètes
CREATE UNIQUE INDEX IF NOT EXISTS idx_transmissions_one_per_user
ON transmissions(user_id)
WHERE is_complete = true;

COMMENT ON INDEX idx_transmissions_one_per_user IS 'Garantit qu''un utilisateur ne peut avoir qu''une seule transmission complétée';

-- 3. ACTIVER ROW LEVEL SECURITY (RLS)
-- ====================================================================

-- Activer RLS sur la table transmissions
ALTER TABLE transmissions ENABLE ROW LEVEL SECURITY;

-- 4. SUPPRIMER LES ANCIENNES POLICIES (si elles existent)
-- ====================================================================

DROP POLICY IF EXISTS "Users can manage own transmissions" ON transmissions;
DROP POLICY IF EXISTS "Authenticated users can read with access_code" ON transmissions;
DROP POLICY IF EXISTS "Users can read own transmissions" ON transmissions;
DROP POLICY IF EXISTS "Users can create own transmission" ON transmissions;
DROP POLICY IF EXISTS "Users can update own transmission" ON transmissions;
DROP POLICY IF EXISTS "Users can delete own transmission" ON transmissions;

-- 5. CRÉER LES NOUVELLES POLICIES RLS
-- ====================================================================

-- Policy 1: Les utilisateurs peuvent VOIR leurs propres transmissions
CREATE POLICY "Users can read own transmissions"
ON transmissions
FOR SELECT
USING (auth.uid() = user_id);

-- Policy 2: Les utilisateurs peuvent CRÉER leur propre transmission
CREATE POLICY "Users can create own transmission"
ON transmissions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy 3: Les utilisateurs peuvent METTRE À JOUR leurs propres transmissions
CREATE POLICY "Users can update own transmission"
ON transmissions
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy 4: Les utilisateurs peuvent SUPPRIMER leurs propres transmissions
CREATE POLICY "Users can delete own transmission"
ON transmissions
FOR DELETE
USING (auth.uid() = user_id);

-- Policy 5: ACCÈS EN LECTURE via access_code pour proches authentifiés
-- Cette policy permet à n'importe quel utilisateur authentifié de lire
-- une transmission s'il possède le code d'accès (système de partage)
CREATE POLICY "Authenticated users can read with access_code"
ON transmissions
FOR SELECT
USING (
  auth.role() = 'authenticated'
  AND access_code IS NOT NULL
);

-- 6. VÉRIFICATIONS ET INFORMATIONS
-- ====================================================================

-- Afficher la structure de la table transmissions
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'transmissions'
ORDER BY ordinal_position;

-- Afficher les policies RLS actives
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'transmissions';

-- ====================================================================
-- NOTES IMPORTANTES
-- ====================================================================
--
-- 1. CONFIGURATION AUTH DANS LE DASHBOARD SUPABASE :
--    - Allez dans Authentication > Providers
--    - Activez "Email" (Email/Password authentication)
--    - Configurez les URLs :
--      * Site URL: http://localhost:3000
--      * Redirect URLs:
--        - http://localhost:3000/auth.html
--        - http://localhost:3000/index.html
--        - http://localhost:3000/dashboard.html
--
-- 2. DONNÉES EXISTANTES :
--    - Les transmissions existantes auront user_id = NULL
--    - Elles ne seront pas accessibles via les nouvelles policies RLS
--    - Option 1 : Les laisser (non accessibles)
--    - Option 2 : Les assigner à un utilisateur "legacy"
--
-- 3. MIGRATION DONNÉES EXISTANTES (optionnel) :
--    Si vous voulez conserver l'accès aux transmissions existantes,
--    vous pouvez les assigner à un utilisateur spécifique après
--    avoir créé ce compte dans l'application.
--
-- ====================================================================

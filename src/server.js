import express from 'express';
import cors from 'cors';
import { Mistral } from '@mistralai/mistralai';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Middleware d'authentification
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    req.user = user;
    req.supabaseClient = getSupabaseClient(token);
    next();
  } catch (error) {
    console.error('❌ Auth middleware error:', error);
    return res.status(401).json({
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_FAILED'
    });
  }
}

// Client Mistral
const client = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY,
});

const AGENT_ID = process.env.MISTRAL_AGENT_ID;
const ROADMAP_AGENT_ID = process.env.MISTRAL_ROADMAP_AGENT_ID;

// Client Supabase (ANON - pour opérations non authentifiées)
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || ''
);

// Helper pour créer un client Supabase avec contexte utilisateur authentifié
function getSupabaseClient(accessToken) {
  return createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || '',
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    }
  );
}

// Stockage temporaire des réponses par session
const sessions = new Map();

// Générer un ID de session unique
function generateSessionId() {
  return 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Générer un code d'accès unique pour les proches (8 caractères alphanumériques)
function generateAccessCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// Fonction pour construire le prompt avec contexte
function buildContextPrompt(historique) {
  if (!historique || historique.length === 0) {
    return '';
  }

  let context = '\n\n=== HISTORIQUE DES RÉPONSES (À ANALYSER OBLIGATOIREMENT) ===\n';
  context += 'Questions déjà posées et réponses reçues :\n\n';
  
  historique.forEach((item, index) => {
    context += `${index + 1}. [${item.question_id}] ${item.question}\n`;
    context += `   → Réponse : ${item.reponse === null ? 'PASSÉE/SKIPPÉE' : item.reponse}\n\n`;
  });

  context += '=== FIN DE L\'HISTORIQUE ===\n\n';
  context += 'INSTRUCTION : Génère la PROCHAINE question en tenant compte de CET historique. ';
  context += 'Ne répète JAMAIS une question déjà posée. ';
  context += 'Adapte les options selon les réponses précédentes.\n';

  return context;
}

// ==================== ROUTES AUTHENTIFICATION ====================

// Route pour créer un compte (signup)
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email et mot de passe requis'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Le mot de passe doit contenir au moins 6 caractères'
      });
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${req.headers.origin || 'http://localhost:3000'}/index.html`
      }
    });

    if (error) {
      console.error('❌ Signup error:', error);
      return res.status(400).json({
        success: false,
        error: error.message,
        code: error.code
      });
    }

    console.log('✅ User created:', data.user?.email);

    res.json({
      success: true,
      user: data.user,
      session: data.session,
      message: data.session
        ? 'Compte créé avec succès'
        : 'Compte créé. Vérifiez votre email pour confirmer.'
    });
  } catch (error) {
    console.error('❌ Signup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route pour se connecter (login)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email et mot de passe requis'
      });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.error('❌ Login error:', error);
      return res.status(400).json({
        success: false,
        error: error.message,
        code: error.code
      });
    }

    console.log('✅ User logged in:', data.user?.email);

    res.json({
      success: true,
      user: data.user,
      session: data.session
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route pour se déconnecter (logout)
app.post('/api/auth/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (token) {
      const client = getSupabaseClient(token);
      await client.auth.signOut();
      console.log('✅ User logged out');
    }

    res.json({
      success: true,
      message: 'Déconnexion réussie'
    });
  } catch (error) {
    console.error('❌ Logout error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route pour vérifier la session actuelle
app.get('/api/auth/me', requireAuth, async (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

// Route pour rafraîchir le token
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token requis'
      });
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token
    });

    if (error) {
      return res.status(401).json({
        success: false,
        error: error.message
      });
    }

    console.log('✅ Token refreshed');

    res.json({
      success: true,
      session: data.session
    });
  } catch (error) {
    console.error('❌ Refresh error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route pour récupérer la transmission du user connecté
app.get('/api/user/transmission', requireAuth, async (req, res) => {
  try {
    const { data, error } = await req.supabaseClient
      .from('transmissions')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      transmission: data,
      has_transmission: !!data
    });
  } catch (error) {
    console.error('❌ Get user transmission error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== ROUTES QUESTIONNAIRE COMPLET ====================

// Route pour démarrer un nouveau questionnaire
app.post('/api/questionnaire/start', requireAuth, async (req, res) => {
  try {
    const session_id = generateSessionId();
    const access_code = generateAccessCode();
    
    sessions.set(session_id, {
      historique: [],
      access_code: access_code,
      is_demo: false,
      created_at: new Date().toISOString()
    });

    const message = `{"action": "nouveau_questionnaire"}

Génère la PREMIÈRE question du formulaire (catégorie: Identité et Situation Personnelle).
Retourne UNIQUEMENT un objet JSON valide, sans texte avant ni après.`;

    console.log('\n📤 START - Envoi à Mistral');

    const response = await client.agents.complete({
      agentId: AGENT_ID,
      messages: [
        { role: 'user', content: message }
      ],
    });

    const content = response.choices[0].message.content;
    console.log('📥 START - Réponse Mistral:', content);
    
    let questionData;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        questionData = JSON.parse(jsonMatch[0]);
      } else {
        questionData = JSON.parse(content);
      }
    } catch (parseError) {
      console.error('❌ Erreur parsing JSON:', parseError);
      questionData = { raw: content };
    }

    res.json({
      success: true,
      session_id: session_id,
      access_code: access_code,
      data: questionData
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route pour envoyer une réponse et obtenir la question suivante
app.post('/api/questionnaire/answer', requireAuth, async (req, res) => {
  try {
    const { session_id, question_id, reponse, question_text, categorie } = req.body;

    if (!session_id || !question_id) {
      return res.status(400).json({
        success: false,
        error: 'session_id et question_id sont requis'
      });
    }

    // Récupérer la session
    if (!sessions.has(session_id)) {
      return res.status(404).json({
        success: false,
        error: 'Session non trouvée'
      });
    }
    
    const session = sessions.get(session_id);
    const historique = session.historique;

    // Ajouter la nouvelle réponse à l'historique
    historique.push({
      question_id: question_id,
      categorie: categorie || '',
      question: question_text || '',
      reponse: reponse
    });

    // Construire le message avec contexte explicite
    const contextPrompt = buildContextPrompt(historique);
    
    const message = `${contextPrompt}

Dernière réponse reçue :
- Question ID : ${question_id}
- Réponse : ${reponse === null ? 'PASSÉE/SKIPPÉE' : reponse}

Génère maintenant la PROCHAINE question (question numéro ${historique.length + 1}).
Retourne UNIQUEMENT un objet JSON valide.`;

    console.log('\n📤 ANSWER - Envoi à Mistral');
    console.log('📊 Historique actuel:', historique.length, 'questions');

    const response = await client.agents.complete({
      agentId: AGENT_ID,
      messages: [
        { role: 'user', content: message }
      ],
    });

    const content = response.choices[0].message.content;
    console.log('📥 ANSWER - Réponse Mistral:', content);
    
    let questionData;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        questionData = JSON.parse(jsonMatch[0]);
      } else {
        questionData = JSON.parse(content);
      }
    } catch (parseError) {
      console.error('❌ Erreur parsing JSON:', parseError);
      questionData = { raw: content };
    }

    res.json({
      success: true,
      data: questionData
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route pour finaliser et sauvegarder le questionnaire
app.post('/api/questionnaire/save', requireAuth, async (req, res) => {
  try {
    const { session_id } = req.body;
    const user_id = req.user.id; // Récupérer user_id depuis middleware

    if (!session_id) {
      return res.status(400).json({
        success: false,
        error: 'session_id requis'
      });
    }

    const session = sessions.get(session_id);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session non trouvée'
      });
    }

    let access_code;
    let saveResult;

    // Check if this session is updating a draft
    if (session.draft_code) {
      console.log('🔄 Mise à jour du brouillon existant:', session.draft_code);

      // UPDATE existing draft - mark as complete
      const { data, error } = await req.supabaseClient
        .from('transmissions')
        .update({
          data: JSON.stringify(session.historique),
          is_complete: true,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          user_id: user_id // Assurer que user_id est bien set
        })
        .eq('access_code', session.draft_code)
        .eq('user_id', user_id) // Sécurité : vérifier ownership
        .select();

      if (error) {
        console.error('❌ Erreur update Supabase:', error);
        return res.status(500).json({
          success: false,
          error: 'Erreur lors de la mise à jour'
        });
      }

      access_code = session.draft_code;
      saveResult = data;
      console.log('✅ Brouillon mis à jour et marqué comme complet');

    } else {
      console.log('➕ Création nouvelle transmission');

      // INSERT new transmission (original behavior)
      const userData = {
        access_code: session.access_code,
        data: JSON.stringify(session.historique),
        is_complete: true,
        user_id: user_id, // AJOUTER user_id
        created_at: session.created_at,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await req.supabaseClient
        .from('transmissions')
        .insert([userData])
        .select();

      if (error) {
        console.error('❌ Erreur Supabase:', error);
        return res.status(500).json({
          success: false,
          error: 'Erreur lors de la sauvegarde'
        });
      }

      access_code = session.access_code;
      saveResult = data;
      console.log('✅ Transmission créée');
    }

    // Nettoyer la session locale
    sessions.delete(session_id);

    console.log('✅ Données sauvegardées avec code:', access_code);

    res.json({
      success: true,
      access_code: access_code,
      message: 'Vos données ont été sauvegardées. Transmettez ce code à vos proches.'
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route pour récupérer les données avec le code d'accès
app.get('/api/transmission/:code', requireAuth, async (req, res) => {
  try {
    const { code } = req.params;

    // Utiliser le client avec auth pour bénéficier des policies RLS
    const { data, error } = await req.supabaseClient
      .from('transmissions')
      .select('*')
      .eq('access_code', code.toUpperCase())
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        error: 'Code invalide ou données non trouvées'
      });
    }

    res.json({
      success: true,
      data: JSON.parse(data.data),
      created_at: data.created_at
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== ROUTES MODE DÉMO ====================

// Route pour démarrer le questionnaire démo
app.post('/api/demo/start', requireAuth, async (req, res) => {
  try {
    const session_id = generateSessionId();
    
    sessions.set(session_id, {
      historique: [],
      is_demo: true,
      created_at: new Date().toISOString()
    });

    const message = `{"action": "debut_questionnaire_demo"}

MODE DÉMO : Tu dois générer un questionnaire COURT de 5 à 10 questions maximum.
L'objectif est de DÉMONTRER que tu prends en compte les réponses précédentes.

Exemple de séquence démo :
1. Situation familiale
2. Avez-vous des enfants ?
3. SI oui → combien ? SI non → passer
4. Possédez-vous un bien immobilier ?
5. SI oui → propriétaire ou locataire ?
6. Personnes à prévenir (ADAPTER selon réponses précédentes !)
7. Fin

Génère la PREMIÈRE question de la démo.
Retourne UNIQUEMENT un objet JSON valide.`;

    console.log('\n🎮 DEMO START - Envoi à Mistral');

    const response = await client.agents.complete({
      agentId: AGENT_ID,
      messages: [
        { role: 'user', content: message }
      ],
    });

    const content = response.choices[0].message.content;
    console.log('📥 DEMO START - Réponse:', content);
    
    let questionData;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        questionData = JSON.parse(jsonMatch[0]);
      } else {
        questionData = JSON.parse(content);
      }
    } catch (parseError) {
      console.error('❌ Erreur parsing JSON:', parseError);
      questionData = { raw: content };
    }

    res.json({
      success: true,
      session_id: session_id,
      is_demo: true,
      data: questionData
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route pour répondre en mode démo
app.post('/api/demo/answer', requireAuth, async (req, res) => {
  try {
    const { session_id, question_id, reponse, question_text, categorie } = req.body;

    if (!session_id || !question_id) {
      return res.status(400).json({
        success: false,
        error: 'session_id et question_id sont requis'
      });
    }

    const session = sessions.get(session_id);
    if (!session || !session.is_demo) {
      return res.status(404).json({
        success: false,
        error: 'Session démo non trouvée'
      });
    }
    
    const historique = session.historique;

    // Ajouter la nouvelle réponse
    historique.push({
      question_id: question_id,
      categorie: categorie || '',
      question: question_text || '',
      reponse: reponse
    });

    // Vérifier si on a atteint la limite de questions démo  
    // NOTE: Ne pas supprimer la session ici non plus, elle est nécessaire pour /api/demo/save
    if (historique.length >= 10) {
      // sessions.delete(session_id);  // COMMENTÉ - session nettoyée dans /api/demo/save
      return res.json({
        success: true,
        data: {
          action: 'fin_demo',
          message: 'La démonstration est terminée. Vous avez pu voir comment le questionnaire s\'adapte à vos réponses.'
        }
      });
    }

    const contextPrompt = buildContextPrompt(historique);
    
    const message = `${contextPrompt}

MODE DÉMO - Question ${historique.length + 1}/10 maximum.

Dernière réponse :
- Question ID : ${question_id}
- Réponse : ${reponse === null ? 'PASSÉE/SKIPPÉE' : reponse}

RAPPEL DÉMO : 
- Questionnaire court (5-10 questions)
- DÉMONTRE que tu adaptes les questions selon les réponses
- Si utilisateur dit "pas d'enfants" → ne propose JAMAIS "enfants" ensuite
- Si utilisateur dit "célibataire" → ne propose JAMAIS "conjoint" ensuite

Si tu estimes que la démo a assez montré l'adaptation (minimum 5 questions), tu peux terminer avec :
{"action": "fin_demo", "message": "..."}

Sinon, génère la prochaine question JSON.`;

    console.log('\n🎮 DEMO ANSWER - Question', historique.length + 1);

    const response = await client.agents.complete({
      agentId: AGENT_ID,
      messages: [
        { role: 'user', content: message }
      ],
    });

    const content = response.choices[0].message.content;
    console.log('📥 DEMO ANSWER - Réponse:', content);
    
    let questionData;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        questionData = JSON.parse(jsonMatch[0]);
      } else {
        questionData = JSON.parse(content);
      }
    } catch (parseError) {
      console.error('❌ Erreur parsing JSON:', parseError);
      questionData = { raw: content };
    }

    // NOTE: Ne pas supprimer la session ici car elle est encore nécessaire pour /api/demo/save
    // La session sera nettoyée après sauvegarde réussie dans /api/demo/save (ligne 535)
    // if (questionData.action === 'fin_demo') {
    //   sessions.delete(session_id);
    // }


    res.json({
      success: true,
      data: questionData
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route pour sauvegarder le questionnaire démo
app.post('/api/demo/save', requireAuth, async (req, res) => {
  try {
    const { session_id } = req.body;
    const user_id = req.user.id; // Récupérer user_id depuis middleware

    console.log('💾 /api/demo/save appelé avec session_id:', session_id);
    console.log('📊 Sessions actuelles:', Array.from(sessions.keys()));

    if (!session_id) {
      return res.status(400).json({
        success: false,
        error: 'session_id requis'
      });
    }

    const session = sessions.get(session_id);
    console.log('🔍 Session trouvée?', session ? 'OUI' : 'NON');

    if (!session || !session.is_demo) {
      console.error('❌ Session non trouvée ou pas une démo');
      console.error('   - session existe:', !!session);
      console.error('   - is_demo:', session?.is_demo);
      return res.status(404).json({
        success: false,
        error: 'Session démo non trouvée'
      });
    }

    // Generate access code
    const access_code = generateAccessCode();

    // Préparer les données pour Supabase
    const userData = {
      access_code: access_code,
      data: JSON.stringify(session.historique),
      user_id: user_id, // AJOUTER user_id
      created_at: session.created_at,
      updated_at: new Date().toISOString()
    };

    // Sauvegarder dans Supabase
    const { data, error } = await req.supabaseClient
      .from('transmissions')
      .insert([userData])
      .select();

    if (error) {
      console.error('❌ Erreur Supabase:', error);
      return res.status(500).json({
        success: false,
        error: 'Erreur lors de la sauvegarde'
      });
    }

    // Nettoyer la session locale
    sessions.delete(session_id);

    console.log('✅ Données démo sauvegardées avec code:', access_code);

    res.json({
      success: true,
      access_code: access_code,
      message: 'Vos données ont été sauvegardées. Transmettez ce code à vos proches.'
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== ROUTES SAUVEGARDE PARTIELLE ====================

// Route pour sauvegarder une progression partielle
app.post('/api/questionnaire/save-partial', requireAuth, async (req, res) => {
  try {
    const { session_id } = req.body;
    const user_id = req.user.id; // Récupérer user_id depuis middleware

    console.log('💾 Sauvegarde partielle pour session:', session_id);

    const session = sessions.get(session_id);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session non trouvée'
      });
    }

    // Generate access code
    const access_code = generateAccessCode();

    console.log('📊 Sauvegarde de', session.historique.length, 'réponses');
    console.log('🔑 Code généré:', access_code);

    // Save to Supabase with is_complete: false
    const { data, error } = await req.supabaseClient
      .from('transmissions')
      .insert({
        access_code: access_code,
        data: JSON.stringify(session.historique),
        is_complete: false,
        user_id: user_id, // AJOUTER user_id
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) {
      console.error('❌ Erreur Supabase:', error);
      throw error;
    }
    
    console.log('✅ Progression partielle sauvegardée');
    
    // Store draft_code in session for potential update later
    session.draft_code = access_code;
    sessions.set(session_id, session);
    
    res.json({
      success: true,
      access_code: access_code,
      question_count: session.historique.length
    });
    
  } catch (error) {
    console.error('❌ Erreur sauvegarde partielle:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route pour charger un brouillon et reprendre
app.post('/api/questionnaire/load-draft', requireAuth, async (req, res) => {
  try {
    const { access_code } = req.body;

    console.log('🔄 Chargement du brouillon:', access_code);

    // Load from Supabase (RLS vérifiera automatiquement que c'est bien le user owner)
    const { data, error } = await req.supabaseClient
      .from('transmissions')
      .select('*')
      .eq('access_code', access_code.toUpperCase())
      .single();
    
    if (error || !data) {
      console.error('❌ Brouillon non trouvé');
      return res.status(404).json({
        success: false,
        error: 'Code invalide ou brouillon non trouvé'
      });
    }
    
    // Parse existing answers
    const historique = JSON.parse(data.data);
    
    console.log('📊 Chargé:', historique.length, 'réponses existantes');
    
    // Create new session with existing data
    const session_id = crypto.randomUUID();
    sessions.set(session_id, {
      is_demo: false,
      historique: historique,
      draft_code: access_code, // Store for later update
      created_at: data.created_at
    });
    
    console.log('✅ Session créée:', session_id);
    
    // Get next question based on history
    const nextQuestion = await getNextQuestionAfterHistory(historique);
    
    if (!nextQuestion) {
      return res.status(200).json({
        success: true,
        session_id: session_id,
        question_count: historique.length,
        action: 'fin_questionnaire',
        message: 'Questionnaire déjà complet'
      });
    }
    
    res.json({
      success: true,
      session_id: session_id,
      question_count: historique.length,
      data: nextQuestion
    });
    
  } catch (error) {
    console.error('❌ Erreur chargement brouillon:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function to get next question after loading history
async function getNextQuestionAfterHistory(historique) {
  // Start with initial question
  let currentQuestion = await getQuestion('q_start');
  
  // Replay history to find next question
  for (const answer of historique) {
    if (!currentQuestion) break;
    
    const response = answer.reponse;
    
    // Find next question based on rules
    if (currentQuestion.suivant) {
      if (typeof currentQuestion.suivant === 'string') {
        currentQuestion = await getQuestion(currentQuestion.suivant);
      } else if (Array.isArray(currentQuestion.suivant)) {
        const rule = currentQuestion.suivant.find(r => {
          if (r.condition === 'oui') return response === true;
          if (r.condition === 'non') return response === false;
          if (r.condition) return response === r.condition;
          return r.defaut === true;
        });
        
        if (rule) {
          if (rule.action === 'fin_questionnaire') {
            return null;
          }
          currentQuestion = await getQuestion(rule.question);
        }
      }
    } else {
      return null; // No more questions
    }
  }
  
  return currentQuestion;
}

// ==================== END ROUTES SAUVEGARDE PARTIELLE ====================

// ==================== ROUTE GÉNÉRATION ROADMAP PERSONNALISÉE ====================

// Route pour générer une roadmap (DÉSACTIVÉ - Utilise toujours la roadmap par défaut)
app.get('/api/roadmap/:code', requireAuth, async (req, res) => {
  try {
    const { code } = req.params;

    console.log('🗺️  Chargement roadmap pour code:', code);

    // Vérifier que le code existe dans Supabase (RLS vérifiera les permissions)
    const { data, error } = await req.supabaseClient
      .from('transmissions')
      .select('*')
      .eq('access_code', code.toUpperCase())
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        error: 'Code invalide ou données non trouvées'
      });
    }

    // Simuler un délai de chargement (minimum 2 secondes)
    const startTime = Date.now();
    
    console.log('⏳ Simulation génération roadmap (2s minimum)...');
    
    // Attendre minimum 2 secondes
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Retourner directement un objet vide pour forcer l'utilisation de la roadmap par défaut
    console.log('✅ Roadmap par défaut sera utilisée');
    console.log(`⏱️  Temps de chargement: ${Date.now() - startTime}ms`);

    // Retourner un échec volontaire pour que le frontend utilise la roadmap par défaut
    res.json({
      success: false,
      error: 'Agent roadmap désactivé, utilisation roadmap par défaut',
      use_default: true
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== ROUTES UTILITAIRES ====================

// Route de debug pour voir l'historique d'une session
app.get('/api/debug/session/:session_id', (req, res) => {
  const { session_id } = req.params;
  const session = sessions.get(session_id);
  
  if (!session) {
    return res.status(404).json({ error: 'Session non trouvée' });
  }
  
  res.json({
    session_id,
    is_demo: session.is_demo,
    questions_count: session.historique.length,
    historique: session.historique
  });
});

// Route de santé
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
  console.log(`📝 Agent Mistral ID: ${AGENT_ID}`);
  console.log(`🗄️  Supabase URL: ${process.env.SUPABASE_URL ? 'Configuré' : 'Non configuré'}`);
});

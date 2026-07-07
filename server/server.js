import express from 'express';
import cors from 'cors';
import { Mistral } from '@mistralai/mistralai';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files: prefer dist/ (built), fallback to public/
const distDir = path.join(__dirname, '../dist');
const publicDir = path.join(__dirname, '../public');
import fs from 'fs';
const staticDir = fs.existsSync(distDir) ? distDir : publicDir;
app.use(express.static(staticDir));

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
const QUESTIONNAIRE_AGENT_ID = process.env.MISTRAL_QUESTIONNAIRE_AGENT_ID || process.env.MISTRAL_AGENT_ID;
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

// ==================== ROUTES QUESTIONNAIRE COMPLET (AI avec mémoire) ====================

const MAX_QUESTIONS = 20;

// Le prompt du questionnaire est maintenant dans l'agent Mistral dédié (QUESTIONNAIRE_AGENT_ID).
// Voir docs/questionnaire-agent-prompt.md pour le contenu à coller dans la console Mistral.

// Helper : extract text from Mistral response (handles thinking mode array or plain string)
function extractMistralText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const textBlock = content.find(block => block.type === 'text');
    if (textBlock?.text) return textBlock.text;
  }
  throw new Error('Impossible d\'extraire le texte de la réponse Mistral');
}

// Helper : sanitize question data from agent (fix common agent mistakes)
function sanitizeQuestionData(data) {
  if (data.action !== 'question') return data;

  // Fix options that look like variable names (snake_case or camelCase without spaces)
  if (Array.isArray(data.options)) {
    const VARIABLE_LABEL_MAP = {
      'notaire_existant': 'Oui, un notaire est déjà en charge',
      'emploi_actuel': 'Oui, il/elle était en activité',
      'deceased_was_tenant': 'Oui, il/elle était locataire',
      'deceased_was_landlord': 'Non, il/elle était propriétaire',
      'has_life_insurance': 'Oui, il/elle avait une assurance vie',
      'has_joint_account': 'Oui, nous avions un compte joint',
      'has_notary': 'Oui, un notaire est déjà en charge',
      'deceased_was_employed': 'Oui, il/elle était en activité professionnelle',
      'conjoint': 'Conjoint(e) / Partenaire',
      'parent': 'Père ou mère',
      'enfant': 'Fils ou fille',
      'frere_soeur': 'Frère ou sœur',
      'autre': 'Autre lien',
    };

    const looksLikeVariable = (s) => /^[a-z][a-z0-9_]*$/.test(s) && s.includes('_');

    data.options = data.options.map(opt => {
      if (VARIABLE_LABEL_MAP[opt]) return VARIABLE_LABEL_MAP[opt];
      if (looksLikeVariable(opt)) {
        // Convert snake_case to readable: "some_variable" → "Some variable"
        const readable = opt.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
        console.log(`⚠️ Option variable détectée: "${opt}" → "${readable}"`);
        return readable;
      }
      return opt;
    });
  }

  // If question contains multiple '?' it's likely asking multiple questions
  const questionMarks = (data.question?.match(/\?/g) || []).length;
  if (questionMarks > 2) {
    console.log(`⚠️ Question multiple détectée (${questionMarks} "?") — l'agent devrait poser 1 question à la fois`);
  }

  return data;
}

// Helper : parse JSON from Mistral response (handles thinking mode + markdown code blocks)
function parseMistralJson(content) {
  const text = extractMistralText(content);
  try {
    // Try direct parse first
    return JSON.parse(text);
  } catch {
    // Try extracting JSON from markdown code block or raw text
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1].trim());
    }
    throw new Error('Impossible de parser la réponse JSON');
  }
}

// Route pour démarrer un nouveau questionnaire
app.post('/api/questionnaire/start', requireAuth, async (req, res) => {
  try {
    const session_id = generateSessionId();

    // Initial user message — l'agent dédié a déjà ses instructions
    const initialMessage = { role: 'user', content: 'Bonjour, je viens de perdre un proche et j\'ai besoin d\'aide pour les démarches administratives. Pouvez-vous m\'accompagner ?' };

    console.log('\n📤 START - Envoi à l\'agent questionnaire dédié');

    const response = await client.agents.complete({
      agentId: QUESTIONNAIRE_AGENT_ID,
      messages: [initialMessage],
    });

    const rawContent = response.choices[0].message.content;
    const assistantText = extractMistralText(rawContent);
    console.log('📥 START - Réponse Mistral:', assistantText);

    let questionData;
    try {
      questionData = sanitizeQuestionData(parseMistralJson(rawContent));
    } catch (parseError) {
      console.error('❌ Erreur parsing JSON:', parseError);
      return res.status(500).json({ success: false, error: 'Erreur de format dans la réponse IA' });
    }

    // Store session with conversation history (always store as string)
    sessions.set(session_id, {
      messages: [
        initialMessage,
        { role: 'assistant', content: assistantText },
      ],
      question_count: 1,
      is_demo: false,
      created_at: new Date().toISOString(),
    });

    res.json({
      success: true,
      session_id,
      data: questionData,
    });
  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route pour envoyer une réponse et obtenir la question suivante
app.post('/api/questionnaire/answer', requireAuth, async (req, res) => {
  try {
    const { session_id, question_id, reponse, question_text } = req.body;

    if (!session_id) {
      return res.status(400).json({ success: false, error: 'session_id requis' });
    }

    const session = sessions.get(session_id);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session non trouvée' });
    }

    session.question_count += 1;

    // Build user message with their answer
    const userContent = reponse === null
      ? `Je passe cette question (${question_id}).`
      : `Ma réponse à "${question_text || question_id}" : ${typeof reponse === 'object' ? JSON.stringify(reponse) : reponse}`;

    // Append user message to history
    session.messages.push({ role: 'user', content: userContent });

    // Guard: force completion if max questions reached
    if (session.question_count >= MAX_QUESTIONS) {
      console.log(`⚠️ Max questions (${MAX_QUESTIONS}) atteint, extraction forcée`);

      session.messages.push({
        role: 'user',
        content: 'Nous avons posé suffisamment de questions. Termine maintenant le questionnaire et retourne le JSON final avec "action": "fin_questionnaire" et le champ "answers" contenant toutes les informations recueillies.',
      });
    }

    console.log(`\n📤 ANSWER - Question ${session.question_count} - Envoi à l'agent questionnaire (${session.messages.length} messages)`);

    const response = await client.agents.complete({
      agentId: QUESTIONNAIRE_AGENT_ID,
      messages: session.messages,
    });

    const rawContent = response.choices[0].message.content;
    const assistantText = extractMistralText(rawContent);
    console.log('📥 ANSWER - Réponse Mistral:', assistantText);

    // Append assistant response to history (always as string)
    session.messages.push({ role: 'assistant', content: assistantText });

    let questionData;
    try {
      questionData = sanitizeQuestionData(parseMistralJson(rawContent));
    } catch (parseError) {
      console.error('❌ Erreur parsing JSON:', parseError);
      return res.status(500).json({ success: false, error: 'Erreur de format dans la réponse IA' });
    }

    // If the agent signals completion, clean up and return answers
    if (questionData.action === 'fin_questionnaire') {
      console.log('✅ Questionnaire terminé par l\'agent');
      // Keep session alive briefly for /complete route
      session.extracted_answers = questionData.answers || {};
    }

    res.json({ success: true, data: questionData });
  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route pour récupérer les answers structurées et nettoyer la session
app.post('/api/questionnaire/complete', requireAuth, async (req, res) => {
  try {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({ success: false, error: 'session_id requis' });
    }

    const session = sessions.get(session_id);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session non trouvée' });
    }

    let answers = session.extracted_answers;

    // If no extracted answers yet, force extraction
    if (!answers || Object.keys(answers).length === 0) {
      console.log('🔄 Extraction forcée des réponses');

      session.messages.push({
        role: 'user',
        content: `Termine maintenant le questionnaire. Retourne UNIQUEMENT un JSON avec :
{
  "action": "fin_questionnaire",
  "answers": {
    "relation": "conjoint|parent|enfant|frere_soeur|autre",
    "deceased_firstname": "string ou null",
    "deceased_lastname": "string ou null",
    "deceased_dod": "YYYY-MM-DD ou null",
    "has_notary": boolean,
    "deceased_was_employed": boolean,
    "deceased_was_tenant": boolean,
    "has_life_insurance": boolean,
    "has_joint_account": boolean,
    "organismes": ["banque", "assurance", ...]
  }
}
Remplis chaque champ avec les informations recueillies. Si une information n'a pas été recueillie, mets la valeur par défaut (false pour les booléens, null pour les strings, [] pour les tableaux).`
      });

      const response = await client.agents.complete({
        agentId: QUESTIONNAIRE_AGENT_ID,
        messages: session.messages,
      });

      const rawContent = response.choices[0].message.content;
      const content = extractMistralText(rawContent);
      console.log('📥 EXTRACT - Réponse:', content);

      try {
        const parsed = parseMistralJson(rawContent);
        answers = parsed.answers || parsed;
      } catch {
        console.error('❌ Extraction failed, using defaults');
        answers = {};
      }
    }

    // Normalize answers to QuestionnaireAnswers shape with defaults
    const normalizedAnswers = {
      relation: answers.relation || 'autre',
      has_notary: answers.has_notary ?? false,
      organismes: Array.isArray(answers.organismes) ? answers.organismes : [],
      deceased_was_employed: answers.deceased_was_employed ?? false,
      deceased_was_tenant: answers.deceased_was_tenant ?? false,
      has_life_insurance: answers.has_life_insurance ?? false,
      has_joint_account: answers.has_joint_account ?? false,
      deceased_firstname: answers.deceased_firstname || undefined,
      deceased_lastname: answers.deceased_lastname || undefined,
      deceased_dod: answers.deceased_dod || undefined,
    };

    // Clean up session
    sessions.delete(session_id);
    console.log('✅ Session nettoyée, answers extraites');

    res.json({
      success: true,
      answers: normalizedAnswers,
    });
  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ success: false, error: error.message });
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

// SPA fallback: serve index.html for all non-API routes (React Router)
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(staticDir, 'index.html'));
  }
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
  console.log(`📝 Agent Mistral ID: ${AGENT_ID}`);
  console.log(`🗄️  Supabase URL: ${process.env.SUPABASE_URL ? 'Configuré' : 'Non configuré'}`);
});

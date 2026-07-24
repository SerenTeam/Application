import express from 'express';
import cors from 'cors';
import { Mistral } from '@mistralai/mistralai';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Resend } from 'resend';
import * as Sentry from '@sentry/node';
import { createQuestionnaireRouter } from './routes/questionnaire.js';
import { createLettersRouter } from './routes/letters.js';
import { createEmailSender } from './lib/email-sender.js';
import * as lettersStore from './lib/letters-store.js';
import { LETTER_CHANNELS } from './lib/letter-channels.js';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

// Sentry serveur : erreurs uniquement (pas de tracing, pas de PII), inerte sans SENTRY_DSN.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Client Supabase (clé publishable — opérations non authentifiées ; la RLS s'applique).
// Déclaré ICI (avant le montage des routers, cf. plus bas) : le webhook Resend (route
// publique, sans token utilisateur) en a besoin en tant que dépendance injectée
// (createLettersRouter({ publicClient: supabase, ... })) au moment même où le router est
// construit — un `const` déclaré plus bas dans le fichier ne serait pas encore initialisé
// à cet instant (temporal dead zone) alors que requireAuth, lui, ne le lit qu'au moment
// d'une requête (bien après la fin du chargement du module), d'où son innocuité plus bas.
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_PUBLISHABLE_KEY || ''
);

// Middleware
// CORS : restreint aux origines autorisées. En production, définir CORS_ORIGIN
// (liste séparée par des virgules, ex. "https://app.seren.fr"). Défaut : origines de dev.
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Autorise les requêtes sans header Origin (same-origin classique, curl, health checks)
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // Refus SANS exception : la réponse part sans en-têtes CORS et le navigateur bloque
    // lui-même les lectures cross-origin. Jeter une erreur ici renverrait des 500 sur les
    // assets same-origin (les <script crossorigin> de Vite envoient un header Origin) —
    // c'est ce qui cassait le déploiement quand CORS_ORIGIN n'était pas défini.
    return callback(null, false);
  },
}));

// Espace privé : interdire l'indexation par les moteurs (politique inverse de la
// landing publique). Complété par public/robots.txt (Disallow: /).
app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

// Webhook Resend : la vérification de signature Svix exige le corps BRUT (octet pour octet).
// Monté ICI, sur le chemin exact, AVANT le express.json() global ci-dessous : body-parser
// (json/raw/text partagent le même mécanisme) marque req._body = true après son premier
// passage et tout parseur suivant se contente alors d'appeler next() SANS retoucher req.body —
// si express.json() passait en premier sur ce chemin, req.body serait déjà un objet JS
// reconstruit (donc inutilisable pour un HMAC octet-exact) au moment d'atteindre le router
// (monté plus bas, lui aussi avec express.raw() en middleware de route — voir
// server/routes/letters.js — par cohérence et pour rester correct si le router est un jour
// utilisé seul, mais c'est bien CE montage-ci qui protège le corps en production).
app.use('/api/letters/webhook', express.raw({ type: 'application/json' }));
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

const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistral-small-latest'; // rédacteur du questionnaire v2

// Questionnaire v2 : flux piloté par le moteur (server/lib), IA limitée à la rédaction des textes.
app.use('/api/questionnaire', createQuestionnaireRouter({ requireAuth, mistral: client, model: MISTRAL_MODEL }));

// Envoi de courriers (canal email v1, Resend). Client instancié PARESSEUSEMENT : si
// RESEND_API_KEY est absent (dev local avant le USER STEP), resendClient reste `null` et
// emailSender.send() lève `email_not_configured` (503, message clair) au lieu de faire
// planter le serveur au démarrage.
const resendClient = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
app.use('/api/letters', createLettersRouter({
  requireAuth,
  store: lettersStore,
  emailSender: createEmailSender({ resendClient, from: process.env.RESEND_FROM }),
  channels: LETTER_CHANNELS,
  // Le webhook (POST /api/letters/webhook, route publique) n'a pas de token utilisateur : il
  // passe par ce client bare (clé publishable) et par la RPC security definer
  // update_letter_send_status pour mettre à jour un statut malgré la RLS — voir letters-store.js.
  publicClient: supabase,
}));

// Helper pour créer un client Supabase avec contexte utilisateur authentifié
function getSupabaseClient(accessToken) {
  return createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_PUBLISHABLE_KEY || '',
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    }
  );
}

// ==================== PRODUIT TRANSMISSION (lecture seule) ====================
// La création (page de démo et ses trois routes serveur) a été retirée au chantier 0 —
// produit gelé. Restent : lecture par le propriétaire et lecture par code d'accès (AccessPage).

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
    // Remonte aussi les 500 gérés à Sentry (no-op sans DSN) — les catch avalent l'erreur sinon.
    Sentry.captureException(error);
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
    Sentry.captureException(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== ROUTES UTILITAIRES ====================

// Route de santé
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA fallback: serve index.html for all non-API routes (React Router)
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(staticDir, 'index.html'));
  } else {
    res.status(404).json({ success: false, error: 'Not found' });
  }
});

// Après toutes les routes : capture les erreurs Express non gérées vers Sentry.
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
  console.log(`📝 Rédacteur questionnaire v2 : ${MISTRAL_MODEL}`);
  console.log(`🗄️  Supabase URL: ${process.env.SUPABASE_URL ? 'Configuré' : 'Non configuré'}`);
});

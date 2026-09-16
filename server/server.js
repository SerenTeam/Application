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
import { createPaymentsRouter } from './routes/payments.js';
import { createAttachmentsRouter } from './routes/attachments.js';
import { createProviderWebhookRouter } from './routes/provider-webhook.js';
import { createPartnerRouter } from './routes/partner.js';
import { createActivationRouter } from './routes/activation.js';
import { createInvitationSender } from './lib/invitation-email.js';
import { generateInviteToken, hashInviteToken } from './lib/invite-token.js';
import { createBasicAuthGate } from './lib/basic-auth.js';
import { createEmailSender } from './lib/email-sender.js';
import { createPaperSender } from './lib/paper-sender.js';
import { createPaperResync } from './lib/paper-resync.js';
import { createStripeClient, createPriceReader } from './lib/stripe-client.js';
import { flagOn } from './lib/flags.js';
import { createRequireActiveDossier } from './lib/require-active-dossier.js';
import { scrubSentryEvent } from './lib/sentry-scrub.js';
import { createMeRouter } from './routes/me.js';
import { createTransmissionRouter } from './routes/transmission.js';
import * as lettersStore from './lib/letters-store.js';
import * as purchasesStore from './lib/purchases-store.js';
import { LETTER_CHANNELS } from './lib/letter-channels.js';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

// Sentry serveur : erreurs uniquement (pas de tracing, pas de PII), inerte sans SENTRY_DSN.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    // Contrat §4.8 : jamais de jeton d'activation, de hash ni de corps des routes
    // d'activation/partenaire dans un événement sortant.
    beforeSend: (event) => scrubSentryEvent(event),
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1); // Render est derrière un proxy : req.ip = IP cliente (limiteur par IP, L2b)
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

// Porte d'accès type .htaccess pour les environnements non publics (préprod, staging) :
// active UNIQUEMENT si SITE_PASSWORD est défini — en production la variable est absente et le
// middleware laisse tout passer (même discipline que Resend, Stripe et Sentry : sans sa
// variable, la feature est inerte). Monté ici, donc AVANT express.static : c'est le HTML et les
// assets qu'il protège. Les routes /api/* sont exclues par le middleware lui-même — elles
// portent leur propre authentification Bearer, et les webhooks signés (Stripe, Resend) n'ont
// évidemment pas d'identifiants Basic à présenter.
app.use(createBasicAuthGate({
  user: process.env.SITE_USER || 'seren',
  password: process.env.SITE_PASSWORD,
  realm: 'Seren',
}));

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
// Webhook Stripe : même contrainte de corps brut, même raison, même position (avant le
// express.json() global) — la signature Stripe se vérifie octet pour octet.
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
// Webhook MySendingBox (chantier 2a, Task 10) : ping non fiable, pas de signature documentée —
// la garde est un secret d'URL (server/routes/provider-webhook.js), pas un HMAC sur le corps brut,
// mais le même montage AVANT le express.json() global est conservé par cohérence avec les deux
// webhooks ci-dessus (et pour que le corps reste un Buffer non reparsé, quel que soit le mécanisme
// de vérification utilisé côté route).
app.use('/api/letters/provider-webhook', express.raw({ type: 'application/json' }));
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

// Rédacteur LLM du questionnaire (chantier 5) : coupé par défaut. Le client Mistral n'est
// INSTANCIÉ que si FEATURE_LLM === 'true' ET qu'une clé existe — lu une seule fois au démarrage
// (contrat §5, exception documentée). Sans lui, question-writer.js renvoie les textes relus du
// catalogue et aucune donnée ne sort vers Mistral.
const llmEnabled = flagOn('FEATURE_LLM') && Boolean(process.env.MISTRAL_API_KEY)
const mistralClient = llmEnabled ? new Mistral({ apiKey: process.env.MISTRAL_API_KEY }) : null

const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistral-small-latest'; // rédacteur du questionnaire v2

// Gate v2 (contrat §4.1) : UNE instance partagée par les routers métier famille.
const requireActiveDossier = createRequireActiveDossier()

// Compte courant (rôle, dossier, consentement, quota, flags) — requireAuth seul, jamais gaté.
app.use('/api/me', createMeRouter({ requireAuth }))

// Questionnaire v2 : flux piloté par le moteur (server/lib), IA limitée à la rédaction des textes.
app.use('/api/questionnaire', createQuestionnaireRouter({ requireAuth, requireActiveDossier, mistral: mistralClient, model: MISTRAL_MODEL }));

// ==================== PAIEMENTS (v2) ====================
// Forfait famille abandonné (la PF paie Seren) : les trois variables d'environnement du forfait
// (ouverture de la vente, tarif Stripe du forfait, quota d'envois inclus) ne sont plus lues. Le
// test « câblage v2 » de tests/flags.test.ts en interdit jusqu'au NOM dans ce fichier — d'où cette
// périphrase. Reste le mini-paiement « envoi supplémentaire », fermé tant que EXTRA_SENDS_ENABLED
// n'est pas 'true' (absent en bêta).
const stripeClient = createStripeClient();
const stripeExtraSendPriceId = process.env.STRIPE_PRICE_ID_EXTRA_SEND;

app.use('/api/payments', createPaymentsRouter({
  requireAuth,
  requireActiveDossier,
  store: purchasesStore,
  stripe: stripeClient,
  publicClient: supabase,
  getExtraPrice: createPriceReader({ stripe: stripeClient, priceId: stripeExtraSendPriceId }),
  extraPriceId: stripeExtraSendPriceId,
  appUrl: process.env.APP_URL || 'http://localhost:5173',
}));

// Envoi de courriers (canal email v1, Resend). Client instancié PARESSEUSEMENT : si
// RESEND_API_KEY est absent (dev local avant le USER STEP), resendClient reste `null` et
// emailSender.send() lève `email_not_configured` (503, message clair) au lieu de faire
// planter le serveur au démarrage.
const resendClient = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
// Adaptateur MySendingBox (chantier 2a) : UNE SEULE instance, partagée par la route d'envoi
// (POST /api/letters/send), le webhook provider (Task 10, GET de vérification) et la
// resynchronisation périodique (Task 10, même GET) — les trois parlent du même provider avec la
// même clé. Sans MYSENDINGBOX_API_KEY, elle lève `paper_not_configured` au premier appel (503
// propre côté route d'envoi) au lieu d'empêcher le démarrage — même discipline que Resend/Stripe ;
// le webhook et la resync, eux, traitent cette même absence comme un GET en échec (événement
// laissé non-processed / ligne resynchronisée au passage suivant).
const paperSender = createPaperSender({ apiKey: process.env.MYSENDINGBOX_API_KEY });
app.use('/api/letters', createLettersRouter({
  requireAuth,
  // Gate v2 (contrat §4.1) : dossier actif + consentement, dans le slot de l'ancien gate forfait.
  requireActiveDossier,
  store: lettersStore,
  emailSender: createEmailSender({ resendClient, from: process.env.RESEND_FROM }),
  channels: LETTER_CHANNELS,
  // Le webhook (POST /api/letters/webhook, route publique) n'a pas de token utilisateur : il
  // passe par ce client bare (clé publishable) et par la RPC security definer
  // update_letter_send_status pour mettre à jour un statut malgré la RLS — voir letters-store.js.
  publicClient: supabase,
  // ── Canal papier (chantier 2a) ──
  // Les deux canaux restent fermés tant que leur flag ≠ 'true' (kill switch PAR CANAL lu à chaque
  // requête dans la route, pas ici : couper un canal ne doit pas exiger un redéploiement).
  paperSender,
  // Le 402 « quota épuisé » ne propose l'achat d'un envoi que si ce Checkout-là peut réellement
  // s'ouvrir (flag relu à CHAQUE 402 + SDK + tarif dédié) — sinon le bouton mènerait à un 503.
  extraSendAvailable: () => flagOn('EXTRA_SENDS_ENABLED') && Boolean(stripeClient) && Boolean(stripeExtraSendPriceId),
}));

// Coffre minimal — pièces jointes des envois papier (chantier 2a). Pas de dépendance
// supplémentaire à injecter : le router lit/écrit directement via req.supabaseClient (posé par
// requireAuth), la RLS owner de la table `attachments` et du bucket `documents` suffit — voir
// server/routes/attachments.js.
app.use('/api/attachments', createAttachmentsRouter({ requireAuth, requireActiveDossier }));

// Ancres contractuelles v2 (docs/design-v2-demonstrateur.md §8.1) : chaque lot insère son app.use
// JUSTE AVANT son ancre, jamais ailleurs. Ne pas supprimer ni déplacer ces lignes.
// Espace partenaire PF (lot L2b) : comptes PF uniquement (la RPC refuse tout autre compte), non gaté
// par le dossier famille. Invitation Resend indépendante d'EMAIL_SENDS_ENABLED.
app.use('/api/partner', createPartnerRouter({
  requireAuth,
  invitationSender: createInvitationSender({ resendClient, from: process.env.RESEND_FROM }),
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  supportEmail: process.env.SUPPORT_EMAIL || 'support@seren-app.fr',
  // Secret partagé webhook_config : sans lui, création et renvoi répondent 500 (contrat §3.4, §4.4).
  // Aucune valeur par défaut : mieux vaut une création fermée qu'une création contournable.
  rpcSecret: process.env.WEBHOOK_RPC_SECRET,
  generateInviteToken,
  hashInviteToken,
}));

// v2:mount-partner

// Activation famille (lot L2b) : check public (client publishable), claim au token utilisateur.
app.use('/api/activation', createActivationRouter({
  requireAuth,
  publicClient: supabase,
  supportEmail: process.env.SUPPORT_EMAIL || 'support@seren-app.fr',
}));

// v2:mount-activation

// v2:mount-admin

// Webhook provider MySendingBox (chantier 2a, Task 10) : ping non fiable, gardé par un secret
// d'URL (MSB_WEBHOOK_URL_SECRET) plutôt qu'une signature (non documentée côté MySendingBox) —
// voir server/routes/provider-webhook.js pour le détail des trois garanties (secret temps
// constant, persist avant ack, jamais d'écriture de statut depuis le payload). Route PUBLIQUE
// (pas de requireAuth) : le même `supabase` bare que les deux autres webhooks, et les mêmes RPC
// security definer à secret (record_provider_event, update_letter_send_status,
// mark_provider_event_processed) pour écrire malgré la RLS.
app.use('/api/letters/provider-webhook', createProviderWebhookRouter({
  store: lettersStore,
  paperSender,
  publicClient: supabase,
}));

// Resynchronisation périodique du cycle papier (chantier 2a, Task 10 — timer serveur, PAS de
// pg_cron/pg_net, décision actée). Démarrée APRÈS app.listen (voir plus bas) : `start()` porte
// elle-même le garde-fou (désarmée sans MYSENDINGBOX_API_KEY, une ligne de log au boot, rien de
// plus) — l'appeler inconditionnellement ici est donc sans risque tant que la clé est absente.
const paperResync = createPaperResync({ store: lettersStore, paperSender, publicClient: supabase });

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

// ==================== PRODUIT TRANSMISSION (gelé, lecture seule) ====================
// Routes extraites dans server/routes/transmission.js (lecture par code via RPC F1).
app.use('/api', createTransmissionRouter({ requireAuth }));

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
  console.log(`📝 Rédacteur questionnaire v2 : ${mistralClient ? MISTRAL_MODEL : 'statique (FEATURE_LLM fermé)'}`);
  console.log(`🗄️  Supabase URL: ${process.env.SUPABASE_URL ? 'Configuré' : 'Non configuré'}`);
  // Chantier 2a, Task 10 : timer serveur (setInterval, PAS pg_cron/pg_net). `start()` se désarme
  // elle-même sans MYSENDINGBOX_API_KEY (une ligne de log, rien de plus) — appel inconditionnel.
  paperResync.start();
});

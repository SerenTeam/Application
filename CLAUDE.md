# Seren

Plateforme d'accompagnement post-décès : questionnaire conversationnel IA, roadmap personnalisée de démarches administratives, courriers pré-remplis et suivi.

## Stack

- **Frontend** : React 18, TypeScript, Vite, Tailwind CSS v4 (CSS-first `@theme`), Shadcn/ui, Radix UI, Lucide icons
- **Backend** : Express.js (`server/server.js`) — API questionnaire IA, auth proxy, static serving
- **BDD** : Supabase (PostgreSQL + Auth + RLS)
- **IA** : Mistral AI (agents dédiés pour questionnaire conversationnel avec mémoire)
- **PDF** : jsPDF (export courriers)
- **Analytics** : PostHog

## Commandes

```bash
npm run dev          # Vite dev server (port 5173)
npm run dev:server   # Express API (port 3000, --watch)
npm run dev:all      # Les deux en parallèle (concurrently)
npm run build        # tsc -b && vite build → dist/
npm start            # Express sert dist/ en production
npx tsc --noEmit     # Type-check sans build
```

## Architecture

```
src/
├── components/       # Composants React organisés par domaine
│   ├── ui/           # Shadcn/ui primitives
│   ├── auth/         # ProtectedRoute, formulaires auth
│   ├── questionnaire/# WelcomeScreen, QuestionCard, CompletionScreen
│   ├── dashboard/    # Sidebar, ProgressHero, RoadmapView
│   ├── letter/       # LetterPreview, LetterVariablesForm, LetterActions
│   ├── documents/    # DocumentCard
│   ├── layout/       # ErrorBoundary, OfflineBanner, CookieBanner
│   └── profile/
├── pages/            # Pages routées (React Router v7)
├── hooks/            # useAuth, useQuestionnaire, useLetterGenerator...
├── lib/              # Clients et utilitaires (supabase, api, roadmap-generator)
├── data/             # Catalogues statiques (steps-catalog, letter-templates)
└── types/            # Types TypeScript partagés
server/
└── server.js         # Express : routes API /api/questionnaire/*, /api/auth/*, /api/demo/*
```

### Flux principal

Questionnaire IA (Mistral agent, ≤20 questions) → `QuestionnaireAnswers` → `generateRoadmap()` → `saveRoadmapToDb()` → Dashboard

### Contrat de données clé

`QuestionnaireAnswers` dans `src/types/auth.ts` — contrat entre questionnaire et roadmap-generator. Toute modification impacte le pipeline complet.

## Conventions

- **Langue du code** : noms de variables/fonctions en anglais, commentaires et UI en français
- **Imports** : alias `@/` → `src/` (configuré dans tsconfig + vite)
- **Styling** : Tailwind utility-first, pas de CSS modules. Design empathique (Cormorant Garamond display, DM Sans body, palette #3B5998 / #FAF9F7)
- **Composants UI** : Shadcn/ui via `components/ui/` — ne pas réinventer les primitives
- **État** : React hooks locaux + Supabase comme source de vérité. Pas de state manager global
- **Auth** : Supabase Auth côté client (`useAuth` hook), middleware `requireAuth` côté serveur avec Bearer token
- **API** : `apiFetch()` dans `lib/api.ts` gère automatiquement le token Bearer et les 401

## Variables d'environnement

Fichier `.env` à la racine (gitignored). Variables requises :
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — client Supabase frontend
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` — client Supabase backend
- `MISTRAL_API_KEY`, `MISTRAL_AGENT_ID` — agent questionnaire
- `MISTRAL_QUESTIONNAIRE_AGENT_ID`, `MISTRAL_ROADMAP_AGENT_ID` — agents spécialisés (optionnels)
- `CORS_ORIGIN` — origines autorisées, séparées par des virgules (défaut : `http://localhost:5173,http://localhost:3000`). À définir en production (ex. `https://app.seren.fr`)

## Points d'attention

- **Pas de tests** : aucun framework de test configuré. Valider manuellement via le navigateur
- **Sessions en mémoire** : les sessions questionnaire sont stockées dans une `Map()` côté serveur — perdu au redémarrage. Pas de persistence inter-process
- **Schema SQL** : `supabase_v1_schema.sql` et `supabase_auth_setup.sql` à la racine — modifications de schema à faire dans Supabase SQL Editor
- **RLS** : les policies Supabase Row Level Security sont actives — les requêtes côté serveur utilisent le token utilisateur via `getSupabaseClient(token)`

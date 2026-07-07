# Seren - Plateforme d'accompagnement post-deces

Application web qui accompagne les proches d'une personne decedee dans leurs demarches administratives : questionnaire conversationnel avec IA, generation d'un parcours personnalise (roadmap), courriers pre-remplis et suivi des etapes.

## Fonctionnalites

- **Questionnaire conversationnel IA** : Agent Mistral AI avec memoire de conversation, questions adaptatives et empathiques (jusqu'a 20 questions)
- **Roadmap personnalisee** : Generation automatique des demarches a effectuer, classees par urgence (48h / semaine / mois / long terme)
- **Courriers pre-remplis** : 10 modeles de courriers (banque, assurance, employeur, bailleur...) avec variables auto-remplies depuis le questionnaire
- **Suivi des demarches** : Marquage termine, notes personnelles, export PDF
- **Authentification Supabase** : Inscription/connexion, gestion de session avec detection d'expiration
- **Design empathique** : Interface sobre et bienveillante (Cormorant Garamond + DM Sans, palette douce)

## Architecture

```
seren/
├── src/
│   ├── components/
│   │   ├── questionnaire/     # WelcomeScreen, QuestionCard, CompletionScreen, Progress
│   │   ├── dashboard/         # Sidebar, ProgressHero, RoadmapView, PriorityActions
│   │   ├── letter/            # LetterPreview, LetterVariablesForm, LetterActions, MarkAsSent
│   │   └── documents/         # DocumentCard
│   ├── data/
│   │   ├── steps-catalog.ts             # 30 etapes post-deces (8 themes)
│   │   └── letter-templates.ts          # 10 modeles de courriers
│   ├── hooks/
│   │   ├── useAuth.ts                   # Auth Supabase + detection expiration session
│   │   └── useLetterGenerator.ts        # Auto-remplissage des variables courrier
│   ├── lib/
│   │   ├── roadmap-generator.ts         # generateRoadmap() + saveRoadmapToDb()
│   │   ├── supabase.ts                  # Client Supabase
│   │   └── api.ts                       # apiFetch() avec gestion 401
│   ├── pages/
│   │   ├── QuestionnairePage.tsx         # Questionnaire IA → extraction → roadmap
│   │   ├── DashboardPage.tsx            # Tableau de bord + roadmap + courriers
│   │   ├── DocumentsPage.tsx            # Gestion des courriers generes
│   │   └── LoginPage.tsx
│   └── App.tsx                          # Routes React Router
├── server/
│   └── server.js              # Express : API questionnaire (Mistral), static serving
├── supabase_v1_schema.sql     # Schema SQL a executer dans Supabase
├── package.json
├── vite.config.ts
└── tsconfig.json
```

### Flux principal

```
Questionnaire IA (agent Mistral, jusqu'a 20 questions)
        │
        │  POST /api/questionnaire/start
        │  POST /api/questionnaire/answer  (conversation avec memoire)
        │  → action: "fin_questionnaire" + answers extraites
        │
        ▼
QuestionnaireAnswers (interface typee)
        │
        ▼
generateRoadmap(answers)    ← filtre STEPS_CATALOG par applicable_when
        │
        ▼
saveRoadmapToDb()           ← Supabase : questionnaires + roadmaps + steps
        │
        ▼
Dashboard                   ← roadmap par urgence, courriers integres, suivi
```

L'agent Mistral conduit le questionnaire de maniere conversationnelle avec un ton empathique. Le serveur maintient l'historique complet des messages (`messages[]`) pour chaque session, permettant a l'agent de poser des questions de suivi contextuelles. A la fin, l'agent extrait les reponses structurees qui alimentent le pipeline de generation de roadmap cote client.

### Contrat de donnees

L'interface `QuestionnaireAnswers` est le contrat entre le questionnaire et le generateur de roadmap :

```typescript
interface QuestionnaireAnswers {
  relation: 'conjoint' | 'parent' | 'enfant' | 'frere_soeur' | 'autre'
  has_notary: boolean
  organismes: ('banque' | 'assurance' | 'caf' | 'retraite' | 'employeur' | 'mutuelle' | 'logement' | 'cpam')[]
  deceased_was_employed: boolean
  deceased_was_tenant: boolean
  has_life_insurance: boolean
  has_joint_account: boolean
  deceased_firstname?: string
  deceased_lastname?: string
  deceased_dod?: string
}
```

## Installation

### Prerequis
- Node.js 18+
- Compte Supabase
- Cle API Mistral + ID agent

### Configurer Supabase

1. Creez un projet sur [supabase.com](https://supabase.com)
2. Executez `supabase_v1_schema.sql` dans le SQL Editor (tables : `questionnaires`, `roadmaps`, `steps`, `step_actions`, `documents`)
3. Recuperez URL et cle anon dans **Settings > API**

### Lancer en local

```bash
npm install
cp .env.example .env   # renseignez les variables ci-dessous
npm run dev:all         # Vite (5173) + Express (3000)
```

### Build production

```bash
npm run build           # tsc + vite build → dist/
npm start               # Express sert dist/ en production
```

## Variables d'environnement

```env
# Supabase (requis)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxx...

# Mistral (requis pour le questionnaire)
MISTRAL_API_KEY=votre_cle_api
MISTRAL_AGENT_ID=ag_xxxxx

# Serveur
PORT=3000
```

## API Endpoints

| Methode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/questionnaire/start` | Demarre une session de questionnaire IA |
| POST | `/api/questionnaire/answer` | Envoie une reponse (maintient l'historique de conversation) |
| POST | `/api/questionnaire/complete` | Extrait les reponses structurees de la conversation |
| GET | `/api/health` | Verifie l'etat du serveur |

## Stack technique

- **Frontend** : React 18, TypeScript, Vite
- **Styling** : Tailwind CSS v4 (CSS-first config avec `@theme`)
- **UI** : Composants Shadcn/ui, Radix UI, Lucide icons
- **Backend** : Express.js (API questionnaire IA)
- **BDD** : Supabase (PostgreSQL + Auth + RLS)
- **IA** : Mistral AI (questionnaire conversationnel avec memoire)
- **PDF** : jsPDF + html2canvas (export courriers)
- **Design** : Cormorant Garamond (display), DM Sans (body), palette #3B5998 / #FAF9F7

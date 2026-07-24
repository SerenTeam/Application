# Seren — Plateforme d'accompagnement post-décès

Application web qui accompagne les proches d'une personne décédée dans leurs démarches administratives : questionnaire guidé (≤ 15 questions, rédaction adaptée par IA), roadmap personnalisée des démarches, courriers pré-remplis (envoi email en 1 clic) et suivi.

## Fonctionnalités

- **Questionnaire v2** : moteur de logique pure côté serveur (questions conditionnelles, récap confirmable), rédaction des libellés par Mistral AI avec fallback statique garanti (timeout 3 s). Minimisation stricte des données envoyées à l'IA : prénom du défunt, relation, dernière réponse fermée — jamais l'historique ni le nom.
- **Roadmap personnalisée** : génération des démarches depuis un catalogue de ~50 étapes sourcées, classées par urgence (48 h / semaine / mois / long terme).
- **Courriers pré-remplis** : modèles avec variables auto-remplies, export PDF, envoi par email (Resend) avec suivi de statut (webhook signé). Les courriers restent en français (destinés aux organismes français).
- **i18n FR/EN** : détection de la langue du device + toggle persistant ; catalogues d'étapes jumeaux avec invariant de parité testé.
- **Auth Supabase** (RLS active sur toutes les tables) · **Monitoring Sentry** (optionnel, inerte sans DSN).

## Stack

React 18 + TypeScript + Vite + Tailwind CSS v4 + Shadcn/ui · Express.js · Supabase (PostgreSQL, Auth, RLS) · Mistral AI · Resend · Vitest.

## Démarrage

```bash
npm install
# créer .env à la racine — voir « Variables d'environnement » dans CLAUDE.md
npm run dev:all        # Vite (5173) + API Express (3000)
```

Autres commandes : `npm run build` (production dans `dist/`), `npm start` (Express sert `dist/`), `npm test` (Vitest), `npx tsc --noEmit` (type-check).

## Architecture

```
src/            React (pages, components par domaine, hooks, i18n, catalogues)
server/         Express — moteur questionnaire v2, rédacteur Mistral, envoi courriers
supabase/       Migrations versionnées (baseline incluse) — `supabase db push`
tests/          Vitest : moteur, catalogues, invariants croisés, routes (supertest)
docs/           Specs (design-*.md), plans (plan-*.md), runbooks
```

Flux principal : questionnaire v2 → `QuestionnaireAnswersV2` → `generateRoadmap()` → sauvegarde Supabase → dashboard.

Le schéma BDD vit dans `supabase/migrations/` (CLI Supabase — voir `docs/runbook-supabase-cli.md`). Les fichiers SQL à la racine sont l'état historique v1, conservés pour référence.

## Tests & CI

`npm test` — 157 tests (moteur, invariants anti-question-morte, parité FR/EN des catalogues, routes). CI GitHub Actions sur chaque push/PR : type-check + tests.

## Déploiement

Render (build : `npm ci && npm run build`, run : `npm start`). Les variables `VITE_*` sont figées au build : tout changement côté client exige un redéploiement. Définir `CORS_ORIGIN` en production.

## Documentation

- `CLAUDE.md` — référence détaillée (conventions, variables d'environnement, état du projet)
- `docs/` — specs de conception, plans d'implémentation, runbooks (Supabase CLI, staging)

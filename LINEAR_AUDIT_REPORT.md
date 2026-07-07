# Rapport d'audit Linear ↔ Code

**Date :** 2026-03-11
**Auditeur :** Claude Code (rôle PO)
**Équipe :** Seren (SerenIt)
**Stack :** React 18 + TypeScript, Tailwind CSS v4, Shadcn/ui, Supabase Auth, Mistral AI, Express.js

---

## Résumé exécutif

| Métrique | Valeur |
|----------|--------|
| Issues auditées | 42 |
| Statuts mis à jour → Done | 13 |
| Statuts mis à jour → In Progress | 2 |
| Tickets créés (fonctionnalités non trackées) | 6 |
| Tickets orphelins signalés | 4 |
| Backlog confirmé (non implémenté) | 17 |

**Avant l'audit :** 2 issues Done, 1 In Review, 37 Backlog
**Après l'audit :** 21 issues Done, 2 In Progress, 1 In Review, 17 Backlog + 4 orphelins signalés

---

## Détail par projet

### Création de compte

| Issue | Titre | Ancien statut | Nouveau statut | Label | Action |
|-------|-------|--------------|----------------|-------|--------|
| SER-5 | Création de compte avec email et mdp | Backlog | **Done** | V1 | ✅ Passé en Done — SignupPage.tsx complet avec Zod + Supabase |
| SER-6 | Accepter les CGU | Backlog | **Done** | V1 | ✅ Passé en Done — CGUCheckbox.tsx avec liens /legal et /security |
| SER-7 | Confirmation de création de compte | Backlog | Backlog | V2 | 📋 Non implémenté (V2) — Pas de page de vérification email dédiée |
| SER-8 | Email déjà utilisé bloqué | Backlog | **Done** | V1 | ✅ Passé en Done — Détection "already registered" + lien vers /login |
| SER-9 | Création de compte via lien | Backlog | Backlog | V2 | 📋 Non implémenté (V2) |
| SER-10 | Tracking nombre d'entrées | Backlog | Backlog | V3 | 📋 Non implémenté (V3) |
| SER-11 | Reprendre si quitte le flux sign-up | Backlog | Backlog | — | 📋 Non implémenté — Spécification à préciser |
| SER-21 | Accès à son profil | Backlog | **Done** | V1 | ✅ Passé en Done — ProfilePage.tsx avec email + prénom |
| SER-22 | Modification du mot de passe | Backlog | **Done** | V1 | ✅ Passé en Done — ChangePasswordForm.tsx complet |
| SER-23 | Modification de l'email | Backlog | Backlog | V2 | 📋 Non implémenté (V2) |
| SER-38 | Règles de validation du mot de passe | Backlog | **Done** | V1 | ✅ Passé en Done — 4 règles temps réel + hook dédié |
| SER-39 | Indicateur de force du mot de passe | Backlog | **Done** | V1 | ✅ Passé en Done — Barre rouge/orange/vert + labels |
| SER-40 | Confirmation et correspondance des mdp | Backlog | **Done** | V1 | ✅ Passé en Done — Détection mismatch + ARIA |

### Connexion

| Issue | Titre | Ancien statut | Nouveau statut | Label | Action |
|-------|-------|--------------|----------------|-------|--------|
| SER-12 | Se connecter email + mdp | Backlog | **Done** | V1 | ✅ Passé en Done — LoginPage.tsx + Supabase signIn |
| SER-13 | Mot de passe oublié | Backlog | Backlog | V2 | 📋 Non implémenté (V2) |
| SER-14 | Déconnexion | Backlog | **Done** | V1 | ✅ Passé en Done — supabase.auth.signOut() dans 3 pages |
| SER-15 | Voir mot de passe masqué | Backlog | Backlog | V1 | 📋 Non implémenté — Pas de toggle eye icon |
| SER-16 | Bloquer connexion si mail non vérifié | Backlog | Backlog | V2 | 📋 Non implémenté (V2) |
| SER-17 | Gestion trop de tentatives | Backlog | Backlog | V2 | 📋 Non implémenté (V2) |
| SER-18 | Gestion des erreurs mauvaise ID | Backlog | **Done** | V1 | ✅ Passé en Done — Erreurs Supabase affichées |
| SER-19 | Garder la connexion | Backlog | **Done** | V1 | ✅ Passé en Done — JWT Supabase + onAuthStateChange |
| SER-20 | Tracking de connexion | Backlog | Backlog | V3 | 📋 Non implémenté (V3) |
| SER-43 | Gestion de la session expirée | Backlog | **In Progress** | V1 | 🔄 Partiellement implémenté — Redirect OK, message manquant |
| SER-44 | Déconnexion automatique par inactivité | Backlog | Backlog | V2 | 📋 Non implémenté (V2) |
| SER-45 | Connexion via Google (OAuth) | Backlog | Backlog | V2 | 📋 Non implémenté (V2) |
| SER-46 | Connexion via Apple (SIWA) | Backlog | Backlog | V2 | 📋 Non implémenté (V2) |

### Abonnement & Paiement

| Issue | Titre | Ancien statut | Nouveau statut | Label | Action |
|-------|-------|--------------|----------------|-------|--------|
| SER-24 | Gestion des différents paiements | Backlog | Backlog | V2 | 📋 Non implémenté (V2) |
| SER-41 | Souscription abonnement via Stripe | Backlog | **In Progress** | V1 | 🔄 Lien Stripe test OK, webhook/page offres manquants |
| SER-42 | Gestion abonnement / factures (Portal) | Backlog | Backlog | V2 | 📋 Non implémenté (V2) |

### Modification de compte

| Issue | Titre | Ancien statut | Nouveau statut | Label | Action |
|-------|-------|--------------|----------------|-------|--------|
| SER-34 | Accès à son profil | Backlog | Backlog | — | ❓ Doublon de SER-21 — Recommandation : archiver |
| SER-35 | Modification mdp | Backlog | Backlog | — | ❓ Doublon de SER-22 — Recommandation : archiver |
| SER-36 | Modification email | Backlog | Backlog | — | ❓ Doublon de SER-23 — Recommandation : archiver |

### Onboarding — Découverte et promesse

| Issue | Titre | Ancien statut | Nouveau statut | Label | Action |
|-------|-------|--------------|----------------|-------|--------|
| SER-31 | Écran de bienvenue (amont/aval) | Backlog | Backlog | — | 📋 Non implémenté — Description vide, à spécifier |
| SER-32 | Sélection du mode (préparer/gérer) | Backlog | Backlog | — | 📋 Non implémenté — Description vide, à spécifier |

### Priorisation des étapes — roadmap

| Issue | Titre | Ancien statut | Nouveau statut | Label | Action |
|-------|-------|--------------|----------------|-------|--------|
| SER-29 | Tags niveaux d'urgence | Done | Done | — | ✅ Confirmé — Urgency flags dans RoadmapView |
| SER-30 | Indicateurs de progression | In Review | **Done** | — | ✅ Passé en Done — ProgressHero.tsx complet |
| SER-33 | Segmentation thématique | Done | Done | — | ✅ Confirmé — 5 phases thématiques |
| SER-51 | Tableau de bord transmission | — | **Done** | V1 | 🆕 Ticket créé — Dashboard 4 vues, 12 composants |

### Upload de documents

| Issue | Titre | Ancien statut | Nouveau statut | Label | Action |
|-------|-------|--------------|----------------|-------|--------|
| SER-26 | Mapping documents ↔ démarches | Backlog | Backlog | — | 📋 Non implémenté — Description vide |
| SER-27 | Gestion sécurité et visibilité | Backlog | Backlog | — | 📋 Non implémenté — Description vide |
| SER-28 | Spécifier l'UX d'upload (flows) | Backlog | Backlog | — | 📋 Non implémenté — Description vide |

### Design system / UI kit

| Issue | Titre | Ancien statut | Nouveau statut | Label | Action |
|-------|-------|--------------|----------------|-------|--------|
| SER-25 | Test Thomas | Backlog | Backlog | — | ❓ Ticket orphelin — Test, pas une feature |
| SER-52 | Design system et composants UI | — | **Done** | V1 | 🆕 Ticket créé — Tokens + 5 composants Shadcn |

### Questionnaires (projet sans issues avant audit)

| Issue | Titre | Ancien statut | Nouveau statut | Label | Action |
|-------|-------|--------------|----------------|-------|--------|
| SER-47 | Questionnaire adaptatif IA (flux complet) | — | **Done** | V1 | 🆕 Ticket créé — 5 composants, 3 routes API, Mistral AI |
| SER-48 | Mode démonstration (questionnaire court) | — | **Done** | V1 | 🆕 Ticket créé — DemoPage 690 lignes, Stripe |
| SER-49 | Sauvegarde partielle et reprise | — | **Done** | V1 | 🆕 Ticket créé — Save-partial, load-draft, localStorage |
| SER-50 | Page d'accès proches (saisie code) | — | **Done** | V1 | 🆕 Ticket créé — AccessPage.tsx, validation code |

### Organisation documentation Notion

| Issue | Titre | Ancien statut | Nouveau statut | Label | Action |
|-------|-------|--------------|----------------|-------|--------|
| SER-37 | Lister prestations | Backlog | Backlog | — | 📋 Tâche business/documentation, pas du code |

---

## Fonctionnalités dans le code sans ticket (avant audit)

Toutes les fonctionnalités non trackées ont été couvertes par les 6 nouveaux tickets :

| Fonctionnalité | Ticket créé | Fichiers principaux |
|----------------|-------------|---------------------|
| Questionnaire adaptatif IA complet | SER-47 | QuestionnairePage.tsx + 4 composants |
| Mode démonstration | SER-48 | DemoPage.tsx (690 lignes) |
| Sauvegarde partielle et reprise | SER-49 | QuestionnairePage.tsx + WelcomeScreen.tsx |
| Page d'accès proches | SER-50 | AccessPage.tsx |
| Dashboard transmission | SER-51 | DashboardPage.tsx + 8 composants |
| Design system / UI Kit | SER-52 | index.css + 5 composants UI |

---

## Tickets jugés obsolètes / à discuter

| Issue | Titre | Projet | Raison | Recommandation |
|-------|-------|--------|--------|----------------|
| SER-34 | Accès à son profil | Modification de compte | Doublon de SER-21 (Création de compte) | **Archiver** |
| SER-35 | Modification mdp | Modification de compte | Doublon de SER-22 (Création de compte) | **Archiver** |
| SER-36 | Modification email | Modification de compte | Doublon de SER-23 (Création de compte) | **Archiver** |
| SER-25 | Test Thomas | Design system / UI kit | Ticket de test, pas une feature | **Archiver** |

> ⚠️ **Décision requise :** L'archivage de ces tickets nécessite votre confirmation. Des commentaires ont été ajoutés sur chaque ticket avec la recommandation.

---

## Recommandations PO

### 1. Qualité des tickets

**Problème identifié :** 19 tickets sur 42 (45%) n'ont aucune description ou une description très vague.

| Gravité | Exemples | Recommandation |
|---------|----------|----------------|
| 🔴 **V1 sans description** | SER-12, SER-14, SER-15, SER-21, SER-22 | Ajouter au minimum les critères d'acceptation |
| 🟡 **V1 vagues** | SER-18 ("À préciser"), SER-19 ("Définir le temps") | Spécifier les valeurs/comportements attendus |
| 🟠 **Backlog vides** | SER-26/27/28, SER-31/32 | Rédiger la user story avant de prioriser |

**Bonne pratique :** Les tickets SER-38/39/40/43/44/45/46 sont d'excellente qualité (user story + AC testables). Ce format devrait être le standard.

### 2. Structure des projets

**Problème :** Le projet "Modification de compte" (SER-34/35/36) duplique des tickets déjà dans "Création de compte" (SER-21/22/23).

**Recommandation :** Archiver le projet "Modification de compte" et centraliser toutes les issues de gestion de compte dans "Création de compte" (renommable en "Gestion de compte").

### 3. Projet "Questionnaires"

**Problème :** Le projet existait mais était vide alors que c'est la fonctionnalité la plus riche de l'application (questionnaire IA + démo + sauvegarde partielle).

**Action effectuée :** 4 tickets créés (SER-47 à SER-50) et passés en Done.

### 4. Prochaines priorités V1

Issues V1 restantes à implémenter, par ordre de priorité recommandé :

| Priorité | Issue | Titre | Effort estimé |
|----------|-------|-------|---------------|
| 🔴 P1 | SER-43 | Session expirée (reste : message + différenciation) | ~2h |
| 🔴 P1 | SER-41 | Stripe (reste : page offres, webhook, email) | ~1-2j |
| 🟡 P2 | SER-15 | Toggle visibilité mot de passe | ~30min |

### 5. Couverture de test

**Constat :** Aucun fichier de test n'a été détecté dans le projet. Considérer l'ajout de :
- Tests unitaires pour les hooks critiques (usePasswordValidation, useAuth)
- Tests d'intégration pour les formulaires (signup, login, change password)
- Tests E2E pour les flux principaux (questionnaire complet, accès proches)

### 6. Sécurité

Quelques observations à prioriser en V2 :
- Les codes d'accès 8 caractères hex (256^4 = ~4 milliards) sont raisonnables mais pourraient être renforcés
- Les données dans `localStorage` ne sont pas chiffrées
- Pas de rate limiting sur les endpoints API
- Le succès de paiement Stripe est basé uniquement sur un paramètre URL (pas de vérification webhook)

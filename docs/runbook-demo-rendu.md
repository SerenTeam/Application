# Runbook — Rendu investisseurs (JEUDI) + bêta réelle

> Mis à jour le 2026-09-14 (nuit). Rendu : **jeudi**, démo pilotée investisseurs + utilisateurs réels ensuite.
> Dispositif : **prod** (`app.seren-app.fr`, branche `main`) = utilisateurs réels, vente fermée, code stable INTOUCHÉ jusqu'au rendu ; **préprod** (`preprod-app.seren-app.fr`, branche `pre-prod`, Basic Auth) = démo complète : paiement Stripe test + espace partenaire PF + **envoi papier chantier 2a en mode test MySendingBox** (décision du 2026-09-14 : la feature phare entre dans la démo — PDF réellement généré, aucun pli réel).
> Séquençage : dimanche = socle (paiement+PF) · lundi = 2a sur préprod · mardi = polish + répétition · mercredi midi = GEL + tag + captures · jeudi = rendu.
> État nuit du 14 : merge 2a→pre-prod PRÊT sur `integration/2a-preprod` (conflits i18n résolus, 467 tests, build vert — ff au réveil). Comptes de démo NON créés (préprod : « Confirm email » activé + rate limit SMTP atteint → toggle à faire, voir §1).
## 1. Mise en place (J-3 → J-2) — dans l'ordre

### Côté Arnaud (user steps)
1. **Stripe (mode test)** : produit « Forfait Seren » + tarif → `STRIPE_PRICE_ID` ; clé `sk_test_…` ; webhook déclaré sur `https://preprod-app.seren-app.fr/api/payments/webhook` → `STRIPE_WEBHOOK_SECRET`.
2. **Render préprod → Environment** : les 3 variables Stripe + `PAYMENTS_ENABLED=true` + `WEBHOOK_RPC_SECRET` (et sa ligne en base : `insert into webhook_config (id, rpc_secret) values (1, '<valeur>');` si absente).
3. **Migrations préprod** : `supabase link --project-ref kvtzhyxlqouvpwasedbe` puis `supabase db push` → applique `20260725120000_purchases.sql` + `20260913200000_pf_dashboard_demo.sql`.
4. **Branche préprod** : merger `feature/pf-dashboard-demo` dans `pre-prod` + push (commandes fournies par la session) → Render redéploie la préprod.
5. **Comptes de démo sur la préprod** (via l'app, Basic Auth) : compte PF (`pf.demo@seren-test.fr` ou autre) + compte famille de démo ; dérouler le questionnaire du compte famille (roadmap remplie = ce qu'on montre).
6. **Seed** : adapter les emails de `scripts/seed-demo-pf.sql` → SQL Editor préprod → exécuter.
7. **Achat test** : depuis le compte famille préprod, Checkout avec la carte `4242 4242 4242 4242` (date future, CVC libre) → le webhook marque l'achat payé.

### Côté session (vérifications, lecture seule)
- Probes d'isolation RLS sur la préprod : famille → `partners`/`attributions` illisibles + RPC = null ; PF → agrégats corrects, aucune table famille lisible.
- E2E : `/partenaire` du compte PF affiche 1 attribué / 1 payé / CA / commission cohérents.
- Contrôle prod : santé, parcours famille, aucun artefact PF (la prod ne contient pas le code PF).

## 2. Scénario de démo (à répéter à J-1, chronométré)

1. **Le produit famille — PROD** (`app.seren-app.fr`, compte famille préparé avec roadmap complète) : dashboard → une démarche → courrier pré-rempli → envoi email en 1 clic + statut. Option : dérouler 3-4 questions du questionnaire en live sur un compte neuf pour montrer l'adaptativité, puis basculer sur le compte préparé.
2. **Le paiement — PRÉPROD** (Basic Auth saisie AVANT la démo, onglet déjà ouvert) : compte famille préprod neuf ou vierge d'achat → paywall → Checkout Stripe → carte test → retour payé, fonctions ouvertes.
3. **Le modèle PF — PRÉPROD** : déconnexion → compte PF → `/partenaire` : « voilà ce que voit la pompe funèbre partenaire » — dossiers accompagnés, payés, CA, commission. Mention préversion assumée à l'oral : « le dispositif complet (enrôlement, QR, reversements) est le prochain chantier ».
4. La vision : roadmap produit (envoi papier/LRAR = chantier en spec, module découverte…) — sur slides.

## 3. Filet de sécurité

- **Tag de gel** (à poser à J-1 après la répétition) : `git tag rendu-2026-09-16 && git push origin rendu-2026-09-16` (sur `main`). Rollback prod : Render → Deploys → « Redeploy » du dernier déploiement vert (2 clics, ~3 min).
- **Gel des merges** à partir de J-1 12 h : plus rien n'entre dans `main` ni `pre-prod` avant le rendu.
- **Captures de secours** : à la répétition de J-1, capturer chaque écran du scénario (paywall, Checkout, retour payé, /partenaire) — si la préprod tombe pendant la démo, on déroule sur captures sans improviser.
- **Monitoring** : Sentry (2 projets) + UptimeRobot actifs sur la prod ; vérifier l'absence de nouvelles issues Sentry à J-1 et le matin du rendu.
- Basic Auth préprod : identifiants notés hors repo, testés à J-1 depuis le navigateur de la démo.

## 4. Après le rendu (rappels)

- Le dashboard PF v0 reste en préprod : le **chantier 4 complet** (enrôlement, QR, attribution robuste, ledger, RLS partenaire testée en CI — T13) le remplace proprement ; `main` ne le récupère que via ce chantier, ou explicitement.
- Reprendre le **chantier 2a** (spec `docs/design-chantier-2a-envoi-papier.md`, contre-vérification à relancer) et les décisions en attente (relecture juridique — toujours ouverte, bandeau bêta disponible).
- Nettoyage branches : `logo-header-seren`, `fix-lettre-champs-auto-remplis` (mergées), `staging` (périmée).

> **Statut** : v1.0 du 18/07/2026, versionnée au repo le 25/07/2026 pour servir de référence aux chantiers (relecture d'Arnaud encore partielle — signaler toute incohérence plutôt que de la corriger silencieusement). Le chantier 0 est LIVRÉ (cf. CLAUDE.md et `docs/design-chantier-0-assainissement.md`) ; prochain : chantier 1.

# Seren — Roadmap Technique

**Version 1.0 — 18 juillet 2026** · Fondée sur l'audit complet des repos `SerenTeam/Application` et `SerenTeam/landing`. Se lit en regard de la roadmap produit (mêmes phases).

---

## 1. Décision préalable : capitaliser ou refondre ?

Vous avez demandé les deux scénarios chiffrés. Les voici.

### Scénario A — Capitaliser sur l'existant (recommandé)

L'audit montre une base plus saine que ce que "repartir de 0" laissait craindre :

- **Moteur questionnaire v2** : logique pure côté serveur (zéro I/O, testable), 15 questions conditionnelles, rédaction Mistral avec fallback garanti (timeout 3 s → texte statique), minimisation exemplaire des données envoyées à l'IA. C'est le composant le plus difficile à refaire correctement.
- **86 tests automatisés** dont des tests d'invariants croisés entre catalogues (anti-question-morte, parité FR/EN) — rare à ce stade d'un projet.
- **RLS Supabase bien utilisée** : le serveur passe par la clé publishable + token utilisateur, jamais par une clé admin. Les policies `auth.uid() = user_id` sont posées partout.
- i18n FR/EN complet, design system cohérent landing↔app, catalogue de 50 étapes structuré.

Coût pour rendre cette base saine : **~2 semaines** d'assainissement (Chantier 0 ci-dessous).

### Scénario B — Table rase

Refaire à neuf (même stack ou autre) coûterait **8 à 12 semaines** pour seulement *revenir* au niveau actuel (questionnaire conditionnel + roadmap + courriers + auth + i18n + tests), sans aucune valeur utilisateur nouvelle, en réintroduisant des bugs déjà éliminés. Les nouvelles features (paiement, envoi, affiliation) devraient de toute façon être écrites — elles n'existent dans aucun des deux scénarios.

Une refonte ne se justifierait que si : (a) le produit pivotait hors du parcours guidé post-décès, (b) la stack bloquait une feature clé (ce n'est pas le cas : Stripe, Maileva, OCR et QR codes s'intègrent naturellement à Express/Supabase), ou (c) plus personne ne pouvait maintenir ce code.

> **Recommandation ferme : Scénario A.** Le "reset produit" est un reset de positionnement et de priorités, pas de code. Chaque semaine de réécriture est une semaine où aucune PF ne peut rien vendre.

---

## 2. Chantiers techniques (alignés sur les phases produit)

### Chantier 0 — Assainissement (S1 → S2) — *avant toute nouvelle feature*

Corrige les problèmes trouvés à l'audit, dans cet ordre :

1. **Corriger les drifts schéma↔code (bugs probables en prod)** :
   - Le code écrit/lit `step_actions.action_type` alors que le schéma définit `type` → les actions "copié/téléchargé/envoyé" échouent probablement en silence (`LetterActions.tsx`, `MarkAsSentButton.tsx`, `DocumentsPage.tsx`).
   - `DocumentsPage.tsx` et `DocumentCard.tsx` lisent `documents.document_type`, colonne absente du schéma.
   - → Vérifier le schéma réellement en prod, trancher un nom, migrer.
2. **Baseline des migrations Supabase** : les 5 tables v1 (`questionnaires`, `roadmaps`, `steps`, `step_actions`, `documents`) n'existent que dans des fichiers SQL racine appliqués à la main ; seules 4 migrations v2 sont versionnées. Créer une baseline CLI Supabase (chantier déjà identifié dans `docs/plan-points-attention.md`), puis **toute évolution passe par migration**. Appliquer la migration `pg_cron` en attente (purge des sessions — sinon croissance non bornée).
3. **CI GitHub Actions** : `tsc --noEmit` + `vitest` sur chaque PR. Les 86 tests existent, rien ne les exécute automatiquement. Une demi-journée, rentabilisée dès la première régression.
4. **Hygiène sécurité immédiate** :
   - Purger les `console.log` d'emails utilisateurs et de réponses Mistral (fuite de PII dans les logs Render).
   - Supprimer les routes Express mortes `/api/auth/*` (jamais appelées par le front, et leur règle de mot de passe — 6 caractères — est plus faible que celle du front : dangereux si réactivées par erreur).
   - Réparer **ou geler** la démo transmission : `DemoPage.tsx` appelle `/api/demo/*` en `fetch()` nu sans header Authorization alors que les routes exigent `requireAuth` → 401 systématique. Si la démo ne sert plus, retirer les routes ; sinon, basculer sur `apiFetch`.
5. **Monitoring** : Sentry (front + serveur) + uptime check. Aujourd'hui, un crash en prod est invisible.
   Bis — **robots/indexation** : sur la landing, corriger `src/app/robots.txt` (contient du code TypeScript servi verbatim en prod — correctif livré le 21/07/2026, dossier agent-ready) ; sur l'app, politique inverse : `Disallow: /` + `X-Robots-Tag: noindex` sur les routes authentifiées (espace privé, données sensibles).
6. **Docs** : réécrire le README (il décrit l'architecture v1 périmée — agent conversationnel 20 questions — et induira en erreur tout nouveau contributeur, humain ou IA). Archiver le plan design périmé du repo landing (`docs/superpowers/plans/2026-05-11…` : Next 14 + palette teal, contredit l'état livré).
7. **Environnements** : un projet Supabase + un service Render de staging, séparés de la prod. Indispensable avant de manipuler des paiements et des envois postaux réels.

### Chantier 1 — Paiement forfait (S3 → S4)

- **Stripe Checkout** en mode paiement one-shot + **webhook signé** (`checkout.session.completed`) → table `purchases` (user_id, montant, statut, session Stripe). L'implémentation actuelle (lien de test en dur, succès détecté par `?payment=success` dans l'URL) est **contournable trivialement et à remplacer intégralement**.
- **Gating côté serveur** : les routes d'envoi et de coffre vérifient `purchases` — jamais un flag côté client.
- Compteur de quota d'envois inclus dans le forfait (décision produit) + Stripe pour les envois à l'acte au-delà.
- Facturation/TVA (Stripe Tax ou mentions manuelles), CGV liées au checkout, remboursement en 1 clic côté admin (promesse produit).
- ⚠️ Webhooks : idempotence (rejouer un événement ne crée pas deux achats) et endpoint vérifiant la signature Stripe.

### Chantier 2 — Envoi réel des courriers (S4 → S8) — *la feature phare*

La conception existe déjà (`docs/design-envoi-courriers.md`) : la suivre, avec ces arbitrages :

- **Canaux dans l'ordre** : ① courrier simple papier + ② LRAR papier via API (Maileva ou équivalent — pas de consentement destinataire requis, accepté par tous les organismes), ③ email (Resend) pour les organismes qui l'acceptent, ④ LRE plus tard (optimisation de coût, contraintes de consentement).
- **Schéma** : tables `letter_sends` (statuts : préparé → validé → transmis → distribué → AR reçu / échec) et `attachments` ; bucket Supabase Storage **privé** (URLs signées, jamais de bucket public).
- **Webhooks provider signés** pour les statuts, avec re-synchronisation périodique en secours (les webhooks postaux se perdent).
- **File d'envoi avec validation** : au début, un écran admin "valider avant envoi" pour chaque courrier (attraper les erreurs de préremplissage avant qu'un LRAR erroné parte chez un notaire). On l'automatise quand le taux d'erreur observé le permet.
- **Base d'adresses organismes** : table `organisations` (CPAM, CAF, CARSAT, centres d'impôts, banques…) avec adresses postales vérifiées. Actif différenciant, à constituer progressivement, avec date de dernière vérification par entrée.
- **Suivi & relances** : `letter_sends` porte déjà les statuts ; ajouter un état "réponse reçue / clôturé" au niveau de la démarche (mise à jour manuelle par l'utilisateur en v1) + un job périodique (pg_cron, déjà en place pour la purge) qui détecte les envois sans réponse à J+15 et génère une relance pré-rédigée proposée en un clic. Coût marginal (~2–3 jours) pour un gain produit majeur — c'est ce qui distingue la feature phare d'un simple service d'envoi.
- ⚠️ Chaque envoi coûte de l'argent réel → plafond par utilisateur, détection de boucles, et coupe-circuit global (kill switch) si un bug déclenche des envois en masse.

### Chantier 3 — Coffre documents (S6 → S8, en parallèle du Chantier 2)

- Upload acte de décès + justificatifs : contrôle type MIME réel (magic bytes, pas l'extension), limite de taille, **scan antivirus** (ClamAV ou service managé), stockage privé chiffré.
- Rétention : purge automatique à J+X après clôture du dossier + suppression totale à la suppression du compte (droit à l'effacement — à câbler réellement, pas juste en promesse).
- Journalisation des accès aux documents (qui a lu quoi quand) — utile RGPD et debugging.

### Chantier 4 — Dispositif d'affiliation PF (S8 → S14)

Modèle de données :

```
partners            (id, raison sociale, SIRET, contact, contrat signé le, statut)
partner_users       (auth user ↔ partner, rôle)
referral_codes      (code, partner_id, QR généré, campagne)
attributions        (user_id, referral_code, source: qr|manuel, horodatage)
commission_ledger   (partner_id, purchase_id, montant, taux, statut: accru|dû|versé)
payouts             (partner_id, période, total, justificatif, versé le)
```

- **Attribution robuste** : QR → URL `seren-app.fr/pf/{code}` → code stocké à la création de compte + champ "code partenaire" au checkout en rattrapage (le scan papier et l'achat se font souvent sur des appareils différents, à des jours d'écart — le cookie seul perdrait une grosse part de l'attribution). Règle : premier code gagne, fenêtre 90 jours.
- **Dashboard PF** : rôle `partner` distinct, **RLS stricte** : un partenaire ne voit que ses agrégats (scans, comptes, achats, CA, compteur de palier) — **aucune donnée des familles, pas même un prénom**. Tests d'isolation automatisés obligatoires ici (un partenaire = un tiers commercial, pas un utilisateur de confiance).
- **Reversements** : le ledger fait foi ; génération d'un relevé de commissions par période que la PF facture à Seren. Paramétrable (palier/périodicité) pour pouvoir ajuster le modèle sans redéploiement — cf. point produit P4 sur le palier de 1 000 €.
- **Anti-fraude minimal** : alerte sur volumes anormaux, même IP/empreinte CB répétée, auto-achat.
- ⚠️ Le QR est généré côté serveur (lib `qrcode`), avec l'URL courte — prévoir la régénération des supports si le domaine change.

### Chantier 5 — Données du défunt (S14+)

1. **matchID (fichier INSEE des décès)** : appel API à la saisie du défunt → vérification + préremplissage. Simple appel REST, faisable en quelques jours — *peut remonter avant si du temps se libère*.
2. **OCR courriers entrants** : upload photo → vision Mistral → extraction (organisme, objet, référence dossier, action demandée) → matching avec le catalogue d'étapes → proposition de réponse. Architecture : pipeline asynchrone (upload → job → résultat), jamais de traitement synchrone dans la requête HTTP. ⚠️ Les courriers contiennent des données très sensibles (santé, banque) → minimisation vers l'IA (même discipline que le questionnaire v2), pas de conservation des images au-delà du besoin, AIPD mise à jour.
3. **Module Découverte (méthode Incogni : mandat + registres + requêtes en lot)** : réutilise intégralement l'infra du Chantier 2 (annuaire `organisations`, `letter_sends`, relances). À ajouter :
   - templates légaux : formulaire AGIRA, demande FICOBA héritier, Ciclade, courrier de découverte art. 85 II LIL (base corrigée par la note juridique du 21/07/2026) ;
   - workflow **mandat** : document généré + signature famille (e-signature simple type Dropbox Sign/Yousign, ou impression-signature-upload en v1) — fallback systématique "préparé par Seren, signé par la famille" ;
   - **vérification d'hérédité bloquante** avant tout envoi de requête découverte : upload livret de famille ou acte de notoriété + pièce d'identité, contrôle humain en v1 (checklist admin), croisement matchID sur le défunt. Aucune requête ne part sans ce feu vert — c'est un point de sécurité, pas d'UX ;
   - tracking des réponses de découverte : chaque réponse positive ("compte trouvé") crée automatiquement les démarches correspondantes dans la roadmap de l'utilisateur.
4. **Open banking (POC, secondaire)** : Powens/Tink en sandbox, compte du survivant co-titulaire uniquement, détection de prélèvements récurrents → suggestions de démarches. Uniquement si le module Découverte est livré et qu'il reste de la capacité.
5. **FranceConnect (timeboxé, 2 semaines d'effort max)** : dossier d'éligibilité DINUM (DataPass) pour connecter l'aidant avec son propre compte. Critère de kill écrit à l'avance.

### Chantier transverse — Sécurité & RGPD (fil rouge, jalons aux S2/S8/S14)

**Réponse à la question pseudonymisation** (le conseil du dev senior) : ton scepticisme est fondé, avec nuance. La pseudonymisation est une mesure reconnue (art. 4-5 RGPD, recommandée par la CNIL) mais ce n'est **pas le chantier prioritaire ici**, pour trois raisons : (1) l'app pratique déjà une vraie minimisation vers l'IA — le rédacteur Mistral ne reçoit que prénom, relation et dernière réponse fermée, jamais le nom ni l'historique — c'est l'esprit de la pseudonymisation appliqué là où ça compte ; (2) pseudonymiser toute la base casserait des fonctions cœur (les courriers *doivent* contenir les vraies identités) pour un gain marginal tant que la RLS est solide ; (3) les vrais risques sont ailleurs (voir liste). **Où la pseudonymisation est pertinente** : les logs, les analytics, les exports de debug, et tout ce qui part vers l'IA — c'est-à-dire en périphérie, pas au centre. À dire au dev senior : "on garde l'idée, appliquée aux flux secondaires ; le cœur est protégé par RLS + chiffrement + minimisation".

Priorités effectives, dans l'ordre :

1. **Tests d'isolation RLS automatisés** (déjà prévus dans `plan-points-attention.md`, jamais écrits) : deux utilisateurs, vérifier que A ne lit jamais les données de B — et, dès le Chantier 4, qu'un partenaire ne lit jamais une famille. À faire tourner en CI.
2. **AIPD (analyse d'impact)** : très probablement requise — personnes en situation de vulnérabilité + données potentiellement sensibles (santé via mutuelle/CPAM, banque) à grande échelle. À rédiger avant le lancement payant ; c'est aussi un argument commercial face aux PF et assureurs.
3. **DPA avec chaque sous-traitant** : Supabase, Mistral, Render, Stripe, Maileva/AR24, Resend, PostHog. Registre des traitements. Mentions d'information complètes (les pages `/legal` et `/security` sont des placeholders).
4. **Chiffrement applicatif** des documents du coffre (en plus du chiffrement au repos de Supabase) et de `transmissions.data` (aujourd'hui questionnaire sérialisé en clair).
5. **Codes d'accès transmission** : policy actuelle = tout utilisateur authentifié possédant un code de 8 caractères hex peut lire ; pas de rate-limit sur `/api/transmission/:code` ; code stocké en clair dans localStorage. → codes plus longs, rate-limit, hachage, expiration.
6. **Données post-mortem** : le RGPD ne s'applique pas aux défunts, mais la loi Informatique et Libertés encadre le sort des données des défunts (art. 84 : extinction des droits ; art. 85 II : droits des héritiers ; art. 86 : traitements de données de défunts) et donne des droits aux héritiers, et les données des *vivants* (l'aidant) sont pleinement couvertes. À intégrer dans la politique de confidentialité et la conception (qui est le "titulaire" d'un dossier de décès partagé entre plusieurs héritiers ? — question de design à trancher en Phase 3/4).
7. Plus tard : MFA, rotation des secrets, pentest avant l'ouverture du canal assurances (Phase 4 produit — les assureurs l'exigeront).

---

## 3. Récapitulatif : efforts et dépendances

| Chantier | Effort (sem.-dev) | Dépend de | Phase produit |
|---|---|---|---|
| 0 · Assainissement | 2 | — | 0 |
| 1 · Paiement Stripe | 1,5 | 0 | 1 |
| 2 · Envoi courriers | 4 | 0, 1 (gating), 3 (pièces jointes) | 1 |
| 3 · Coffre documents | 2 (parallèle à 2) | 0 | 1 |
| 4 · Affiliation PF | 5 | 1 (achats à attribuer) | 2 |
| 5 · Données défunt | 4–6 | 3 (OCR s'appuie sur le coffre) | 3 |
| T · Sécurité/RGPD | ~15 % continu + jalons | fil rouge | toutes |

Total jusqu'à la fin du dispositif PF : **~15 semaines-dev** — cohérent avec un lancement payant vers S8 et un canal PF outillé vers S14, à capacité d'un dev temps plein assisté IA.

**Règle de pilotage** : si la capacité manque, on coupe dans le Chantier 5 (données défunt) et jamais dans le Chantier T (sécurité) ni dans la validation humaine des envois.

---

## 4. Points d'attention techniques consolidés

| # | Point | Gravité | Où |
|---|---|---|---|
| T1 | Paiement actuel contournable (`?payment=success`, lien Stripe test en dur) | 🔴 | Chantier 1 |
| T2 | Drifts schéma↔code (`action_type`, `document_type`) — features probablement cassées en prod | 🔴 | Chantier 0 |
| T3 | Démo transmission : appels API sans auth → 401 systématique | 🟠 | Chantier 0 |
| T4 | Aucune CI malgré 86 tests | 🟠 | Chantier 0 |
| T5 | PII (emails, réponses Mistral) dans les logs serveur | 🟠 | Chantier 0 |
| T6 | Routes `/api/auth/*` mortes avec règle mdp faible (6 car.) | 🟠 | Chantier 0 |
| T7 | Migration pg_cron non appliquée → table sessions en croissance libre | 🟡 | Chantier 0 |
| T8 | Double source de schéma SQL (racine v1 vs migrations v2) | 🟠 | Chantier 0 |
| T9 | Codes transmission 8 car. hex + pas de rate-limit + localStorage en clair | 🟠 | Chantier T |
| T10 | Pas d'environnement de staging (risqué dès qu'il y a paiements/envois réels) | 🟠 | Chantier 0 |
| T11 | README/docs périmés (v1 décrite, plan teal sur la landing) — piège pour tout nouveau contributeur | 🟡 | Chantier 0 |
| T12 | Envois postaux = coûts réels → kill switch + plafonds obligatoires | 🟠 | Chantier 2 |
| T13 | Dashboard PF : isolation RLS partenaire↔familles à tester automatiquement | 🔴 | Chantier 4 |
| T14 | `VITE_*` figées au build (Render) → tout changement de config front = redéploiement | 🟡 | infra |
| T15 | AIPD + DPA + pages légales réelles avant lancement payant | 🔴 | Chantier T |
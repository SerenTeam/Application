# Protocole de tests utilisateurs — Seren

> Protocole de session modérée (45–60 min par participant, en visio ou en présentiel).
> Objectif : observer de vrais utilisateurs dérouler le parcours complet — inscription → questionnaire → roadmap → courrier — et identifier les frictions d'usage et les inconforts émotionnels.

---

## 1. Objectifs du test

Ce que nous cherchons à apprendre (à relire avant chaque session) :

1. **Compréhension** : l'utilisateur comprend-il ce que fait Seren en moins de 30 secondes sur l'écran d'accueil ?
2. **Fluidité du questionnaire** : les ~15 questions sont-elles claires, le ton est-il juste (empathique sans être pesant), le récap donne-t-il confiance ?
3. **Valeur perçue de la roadmap** : la liste d'étapes rassure-t-elle ou submerge-t-elle ? L'utilisateur identifie-t-il par quoi commencer ?
4. **Courriers** : l'utilisateur trouve-t-il, comprend-il et sait-il utiliser un courrier pré-rempli ?
5. **Registre émotionnel** : à quel(s) moment(s) le produit provoque-t-il de l'inconfort, de la confusion ou au contraire du soulagement ?

Ce que nous ne testons **pas** dans cette session : la performance, le prix, la landing page marketing.

---

## 2. Participants

- **Cible** : 5 à 8 participants (les problèmes majeurs émergent dès 5).
- **Profils recherchés** :
  - ayant accompagné des démarches après un décès il y a **plus de 12 mois** (recul émotionnel), OU
  - « proches aidants » susceptibles d'avoir à le faire (45–70 ans, enfant de parent âgé), OU
  - 1–2 profils « naïfs » sans expérience du sujet (test de compréhension pure).
- **À éviter** : personnes en deuil de moins de 6 mois (risque de détresse), proches de l'équipe (biais de complaisance).
- Mixer : à l'aise / peu à l'aise avec le numérique ; desktop / mobile ; 1–2 sessions en anglais si possible (test du toggle FR/EN).

---

## 3. Précautions éthiques (spécifiques à Seren — non négociables)

- [ ] Le participant teste avec un **scénario fictif fourni** (voir §5) — on ne lui demande **jamais** d'utiliser son propre vécu ni ses vraies informations.
- [ ] Annoncer dès l'accueil : *« Le sujet est sensible. Vous pouvez faire une pause ou arrêter à tout moment, sans justification. »*
- [ ] Si le participant évoque spontanément son propre deuil : écouter brièvement, ne pas creuser, ramener doucement au scénario.
- [ ] Signes de détresse (larmes, voix qui se brise, silence prolongé) → proposer une pause immédiatement ; arrêter la session si ça persiste. La session vaut moins que la personne.
- [ ] Aucune donnée personnelle réelle saisie dans l'app (compte de test fourni, persona fictif).

---

## 4. Matériel & préparation (la veille)

- [ ] **Environnement** : instance de test déployée (préprod protégée par mot de passe) OU app en local (`npm run dev:all`). Vérifier que le questionnaire tourne de bout en bout (une session complète de contrôle).
- [ ] **Comptes de test** : créer 1 compte vierge par participant (`usertest01@…`, `usertest02@…`) — le questionnaire et la roadmap doivent partir de zéro pour chacun.
- [ ] **Fiche persona** imprimée/partagée (voir §5).
- [ ] **Enregistrement** : outil de visio avec partage d'écran + enregistrement (consentement en début de session), ou capture d'écran locale.
- [ ] **Grille d'observation** dupliquée pour la session (voir §8).
- [ ] Chronomètre, bloc-notes.
- [ ] Rôles répartis : 1 **facilitateur** (parle, guide, ne juge jamais) + 1 **observateur** (note, chronomètre, ne parle pas). Si vous êtes seul : enregistrer et noter a posteriori.

---

## 5. Fiche persona (à donner au participant)

> À lire au participant et à lui laisser sous les yeux pendant toute la session.

*« Vous allez utiliser Seren en jouant le rôle suivant. Rien de ce que vous saisirez n'est réel. »*

- Vous êtes **l'enfant de Pierre Dupont**, décédé le **15 juin dernier** à 68 ans.
- Pierre était **indépendant** (artisan), **propriétaire** de son logement, il avait **des enfants tous majeurs**.
- Vous ne savez pas s'il avait une **assurance vie** ; il avait souscrit un **contrat obsèques**.
- Vous aviez un **compte bancaire joint** avec lui. Pas de véhicule, pas de crédit en cours, pas d'aide à domicile.
- Aucun notaire n'a encore été contacté ; vous n'avez encore prévenu **aucun organisme**.

(Adapter librement un 2ᵉ persona « conjoint » pour la moitié des sessions : épouse de Pierre, salarié, locataire — cela active d'autres étapes de la roadmap.)

---

## 6. Déroulé de la session (45–60 min)

### Phase 0 — Accueil & cadrage (5 min)

Script du facilitateur :

> « Merci d'être là. On teste **le produit, pas vous** : il n'y a aucune bonne ou mauvaise réponse, et chaque hésitation de votre part est une information précieuse pour nous.
> Je vais vous demander de **penser à voix haute** : dites tout ce qui vous passe par la tête, ce que vous cherchez, ce qui vous surprend.
> Le sujet est sensible — vous pouvez faire une **pause ou arrêter à tout moment**.
> Est-ce que vous m'autorisez à **enregistrer** l'écran et la conversation, uniquement pour notre analyse interne ? »

- [ ] Consentement enregistrement obtenu (oral suffit, le noter).
- [ ] Remettre la fiche persona et la lire ensemble.

### Phase 1 — Questions pré-test (3 min)

1. « Avez-vous déjà eu à gérer des démarches administratives après un décès ? » (sans détailler si non souhaité)
2. « Si oui : qu'est-ce qui a été le plus difficile ? »
3. « À l'aise avec les outils numériques au quotidien ? » (auto-évaluation 1–5)

### Phase 2 — Premier contact (5 min) — *sans consigne*

Ouvrir l'app sur l'écran de connexion/accueil, puis :

> « Sans rien toucher pour l'instant : que pensez-vous que ce site propose ? À qui s'adresse-t-il ? »

Noter les mots employés. Puis : « Allez-y, faites ce qui vous semble naturel. » (identifiants du compte de test fournis quand le participant cherche à se connecter).

### Phase 3 — Tâche 1 : le questionnaire (15 min)

Consigne :

> « En vous appuyant sur la fiche, laissez Seren comprendre votre situation. »

Points d'observation silencieuse (ne pas aider sauf blocage > 1 min) :
- Comprend-il qu'il faut cliquer « Commencer » ?
- Fluidité des réponses ; questions relues plusieurs fois ? lesquelles ?
- Réaction au ton des questions (verbatims !).
- **Au récap** : le lit-il ? Demander : « Modifiez votre réponse sur le compte joint » (test du bouton Modifier).
- Confirme-t-il en confiance ?

### Phase 4 — Tâche 2 : la roadmap (10 min)

Consigne après génération :

> « Vous avez maintenant votre parcours. Prenez-en connaissance… Par quoi commenceriez-vous, concrètement, demain matin ? »

Puis :
1. « Trouvez ce que Seren vous conseille de faire concernant **l'entreprise de votre père**. » (étape URSSAF/guichet unique — teste la recherche dans la liste)
2. « Vous avez déclaré le décès en mairie hier. Indiquez-le à Seren. » (cocher une étape)
3. Question ouverte : « Cette liste vous rassure ou vous décourage ? Pourquoi ? »

### Phase 5 — Tâche 3 : un courrier (8 min)

Consigne :

> « Vous voulez prévenir la banque de Pierre. Voyez si Seren peut vous aider à écrire ce courrier. »

Observer : trouve-t-il l'étape banque → « Générer le courrier » ? Comprend-il les champs à compléter ? Sait-il quoi faire du courrier (copier / PDF) ? Comprend-il que le courrier reste en français s'il est en anglais ?

### Phase 6 — (Optionnel, si temps) Bascule de langue (2 min)

> « Vous préféreriez utiliser ce site en anglais. Faites-le. »

Trouve-t-il le toggle FR/EN ? Réaction à la bascule de la roadmap déjà générée ?

### Phase 7 — Débrief (8 min)

1. « En une phrase, que fait Seren ? » (comparer avec la Phase 2)
2. « Qu'est-ce qui vous a le plus aidé ? Le plus gêné ? »
3. « Y a-t-il un moment où vous vous êtes senti(e) mal à l'aise ? »
4. « Le recommanderiez-vous à un proche qui vient de perdre quelqu'un ? » (0–10 + pourquoi — NPS qualitatif)
5. Auto-évaluation : « La facilité d'utilisation globale, de 1 à 5 ? »
6. « Une chose à changer en priorité ? »

Clôture : remercier, rappeler la confidentialité, (dédommagement le cas échéant).

---

## 7. Règles d'or du facilitateur

- **Ne jamais guider** : répondre aux questions par une question (« Que feriez-vous si je n'étais pas là ? »).
- Laisser les silences vivre ; n'intervenir qu'après **1 minute** de blocage réel.
- Noter les **verbatims exacts** (entre guillemets), pas des paraphrases.
- Ne jamais dire « non, ce n'est pas comme ça » — dire « intéressant, continuez ».
- Ne pas expliquer le produit avant la Phase 7.

---

## 8. Grille d'observation (à dupliquer par participant)

| # | Tâche | Réussite (✔ / ✔ avec aide / ✘) | Temps | Erreurs / hésitations | Verbatims marquants |
|---|-------|--------------------------------|-------|------------------------|---------------------|
| 2 | Compréhension accueil | | | | |
| 3 | Questionnaire complet | | | | |
| 3b | Modifier une réponse au récap | | | | |
| 4a | Trouver l'étape « entreprise » | | | | |
| 4b | Cocher une étape faite | | | | |
| 5 | Générer + exploiter un courrier | | | | |
| 6 | Bascule EN | | | | |

**Échelle émotionnelle** (noter à chaud, par phase) : 😊 soulagé · 😐 neutre · 😕 confus · 😟 mal à l'aise — avec le déclencheur.

---

## 9. Après chaque session (15 min, à chaud)

- [ ] Compléter la grille pendant que c'est frais.
- [ ] Noter les **3 problèmes les plus graves** vus dans la session.
- [ ] Un moment d'inconfort émotionnel ? Le décrire précisément (écran, formulation en cause).

## 10. Synthèse après la vague de tests

- [ ] Consolider tous les problèmes dans un tableau unique : **Problème · Fréquence (x/N participants) · Gravité (bloquant / majeur / mineur) · Piste de correction**.
- [ ] Prioriser : bloquants d'abord, puis fréquence × gravité.
- [ ] Extraire 5–10 verbatims pour l'équipe (et les investisseurs).
- [ ] Décider : corrections → backlog produit ; retester les bloquants à la vague suivante.
- [ ] Supprimer les comptes de test et les enregistrements une fois l'analyse terminée (engagement de confidentialité).

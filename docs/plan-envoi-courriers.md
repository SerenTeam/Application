# Envoi de courriers v1 (canal email) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** L'utilisateur envoie en 1 clic (après relecture) les courriers à canal **email** (employeur, mutuelle) avec PDF joint via **Resend**, et suit le statut (`sent` → `delivered`) dans l'app. Spec : `docs/design-envoi-courriers.md` (v1 uniquement — LRE/papier = v2, portails = v3).

**Architecture:** métadonnée `channel` sur les 10 templates ; table `letter_sends` (RLS owner) ; côté serveur un dispatcher minimal + `EmailSender` (Resend) + génération PDF (jspdf, déjà en dépendance, fonctionne sous Node) ; routes `POST /api/letters/send` (idempotente par `dedup_key`, rate-limitée), `GET /api/letters`, `POST /api/letters/webhook` (publique, signature svix vérifiée à la main — pas de dépendance svix). Frontend : panneau d'envoi dans le flux courrier existant, i18n FR/EN, primitives du design landing. **Les courriers restent français** ; le rédacteur Mistral n'est pas concerné.

**Tech Stack:** + 1 dépendance serveur : `resend`. Vitest/supertest comme l'existant (provider TOUJOURS injecté/faké dans les tests — zéro appel réseau en test).

**Décisions v1 (issues de la spec + périmètre validé le 2026-07-16)** : canal email seul ; coordonnées destinataire saisies manuellement ; frais = zéro (free tier) donc pas de paiement ; templates `lre`/`papier`/`portail` gardent le flux actuel (copie/PDF/« marquer envoyé »).

**Baseline au départ** : `npm test` → 86 passed.

**⚠️ USER STEPS (Arnaud, avant l'E2E live — le code et les tests n'en dépendent pas)** : créer le compte **Resend**, vérifier un domaine d'envoi, créer la clé API et le webhook (endpoint `https://<render>/api/letters/webhook`, events `email.sent`, `email.delivered`, `email.bounced`) ; renseigner les **4 variables** `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, `WEBHOOK_RPC_SECRET` dans `.env` local et sur Render ; **insérer le secret RPC en base** (chaque projet) : `insert into webhook_config (id, rpc_secret) values (1, '<même valeur que WEBHOOK_RPC_SECRET>');` — sans cette ligne, le webhook no-op silencieusement et les statuts restent bloqués à `sent`.

---

### Task 0 : Branche

- [x] **Step 1**
```bash
cd /Users/arnaudgay/Documents/git/Seren/Application
git checkout main && git checkout -b feat/envoi-courriers-v1
npm test   # 86 passed attendus
```

---

### Task 1 : Métadonnée `channel` sur les templates

**Files:**
- Modify: `src/data/letter-templates.ts`
- Test: `tests/letter-templates.test.ts` (nouveau)

- [x] **Step 1 : Test rouge** — `tests/letter-templates.test.ts` :
```typescript
import { describe, it, expect } from 'vitest'
import { LETTER_TEMPLATES } from '../src/data/letter-templates'

const CHANNELS = ['email', 'lre', 'papier', 'portail'] as const

describe('letter templates — canal d\'envoi', () => {
  it('chaque template a un canal valide', () => {
    for (const t of LETTER_TEMPLATES) {
      expect(CHANNELS, `${t.id}: channel manquant/invalide`).toContain(t.channel)
    }
  })
  it('portail ⇒ portal_url en https ; autres canaux ⇒ pas de portal_url', () => {
    for (const t of LETTER_TEMPLATES) {
      if (t.channel === 'portail') expect(t.portal_url, t.id).toMatch(/^https:\/\//)
      else expect(t.portal_url, t.id).toBeUndefined()
    }
  })
  it('v1 : employeur et mutuelle sont en email', () => {
    const emails = LETTER_TEMPLATES.filter((t) => t.channel === 'email').map((t) => t.id)
    expect(emails).toContain('employeur-notification')
    expect(emails).toContain('mutuelle-resiliation')
  })
})
```
(Vérifier les ids réels dans le fichier — adapter si `employeur-notification`/`mutuelle-resiliation` diffèrent.) Run → FAIL.

- [x] **Step 2 : Implémenter** — dans `LetterTemplate` : `channel: 'email' | 'lre' | 'papier' | 'portail'` et `portal_url?: string`. Renseigner les 10 templates d'après leur champ `notes` (source de vérité) : « Email ou courrier simple » → `email` ; « Envoi recommandé avec AR » → `lre` ; « Espace caf.fr / ameli.fr / impots.gouv.fr » → `portail` + `portal_url` (`https://www.caf.fr`, `https://www.ameli.fr`, `https://www.impots.gouv.fr`).

- [x] **Step 3 : Vérifier** — `npm test` → 89 ; `npx tsc --noEmit`.
- [x] **Step 4 : Commit** — `feat(courriers): métadonnée channel sur les templates (routage v1)`

---

### Task 2 : Migration `letter_sends` + store serveur

**Files:**
- Create: `supabase/migrations/20260716120000_letter_sends.sql`, `server/lib/letters-store.js`
- Test: `tests/letters-store.test.ts` (nouveau)

- [x] **Step 1 : Migration** (SQL de la spec + `dedup_key` pour l'idempotence) :
```sql
-- Envois de courriers (v1 : canal email). L'idempotence est portée par dedup_key
-- (hash user+template+corps+destinataire) : un même courrier ne part jamais deux fois.
create table if not exists letter_sends (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  step_id      text,
  template_id  text not null,
  channel      text not null check (channel in ('email','lre','papier','portail')),
  status       text not null default 'sending'
                 check (status in ('sending','sent','delivered','failed')),
  provider     text,
  provider_ref text,
  recipient    jsonb,
  dedup_key    text not null unique,
  error        text,
  sent_at      timestamptz,
  delivered_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table letter_sends enable row level security;
create policy "own sends" on letter_sends
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists letter_sends_user_idx on letter_sends (user_id);
create index if not exists letter_sends_provider_ref_idx on letter_sends (provider_ref);
```
(v1 volontairement sans `roadmap_id`/`tracking_url`/`ar_signed` — champs v2, YAGNI.)
⚠️ USER STEP en fin de plan : `supabase db push` (ou SQL Editor) sur dev/préprod/prod.

- [x] **Step 2 : Store (tests rouges d'abord)** — `server/lib/letters-store.js`, même pattern que `sessions-store.js` (client Supabase utilisateur passé en argument, RLS s'applique) :
```javascript
export async function createSend(client, fields)          // insert → row ; erreur unicité dedup_key → { duplicate: true, existing }
export async function listSends(client, userId)            // select * order by created_at desc
export async function updateSendByProviderRef(client, providerRef, patch) // update status/delivered_at/error
```
Pour le conflit d'unicité : intercepter le code erreur PostgREST `23505` et recharger la ligne existante par `dedup_key`. Tests avec un faux client Supabase (comme `tests/sessions-store.test.ts`).
⚠️ Le webhook n'a PAS de token utilisateur : `updateSendByProviderRef` sera appelé avec le client publishable **sans** session → la RLS le bloquerait. Décision v1 : le webhook fait la mise à jour via une **policy dédiée** ? Non — plus simple et sûr : ajouter à la migration une policy `update` restreinte au rôle service ? Pas de clé service dans ce projet (interdit par CLAUDE.md). **Solution retenue v1** : le webhook met à jour via une fonction SQL `security definer` :
```sql
create or replace function update_letter_send_status(p_provider_ref text, p_status text, p_delivered_at timestamptz default null, p_error text default null)
returns void language sql security definer set search_path = public as $$
  update letter_sends
     set status = p_status,
         delivered_at = coalesce(p_delivered_at, delivered_at),
         error = coalesce(p_error, error),
         updated_at = now()
   where provider_ref = p_provider_ref
     and p_status in ('sent','delivered','failed');
$$;
revoke all on function update_letter_send_status from public;
grant execute on function update_letter_send_status to anon, authenticated;
```
(La fonction n'expose aucune lecture, ne touche que des colonnes de statut, et la véracité vient de la signature du webhook vérifiée côté Express — voir Task 4.) Le store expose `updateSendByProviderRef(client, …)` qui appelle `client.rpc('update_letter_send_status', …)`.

- [x] **Step 3 : Vérifier** — `npm test` (89 + tests store) ; `node --check server/lib/letters-store.js`.
- [x] **Step 4 : Commit** — `feat(courriers): table letter_sends (RLS + dedup) et store serveur`

---

### Task 3 : EmailSender (Resend), PDF, routes send/list

**Files:**
- Create: `server/lib/letter-pdf.js`, `server/lib/email-sender.js`, `server/routes/letters.js`
- Modify: `server/server.js` (monter le router), `package.json` (`npm install resend`), `server/lib/messages.js` (clés des nouveaux messages)
- Test: `tests/letters-routes.test.ts` (nouveau)

- [x] **Step 1 : Tests rouges** — `tests/letters-routes.test.ts`, sur le modèle de `tests/questionnaire-routes.test.ts` (`makeApp()` avec fake store, fake `requireAuth`, et **fake sender injecté**) :
```typescript
// cas à couvrir :
it('send email : 200, PDF généré, sender appelé, insert letter_sends avec status sent + provider_ref')
it('send : template inconnu → 404 ; template non-email (channel lre/portail) → 400 canal non disponible')
it('send : email destinataire invalide → 400')
it('send : corps résolu incomplet ({{variables}} restantes) → 400')
it('idempotence : deuxième send identique → 200 { already_sent: true }, sender appelé UNE fois')
it('échec provider → status failed + error persistés, 502 renvoyé')
it('list : GET /api/letters → envois de l’utilisateur')
```

- [x] **Step 2 : PDF** — `server/lib/letter-pdf.js` : `renderLetterPdf({ subject, body })` → `Buffer` via jspdf (marges A4, police standard, texte multi-lignes avec `splitTextToSize`). Pas de mise en page sophistiquée en v1 (parité avec l'export client suffit).

- [x] **Step 3 : Sender + route** — `server/lib/email-sender.js` :
```javascript
// Adaptateur Resend. `resendClient` injecté (tests : fake). Renvoie { providerRef, status }.
export function createEmailSender({ resendClient, from }) {
  return {
    async send({ pdf, subject, recipientEmail, filename }) {
      const { data, error } = await resendClient.emails.send({
        from, to: recipientEmail, subject,
        text: 'Veuillez trouver ci-joint le courrier.', // corps minimal : le courrier EST la PJ
        attachments: [{ filename, content: pdf.toString('base64') }],
      })
      if (error) throw new Error(error.message ?? 'resend_error')
      return { providerRef: data.id, status: 'sent' }
    },
  }
}
```
`server/routes/letters.js` : `createLettersRouter({ requireAuth, store, emailSender, templates })` — templates = import de `src/data/letter-templates.ts` impossible côté JS serveur : **dupliquer uniquement la carte `{ id → channel }`** ? NON — lire la source de vérité : exporter depuis `src/data/letter-templates.ts` est TS… Décision : le client envoie `template_id` et le serveur valide contre une **carte serveur** `server/lib/letter-channels.js` générée à la main (10 lignes id → channel) avec un TEST DE PARITÉ dans `tests/letter-templates.test.ts` (la carte serveur et les templates TS doivent coïncider — même mécanique que les invariants existants). Route :
  - `POST /send` : `requireAuth` + `createUserRateLimiter({ max: 20, windowMs: 3600000 })` ; body `{ template_id, step_id?, subject, resolved_body, recipient_email }` ; validations (template connu, channel email, email RFC basique, aucun `{{` restant dans `resolved_body`) ; `dedup_key = sha256(user.id|template_id|resolved_body|recipient_email)` ; insert `sending` → `emailSender.send(...)` → update `sent`+`provider_ref` (ou `failed`+`error` → 502) ; conflit dedup → `{ success: true, already_sent: true, send }`.
  - `GET /` : liste.
  - Messages utilisateur via `server/lib/messages.js` (FR/EN — la langue vient de `req.body.lang` validé comme au questionnaire, défaut fr ; ajouter les clés des deux côtés).
Monter dans `server.js` : `app.use('/api/letters', createLettersRouter({ requireAuth, store: lettersStore, emailSender: createEmailSender({ resendClient: new Resend(process.env.RESEND_API_KEY), from: process.env.RESEND_FROM }), ... }))` — instancier Resend **paresseusement** (seulement si la clé existe ; sinon le sender lève `email_not_configured` → 503, message clair).

- [x] **Step 4 : Vérifier** — `npm test` (tous verts) ; `node --check` sur les 4 fichiers serveur ; `npx tsc --noEmit`.
- [x] **Step 5 : Commit** — `feat(courriers): envoi email Resend — PDF serveur, POST /api/letters/send idempotent, GET /api/letters`

---

### Task 4 : Webhook Resend (statuts delivered/bounced)

**Files:**
- Modify: `server/routes/letters.js`, `server/server.js` (raw body pour la route webhook)
- Test: `tests/letters-webhook.test.ts` (nouveau)

- [x] **Step 1 : Tests rouges** — signature svix recalculée dans le test avec le secret de test :
```typescript
it('webhook signé valide email.delivered → status delivered + delivered_at')
it('webhook email.bounced → status failed + error')
it('signature invalide → 401, aucun update')
it('provider_ref inconnu → 200 silencieux (pas d’erreur, pas d’update)')
```

- [x] **Step 2 : Implémenter** — route `POST /webhook` SANS `requireAuth`, montée avec `express.raw({ type: 'application/json' })` (la vérification exige le corps brut). Vérification svix maison (~15 lignes, pas de dépendance) : secret `RESEND_WEBHOOK_SECRET` (`whsec_` + base64) ; signature attendue = `HMAC-SHA256(secret, "{svix-id}.{svix-timestamp}.{body}")` en base64, comparée en temps constant à chaque valeur de l'en-tête `svix-signature` (format `v1,<sig> v1,<sig2>`) ; rejeter si timestamp à ±5 min. Puis mapper `email.sent|email.delivered|email.bounced` → `sent|delivered|failed` et appeler `updateSendByProviderRef` (RPC security definer de la Task 2) avec `data.email_id` comme `provider_ref`. Secret absent → 503.

- [x] **Step 3 : Vérifier** — `npm test` ; `node --check`.
- [x] **Step 4 : Commit** — `feat(courriers): webhook Resend signé — statuts delivered/bounced`

---

### Task 5 : Frontend — envoi 1 clic + suivi (i18n, design landing)

**Files:**
- Modify: `src/components/letter/LetterActions.tsx` (+ `LetterPreview`/`MarkAsSentButton` selon structure réelle), `src/i18n/strings.fr.ts`, `src/i18n/strings.en.ts`, `src/types/` si besoin
- Test: build + vérification navigateur

- [x] **Step 1 : Flux** — pour les templates `channel === 'email'` UNIQUEMENT : dans le panneau courrier (sous `LetterVariablesForm`), un champ « Email du destinataire » (input 52px, label maison) + bouton pilule « Envoyer par email » actif seulement si `isComplete` && email valide ; au clic → `apiFetch('/api/letters/send', { template_id, step_id, subject, resolved_body, recipient_email, lang })` ; états : envoi en cours (bouton loading), succès → `PillBadge` statut (Envoyé / Distribué / Échec + message d'erreur doux), `already_sent` → badge « Déjà envoyé ». Au montage du panneau : `GET /api/letters` filtré par template+step pour réafficher le statut existant. Les autres canaux gardent le flux actuel (copie/PDF/marquer envoyé) — aucun changement pour eux. **Toutes les chaînes via `useT()`** (clés FR+EN nouvelles, domaine `lettersPage.send`). Réutiliser Button/PillBadge existants.
- [ ] **Step 2 : Vérifier** — `npx tsc --noEmit` (parité des clés) ; `npm test` ; `npx vite build` ; navigateur : ouvrir le courrier mutuelle depuis la roadmap (compte test), remplir, cliquer Envoyer → sans clé Resend locale on attend le message « service non configuré » (503) proprement affiché — c'est le comportement voulu hors USER STEP ; vérifier le flux inchangé d'un template `lre` (banque).
- [x] **Step 3 : Commit** — `feat(courriers): envoi email 1 clic + suivi de statut (FR/EN)`

---

### Task 6 : Vérification finale, docs, revue globale, merge

- [x] **Step 1 : Suite complète** — `npx tsc --noEmit && npm test && npx vite build && node --check server/server.js server/routes/letters.js server/lib/letters-store.js server/lib/email-sender.js`
- [ ] **Step 2 : ⚠️ USER STEPS** — compte Resend (domaine vérifié, clé API, webhook → `/api/letters/webhook`, events sent/delivered/bounced) ; env local + Render ; migration `letter_sends` appliquée (`supabase db push` après login/link, ou SQL Editor).
- [ ] **Step 3 : E2E live** (dès la clé fournie) — envoyer le courrier mutuelle à une adresse de test contrôlée, vérifier réception + PJ PDF + passage `sent` → `delivered` via webhook (ou simulateur d'événement Resend), idempotence re-clic.
- [x] **Step 4 : Docs** — CLAUDE.md : variables d'env (`RESEND_*`), section architecture (router letters), état du projet.
- [x] **Step 5 : Revue globale de branche** (contrôleur) puis `superpowers:finishing-a-development-branch` (merge local — Arnaud pushe).

---

**Hors périmètre v1 (v2/v3, cf. spec)** : LRE/papier (Maileva/AR24 — modèle économique à trancher), upload acte de décès + Supabase Storage, annuaire d'organismes, bouton portail, rétention/purge des PJ.

> **Notes post-revue (exécution)** :
> - **Task 3** — deux correctifs de revue : (a) l'idempotence ne protège que les envois ABOUTIS —
>   les lignes `failed`/`sending` périmées sont ré-essayables via `claimRetry` (UPDATE conditionnel
>   atomique, verrou stale 60 s) ; le double-clic concurrent répond 409 `send_in_progress` sans
>   double envoi (course TOCTOU fermée). (b) `RESEND_FROM` manquant → `email_not_configured` (503),
>   pas un faux échec provider.
> - **Task 4** — finding critique de revue corrigé : la RPC `security definer` étant exposée par
>   PostgREST à quiconque a la clé publishable, elle exige désormais un secret partagé vérifié EN BASE
>   (table `webhook_config`, RLS sans policy). Plus : transitions de statut forward-only
>   (`delivered`/`failed` terminaux — les relivraisons désordonnées ne rétrogradent plus rien) et
>   purge de l'erreur périmée quand un envoi finit par aboutir. Pas de rate limiter sur `/webhook`
>   (délibéré : la vérification de signature échoue à bas coût, un plafond punirait les retries
>   légitimes de Resend).
> - **RGPD (backlog v2)** : `letter_sends.recipient` stocke l'email d'un tiers sans TTL — la
>   politique de rétention exigée par la spec §Vigilance reste à définir avec les PJ de la v2.
> - Risque assumé : un utilisateur authentifié peut envoyer un PDF au contenu arbitraire depuis le
>   domaine Seren (corps résolu côté client) — mitigé par auth + 20/h + clic volontaire.

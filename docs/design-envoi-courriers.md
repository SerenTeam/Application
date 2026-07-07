# Design — Envoi automatique des courriers

> Document de conception destiné à un agent d'implémentation.
> Rédigé le 2026-07-07. Contexte projet : voir `CLAUDE.md`.
> Prérequis : traiter d'abord `plan-points-attention.md` §1 (migrations) et §2 (sessions).

## Objectif

Permettre à l'utilisateur d'**envoyer** les courriers pré-remplis générés par Seren (aujourd'hui uniquement prévisualisés/exportés en PDF), avec suivi du statut d'envoi dans le dashboard.

## Décisions verrouillées (issues du brainstorming)

- **Canal : hybride** — chaque courrier est routé vers le bon canal selon l'organisme destinataire.
- **Automatisation : assistée, envoi en 1 clic** — l'utilisateur relit le courrier pré-rempli, complète les infos manquantes, puis clique pour envoyer. Pas d'envoi sans relecture (ces courriers l'engagent juridiquement).

## État existant (à réutiliser)

- Templates : `src/data/letter-templates.ts` — 10 templates `LetterTemplate` avec `{{variables}}` et un champ `notes` qui indique déjà le canal attendu (« Envoi recommandé avec AR », « Email ou courrier simple », « Espace ameli.fr… »).
- Résolution des variables : `src/hooks/useLetterGenerator.ts` (`resolvedLetter`, `isComplete`, `missingVariables`).
- UI courrier : `src/components/letter/` (`LetterPreview`, `LetterVariablesForm`, `LetterActions`, `MarkAsSent`).
- Export PDF : `jspdf` (déjà en dépendance).
- API client : `src/lib/api.ts` (`apiFetch()` gère le Bearer token et les 401).
- Serveur : `server/server.js` (pattern : routes `requireAuth`, `req.supabaseClient` respecte la RLS).

---

## Routage par canal

| Organismes (templates) | Canal | Provider retenu |
|---|---|---|
| Employeur (`employeur-notification`), Mutuelle (`mutuelle-resiliation`) | **Email** (courrier en PDF joint) | **Resend** |
| Banque, Assurance, Assurance-vie, CARSAT, Bailleur | **LRE / LRAR** (recommandé) | **Maileva** (La Poste) |
| CAF, CPAM, Impôts | **Portail en ligne** (pas d'envoi auto possible) | Deep-link + instructions, statut « à faire sur le portail » |

### Providers

- **Resend** (email) — meilleur DX, free tier ~3 000 mails/mois, bonne délivrabilité, PJ supportées. Alternatives : Postmark, SendGrid.
- **Maileva** (Docaposte / groupe La Poste) — une seule API couvre **LRE** (recommandé électronique, valeur juridique du LRAR papier, eIDAS / art. L100 CPCE) **et** le **LRAR papier** en repli. Alternatives : AR24 (LRE pur), Merci Facteur (papier low-cost).

---

## Architecture (pattern adaptateur)

```
Dashboard → [Relire courrier] → [1 clic « Envoyer »]
                                      │
                          POST /api/letters/send
                                      │
                        LetterSender (dispatcher, route par channel)
                     ┌────────────────┼────────────────┐
              EmailSender        LreSender         PortalStep
              (Resend)           (Maileva)         (pas d'envoi : marque « à faire »)
                     └────────────────┼────────────────┘
                          INSERT letter_sends (statut, provider_ref)
                                      │
             POST /api/letters/webhook (provider) → update statut
                                      │
                              Dashboard (suivi : envoyé / reçu / AR signé)
```

Interface commune (serveur) :
```ts
interface LetterSender {
  send(input: {
    letterPdf: Buffer,        // courrier résolu, généré en PDF
    subject: string,
    recipient: RecipientInfo, // email OU adresse postale
    attachments: Buffer[],    // ex. acte de décès
  }): Promise<{ providerRef: string, status: SendStatus, trackingUrl?: string }>
}
```
Implémentations : `EmailSender` (Resend), `LreSender` (Maileva). Le dispatcher choisit d'après `channel` (voir métadonnée template ci-dessous).

---

## Modèle de données (nouvelles tables — via migration Supabase)

```sql
-- Envois de courriers
create table letter_sends (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  roadmap_id   uuid references roadmaps(id) on delete set null,
  step_id      text,                          -- étape de la roadmap concernée
  template_id  text not null,                 -- id du LetterTemplate
  channel      text not null check (channel in ('email','lre','papier','portail')),
  status       text not null default 'draft'  -- draft|sending|sent|delivered|ar_signed|failed
                 check (status in ('draft','sending','sent','delivered','ar_signed','failed')),
  provider     text,                          -- 'resend' | 'maileva'
  provider_ref text,                          -- id d'envoi côté provider (idempotence + webhook)
  recipient    jsonb,                         -- { email } ou { name, address, city, zip }
  tracking_url text,
  error        text,
  sent_at      timestamptz,
  delivered_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table letter_sends enable row level security;
create policy "own sends" on letter_sends
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Pièces jointes (métadonnées ; le binaire va dans Supabase Storage)
create table attachments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null,                 -- ex. 'acte_deces'
  storage_path text not null,                 -- chemin dans le bucket privé
  filename     text,
  created_at   timestamptz not null default now()
);
alter table attachments enable row level security;
create policy "own attachments" on attachments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

**Supabase Storage** : bucket **privé** `documents` pour l'acte de décès (donnée sensible). Policies : accès restreint au propriétaire (`auth.uid()`). Chemin conseillé : `documents/{user_id}/acte_deces_{uuid}.pdf`.

---

## Métadonnée `channel` sur les templates

Ajouter à l'interface `LetterTemplate` (`src/data/letter-templates.ts`) :
```ts
channel: 'email' | 'lre' | 'papier' | 'portail'
portal_url?: string   // si channel === 'portail' (ex. https://www.ameli.fr)
```
Renseigner les 10 templates d'après leur champ `notes` actuel (voir table de routage). Les templates `portail` (CAF/CPAM/Impôts) ne déclenchent pas d'envoi : le bouton devient « Ouvrir le portail » + marquage manuel « fait ».

---

## Routes API (serveur Express, toutes `requireAuth`)

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/api/letters/send` | Reçoit `{ template_id, resolved_body, subject, recipient, attachment_ids }`, génère le PDF, dispatche vers le bon `LetterSender`, insère `letter_sends`. **Idempotent** (clé `provider_ref` / hash pour éviter double envoi). |
| GET | `/api/letters` | Liste les envois de l'utilisateur (pour le suivi dashboard). |
| POST | `/api/attachments` | Upload d'une PJ (acte de décès) → Supabase Storage → insert `attachments`. |
| POST | `/api/letters/webhook` | Endpoint public signé recevant les callbacks provider (Resend / Maileva) → met à jour `status`, `delivered_at`, `ar_signed`. Vérifier la signature du provider. |

Génération PDF côté serveur : réutiliser la logique de résolution des variables (extraire de `useLetterGenerator.ts` une fonction pure partageable, ou envoyer le `resolved_body` déjà résolu depuis le front et générer le PDF avec `jspdf` côté serveur).

---

## Frontend — flux « 1 clic »

1. Depuis la roadmap/dashboard, l'utilisateur ouvre un courrier (`LetterPreview` existant).
2. `LetterVariablesForm` : compléter les variables non auto-remplies (ex. `organisme_name`, `account_number`) **et** les coordonnées destinataire (email OU adresse postale, selon `channel`).
3. Si `channel ∈ {lre, papier}` : composant d'upload de l'**acte de décès** (→ `/api/attachments`), obligatoire.
4. Bouton **« Envoyer »** (dans `LetterActions`) → `apiFetch('/api/letters/send', …)`.
5. Retour de statut, affichage du suivi (remplace/complète `MarkAsSent`) : `sent` → `delivered` → `ar_signed`.

---

## Vigilance juridique / RGPD (à respecter à l'implémentation)

- **Mandat/consentement** : l'envoi doit résulter d'une action explicite de l'utilisateur (le clic) ; conserver la trace (horodatage dans `letter_sends`).
- **LRE qualifiée eIDAS** : n'utiliser que des offres LRE qualifiées (Maileva/AR24 le sont).
- **Donnée sensible** : l'acte de décès et les données personnelles → bucket privé, RLS stricte, **politique de rétention** (purge après X mois), **DPA** signé avec chaque provider.
- **Idempotence** : `/api/letters/send` ne doit jamais envoyer deux fois le même courrier (contrainte d'unicité ou vérification `provider_ref`).
- **Coûts** (répercutés à l'utilisateur ou absorbés = décision business) : Email ~0 (free tier) · LRE ~3-4 €/envoi · LRAR papier ~5-7 €/envoi.

---

## Plan d'implémentation par étapes

### v1 — canal Email (tranche fine, valide le flux de bout en bout)
1. Ajouter `channel` aux templates ; compte Resend + var d'env.
2. Migration : `letter_sends` (+ RLS).
3. Route `POST /api/letters/send` limitée au canal email (EmailSender/Resend), génération PDF, insert `letter_sends`.
4. Route `GET /api/letters` + suivi dans le dashboard.
5. Frontend : saisie email destinataire + bouton « Envoyer » sur les templates `email` (employeur, mutuelle).
6. Webhook Resend → statut `delivered`.
**Critère de fin v1** : envoyer le courrier employeur/mutuelle par email avec PDF joint, voir le statut passer à `delivered`.

### v2 — LRE / papier + pièces jointes
1. Supabase Storage (bucket privé) + migration `attachments` + route `POST /api/attachments`.
2. Upload acte de décès dans le flux (obligatoire pour lre/papier).
3. `LreSender` (Maileva) + routage dispatcher.
4. Webhook Maileva → statuts `sent` / `delivered` / `ar_signed` + `tracking_url`.
**Critère de fin v2** : envoyer un courrier banque en LRE avec acte de décès joint, suivre l'AR jusqu'à signature.

### v3 — portails
1. Templates `portail` → bouton « Ouvrir le portail » (`portal_url`) + marquage manuel « fait » (statut hors envoi).

---

## Variables d'environnement à ajouter

```env
# Email (v1)
RESEND_API_KEY=re_xxx
RESEND_FROM=courriers@seren.xxx

# LRE / papier (v2)
MAILEVA_API_KEY=xxx
MAILEVA_API_URL=https://api.maileva.com/...

# Webhooks (vérification de signature)
RESEND_WEBHOOK_SECRET=xxx
MAILEVA_WEBHOOK_SECRET=xxx
```
Mettre à jour la section « Variables d'environnement » de `CLAUDE.md`.

---

## Questions ouvertes (décisions humaines avant implémentation)

- **Modèle économique** : les frais d'envoi (LRE/papier) sont-ils facturés à l'utilisateur, inclus dans un abonnement, ou absorbés ? Impacte l'ajout éventuel d'un paiement (Stripe) avant l'envoi.
- **Coordonnées des organismes** : saisies manuellement par l'utilisateur (v1) ou constitution d'un annuaire (banques, CARSAT régionales…) ? v1 = saisie manuelle.
- **Provider LRE définitif** : Maileva (LRE + papier unifiés) vs AR24 (LRE pur, API souvent jugée plus simple). Trancher avant v2 selon tarifs négociés et besoin réel de repli papier.

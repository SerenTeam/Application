// Reprise automatique d'un envoi papier après le retour de Stripe Checkout (chantier 2a, Task 11,
// legs R1 de la revue Task 9). Le clic « Acheter un envoi » quitte la page pour de bon (Checkout
// hébergé) : tout état React en mémoire (adresse saisie, pièces jointes sélectionnées) disparaît.
// Ce module persiste EXACTEMENT la requête qui a été refusée en 402 QUOTA_EXHAUSTED dans
// `sessionStorage`, pour la rejouer UNE SEULE fois au retour — jamais une requête reconstruite
// différemment (les PJ, en particulier, doivent rester identiques : legs R2 côté serveur les
// refuserait sinon en 409 ATTACHMENTS_MISMATCH).
//
// `sessionStorage` (pas `localStorage`) : la reprise n'a de sens que pour CET aller-retour
// Checkout, jamais pour une session ultérieure.

export interface RecipientAddress {
  name: string
  address_line1: string
  address_line2?: string
  postal_code: string
  city: string
}

export interface PaperSendPayload {
  template_id: string
  step_id: string | null
  variables: Record<string, string>
  recipient: RecipientAddress
  attachment_ids: string[]
  resend_of?: string | null
}

interface PendingPaperSend {
  templateId: string
  stepId: string
  payload: PaperSendPayload
  retryAfterSeconds: number
}

const STORAGE_KEY = 'seren:pending-paper-send'
// Valeur du paramètre `checkout` posée par le success_url de POST /api/payments/checkout-extra-send
// (server/routes/payments.js) — distincte de 'success' (retour du forfait, CheckoutReturnBanner).
const RESUME_CHECKOUT_VALUE = 'extra_success'

function readPending(): PendingPaperSend | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PendingPaperSend) : null
  } catch {
    return null
  }
}

/** À appeler juste avant `window.location.href = <url Checkout>`. `retryAfterSeconds` vient du
 * 402 (legs R1, `retry_after_seconds`) : c'est la même fenêtre que la reprise en base réutilisera
 * pour patienter si le retour est trop rapide (SEND_IN_PROGRESS, garde 7 bis encore chaude). */
export function savePendingPaperSend(
  templateId: string,
  stepId: string,
  payload: PaperSendPayload,
  retryAfterSeconds: number
) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ templateId, stepId, payload, retryAfterSeconds }))
  } catch {
    // Stockage indisponible (navigation privée stricte…) : pas d'auto-retry au retour, l'achat
    // reste valable, l'utilisateur relance simplement l'envoi lui-même — jamais bloquant.
  }
}

export function clearPendingPaperSend() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // idem — rien à nettoyer si le stockage n'a jamais pu écrire.
  }
}

/** Lecture NON destructive : sert uniquement à décider, au montage, si CE courrier (même modèle
 * + même étape) doit se ré-ouvrir automatiquement après un retour de Checkout — avant même que
 * le panneau d'envoi lui-même ne soit monté pour consommer la reprise. */
export function shouldAutoResumePaperSend(templateId: string, stepId: string): boolean {
  if (typeof window === 'undefined') return false
  if (!window.location.search.includes(`checkout=${RESUME_CHECKOUT_VALUE}`)) return false
  const pending = readPending()
  return !!pending && pending.templateId === templateId && pending.stepId === stepId
}

/** Même garde, mais SANS connaître le courrier concerné — utilisée au niveau de la page (choix
 * de l'onglet initial du dashboard) : la reprise vit dans la vue « roadmap », repliée par
 * défaut ; sans forcer cet onglet au premier rendu, PaperSendPanel ne serait jamais remonté et
 * la reprise automatique (legs R1) resterait lettre morte. */
export function hasPendingPaperSendForCheckoutReturn(): boolean {
  if (typeof window === 'undefined') return false
  if (!window.location.search.includes(`checkout=${RESUME_CHECKOUT_VALUE}`)) return false
  return readPending() !== null
}

/** Consommation UNIQUE de la reprise (destructive — un second appel renvoie `null`, y compris en
 * React StrictMode où les effets sont invoqués deux fois en développement). `checkoutParam` est
 * la valeur EXACTE lue par `useSearchParams` (react-router), pas une relecture de `location`. */
export function takePendingPaperSend(
  templateId: string,
  stepId: string,
  checkoutParam: string | null
): PendingPaperSend | null {
  if (checkoutParam !== RESUME_CHECKOUT_VALUE) return null
  const pending = readPending()
  if (!pending || pending.templateId !== templateId || pending.stepId !== stepId) return null
  clearPendingPaperSend()
  return pending
}

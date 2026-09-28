import type { RecipientAddress } from '@/lib/paper-send-resume'

// Adresse du destinataire d'un envoi papier (chantier 2a) : pré-remplissage depuis l'annuaire et
// validation côté client. Le serveur revalide tout (garde 4 de POST /api/letters/send, règle
// portée par server/lib/paper-sender.js) : ici, ce n'est qu'un guide pour l'interface.

export const LINE_MAX = 45
const POSTAL_CODE_RE = /^[0-9]{5}$/

/** Organisme de l'annuaire tel que renvoyé par GET /api/letters/organisations. */
export interface Organisation {
  id: string
  // Nom officiel DILA (jusqu'à 88 caractères) : libellé de la liste déroulante seulement.
  name: string
  // Nom calculé par le serveur pour tenir sur une ligne d'enveloppe (server/lib/organisations.js).
  envelope_name: string
  address_line1: string
  address_line2?: string | null
  postal_code: string
  city: string
}

/** Adresse proposée par l'annuaire pour un organisme — modifiable ensuite par la famille. */
export function recipientFromOrganisation(org: Organisation): RecipientAddress {
  return {
    name: org.envelope_name,
    address_line1: org.address_line1,
    address_line2: org.address_line2 ?? undefined,
    postal_code: org.postal_code,
    city: org.city,
  }
}

export function recipientValid(r: RecipientAddress): boolean {
  return (
    r.name.trim().length > 0 &&
    r.name.length <= LINE_MAX &&
    r.address_line1.trim().length > 0 &&
    r.address_line1.length <= LINE_MAX &&
    (r.address_line2 ?? '').length <= LINE_MAX &&
    POSTAL_CODE_RE.test(r.postal_code.trim()) &&
    r.city.trim().length > 0 &&
    r.city.length <= LINE_MAX
  )
}

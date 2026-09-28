import { createContext, useContext } from 'react'
import type { LetterAutofill } from '@/lib/letter-autofill'
import type { LetterProfileRow } from '@/lib/letter-profile'
import type { RelationV2 } from '@/types/questionnaire'

// Profil courrier partagé par le tableau de bord (personnalisation v2, spec §4.7) : une seule source
// pour le pré-remplissage des courriers (StepLetterSection) et pour l'expéditeur de l'envoi papier
// (PaperSendPanel). Enregistrer le profil depuis le panneau d'envoi met aussitôt à jour les courriers
// ouverts : l'adresse sous la signature et celle de l'enveloppe ne peuvent plus diverger. Le nom non
// plus pour un profil v2 (prénom et nom séparés) ; un profil du 2a, qui n'a que `full_name` tant
// qu'il n'est pas réenregistré, signe encore avec les noms du dossier PF alors que l'enveloppe porte
// `full_name`.
export interface LetterProfileContextValue {
  profile: LetterProfileRow | null
  relation: RelationV2 | undefined
  deceasedFirstName: string | undefined
  autofill: LetterAutofill
  onProfileSaved: (profile: LetterProfileRow) => void
}

export const LetterProfileContext = createContext<LetterProfileContextValue | null>(null)

/** null hors du tableau de bord : les consommateurs gardent alors leur comportement autonome. */
export function useLetterProfileContext(): LetterProfileContextValue | null {
  return useContext(LetterProfileContext)
}

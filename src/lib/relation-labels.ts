import type { RelationV2 } from '@/types/questionnaire'

// Lien écrit dans les courriers — toujours en français (les courriers vont à des organismes
// français). `relation` (questionnaire) dit qui était le défunt POUR l'utilisateur ; le courrier
// écrit ce qu'est l'utilisateur POUR le défunt : « parent » (mon père ou ma mère) → « fils / fille ».
// Le genre n'est jamais deviné : la personne choisit (spec docs/design-personnalisation-v2.md §4.6).
export interface RelationLabelOption {
  value: string // mot français enregistré (sender_profiles.relationship) et écrit dans le courrier
  label: { fr: string; en: string } // FR : le mot seul ; EN : le mot suivi d'une glose
}

function option(value: string, gloss: string): RelationLabelOption {
  return { value, label: { fr: value, en: `${value} — ${gloss}` } }
}

const OPTIONS: Record<Exclude<RelationV2, 'autre'>, RelationLabelOption[]> = {
  conjoint_marie: [option('époux', 'husband'), option('épouse', 'wife')],
  pacse: [option('partenaire de PACS', 'PACS partner')],
  concubin: [option('concubin', 'partner (man)'), option('concubine', 'partner (woman)')],
  parent: [option('fils', 'son'), option('fille', 'daughter')],
  enfant: [option('père', 'father'), option('mère', 'mother')],
  frere_soeur: [option('frère', 'brother'), option('sœur', 'sister')],
}

/** Choix « Vous signez en tant que ». null = saisie libre (relation « autre » ou inconnue). */
export function relationLabelOptions(relation: RelationV2 | undefined): RelationLabelOption[] | null {
  if (!relation || relation === 'autre') return null
  // OPTIONS[relation] résoudrait aussi les clés héritées du prototype (ex. relation === 'constructor'
  // ou 'hasOwnProperty') : hasOwnProperty exclut ces clés qui n'ont jamais été posées sur l'objet.
  if (!Object.prototype.hasOwnProperty.call(OPTIONS, relation)) return null
  return OPTIONS[relation as keyof typeof OPTIONS]
}

/** Valeur retenue sans intervention : seule une forme unique, donc sans ambiguïté de genre (PACS). */
export function defaultRelationLabel(relation: RelationV2 | undefined): string {
  const options = relationLabelOptions(relation)
  return options && options.length === 1 ? options[0].value : ''
}

/**
 * Lien enregistré ramené à la forme proposée équivalente, casse et accents ignorés (saisie libre du
 * chantier 2a, ex. « Fille » → « fille ») ; sinon renvoyé tel quel, sans espaces autour.
 */
export function normalizeRelationLabel(relation: RelationV2 | undefined, saved: string): string {
  const value = saved.trim()
  if (!value) return ''
  const match = relationLabelOptions(relation)?.find(
    (option) => option.value.localeCompare(value, 'fr', { sensitivity: 'base' }) === 0
  )
  return match?.value ?? value
}

/**
 * Vrai quand le lien se saisit librement : relation « autre » ou inconnue, ou lien enregistré hors des
 * formes proposées (relation modifiée par un nouveau questionnaire…) — il reste alors visible et
 * modifiable, au lieu d'un groupe de boutons dont aucun n'est sélectionné.
 */
export function isFreeRelationLabel(relation: RelationV2 | undefined, value: string): boolean {
  const options = relationLabelOptions(relation)
  return !options || (value !== '' && !options.some((option) => option.value === value))
}

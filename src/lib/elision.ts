// Élision de « de » devant une valeur saisie (prénom du défunt dans les courriers et dans l'interface
// FR) : « fille d'Anne Martin », jamais « fille de Anne Martin ». Règle retenue par Arnaud le 2026-09-28 :
// « d' » devant une voyelle (accentuée ou non, æ, œ), devant un y suivi d'une consonne (Yves, Yvonne :
// le y s'y prononce i) et devant un h muet, reconnu par la liste ci-dessous ; « de » partout ailleurs :
// h aspiré (Hugues, Hassan, Hans), y suivi d'une voyelle (Yann, Yasmine), consonne, valeur vide ou
// repli « [PRÉNOM DU DÉFUNT] ». La valeur est lue telle quelle : une espace en tête empêche l'élision.
// Dans un modèle, la règle vaut pour toute valeur placée après « de », pas seulement le prénom (un
// libellé « … de {{organisme_name}} » donne « d'AXA ») ; la liste des h muets ne connaît que des
// prénoms : un organisme en h garde « de ».
// Miroir exact : server/lib/elision.js (parité testée dans tests/letter-elision.test.ts).

// Prénoms à h muet, sans accents ni majuscules. Un prénom en h absent de la liste garde « de » :
// l'erreur possible se limite à un h muet oublié, à ajouter ici ET dans le miroir serveur.
export const MUTE_H_FIRST_NAMES: ReadonlySet<string> = new Set([
  'hadrien', 'hector', 'helena', 'helene', 'helie', 'heloise', 'henri', 'henriette', 'henry', 'hermance',
  'hermine', 'hermione', 'herve', 'hilaire', 'hilarion', 'hippolyte', 'honorat', 'honore', 'honorine', 'horace',
  'hortense', 'hubert', 'hugo', 'huguette', 'hyacinthe',
])

const VOWELS = 'aeiouæœ'
const Y_BEFORE_CONSONANT_RE = /^y[bcdfghjklmnpqrstvwxz]/

// Minuscules sans accents : « Hélène » → « helene », « Œdipe » → « œdipe » (œ et æ ne se décomposent pas).
function plain(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export function elidesDe(value: string): boolean {
  const text = plain(value)
  const first = text.charAt(0)
  if (!first) return false
  if (VOWELS.includes(first)) return true
  if (first === 'y') return Y_BEFORE_CONSONANT_RE.test(text)
  // Prénom composé : seul le premier élément compte (« Henri-Pierre »).
  if (first === 'h') return MUTE_H_FIRST_NAMES.has(text.split(/[\s-]/)[0])
  return false
}

/**
 * « de » ou « d' » accolé à la valeur : « de Jean », « d'Anne ». Apostrophe droite par défaut, celle
 * des courriers ; les textes d'interface FR passent l'apostrophe typographique de leurs dictionnaires.
 */
export function withDe(value: string, apostrophe: "'" | '’' = "'"): string {
  return elidesDe(value) ? `d${apostrophe}${value}` : `de ${value}`
}

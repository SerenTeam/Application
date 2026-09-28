// Miroir exact de src/lib/elision.ts (parité testée dans tests/letter-elision.test.ts) : élision de
// « de » devant une valeur saisie, pour le corps regénéré à l'envoi papier (letter-render.js). Règle
// retenue par Arnaud le 2026-09-28 : « d' » devant une voyelle (accentuée ou non, æ, œ), devant un y
// suivi d'une consonne (Yves, Yvonne) et devant un h muet, reconnu par la liste ci-dessous ; « de »
// partout ailleurs (h aspiré, y suivi d'une voyelle, consonne, valeur vide ou repli « [CLÉ] »).

// Prénoms à h muet, sans accents ni majuscules — liste identique au client.
export const MUTE_H_FIRST_NAMES = new Set([
  'hadrien', 'hector', 'helena', 'helene', 'helie', 'heloise', 'henri', 'henriette', 'henry', 'hermance',
  'hermine', 'hermione', 'herve', 'hilaire', 'hilarion', 'hippolyte', 'honorat', 'honore', 'honorine', 'horace',
  'hortense', 'hubert', 'hugo', 'huguette', 'hyacinthe',
])

const VOWELS = 'aeiouæœ'
const Y_BEFORE_CONSONANT_RE = /^y[bcdfghjklmnpqrstvwxz]/

function plain(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export function elidesDe(value) {
  const text = plain(value)
  const first = text.charAt(0)
  if (!first) return false
  if (VOWELS.includes(first)) return true
  if (first === 'y') return Y_BEFORE_CONSONANT_RE.test(text)
  if (first === 'h') return MUTE_H_FIRST_NAMES.has(text.split(/[\s-]/)[0])
  return false
}

/** « de » ou « d' » accolé à la valeur : « de Jean », « d'Anne » (apostrophe droite des courriers par défaut). */
export function withDe(value, apostrophe = "'") {
  return elidesDe(value) ? `d${apostrophe}${value}` : `de ${value}`
}

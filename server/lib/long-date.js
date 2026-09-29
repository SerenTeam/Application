// Miroir exact de src/lib/long-date.ts (parité testée dans tests/long-date.test.ts) : date en toutes
// lettres, « 1er » pour le premier jour du mois en français (« 1er octobre 2026 »), jamais d'ordinal
// en anglais (« 1 October 2026 »). Sert à l'e-mail d'invitation ; les dates des courriers arrivent,
// elles, déjà écrites par le client (buildInitialValues de useLetterGenerator).
const DEFAULT_OPTIONS = { day: 'numeric', month: 'long', year: 'numeric' }

/**
 * @param {Date} date — valide (Intl lève une RangeError sinon)
 * @param {'fr' | 'en'} lang
 * @param {Intl.DateTimeFormatOptions} [options] — complète le format par défaut (fuseau, heure…)
 * @returns {string}
 */
export function formatLongDate(date, lang, options = {}) {
  const french = lang !== 'en'
  return new Intl.DateTimeFormat(french ? 'fr-FR' : 'en-GB', { ...DEFAULT_OPTIONS, ...options })
    .formatToParts(date)
    .map(({ type, value }) => (french && type === 'day' && value === '1' ? '1er' : value))
    .join('')
}

import type { Lang } from '@/i18n'

// Date en toutes lettres, dans la langue voulue : « 1er mars 1941 », « 14 mars 1941 » en français,
// « 1 March 1941 » en anglais (en-GB, jamais d'ordinal). Typographie française : le premier jour du
// mois est un ordinal, « 1er » ; les autres jours restent des nombres (« 11 », « 21 », jamais « 21er »).
// Le « er » reste sur la ligne, sans exposant : la police standard des PDF de courrier (jsPDF,
// Helvetica) n'a pas de « ʳ », et un seul caractère hors de son jeu brouille toute la ligne. Le jour
// est lu dans la partie `day` de formatToParts, jamais par une regex sur le texte formaté.
// `options` complète le format par défaut (jour, mois en toutes lettres, année) : fuseau, heure… La
// date doit être valide (Intl lève une RangeError sinon) : c'est à l'appelant de la contrôler.
// Miroir exact : server/lib/long-date.js (parité testée dans tests/long-date.test.ts).
const DEFAULT_OPTIONS: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }

export function formatLongDate(date: Date, lang: Lang, options: Intl.DateTimeFormatOptions = {}): string {
  const french = lang !== 'en'
  return new Intl.DateTimeFormat(french ? 'fr-FR' : 'en-GB', { ...DEFAULT_OPTIONS, ...options })
    .formatToParts(date)
    .map(({ type, value }) => (french && type === 'day' && value === '1' ? '1er' : value))
    .join('')
}

// Annuaire des organismes (chantier 2a) : nom à imprimer sur l'enveloppe.
//
// `organisations.name` est le nom officiel publié par la DILA (44 à 88 caractères), alors qu'une
// ligne d'enveloppe en admet 45 (règle portée par paper-sender.js). Recopié tel quel, il
// bloquait l'envoi de 312 organismes sur 321, dont les 20 CARSAT (défaut du 2026-09-28).
// Décision d'Arnaud : garder le nom officiel s'il tient, sinon la forme courte
// « SIGLE territoire » tirée du sigle que l'organisme publie lui-même entre parenthèses
// (« Carsat Midi-Pyrénées ») — la règle `deriveAcronymLine` de scripts/import-organisations.mjs,
// calculée à la lecture plutôt que stockée : aucune migration. Elle tient pour les 321 organismes
// du seed (tests/organisations.test.ts).
import { LINE_MAX } from './paper-sender.js'

const ACRONYM_RE = /\(([^)]+)\)\s*(.+)$/

/** Nom d'enveloppe d'un organisme : jamais tronqué — sans forme courte qui tienne, le nom
 * officiel est rendu tel quel, la garde 4 de POST /api/letters/send le refusera et le
 * formulaire le signale à la famille. */
export function envelopeNameOf(officialName) {
  if (officialName.length <= LINE_MAX) return officialName
  const match = officialName.match(ACRONYM_RE)
  if (!match) return officialName
  const acronym = match[1].trim()
  const territory = match[2].trim().replace(/^[-–—]\s*/, '')
  const short = `${acronym} ${territory}`
  return acronym && territory && short.length <= LINE_MAX ? short : officialName
}

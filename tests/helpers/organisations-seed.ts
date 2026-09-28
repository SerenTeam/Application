import { readFileSync } from 'node:fs'
import path from 'node:path'

// Lecture du VRAI seed de l'annuaire (supabase/migrations/20260914110000_organisations_seed.sql,
// 321 organismes DILA) pour les tests : les fixtures écrites à la main (« CPAM de Paris »,
// « CARSAT Bretagne ») avaient masqué que les noms officiels dépassent les 45 caractères d'une
// ligne d'enveloppe. Aucun accès réseau ni base : le fichier de migration est la source.

export interface SeedOrganisation {
  id: string
  name: string
  kind: string
  network: 'caf' | 'cpam' | 'carsat' | 'impots'
  department: string | null
  address_line1: string
  address_line2: string | null
  postal_code: string
  city: string
}

export const ORGANISATIONS_SEED_PATH = path.resolve(
  __dirname,
  '../../supabase/migrations/20260914110000_organisations_seed.sql'
)

/** Découpe un tuple SQL `('a', null, date '2026-09-13', 'l''apostrophe')` en valeurs. */
function parseTuple(inner: string): Array<string | null> {
  const values: Array<string | null> = []
  let i = 0
  while (i < inner.length) {
    const c = inner[i]
    if (c === ' ' || c === ',') {
      i += 1
    } else if (inner.startsWith('null', i)) {
      values.push(null)
      i += 4
    } else if (inner.startsWith('date ', i)) {
      i += 5
    } else if (c === "'") {
      let j = i + 1
      let out = ''
      while (j < inner.length) {
        if (inner[j] === "'" && inner[j + 1] === "'") {
          out += "'"
          j += 2
        } else if (inner[j] === "'") {
          break
        } else {
          out += inner[j]
          j += 1
        }
      }
      if (j >= inner.length) throw new Error(`Chaîne SQL non terminée : ${inner.slice(i, i + 40)}`)
      values.push(out)
      i = j + 1
    } else {
      throw new Error(`Jeton SQL inattendu : ${inner.slice(i, i + 40)}`)
    }
  }
  return values
}

export function loadOrganisationsSeed(): SeedOrganisation[] {
  const sql = readFileSync(ORGANISATIONS_SEED_PATH, 'utf8')
  const header = sql.match(/insert into organisations \(([^)]+)\) values/)
  if (!header) throw new Error('En-tête INSERT introuvable dans le seed des organisations')
  const columns = header[1].split(',').map((c) => c.trim())

  const rows: SeedOrganisation[] = []
  for (const line of sql.split('\n')) {
    const tuple = line.match(/^\s*\((.*)\),?$/)
    if (!tuple) continue
    const values = parseTuple(tuple[1])
    if (values.length !== columns.length) {
      throw new Error(`Tuple à ${values.length} valeurs pour ${columns.length} colonnes : ${line.slice(0, 60)}`)
    }
    const record = Object.fromEntries(columns.map((col, k) => [col, values[k]]))
    rows.push(record as unknown as SeedOrganisation)
  }
  return rows
}

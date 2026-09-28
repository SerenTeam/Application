import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { createElement as h, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useLetterGenerator } from '@/hooks/useLetterGenerator'
import { formatLetterValue } from '@/data/letter-templates'
// @ts-expect-error — module JS serveur
import { renderLetter, renderTemplate } from '../server/lib/letter-render.js'

// Défaut rc2 (démo) : « né(e) le 1946-03-14 » dans le courrier. Un champ `type: 'date'` resté vide
// au pré-remplissage est saisi dans un <input type="date">, qui renvoie l'ISO AAAA-MM-JJ ; seul le
// pré-remplissage (formatDate de useLetterGenerator) formatait. Correctif : toute valeur ISO
// AAAA-MM-JJ est rendue JJ/MM/AAAA AU RENDU (aperçu client ET corps regénéré serveur), la valeur
// stockée restant l'ISO.

const IMPOTS_VALUES: Record<string, string> = {
  organisme_name: 'Lyon',
  user_firstname: 'Claire',
  user_lastname: 'Martin',
  user_relation: 'fille',
  deceased_firstname: 'Jean',
  deceased_lastname: 'Martin',
  deceased_dob: '1946-03-14',
  deceased_dod: '10 janvier 2026',
  user_address: '12 rue des Lilas',
  city: 'Lyon',
  today_date: '17 septembre 2026',
}

// Hôte minimal pour react-dom en environnement node : le composant sonde ne rend aucun élément DOM.
// Aucune attente à délai fixe : chaque étape attend (vi.waitFor) la condition qu'elle prépare.
const fakeDocument = { addEventListener() {}, removeEventListener() {} }
const container = { nodeType: 1, nodeName: 'DIV', tagName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml', ownerDocument: fakeDocument, textContent: '', addEventListener() {}, removeEventListener() {} }

describe('courriers — date ISO saisie rendue JJ/MM/AAAA', () => {
  let root: Root | null = null
  const globals = globalThis as Record<string, unknown>

  beforeAll(() => {
    globals.window = { HTMLIFrameElement: class {} }
  })
  afterAll(() => {
    root?.unmount()
    delete globals.window
  })

  it('client (aperçu useLetterGenerator) : « né(e) le 14/03/1946 », valeur stockée intacte', async () => {
    let generator: ReturnType<typeof useLetterGenerator> | null = null
    let mounted = false
    function Probe() {
      generator = useLetterGenerator({ templateId: 'impots-notification' })
      useEffect(() => {
        mounted = true
      }, [])
      return null
    }
    root = createRoot(container as unknown as Element)
    root.render(h(Probe))
    // Sonde montée : rendu validé et effets de montage passés (ceux du hook compris, déclarés avant).
    await vi.waitFor(() => expect(mounted).toBe(true))

    // Saisie du champ date (valeur renvoyée par <input type="date">).
    generator!.setVariable('deceased_dob', '1946-03-14')
    // Valeur rendue : la sonde a reçu le générateur à jour (l'aperçu est un useMemo de ces valeurs).
    await vi.waitFor(() => expect(generator!.values.deceased_dob).toBe('1946-03-14'))

    expect(generator!.resolvedLetter).toContain('né(e) le 14/03/1946')
    expect(generator!.resolvedLetter).not.toContain('1946-03-14')
    expect(generator!.values.deceased_dob).toBe('1946-03-14')
  })

  it('serveur (corps regénéré renderLetter) : « né(e) le 14/03/1946 »', () => {
    const { body, missingVariables } = renderLetter('impots-notification', IMPOTS_VALUES)
    expect(missingVariables).toEqual([])
    expect(body).toContain('né(e) le 14/03/1946')
    expect(body).not.toContain('1946-03-14')
  })

  it('valeurs non ISO inchangées (dates pré-remplies en toutes lettres, texte libre)', () => {
    expect(formatLetterValue('14 mars 1946')).toBe('14 mars 1946')
    expect(formatLetterValue('Lyon')).toBe('Lyon')
    expect(formatLetterValue('')).toBe('')
    expect(formatLetterValue(undefined)).toBeUndefined()
  })

  it('parité client ↔ serveur sur chaque valeur', () => {
    const forged = { id: 'forged-date', subject: '{{v}}', recipient_label: '{{v}}', body: '{{v}}', variables: ['v'] }
    for (const input of ['1946-03-14', '2026-01-10', '14 mars 1946', '1946-3-14', '1946-03-14T00:00:00Z', 'le 1946-03-14', 'Lyon']) {
      const { body } = renderTemplate(forged, { v: input })
      expect(body, input).toBe(formatLetterValue(input))
    }
    expect(formatLetterValue('2026-01-10')).toBe('10/01/2026')
  })
})

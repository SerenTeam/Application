import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { createElement as h, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { useLetterGenerator } from '@/hooks/useLetterGenerator'
// @ts-expect-error — module JS serveur
import { renderLetter } from '../server/lib/letter-render.js'

// Défaut préexistant : le libellé destinataire et l'objet, une fois résolus, étaient injectés dans le
// corps par `replaceAll(chaîne)`, qui interprète « $& », « $' », « $` » et « $$ ». Un nom d'organisme
// saisi avec l'une de ces suites réinjectait un bout du modèle dans le courrier (« $& » y laissait
// {{recipient_label}} : envoi papier refusé et fausse alerte « bug de catalogue »). Toute valeur
// saisie doit arriver dans le courrier telle quelle, dans les deux miroirs.

const ORGANISME = "Banque $& $' $` $$"
const SUBSCRIBER = 'AB-$&-$$'
// Dans l'objet, injecté à son tour dans le corps par {{subject}}.
const DECEASED_LASTNAME = "Martin $& $'"

const VALUES: Record<string, string> = {
  organisme_name: ORGANISME,
  subscriber_number: SUBSCRIBER,
  user_firstname: 'Camille',
  user_lastname: 'Roussel',
  user_relation: 'fille',
  user_address: '18 rue des Tanneurs, 33000 Bordeaux',
  city: 'Bordeaux',
  deceased_firstname: 'Bernard',
  deceased_lastname: DECEASED_LASTNAME,
  deceased_dob: '14/03/1941',
  deceased_dod: '12/09/2026',
  today_date: '28/09/2026',
}

describe('courriers — une valeur saisie arrive telle quelle, même avec « $& », « $\' », « $` » ou « $$ »', () => {
  it('serveur : destinataire et objet intacts dans le corps regénéré, rendu accepté', () => {
    const { subject, body, missingVariables } = renderLetter('resiliation-presse', VALUES)
    expect(missingVariables).toEqual([])
    expect(subject).toBe(`Résiliation de l'abonnement de Bernard ${DECEASED_LASTNAME} à la suite de son décès`)
    expect(body.split('\n')[0]).toBe(`À l'attention du service abonnements — ${ORGANISME}`)
    expect(body).toContain(`\n\nObjet : ${subject}\nAbonnement n° ${SUBSCRIBER}\n\n`)
  })

  describe('client (useLetterGenerator)', () => {
    const globals = globalThis as Record<string, unknown>
    const fakeDocument = { addEventListener() {}, removeEventListener() {} }
    const container = { nodeType: 1, nodeName: 'DIV', tagName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml', ownerDocument: fakeDocument, textContent: '', addEventListener() {}, removeEventListener() {} }

    beforeAll(() => {
      globals.window = { HTMLIFrameElement: class {} }
    })
    afterAll(() => {
      delete globals.window
    })

    it('destinataire intact dans l’aperçu, et même texte que le serveur pour les mêmes valeurs', async () => {
      let generator: ReturnType<typeof useLetterGenerator> | null = null
      let mounted = false
      function Probe() {
        generator = useLetterGenerator({ templateId: 'resiliation-presse' })
        useEffect(() => {
          mounted = true
        }, [])
        return null
      }
      const root = createRoot(container as unknown as Element)
      root.render(h(Probe))
      // Sonde montée (effets du hook compris), puis toutes les valeurs saisies rendues.
      await vi.waitFor(() => expect(mounted).toBe(true))
      for (const [key, value] of Object.entries(VALUES)) generator!.setVariable(key, value)
      await vi.waitFor(() => expect(generator!.values).toEqual(VALUES))
      const { resolvedLetter, resolvedSubject } = generator!
      root.unmount()

      expect(resolvedSubject).toBe(`Résiliation de l'abonnement de Bernard ${DECEASED_LASTNAME} à la suite de son décès`)
      expect(resolvedLetter.split('\n')[0]).toBe(`À l'attention du service abonnements — ${ORGANISME}`)
      expect(resolvedLetter).toContain(`\n\nObjet : ${resolvedSubject}\nAbonnement n° ${SUBSCRIBER}\n\n`)
      expect(resolvedLetter).not.toMatch(/\{\{/)
      const server = renderLetter('resiliation-presse', VALUES)
      expect(resolvedSubject).toBe(server.subject)
      expect(resolvedLetter).toBe(server.body)
    })
  })
})

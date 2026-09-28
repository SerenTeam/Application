import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createElement as h } from 'react'
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

const VALUES: Record<string, string> = {
  organisme_name: ORGANISME,
  subscriber_number: SUBSCRIBER,
  user_firstname: 'Camille',
  user_lastname: 'Roussel',
  user_relation: 'fille',
  user_address: '18 rue des Tanneurs, 33000 Bordeaux',
  city: 'Bordeaux',
  deceased_firstname: 'Bernard',
  deceased_lastname: 'Martin',
  deceased_dob: '14/03/1941',
  deceased_dod: '12/09/2026',
  today_date: '28/09/2026',
}

describe('courriers — une valeur saisie arrive telle quelle, même avec « $& », « $\' », « $` » ou « $$ »', () => {
  it('serveur : destinataire et objet intacts dans le corps regénéré, rendu accepté', () => {
    const { subject, body, missingVariables } = renderLetter('resiliation-presse', VALUES)
    expect(missingVariables).toEqual([])
    expect(body.split('\n')[0]).toBe(`À l'attention du service abonnements — ${ORGANISME}`)
    expect(body).toContain(`Objet : ${subject}\nAbonnement n° ${SUBSCRIBER}`)
    expect(subject).toBe("Résiliation de l'abonnement de Bernard Martin à la suite de son décès")
  })

  describe('client (useLetterGenerator)', () => {
    const globals = globalThis as Record<string, unknown>
    const fakeDocument = { addEventListener() {}, removeEventListener() {} }
    const container = { nodeType: 1, nodeName: 'DIV', tagName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml', ownerDocument: fakeDocument, textContent: '', addEventListener() {}, removeEventListener() {} }
    const flush = () => new Promise((resolve) => setTimeout(resolve, 20))

    beforeAll(() => {
      globals.window = { HTMLIFrameElement: class {} }
    })
    afterAll(() => {
      delete globals.window
    })

    it('destinataire intact dans l’aperçu, et même texte que le serveur pour les mêmes valeurs', async () => {
      let generator: ReturnType<typeof useLetterGenerator> | null = null
      function Probe() {
        generator = useLetterGenerator({ templateId: 'resiliation-presse' })
        return null
      }
      const root = createRoot(container as unknown as Element)
      root.render(h(Probe))
      await flush()
      for (const [key, value] of Object.entries(VALUES)) generator!.setVariable(key, value)
      await flush()
      const { resolvedLetter, resolvedSubject } = generator!
      root.unmount()

      expect(resolvedLetter.split('\n')[0]).toBe(`À l'attention du service abonnements — ${ORGANISME}`)
      expect(resolvedLetter).not.toMatch(/\{\{/)
      const server = renderLetter('resiliation-presse', VALUES)
      expect(resolvedSubject).toBe(server.subject)
      expect(resolvedLetter).toBe(server.body)
    })
  })
})

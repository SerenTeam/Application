import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createElement as h, Fragment } from 'react'
import { createRoot } from 'react-dom/client'
import { useLetterGenerator } from '@/hooks/useLetterGenerator'
import { LETTER_TEMPLATES, fillLetterPlaceholder } from '@/data/letter-templates'
import { withDe, MUTE_H_FIRST_NAMES } from '@/lib/elision'
// @ts-expect-error — module JS serveur
import { renderLetter, fillLetterPlaceholder as serverFillLetterPlaceholder } from '../server/lib/letter-render.js'
// @ts-expect-error — module JS serveur
import { withDe as serverWithDe, MUTE_H_FIRST_NAMES as SERVER_MUTE_H_FIRST_NAMES } from '../server/lib/elision.js'

// Défaut préexistant relevé le 2026-09-28 par une revue de code : « de » n'est jamais élidé devant
// un prénom à voyelle ou à h muet (« fille de Anne Martin », « Dossier allocataire de Anne Martin »).
// Recensement dans les 15 modèles (identiques côté client et serveur, parité verbatim testée) :
// - corps : « {{user_relation}} de {{deceased_firstname}} {{deceased_lastname}} », dans les 15 ;
// - objets : « de {{deceased_firstname}} » dans 10 objets. Les 5 autres (employeur, CARSAT,
//   bailleur, CPAM, impôts) placent le prénom juste après un tiret.
// Le rendu existe en deux miroirs, vérifiés tous les deux : le client (aperçu, PDF, courrier
// enregistré, corps de l'envoi e-mail) et le serveur (corps regénéré à l'envoi papier).

const VALUES: Record<string, string> = {
  organisme_name: 'Banque Populaire',
  subscriber_number: 'AB-204518',
  user_firstname: 'Camille',
  user_lastname: 'Roussel',
  user_relation: 'fille',
  user_address: '18 rue des Tanneurs, 33000 Bordeaux',
  city: 'Bordeaux',
  deceased_firstname: 'Bernard',
  deceased_lastname: 'Martin',
  deceased_dob: '14 mars 1941',
  deceased_dod: '12 septembre 2026',
  today_date: '28 septembre 2026',
}

const NAMES = ['Anne', 'Hélène', 'Yves']

const SUBJECTS_WITH_DE = [
  'banque-declaration-deces',
  'assurance-declaration-deces',
  'assurance-vie-demande',
  'caf-notification',
  'mutuelle-resiliation',
  'resiliation-presse',
  'resiliation-telecom',
  'resiliation-sport-association',
  'ehpad-fin-contrat',
  'aides-departement',
]

// « de » en mot entier, suivi du prénom en mot entier.
const deBefore = (name: string) => new RegExp(`(^|[^\\p{L}])de ${name}(?!\\p{L})`, 'u')

function expectNoDeBefore(text: string, name: string, label: string) {
  expect(text, label).toContain(`${name} Martin`) // le prénom est bien écrit dans le texte vérifié
  expect(text, label).not.toMatch(deBefore(name))
}

// Sonde client : le hook réel, rendu par react-dom sur un hôte minimal en environnement node (même
// sonde que letter-date-format.test.ts), une instance par couple (modèle, prénom), toutes montées
// dans une seule racine. Toutes les valeurs arrivent par le pré-remplissage, sauf les deux
// variables jamais pré-remplies, saisies comme dans le formulaire.
type ClientRender = { subject: string; body: string; values: Record<string, string> }
const CLIENT_NAMES = ['Anne', 'Hélène', 'Yves', 'Hugues', 'Yann', 'Jean', '']
const globals = globalThis as Record<string, unknown>
const fakeDocument = { addEventListener() {}, removeEventListener() {} }
const container = { nodeType: 1, nodeName: 'DIV', tagName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml', ownerDocument: fakeDocument, textContent: '', addEventListener() {}, removeEventListener() {} }
const flush = () => new Promise((resolve) => setTimeout(resolve, 20))
const generators = new Map<string, ReturnType<typeof useLetterGenerator>>()
const clientRenders = new Map<string, ClientRender>()

function Probe({ templateId, deceasedFirstname }: { templateId: string; deceasedFirstname: string }) {
  generators.set(
    `${templateId}|${deceasedFirstname}`,
    useLetterGenerator({
      templateId,
      userProfile: { firstname: VALUES.user_firstname, lastname: VALUES.user_lastname, address: VALUES.user_address, relation: VALUES.user_relation, city: VALUES.city },
      questionnaireData: { deceased_firstname: deceasedFirstname, deceased_lastname: VALUES.deceased_lastname, deceased_dob: '1941-03-14', deceased_dod: '2026-09-12' },
    })
  )
  return null
}

beforeAll(async () => {
  globals.window = { HTMLIFrameElement: class {} }
  const root = createRoot(container as unknown as Element)
  const probes = LETTER_TEMPLATES.flatMap(({ id }) =>
    CLIENT_NAMES.map((name) => h(Probe, { key: `${id}|${name}`, templateId: id, deceasedFirstname: name }))
  )
  root.render(h(Fragment, null, probes))
  await flush()
  for (const generator of generators.values()) {
    generator.setVariable('organisme_name', VALUES.organisme_name)
    generator.setVariable('subscriber_number', VALUES.subscriber_number)
  }
  await flush()
  for (const [key, generator] of generators) {
    clientRenders.set(key, { subject: generator.resolvedSubject, body: generator.resolvedLetter, values: generator.values })
  }
  root.unmount()
})
afterAll(() => {
  delete globals.window
})

function renderClient(templateId: string, deceasedFirstname: string): ClientRender {
  const rendered = clientRenders.get(`${templateId}|${deceasedFirstname}`)
  if (!rendered) throw new Error(`rendu client absent : ${templateId}, ${JSON.stringify(deceasedFirstname)}`)
  return rendered
}

// Règle retenue par Arnaud (2026-09-28) : « d' » devant une voyelle (accentuée ou non, æ, œ), devant
// un y suivi d'une consonne (le y s'y prononce comme un i), et devant un h muet, reconnu par une
// liste de prénoms ; « de » partout ailleurs (h aspiré, y suivi d'une voyelle, consonne, repli).
const RULE_CASES: Array<[string, string]> = [
  ['Anne', "d'Anne"],
  ['anne', "d'anne"],
  ['ANNE', "d'ANNE"],
  ['Anne-Marie', "d'Anne-Marie"],
  ['Émile', "d'Émile"],
  ['Ève', "d'Ève"],
  ['Isabelle', "d'Isabelle"],
  ['Olivier', "d'Olivier"],
  ['Ursule', "d'Ursule"],
  ['Œdipe', "d'Œdipe"],
  ['Æsa', "d'Æsa"],
  ['Yves', "d'Yves"],
  ['YVES', "d'YVES"],
  ['Yvonne', "d'Yvonne"],
  ['Ysabelle', "d'Ysabelle"],
  ['Yann', 'de Yann'],
  ['Yasmine', 'de Yasmine'],
  ['Yolande', 'de Yolande'],
  ['Youssef', 'de Youssef'],
  ['Yéléna', 'de Yéléna'],
  ['Hélène', "d'Hélène"],
  ['HÉLÈNE', "d'HÉLÈNE"],
  ['Helene', "d'Helene"],
  ['Henri', "d'Henri"],
  ['Henri-Pierre', "d'Henri-Pierre"],
  ['Hugo', "d'Hugo"],
  ['Hubert', "d'Hubert"],
  ['Hervé', "d'Hervé"],
  ['Hortense', "d'Hortense"],
  ['Hugues', 'de Hugues'],
  ['Hassan', 'de Hassan'],
  ['Hans', 'de Hans'],
  ['Hannah', 'de Hannah'],
  ['Jean', 'de Jean'],
  ['Marie-Hélène', 'de Marie-Hélène'],
  ['Jean-Yves', 'de Jean-Yves'],
  ['', 'de '],
  [' Anne', 'de  Anne'], // précédée d'une espace : écrite telle quelle, sans élision
  ['[PRÉNOM DU DÉFUNT]', 'de [PRÉNOM DU DÉFUNT]'],
]

describe('règle d’élision de « de »', () => {
  it.each(RULE_CASES)('client : %j → %j', (value, expected) => {
    expect(withDe(value)).toBe(expected)
  })

  it.each(RULE_CASES)('serveur (miroir) : %j → %j', (value, expected) => {
    expect(serverWithDe(value)).toBe(expected)
  })

  it('même liste de prénoms à h muet des deux côtés, et chacun est élidé des deux côtés', () => {
    expect([...SERVER_MUTE_H_FIRST_NAMES].sort()).toEqual([...MUTE_H_FIRST_NAMES].sort())
    for (const name of MUTE_H_FIRST_NAMES) {
      const capitalized = name.charAt(0).toUpperCase() + name.slice(1)
      expect(withDe(capitalized), name).toBe(`d'${capitalized}`)
      expect(serverWithDe(capitalized), name).toBe(`d'${capitalized}`)
    }
  })
})

describe('courriers — élision de « de » devant le prénom du défunt (recensement)', () => {
  it('le catalogue place « de {{deceased_firstname}} » dans les 15 corps et dans 10 objets', () => {
    expect(LETTER_TEMPLATES.filter((t) => t.body.includes('{{user_relation}} de {{deceased_firstname}}'))).toHaveLength(15)
    expect(LETTER_TEMPLATES.filter((t) => t.subject.includes('de {{deceased_firstname}}')).map((t) => t.id)).toEqual(SUBJECTS_WITH_DE)
  })

  // Le rendu n'élide que « de » en minuscules. Un autre mot élidable, ou « De » en tête de phrase,
  // placé devant une variable texte (prénom, nom, organisme…), resterait non élidé : un modèle qui en
  // introduit un doit d'abord étendre fillLetterPlaceholder. Les dates (« le {{deceased_dod}} »)
  // s'écrivent en chiffres et ne s'élident jamais.
  it('garde : devant une variable texte, le seul mot élidable du catalogue est « de »', () => {
    const ELIDABLE = new Set(['de', 'le', 'la', 'que', 'je', 'me', 'te', 'se', 'ne', 'jusque', 'lorsque', 'puisque', 'quoique'])
    for (const t of LETTER_TEMPLATES) {
      const textKeys = new Set(t.variables.filter((v) => v.type === 'text').map((v) => v.key))
      for (const field of ['subject', 'recipient_label', 'body'] as const) {
        for (const [, word, key] of t[field].matchAll(/(\p{L}+) \{\{(\w+)\}\}/gu)) {
          if (!textKeys.has(key) || !ELIDABLE.has(word.toLowerCase())) continue
          expect(word, `${t.id} (${field}) : « ${word} {{${key}}} »`).toBe('de')
        }
      }
    }
  })

  describe('serveur : corps regénéré à l’envoi papier (renderLetter)', () => {
    for (const { id } of LETTER_TEMPLATES) {
      for (const field of ['subject', 'body'] as const) {
        it(`${id} — ${field === 'subject' ? 'objet' : 'corps'}`, () => {
          for (const name of NAMES) {
            const rendered = renderLetter(id, { ...VALUES, deceased_firstname: name })
            expectNoDeBefore(rendered[field], name, `${id}, ${name}`)
          }
        })
      }
    }
  })

  describe('client : aperçu, PDF, courrier enregistré, envoi e-mail (useLetterGenerator)', () => {
    for (const { id } of LETTER_TEMPLATES) {
      for (const field of ['subject', 'body'] as const) {
        it(`${id} — ${field === 'subject' ? 'objet' : 'corps'}`, () => {
          for (const name of NAMES) {
            const rendered = renderClient(id, name)
            expectNoDeBefore(rendered[field], name, `${id}, ${name}`)
          }
        })
      }
    }
  })
})

describe('courriers — « d’ » ou « de » selon le prénom, dans le corps et dans l’objet', () => {
  const CASES: Array<[string, string]> = [
    ['Anne', "d'Anne"],
    ['Hélène', "d'Hélène"],
    ['Yves', "d'Yves"],
    ['Hugues', 'de Hugues'],
    ['Yann', 'de Yann'],
    ['Jean', 'de Jean'],
  ]

  it('serveur : « fille d’Anne Martin », « Comptes d’Anne Martin »… et « de » devant Hugues, Yann, Jean', () => {
    for (const { id } of LETTER_TEMPLATES) {
      for (const [name, expected] of CASES) {
        const { subject, body } = renderLetter(id, { ...VALUES, deceased_firstname: name })
        expect(body, `${id}, ${name}`).toContain(`, fille ${expected} Martin`)
        if (SUBJECTS_WITH_DE.includes(id)) expect(subject, `${id}, ${name}`).toContain(` ${expected} Martin`)
      }
    }
  })

  it('client : mêmes formes dans l’objet et dans le courrier', () => {
    for (const { id } of LETTER_TEMPLATES) {
      for (const [name, expected] of CASES) {
        const { subject, body } = renderClient(id, name)
        expect(body, `${id}, ${name}`).toContain(`, fille ${expected} Martin`)
        if (SUBJECTS_WITH_DE.includes(id)) expect(subject, `${id}, ${name}`).toContain(` ${expected} Martin`)
      }
    }
  })

  it('prénom absent : « de » devant le repli, [PRÉNOM DU DÉFUNT] côté client, [DECEASED_FIRSTNAME] côté serveur', () => {
    const server = renderLetter('banque-declaration-deces', { ...VALUES, deceased_firstname: '' })
    expect(server.body).toContain(', fille de [DECEASED_FIRSTNAME] Martin')
    const client = renderClient('banque-declaration-deces', '')
    expect(client.body).toContain(', fille de [PRÉNOM DU DÉFUNT] Martin')
  })

  // Les deux miroirs doivent rester strictement identiques : le courrier papier part avec le corps
  // regénéré par le serveur, alors que la famille a validé l'aperçu du client.
  it('parité du rendu complet : les valeurs du client, rendues par le serveur, donnent le même objet et le même corps', () => {
    for (const { id } of LETTER_TEMPLATES) {
      for (const [name] of CASES) {
        const client = renderClient(id, name)
        const server = renderLetter(id, client.values)
        expect(server.missingVariables, `${id}, ${name}`).toEqual([])
        expect(server.subject, `${id}, ${name}`).toBe(client.subject)
        expect(server.body, `${id}, ${name}`).toBe(client.body)
      }
    }
  })
})

describe('substitution d’une variable : parité client ↔ serveur', () => {
  const TEXTS = [
    'fille de {{v}} Martin',
    'Comptes de {{v}} — {{v}} était salarié(e). Décès de {{v}}.',
    'Monde {{v}}', // « de » en fin de mot : jamais élidé
    'succède {{v}}',
    'de {{v}}', // en tête de texte
    'le {{v}}', // seul « de » est concerné
  ]
  const VALUES_TO_TRY = ['Anne', 'Hélène', 'Yves', 'Hugues', 'Yann', 'Jean', '', '[V]', 'Anne $& $$', '$& Jean']

  it('client et serveur donnent le même texte, pour chaque texte et chaque valeur', () => {
    for (const text of TEXTS) {
      for (const value of VALUES_TO_TRY) {
        expect(serverFillLetterPlaceholder(text, 'v', value), `${text} / ${value}`).toBe(fillLetterPlaceholder(text, 'v', value))
      }
    }
  })

  it('élide « de » en mot entier seulement, et laisse les autres occurrences telles quelles', () => {
    expect(fillLetterPlaceholder('Comptes de {{v}} — {{v}} était salarié(e). Décès de {{v}}.', 'v', 'Anne')).toBe(
      "Comptes d'Anne — Anne était salarié(e). Décès d'Anne."
    )
    expect(fillLetterPlaceholder('Monde {{v}} / succède {{v}} / le {{v}}', 'v', 'Anne')).toBe('Monde Anne / succède Anne / le Anne')
    expect(fillLetterPlaceholder('de {{v}}', 'v', 'Anne')).toBe("d'Anne")
  })

  it('la valeur est écrite telle quelle, même si elle contient « $& » ou « $$ »', () => {
    expect(fillLetterPlaceholder('fille de {{v}} ; {{v}}', 'v', 'Anne $& $$')).toBe("fille d'Anne $& $$ ; Anne $& $$")
    expect(fillLetterPlaceholder('fille de {{v}} ; {{v}}', 'v', '$& Jean')).toBe('fille de $& Jean ; $& Jean')
  })
})

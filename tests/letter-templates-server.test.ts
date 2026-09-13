import { describe, it, expect } from 'vitest'
import { LETTER_TEMPLATES as FRONT_TEMPLATES, getTemplateNetwork } from '../src/data/letter-templates'
// @ts-expect-error — module JS serveur
import { LETTER_TEMPLATES as SERVER_TEMPLATES } from '../server/lib/letter-templates.js'
// @ts-expect-error — module JS serveur
import { renderLetter, renderTemplate, LetterRenderError } from '../server/lib/letter-render.js'

// Jumeau serveur du catalogue front (chantier 2a, Task 8, spec D2 §5 « corps regénéré côté
// serveur ») : `server/lib/letter-templates.js` doit rester en parité STRICTE avec
// `src/data/letter-templates.ts` (ids, canaux, corps verbatim, ensembles de variables) — même
// mécanique que `server/lib/letter-channels.js` (tests/letter-templates.test.ts). Toute dérive
// entre les deux catalogues ferait échouer `npm test`.

const NETWORKS = ['caf', 'cpam', 'carsat', 'impots'] as const
const RECIPIENT_KIND_RE = /^(network:(caf|cpam|carsat|impots)|user_specific|portail)$/

describe('parité server/lib/letter-templates.js ↔ LETTER_TEMPLATES (front)', () => {
  it('même nombre de templates', () => {
    expect(SERVER_TEMPLATES.length).toBe(FRONT_TEMPLATES.length)
  })

  it('mêmes ids, aucun en trop ou manquant', () => {
    const frontIds = FRONT_TEMPLATES.map((t) => t.id).sort()
    const serverIds = SERVER_TEMPLATES.map((t: { id: string }) => t.id).sort()
    expect(serverIds).toEqual(frontIds)
  })

  it('mêmes canaux pour chaque id', () => {
    const frontChannels = Object.fromEntries(FRONT_TEMPLATES.map((t) => [t.id, t.channel]))
    const serverChannels = Object.fromEntries(
      SERVER_TEMPLATES.map((t: { id: string; channel: string }) => [t.id, t.channel])
    )
    expect(serverChannels).toEqual(frontChannels)
  })

  it('pour chaque id : mêmes ensembles de variables (dérivées serveur == déclarées front)', () => {
    for (const front of FRONT_TEMPLATES) {
      const server = SERVER_TEMPLATES.find((t: { id: string }) => t.id === front.id)
      expect(server, `${front.id} absent du catalogue serveur`).toBeDefined()

      const frontKeys = [...new Set(front.variables.map((v) => v.key))].sort()
      const serverKeys = [...server.variables].sort()
      expect(serverKeys, `${front.id} : ensemble de variables`).toEqual(frontKeys)
    }
  })

  it('pour chaque id : corps identique (verbatim, chaîne exacte)', () => {
    for (const front of FRONT_TEMPLATES) {
      const server = SERVER_TEMPLATES.find((t: { id: string }) => t.id === front.id)
      expect(server.body, `${front.id} : corps`).toBe(front.body)
      expect(server.subject, `${front.id} : sujet`).toBe(front.subject)
    }
  })
})

describe('recipient_kind — destinataire réel de chaque template', () => {
  it('chaque template a un recipient_kind valide', () => {
    for (const t of SERVER_TEMPLATES) {
      expect(RECIPIENT_KIND_RE.test(t.recipient_kind), `${t.id}: recipient_kind invalide (${t.recipient_kind})`).toBe(
        true
      )
    }
  })

  it('les valeurs network:* correspondent aux 4 réseaux de l\'annuaire (organisations.network)', () => {
    const networkKinds = SERVER_TEMPLATES.filter((t: { recipient_kind: string }) =>
      t.recipient_kind.startsWith('network:')
    ).map((t: { recipient_kind: string }) => t.recipient_kind.slice('network:'.length))
    for (const network of networkKinds) {
      expect(NETWORKS, `réseau inconnu : ${network}`).toContain(network)
    }
  })

  // Les organismes réseau (CAF/CPAM/CARSAT/impôts) sont résolus par l'annuaire ; les
  // destinataires propres à l'utilisateur (banque, assurance, employeur, mutuelle, bailleur)
  // sont toujours saisis — cf. spec §3.3 « les destinataires propres à l'utilisateur ne passent
  // pas par l'annuaire ».
  it.each([
    ['banque-declaration-deces', 'user_specific'],
    ['assurance-declaration-deces', 'user_specific'],
    ['assurance-vie-demande', 'user_specific'],
    ['employeur-notification', 'user_specific'],
    ['mutuelle-resiliation', 'user_specific'],
    ['bailleur-notification', 'user_specific'],
    ['caf-notification', 'network:caf'],
    ['carsat-notification', 'network:carsat'],
    ['cpam-notification', 'network:cpam'],
    ['impots-notification', 'network:impots'],
  ])('%s → %s', (id, expected) => {
    const t = SERVER_TEMPLATES.find((tpl: { id: string }) => tpl.id === id)
    expect(t.recipient_kind).toBe(expected)
  })
})

// Corrigé après la revue finale (Task 11) : le commentaire de NETWORK_RECIPIENT_TEMPLATES
// promettait une vérification de parité qui n'existait nulle part — cette carte front (indice
// d'UI : quel formulaire d'adresse afficher) doit rester synchronisée avec les VRAIS
// `recipient_kind` serveur, sans quoi un template reclassé côté serveur (network ↔ user_specific)
// afficherait le mauvais formulaire sans qu'aucun test ne le détecte.
describe('parité NETWORK_RECIPIENT_TEMPLATES (front) ↔ recipient_kind serveur', () => {
  it('un template network:X côté serveur → getTemplateNetwork(id) === X', () => {
    for (const t of SERVER_TEMPLATES as Array<{ id: string; recipient_kind: string }>) {
      if (!t.recipient_kind.startsWith('network:')) continue
      const expected = t.recipient_kind.slice('network:'.length)
      expect(getTemplateNetwork(t.id), `${t.id} : réseau attendu ${expected}`).toBe(expected)
    }
  })

  it('un template user_specific ou portail côté serveur → getTemplateNetwork(id) === null', () => {
    for (const t of SERVER_TEMPLATES as Array<{ id: string; recipient_kind: string }>) {
      if (t.recipient_kind.startsWith('network:')) continue
      expect(getTemplateNetwork(t.id), `${t.id} ne devrait pas avoir de réseau`).toBeNull()
    }
  })

  it('aucune entrée orpheline dans NETWORK_RECIPIENT_TEMPLATES (id inconnu du catalogue serveur)', () => {
    for (const t of FRONT_TEMPLATES) {
      const network = getTemplateNetwork(t.id)
      if (network === null) continue
      const server = SERVER_TEMPLATES.find((s: { id: string }) => s.id === t.id)
      expect(server?.recipient_kind, t.id).toBe(`network:${network}`)
    }
  })
})

// ── Rendu (letter-render.js) ─────────────────────────────────────────────────────────────────

const BANQUE_VALUES = {
  organisme_name: 'Crédit Agricole',
  user_firstname: 'Claire',
  user_lastname: 'Martin',
  user_relation: 'fille',
  deceased_firstname: 'Jean',
  deceased_lastname: 'Martin',
  deceased_dob: '3 mars 1940',
  deceased_dod: '10 janvier 2026',
  user_address: '12 rue des Lilas',
  city: 'Lyon',
  today_date: '13 septembre 2026',
}

describe('renderLetter — fusion mustache-light (miroir useLetterGenerator)', () => {
  it('template complet : aucun résidu `{{` dans le sujet ni dans le corps', () => {
    const { subject, body, missingVariables } = renderLetter('banque-declaration-deces', BANQUE_VALUES)
    expect(missingVariables).toEqual([])
    expect(subject).not.toMatch(/\{\{/)
    expect(body).not.toMatch(/\{\{/)
    // Sanity : les valeurs sont bien injectées (pas juste « pas de {{ » par accident).
    expect(subject).toContain('Jean')
    expect(body).toContain('Crédit Agricole')
    expect(body).toContain('Claire Martin')
  })

  it('template incomplet : missingVariables liste exactement les clés vides/absentes', () => {
    const partial: Record<string, string> = { ...BANQUE_VALUES, organisme_name: '' }
    delete partial.city
    const { missingVariables } = renderLetter('banque-declaration-deces', partial)
    expect(missingVariables.sort()).toEqual(['city', 'organisme_name'])
  })

  it('une valeur absente est remplacée par un repli `[CLÉ]` — jamais de `{{...}}` littéral', () => {
    const { body, missingVariables } = renderLetter('banque-declaration-deces', {})
    expect(missingVariables.length).toBeGreaterThan(0)
    expect(body).not.toMatch(/\{\{/)
    expect(body).toContain('[ORGANISME_NAME]')
  })

  it('template_id inconnu → LetterRenderError(unknown_template)', () => {
    expect(() => renderLetter('inexistant', {})).toThrowError(
      expect.objectContaining({ code: 'unknown_template' })
    )
  })

  // Garde de défense (divergence de regex / variable référencée dans le corps mais jamais
  // déclarée) : impossible à produire avec le vrai catalogue (variables dérivées du corps), donc
  // testée sur un template FORGÉ via `renderTemplate` (cœur pur, sans passer par le catalogue).
  it('garde `unresolved_variables` : corps contenant un `{{...}}` non déclaré dans `variables`', () => {
    const forged = {
      id: 'forged-template',
      subject: 'Sujet {{deceased_firstname}}',
      recipient_label: 'À {{deceased_firstname}}',
      // `oops_undeclared` n'apparaît PAS dans `variables` ci-dessous : la boucle de substitution
      // ne le touchera jamais.
      body: '{{recipient_label}} — {{deceased_firstname}} — {{oops_undeclared}}',
      variables: ['deceased_firstname'],
    }

    expect(() => renderTemplate(forged, { deceased_firstname: 'Jean' })).toThrowError(
      expect.objectContaining({ code: 'unresolved_variables' })
    )
  })

  it('la garde ne se déclenche PAS tant qu\'il reste des variables manquantes (mustache résiduel toléré)', () => {
    const forged = {
      id: 'forged-template-2',
      subject: 'Sujet {{a}}',
      recipient_label: '{{b}}',
      body: '{{recipient_label}} {{a}} {{b}}',
      variables: ['a', 'b'],
    }
    // `b` n'est jamais fourni : missingVariables non vide → la garde ne throw pas, même si le
    // repli `[B]` a bien remplacé toute occurrence de `{{b}}` (pas de résidu de toute façon ici,
    // mais la garde reste inactive par construction dès que missingVariables ≠ []).
    const result = renderTemplate(forged, { a: 'A' })
    expect(result.missingVariables).toEqual(['b'])
  })
})

import { describe, it, expect } from 'vitest'
// @ts-expect-error — module JS serveur
import { writeQuestionText, interpolateFallback } from '../server/lib/question-writer.js'
// @ts-expect-error — module JS serveur
import { buildWriterMessages } from '../server/lib/writer-prompt.js'

const SPEC = {
  id: 'deceased_dod',
  type: 'date',
  fallback_text: {
    question: 'À quelle date {prenom} est-il/elle décédé(e) ?',
    aide: 'Cette date nous permet de calculer les délais légaux.',
  },
}
const CTX = { prenom: 'Pierre', relation: 'conjoint_marie' }

/** Fake client Mistral : renvoie `content` après `delayMs`, ou rejette si content === REJECT. */
const REJECT = Symbol('reject')
function fakeMistral(content: unknown, delayMs = 0) {
  return {
    chat: {
      complete: (_req: unknown, options?: { timeoutMs?: number }) =>
        new Promise((resolve, reject) => {
          if (options?.timeoutMs !== undefined && delayMs > options.timeoutMs) {
            setTimeout(() => reject(new Error('request timed out')), options.timeoutMs)
            return
          }
          setTimeout(() => {
            if (content === REJECT) reject(new Error('réseau'))
            else resolve({ choices: [{ message: { content } }] })
          }, delayMs)
        }),
    },
  }
}

describe('interpolateFallback', () => {
  it('remplace {prenom}, avec repli « votre proche »', () => {
    expect(interpolateFallback(SPEC, 'Pierre').question).toContain('Pierre')
    expect(interpolateFallback(SPEC, undefined).question).toContain('votre proche')
  })
})

describe('writeQuestionText', () => {
  it('utilise le texte du LLM quand la sortie est valide', async () => {
    const mistral = fakeMistral(JSON.stringify({ question: 'Quand Pierre vous a-t-il quittés ?', aide: 'Pour les délais.' }))
    const out = await writeQuestionText({ spec: SPEC, context: CTX, mistral, model: 'test' })
    expect(out.source).toBe('llm')
    expect(out.question).toBe('Quand Pierre vous a-t-il quittés ?')
    expect(out.aide).toBe('Pour les délais.')
  })
  it('fallback si timeout dépassé', async () => {
    const mistral = fakeMistral(JSON.stringify({ question: 'Trop tard…………' }), 100)
    const out = await writeQuestionText({ spec: SPEC, context: CTX, mistral, model: 'test', timeoutMs: 10 })
    expect(out.source).toBe('fallback')
    expect(out.question).toContain('Pierre')
  })
  it('fallback si JSON invalide', async () => {
    const out = await writeQuestionText({ spec: SPEC, context: CTX, mistral: fakeMistral('pas du json'), model: 'test' })
    expect(out.source).toBe('fallback')
  })
  it('fallback si champ question manquant ou trop court', async () => {
    expect((await writeQuestionText({ spec: SPEC, context: CTX, mistral: fakeMistral(JSON.stringify({ aide: 'x' })), model: 'test' })).source).toBe('fallback')
    expect((await writeQuestionText({ spec: SPEC, context: CTX, mistral: fakeMistral(JSON.stringify({ question: 'court' })), model: 'test' })).source).toBe('fallback')
  })
  it('fallback si sortie trop longue (question > 300 ou aide > 200)', async () => {
    expect((await writeQuestionText({ spec: SPEC, context: CTX, mistral: fakeMistral(JSON.stringify({ question: 'x'.repeat(5000) })), model: 'test' })).source).toBe('fallback')
    expect((await writeQuestionText({ spec: SPEC, context: CTX, mistral: fakeMistral(JSON.stringify({ question: 'Une question valide ?', aide: 'a'.repeat(3000) })), model: 'test' })).source).toBe('fallback')
  })
  it('fallback si erreur réseau', async () => {
    const out = await writeQuestionText({ spec: SPEC, context: CTX, mistral: fakeMistral(REJECT), model: 'test' })
    expect(out.source).toBe('fallback')
  })
  it('fallback si aucun client fourni', async () => {
    const out = await writeQuestionText({ spec: SPEC, context: CTX, mistral: null, model: 'test' })
    expect(out.source).toBe('fallback')
  })
})

describe('buildWriterMessages', () => {
  it('structure [system, user] avec prénom, relation et formulation de référence', () => {
    const messages = buildWriterMessages({ ...SPEC, writer_hints: 'indice métier' }, CTX)
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('system')
    expect(messages[1].role).toBe('user')
    expect(messages[1].content).toContain('Pierre')
    expect(messages[1].content).toContain('l\'époux ou l\'épouse')
    expect(messages[1].content).toContain('indice métier')
    expect(messages[1].content).toContain(SPEC.fallback_text.question)
  })
  it('contexte vide : aucun « undefined » dans le contenu', () => {
    const messages = buildWriterMessages(SPEC, {})
    expect(messages[1].content).not.toContain('undefined')
  })
  it('la relation est transmise sans ambiguïté de direction (bug réel : parent lu comme enfant)', () => {
    const parent = buildWriterMessages(SPEC, { relation: 'parent' })
    expect(parent[1].content).toContain('le père ou la mère de l\'utilisateur')
    expect(parent[1].content).not.toMatch(/défunt : parent/)
    const enfant = buildWriterMessages(SPEC, { relation: 'enfant' })
    expect(enfant[1].content).toContain('le fils ou la fille de l\'utilisateur')
    // valeur inconnue : repli neutre, jamais l'enum brut
    const autre = buildWriterMessages(SPEC, { relation: 'autre' })
    expect(autre[1].content).toContain('un proche de l\'utilisateur')
  })
  it('les libellés des options sont fournis au rédacteur pour une formulation compatible', () => {
    const spec = { ...SPEC, type: 'select', options: [{ value: 'a', label: 'Premier choix' }, { value: 'b', label: 'Second choix' }] }
    const messages = buildWriterMessages(spec, {})
    expect(messages[1].content).toContain('Premier choix')
    expect(messages[1].content).toContain('formulation ouverte')
  })
})

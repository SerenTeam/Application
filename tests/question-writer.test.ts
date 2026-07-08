import { describe, it, expect } from 'vitest'
// @ts-expect-error — module JS serveur
import { writeQuestionText, interpolateFallback } from '../server/lib/question-writer.js'

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
      complete: () =>
        new Promise((resolve, reject) =>
          setTimeout(() => {
            if (content === REJECT) reject(new Error('réseau'))
            else resolve({ choices: [{ message: { content } }] })
          }, delayMs)
        ),
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
  it('fallback si erreur réseau', async () => {
    const out = await writeQuestionText({ spec: SPEC, context: CTX, mistral: fakeMistral(REJECT), model: 'test' })
    expect(out.source).toBe('fallback')
  })
  it('fallback si aucun client fourni', async () => {
    const out = await writeQuestionText({ spec: SPEC, context: CTX, mistral: null, model: 'test' })
    expect(out.source).toBe('fallback')
  })
})

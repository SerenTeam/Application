import { afterEach, describe, expect, it, vi } from 'vitest'
import { focusIfIdle } from '@/lib/focus'

// Vitest tourne en node, sans DOM : `document` est remplacé par un faux minimal (activeElement, body)
// et chaque élément n'est qu'un espion `focus`.
function fakeElement() {
  const focus = vi.fn()
  return { focus, el: { focus } as unknown as HTMLElement }
}

function stubDocument(activeElement: HTMLElement | null, body: HTMLElement) {
  vi.stubGlobal('document', { activeElement, body })
}

afterEach(() => vi.unstubAllGlobals())

describe('focusIfIdle — focus donné seulement s’il est libre, jamais volé', () => {
  it('élément absent (null, undefined) : aucun appel, aucune erreur, même quand le focus est libre', () => {
    const body = fakeElement()
    stubDocument(body.el, body.el)
    for (const missing of [null, undefined]) {
      expect(() => focusIfIdle(missing), String(missing)).not.toThrow()
    }
    expect(body.focus).not.toHaveBeenCalled()
  })

  it('focus libre (retombé sur body, ou aucun élément actif) : el.focus() appelé une fois', () => {
    for (const idle of ['body', 'null'] as const) {
      const body = fakeElement()
      const target = fakeElement()
      stubDocument(idle === 'body' ? body.el : null, body.el)
      focusIfIdle(target.el)
      expect(target.focus, idle).toHaveBeenCalledTimes(1)
    }
  })

  it('focus ailleurs (en-tête, autre champ) : el.focus() n’est pas appelé', () => {
    const body = fakeElement()
    const elsewhere = fakeElement()
    const target = fakeElement()
    stubDocument(elsewhere.el, body.el)
    focusIfIdle(target.el)
    expect(target.focus).not.toHaveBeenCalled()
  })

  it('focus déjà sur l’élément lui-même : aucun appel (comportement verrouillé)', () => {
    const body = fakeElement()
    const target = fakeElement()
    stubDocument(target.el, body.el)
    focusIfIdle(target.el)
    expect(target.focus).not.toHaveBeenCalled()
  })
})

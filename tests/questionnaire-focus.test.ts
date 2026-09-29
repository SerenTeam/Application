import { describe, expect, it } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QuestionCard, type QuestionData } from '@/components/questionnaire/QuestionCard'
import { RecapScreen } from '@/components/questionnaire/RecapScreen'
import { WelcomeScreen } from '@/components/questionnaire/WelcomeScreen'
import { STRINGS_FR } from '@/i18n/strings.fr'

// Accessibilité du questionnaire : à chaque nouvelle question et à l'entrée du récapitulatif, le focus
// va sur le titre de l'écran (focusIfIdle — jamais volé). Vitest tourne en node, sans DOM : ce fichier
// verrouille le balisage qui rend ce focus possible. Un titre sans tabindex ne prend pas le focus :
// focus() serait sans effet, en silence. renderToStaticMarkup n'exécute pas les effets : le déplacement
// effectif du focus (ref + effet) se vérifie au navigateur (parcours au clavier, FR et EN).

const QUESTION: QuestionData = {
  question_id: 'relation',
  question: 'Quel était votre lien avec la personne ?',
  type: 'select',
  options: [{ value: 'enfant', label: 'Son enfant' }],
  obligatoire: true,
  progress: { current: 1, total: 12 },
}

// Titres (h1…h6) du HTML rendu : balise, attributs bruts, texte.
function headings(html: string) {
  return [...html.matchAll(/<(h[1-6])\b([^>]*)>(.*?)<\/\1>/g)].map(([, tag, attrs, text]) => ({ tag, attrs, text }))
}

// Cible de focus silencieuse : focalisable par script seulement (tabindex -1, hors tabulation) et sans
// indicateur visible. Le projet dessine l'anneau de focus en box-shadow, par une règle globale
// `:focus-visible` (src/index.css, layer base) : `focus:outline-none` seul ne l'efface pas, il faut aussi
// `focus:ring-0 focus:ring-offset-0` (layer utilities, prioritaire).
function expectSilentFocusTarget(attrs: string) {
  expect(attrs).toContain('tabindex="-1"')
  const classes = attrs.match(/class="([^"]*)"/)?.[1].split(/\s+/) ?? []
  expect(classes).toEqual(expect.arrayContaining(['focus:outline-none', 'focus:ring-0', 'focus:ring-offset-0']))
}

describe('questionnaire — le titre de chaque écran peut recevoir le focus par script', () => {
  it('QuestionCard : l’énoncé est un vrai titre h2, tabindex=-1 (hors tabulation), sans anneau de focus', () => {
    const html = renderToStaticMarkup(
      h(QuestionCard, { question: QUESTION, onAnswer: () => {}, isSubmitting: false, error: null }),
    )
    const [title, ...others] = headings(html)
    expect(others).toEqual([])
    expect(title).toMatchObject({ tag: 'h2', text: QUESTION.question })
    expectSilentFocusTarget(title.attrs)
  })

  it('RecapScreen : le titre est un vrai titre h2, tabindex=-1 (hors tabulation), sans anneau de focus', () => {
    const html = renderToStaticMarkup(
      h(RecapScreen, {
        entries: [{ question_id: 'relation', question: 'Lien', display: 'Son enfant' }],
        onEdit: () => {},
        onConfirm: () => {},
        isSubmitting: false,
        error: null,
      }),
    )
    const [title, ...others] = headings(html)
    expect(others).toEqual([])
    expect(title).toMatchObject({ tag: 'h2', text: STRINGS_FR.recap.title })
    expectSilentFocusTarget(title.attrs)
  })

  // Garde-fou de balisage seulement : que l'accueil ne prenne pas le focus au premier rendu (aucun effet
  // de focus) se vérifie au navigateur, faute d'effets exécutés ici.
  it('WelcomeScreen : aucun élément focalisable par script (pas de tabindex=-1)', () => {
    const html = renderToStaticMarkup(h(WelcomeScreen, { onStart: () => {} }))
    expect(html).not.toContain('tabindex="-1"')
  })
})

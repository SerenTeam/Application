export type Lang = 'fr' | 'en'

const STORAGE_KEY = 'seren_lang'

export function detectLang(): Lang {
  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (saved === 'fr' || saved === 'en') return saved
    const nav = typeof navigator !== 'undefined' ? navigator.language : undefined
    return nav?.toLowerCase().startsWith('en') ? 'en' : 'fr'
  } catch {
    return 'fr'
  }
}

export function persistLang(lang: Lang): void {
  try { localStorage.setItem(STORAGE_KEY, lang) } catch { /* stockage indisponible : tant pis */ }
}

// Interpolation minimaliste : remplace {clé} par vars[clé] ; laisse intact si absent.
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
}

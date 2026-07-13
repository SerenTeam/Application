import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { detectLang, persistLang, type Lang } from './index'

const LanguageContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'fr', setLang: () => {} })

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detectLang())
  const setLang = (l: Lang) => { persistLang(l); setLangState(l) }
  useEffect(() => { document.documentElement.lang = lang }, [lang])
  return <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>
}

export function useLang() { return useContext(LanguageContext) }

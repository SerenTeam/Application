import { useLang } from './LanguageContext'
import { STRINGS_FR, type Strings } from './strings.fr'
import { STRINGS_EN } from './strings.en'

const ALL: Record<'fr' | 'en', Strings> = { fr: STRINGS_FR, en: STRINGS_EN }

export function useT(): Strings {
  return ALL[useLang().lang]
}

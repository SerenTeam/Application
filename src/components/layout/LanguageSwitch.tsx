import { useLang } from '@/i18n/LanguageContext'

// Toggle FR/EN : la langue choisie persiste (localStorage) et prime sur la langue du device.
export function LanguageSwitch() {
  const { lang, setLang } = useLang()
  return (
    <div className="flex items-center gap-1 text-sm" role="group" aria-label="Language">
      {(['fr', 'en'] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`px-2 py-1 rounded uppercase transition-colors ${lang === l ? 'font-semibold text-accent' : 'text-text-soft hover:text-text'}`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

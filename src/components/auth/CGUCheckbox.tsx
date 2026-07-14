import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useT } from '@/i18n/useT'

interface CGUCheckboxProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  error?: string
}

export function CGUCheckbox({ checked, onCheckedChange, error }: CGUCheckboxProps) {
  const t = useT()
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <Checkbox
          id="cgu"
          checked={checked}
          onCheckedChange={(checked) => onCheckedChange(checked === true)}
          aria-describedby="cgu-description"
          aria-required="true"
          className="mt-0.5"
        />
        <Label
          htmlFor="cgu"
          className="text-sm text-text-soft leading-relaxed cursor-pointer font-normal"
        >
          {t.auth.cgu.acceptPrefix}{' '}
          <a
            href="/legal"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline hover:text-accent-hover"
          >
            {t.auth.cgu.termsOfService}
          </a>{' '}
          {t.auth.cgu.andThe}{' '}
          <a
            href="/security"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline hover:text-accent-hover"
          >
            {t.auth.cgu.privacyPolicy}
          </a>
        </Label>
      </div>
      <p id="cgu-description" className="text-xs text-text-muted pl-7">
        {t.auth.cgu.dataProtected}
      </p>
      {error && (
        <p className="text-sm text-error pl-7" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

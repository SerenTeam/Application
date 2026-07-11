import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

interface CGUCheckboxProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  error?: string
}

export function CGUCheckbox({ checked, onCheckedChange, error }: CGUCheckboxProps) {
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
          J'accepte les{' '}
          <a
            href="/legal"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline hover:text-accent-hover"
          >
            conditions générales d'utilisation
          </a>{' '}
          et la{' '}
          <a
            href="/security"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline hover:text-accent-hover"
          >
            politique de confidentialité
          </a>
        </Label>
      </div>
      <p id="cgu-description" className="text-xs text-text-muted pl-7">
        Vos données sont protégées et ne seront jamais partagées sans votre consentement.
      </p>
      {error && (
        <p className="text-sm text-error pl-7" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

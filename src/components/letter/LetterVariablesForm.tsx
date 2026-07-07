import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { LetterVariable } from '@/data/letter-templates'

interface LetterVariablesFormProps {
  variables: LetterVariable[]
  values: Record<string, string>
  onVariableChange: (key: string, value: string) => void
}

export function LetterVariablesForm({ variables, values, onVariableChange }: LetterVariablesFormProps) {
  // Only show variables that need user input (not auto-filled or empty auto-filled)
  const editableVariables = variables.filter((v) => !v.auto_filled || !values[v.key]?.trim())

  if (editableVariables.length === 0) return null

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-text-primary">
        Complétez les informations manquantes
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {editableVariables.map((variable) => (
          <div key={variable.key} className="space-y-1.5">
            <Label htmlFor={`var-${variable.key}`} className="text-sm">
              {variable.label}
              {variable.required && <span className="text-error ml-0.5">*</span>}
            </Label>
            <Input
              id={`var-${variable.key}`}
              type={variable.type === 'date' ? 'date' : 'text'}
              value={values[variable.key] ?? ''}
              onChange={(e) => onVariableChange(variable.key, e.target.value)}
              placeholder={variable.label}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

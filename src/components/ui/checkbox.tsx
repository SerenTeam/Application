import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, id, ...props }, ref) => {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        id={id}
        className={cn(
          "peer h-4 w-4 shrink-0 rounded-sm border border-border ring-offset-bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          checked && "bg-accent border-accent text-white",
          className
        )}
        onClick={() => onCheckedChange?.(!checked)}
        {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {checked && <Check className="h-3 w-3 mx-auto" />}
        <input
          type="checkbox"
          ref={ref}
          checked={checked}
          onChange={() => {}}
          className="sr-only"
          tabIndex={-1}
        />
      </button>
    )
  }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }

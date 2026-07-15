import * as React from "react"
import { cn } from "@/lib/utils"

export interface PillBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: "primary" | "success" | "warning" | "violet" | "neutral"
}

const toneClasses: Record<NonNullable<PillBadgeProps["tone"]>, string> = {
  primary: "bg-primary-light text-primary",
  success: "bg-success-light text-success",
  warning: "bg-warning-light text-warning",
  violet: "bg-violet-light text-violet",
  neutral: "border border-border text-text-secondary",
}

const PillBadge = React.forwardRef<HTMLSpanElement, PillBadgeProps>(
  ({ className, tone = "primary", ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-full px-3 py-1 text-[12px] font-medium uppercase tracking-[0.5px]",
          toneClasses[tone],
          className
        )}
        {...props}
      />
    )
  }
)
PillBadge.displayName = "PillBadge"

export { PillBadge }

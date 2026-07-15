import * as React from "react"
import { cn } from "@/lib/utils"

export interface IconBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "md" | "sm"
  tone?: "primary" | "violet"
}

const sizeClasses: Record<NonNullable<IconBadgeProps["size"]>, string> = {
  md: "h-16 w-16 [&_svg]:size-[28px]",
  sm: "h-10 w-10 [&_svg]:size-5",
}

const toneClasses: Record<NonNullable<IconBadgeProps["tone"]>, string> = {
  primary: "bg-primary-light text-primary",
  violet: "bg-violet-light/50 text-violet",
}

const IconBadge = React.forwardRef<HTMLDivElement, IconBadgeProps>(
  ({ className, size = "md", tone = "primary", children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full",
          sizeClasses[size],
          toneClasses[tone],
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)
IconBadge.displayName = "IconBadge"

export { IconBadge }

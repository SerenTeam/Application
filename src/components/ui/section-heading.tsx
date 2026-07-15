import * as React from "react"
import { cn } from "@/lib/utils"

export interface SectionHeadingProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  lead?: React.ReactNode
  /** Balise du titre (h1/h2/h3…). Par défaut h2. */
  as?: React.ElementType
}

const SectionHeading = React.forwardRef<HTMLDivElement, SectionHeadingProps>(
  ({ className, eyebrow, title, lead, as: Title = "h2", ...props }, ref) => {
    return (
      <div ref={ref} className={cn("max-w-xl space-y-3", className)} {...props}>
        {eyebrow && (
          <p className="font-body text-[11px] font-medium uppercase tracking-[1.5px] text-primary">
            {eyebrow}
          </p>
        )}
        <Title className="font-display text-[28px] font-normal leading-[1.3] text-text sm:text-[32px] lg:text-[36.5px]">
          {title}
        </Title>
        {lead && (
          <p className="font-body text-[17px] font-medium leading-[1.6] text-text-secondary lg:text-[19.5px]">
            {lead}
          </p>
        )}
      </div>
    )
  }
)
SectionHeading.displayName = "SectionHeading"

export { SectionHeading }

import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

const Select = React.forwardRef<
  HTMLSelectElement,
  React.ComponentPropsWithoutRef<"select">
>(({ className, children, ...props }, ref) => {
  return (
    <div className="relative min-w-0">
      <select
        ref={ref}
        data-slot="select"
        className={cn(
          "h-11 min-w-0 w-full truncate appearance-none border border-border bg-background px-4 pr-10 text-sm tracking-[0.08em] text-foreground uppercase outline-none transition-colors focus:border-foreground disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
})

Select.displayName = "Select"

export { Select }

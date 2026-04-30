import { cn } from "@/lib/utils"

interface ProgressProps {
  value?: number
  className?: string
  indicatorClassName?: string
}

function Progress({
  value = 0,
  className,
  indicatorClassName,
}: ProgressProps) {
  const clampedValue = Math.min(100, Math.max(0, value))

  return (
    <div
      data-slot="progress"
      className={cn(
        "relative h-3 w-full overflow-hidden border border-border bg-muted",
        className
      )}
    >
      <div
        data-slot="progress-indicator"
        className={cn(
          "h-full bg-foreground transition-[width] duration-300 ease-out",
          indicatorClassName
        )}
        style={{ width: `${clampedValue}%` }}
      />
    </div>
  )
}

export { Progress }

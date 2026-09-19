import * as ProgressPrimitive from "@radix-ui/react-progress";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A meter, not a chart: recessive track, one color on the fill, and the value
 * always written beside it rather than read off the length.
 */
export function Progress({
  className,
  value = 0,
  indicatorClassName,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & { indicatorClassName?: string }) {
  const clamped = Math.min(Math.max(value ?? 0, 0), 100);
  return (
    <ProgressPrimitive.Root
      value={clamped}
      className={cn("bg-muted relative h-2 w-full overflow-hidden rounded-full", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          "bg-primary h-full rounded-full transition-[width] duration-500",
          indicatorClassName,
        )}
        style={{ width: clamped + "%" }}
      />
    </ProgressPrimitive.Root>
  );
}

import type { LucideIcon } from "lucide-react";

import { Amount } from "@/components/common/Amount";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A stat tile, not a chart: one number, its label, and at most one comparison.
 * The hero figure is the largest thing in the card and the only thing set in
 * tabular figures at that size.
 */
export function KpiTile({
  label,
  minor,
  direction = "neutral",
  icon: Icon,
  footer,
  accent,
  className,
}: {
  label: string;
  minor: number;
  direction?: "in" | "out" | "neutral" | "auto";
  icon: LucideIcon;
  footer?: React.ReactNode;
  accent?: string;
  className?: string;
}) {
  return (
    <Card className={cn("relative overflow-hidden p-4 sm:p-5", className)}>
      {accent ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-0.5"
          style={{ backgroundColor: accent }}
        />
      ) : null}

      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground min-w-0 text-[11px] font-bold tracking-wide uppercase">
          {label}
        </p>
        <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-lg sm:size-8">
          <Icon className="size-3.5 sm:size-4" />
        </span>
      </div>

      <Amount
        minor={minor}
        direction={direction}
        signed={false}
        className="mt-2.5 block text-xl font-extrabold tracking-tight sm:mt-3 sm:text-2xl"
      />

      {footer ? <div className="mt-2">{footer}</div> : null}
    </Card>
  );
}

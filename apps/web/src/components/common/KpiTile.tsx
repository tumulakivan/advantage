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
    <Card className={cn("relative overflow-hidden p-5", className)}>
      {accent ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-0.5"
          style={{ backgroundColor: accent }}
        />
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-[11px] font-bold tracking-wide uppercase">
          {label}
        </p>
        <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
          <Icon className="size-4" />
        </span>
      </div>

      <Amount
        minor={minor}
        direction={direction}
        signed={false}
        className="mt-3 block text-2xl font-extrabold tracking-tight"
      />

      {footer ? <div className="mt-2.5">{footer}</div> : null}
    </Card>
  );
}

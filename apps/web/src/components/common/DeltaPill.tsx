import { formatPercent } from "@advantage/core";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A month-over-month change. `goodWhen` exists because up is not always good:
 * income rising is healthy, spending rising is not.
 */
export function DeltaPill({
  ratio,
  goodWhen = "up",
  className,
}: {
  ratio: number | null;
  goodWhen?: "up" | "down";
  className?: string;
}) {
  if (ratio === null || !Number.isFinite(ratio)) {
    return (
      <span className={cn("text-muted-foreground text-[12px] font-medium", className)}>
        no prior month
      </span>
    );
  }

  const flat = Math.abs(ratio) < 0.005;
  const up = ratio > 0;
  const good = flat ? null : up === (goodWhen === "up");
  const Icon = flat ? ArrowRight : up ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[12px] font-bold",
        good === null && "text-muted-foreground",
        good === true && "text-money-in",
        good === false && "text-money-out",
        className,
      )}
    >
      <Icon className="size-3.5" />
      <span className="num">{flat ? "flat" : formatPercent(Math.abs(ratio))}</span>
      <span className="text-muted-foreground font-medium">vs last month</span>
    </span>
  );
}

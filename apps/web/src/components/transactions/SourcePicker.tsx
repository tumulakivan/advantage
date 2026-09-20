import type { IncomeSource } from "@advantage/api-client";
import { slotColor } from "@advantage/theme";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Income always answers "from where" before anything else, so the answer
 * belongs on screen as tappable cards rather than hidden in a dropdown.
 *
 * Text only, on purpose. These are whoever pays you - an employer, a client, a
 * tenant - and that is the user's business, not a brand we should be hosting a
 * logo for. What keeps the row scannable instead is the initial on a chip in
 * the source's own chart colour, which is the same colour it carries in the
 * income breakdown, so the card and the chart agree without anyone being asked
 * to remember which is which.
 */
export function SourcePicker({
  sources,
  value,
  onChange,
}: {
  sources: IncomeSource[];
  value: string | null;
  onChange: (source: IncomeSource) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Income source"
      className={cn("grid gap-2", sources.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2")}
    >
      {sources.map((source) => {
        const active = source.id === value;
        return (
          <button
            key={source.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(source)}
            className={cn(
              "group focus-visible:ring-ring/50 relative flex items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none",
              active
                ? "border-primary/60 bg-primary/8"
                : "border-border bg-background hover:border-input hover:bg-accent/40",
            )}
          >
            <SourceChip source={source} />

            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-bold">{source.shortName}</span>
              <span className="text-muted-foreground block truncate text-[12px]">
                {source.name}
              </span>
            </span>

            {active ? (
              <span className="bg-primary text-primary-foreground flex size-5 shrink-0 items-center justify-center rounded-full">
                <Check className="size-3" strokeWidth={3} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** The initial, tinted by the source's chart slot. Same box as an account mark. */
export function SourceChip({
  source,
  size = "md",
  className,
}: {
  /** Whatever the row carries. Joined rows leave any of these null. */
  source: { shortName?: string | null; name?: string | null; color?: string | null };
  size?: "sm" | "md";
  className?: string;
}) {
  const color = slotColor(source.color ?? undefined);
  const label = (source.shortName || source.name || "?").trim().slice(0, 1).toUpperCase();

  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: `color-mix(in oklab, ${color} 18%, transparent)`, color }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg font-extrabold",
        size === "sm" ? "size-7 text-[11px]" : "size-9 text-[13px]",
        className,
      )}
    >
      {label}
    </span>
  );
}

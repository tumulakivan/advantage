import type { IncomeSource } from "@advantage/db";
import { Check } from "lucide-react";

import { BrandMark } from "@/components/brand/BrandMark";
import { cn } from "@/lib/utils";

/**
 * Income always answers "from where" before anything else, and with only two
 * payers the answer belongs on screen as two tappable cards rather than hidden
 * in a dropdown. Each carries its own logo on a light chip, since both marks
 * are dark ink and would vanish on graphite.
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
            <BrandMark logo={source.logo} size="md" />

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

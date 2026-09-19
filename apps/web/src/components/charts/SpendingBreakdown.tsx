import { formatPercent, type BreakdownResult } from "@advantage/core";
import { slotColor } from "@advantage/theme";

import { Amount } from "@/components/common/Amount";
import { CategoryIcon } from "@/components/common/CategoryChip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Where the month went.
 *
 * Labeled horizontal bars instead of a donut: every row carries its own name,
 * amount and share, so identity never rests on hue and no two slices have to
 * be compared by angle. The strip on top still answers the part-to-whole
 * question a pie would - with a 2px surface gap between segments so adjacent
 * colors never touch.
 */
export function SpendingBreakdown({
  breakdown,
  icons,
  onSelect,
}: {
  breakdown: BreakdownResult;
  icons?: Record<string, string>;
  onSelect?: (key: string) => void;
}) {
  const { slices, totalMinor } = breakdown;
  const widest = slices[0]?.amountMinor ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
        {slices.map((slice) => (
          <span
            key={slice.key}
            title={slice.label}
            style={{
              width: `${Math.max(slice.share * 100, 1.5)}%`,
              backgroundColor: slotColor(slice.color),
            }}
          />
        ))}
      </div>

      <ul className="space-y-1">
        {slices.map((slice) => {
          const interactive = Boolean(onSelect) && !slice.isOther;
          return (
            <li key={slice.key}>
              <button
                type="button"
                disabled={!interactive}
                onClick={() => onSelect?.(slice.key)}
                className="group hover:bg-muted/50 flex w-full items-center gap-3 rounded-lg px-1.5 py-1.5 text-left transition-colors disabled:cursor-default"
              >
                <CategoryIcon
                  icon={icons?.[slice.key] ?? (slice.isOther ? "Tag" : undefined)}
                  color={slice.color}
                  size="sm"
                />

                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13.5px] font-semibold">{slice.label}</span>
                    <Amount
                      minor={slice.amountMinor}
                      signed={false}
                      hideCents
                      className="text-[13px]"
                    />
                  </span>

                  <span className="mt-1.5 flex items-center gap-2">
                    <span className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.max((slice.amountMinor / widest) * 100, 2)}%`,
                          backgroundColor: slotColor(slice.color),
                        }}
                      />
                    </span>
                    <span className="num text-muted-foreground w-9 text-right text-[11.5px] font-semibold">
                      {formatPercent(slice.share)}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="text-muted-foreground border-border border-t pt-3 text-[12px]">
        {slices.length} {slices.length === 1 ? "group" : "groups"} &middot; total{" "}
        <Amount minor={totalMinor} signed={false} className="text-foreground text-[12px]" />
        {breakdown.foldedCount > 0
          ? ` · ${breakdown.foldedCount} smaller groups folded into Other`
          : ""}
      </p>
    </div>
  );
}

export function BreakdownTable({ breakdown }: { breakdown: BreakdownResult }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Group</TableHead>
          <TableHead className="text-right">Spent</TableHead>
          <TableHead className="text-right">Share</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {breakdown.slices.map((slice) => (
          <TableRow key={slice.key}>
            <TableCell className="font-semibold">{slice.label}</TableCell>
            <TableCell className="text-right">
              <Amount minor={slice.amountMinor} signed={false} />
            </TableCell>
            <TableCell className="num text-muted-foreground text-right">
              {formatPercent(slice.share, undefined, 1)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

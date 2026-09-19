import { dateLabel, fullDateLabel, todayIso, type IsoDate } from "@advantage/core";
import type { TransactionRow } from "@advantage/db";
import { ArrowLeftRight, Repeat } from "lucide-react";
import * as React from "react";

import { Amount } from "@/components/common/Amount";
import { BrandMark } from "@/components/brand/BrandMark";
import { CategoryIcon } from "@/components/common/CategoryChip";
import { cn } from "@/lib/utils";
import { useSettings } from "@/providers/SettingsProvider";

/**
 * Records grouped by day with a running day total, which is how people
 * actually read a ledger: "what did Tuesday cost me".
 */
export function TransactionList({
  rows,
  onSelect,
  className,
}: {
  rows: TransactionRow[];
  onSelect?: (row: TransactionRow) => void;
  className?: string;
}) {
  const { settings } = useSettings();
  const thisYear = todayIso().slice(0, 4);

  const days = React.useMemo(() => {
    const grouped = new Map<IsoDate, TransactionRow[]>();
    for (const row of rows) {
      const bucket = grouped.get(row.date) ?? [];
      bucket.push(row);
      grouped.set(row.date, bucket);
    }
    return [...grouped.entries()].map(([date, items]) => ({
      date,
      items,
      netMinor: items.reduce((total, item) => {
        if (item.type === "income") return total + item.amountMinor;
        if (item.type === "expense") return total - item.amountMinor;
        return total;
      }, 0),
    }));
  }, [rows]);

  return (
    <div className={cn("divide-border divide-y", className)}>
      {days.map((day) => (
        <section key={day.date}>
          <header className="bg-muted/40 flex items-baseline justify-between gap-4 px-5 py-2">
            <h3 className="text-[12px] font-bold" title={fullDateLabel(day.date, settings.locale)}>
              {dateLabel(day.date, settings.locale)}
              {day.date.slice(0, 4) === thisYear ? null : (
                <span className="text-muted-foreground ml-2 font-medium">
                  {day.date.slice(0, 4)}
                </span>
              )}
            </h3>
            <Amount minor={day.netMinor} direction="auto" hideCents className="text-[12px]" />
          </header>

          <ul>
            {day.items.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onSelect?.(row)}
                  className="hover:bg-muted/40 flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors"
                >
                  {row.type === "income" && row.sourceLogo ? (
                    <BrandMark logo={row.sourceLogo} size="sm" />
                  ) : row.type === "transfer" ? (
                    <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-lg">
                      <ArrowLeftRight className="size-3.5" />
                    </span>
                  ) : (
                    <CategoryIcon icon={row.categoryIcon} color={row.categoryColor} size="sm" />
                  )}

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13.5px] font-semibold">
                        {row.payee ||
                          (row.type === "transfer"
                            ? `${row.accountName} to ${row.toAccountName}`
                            : row.categoryName) ||
                          "Untitled"}
                      </span>
                      {row.plannedPaymentId ? (
                        <span className="shrink-0" title="Posted from a planned payment">
                          <Repeat className="text-muted-foreground size-3" />
                        </span>
                      ) : null}
                    </span>

                    <span className="text-muted-foreground flex items-center gap-1.5 truncate text-[12px]">
                      {row.type === "income"
                        ? (row.sourceShortName ?? "Income")
                        : row.type === "transfer"
                          ? "Transfer"
                          : (row.categoryName ?? "Uncategorized")}
                      <span aria-hidden="true">&middot;</span>
                      {row.accountName}
                      {row.note ? (
                        <>
                          <span aria-hidden="true">&middot;</span>
                          <span className="truncate">{row.note}</span>
                        </>
                      ) : null}
                    </span>
                  </span>

                  <Amount
                    minor={row.amountMinor}
                    direction={
                      row.type === "income" ? "in" : row.type === "expense" ? "out" : "neutral"
                    }
                    className="shrink-0 text-[14px]"
                  />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

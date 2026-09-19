import {
  addMonths,
  dateLabel,
  monthEnd,
  monthLabel,
  monthStart,
  relativeDayLabel,
  todayIso,
  type Granularity,
  type MonthKey,
  type OutlookEntry,
} from "@advantage/core";
import { CalendarRange, ChevronLeft, ChevronRight, Telescope } from "lucide-react";
import * as React from "react";

import { BrandMark } from "@/components/brand/BrandMark";
import { ChartCard } from "@/components/charts/ChartCard";
import { OutlookChart, OutlookLegend, OutlookTable } from "@/components/charts/OutlookChart";
import { Amount } from "@/components/common/Amount";
import { CategoryIcon } from "@/components/common/CategoryChip";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOutlook } from "@/hooks/useData";
import { useMonth } from "@/hooks/useMonth";
import { cn } from "@/lib/utils";
import { useSettings } from "@/providers/SettingsProvider";

type Mode = "month" | "range" | "year";

const LIST_LIMIT = 120;

/**
 * Outlook: what the months ahead look like once the schedule is counted.
 *
 * It answers a question the rest of the dashboard cannot, because every other
 * card reads only what has already been logged. Here a planned occurrence is
 * projected forward and shown next to the records, clearly marked as the
 * difference between a promise and a receipt.
 */
export function OutlookCard() {
  const { settings } = useSettings();
  const { month } = useMonth();

  const [mode, setMode] = React.useState<Mode>("range");
  const [rangeFrom, setRangeFrom] = React.useState<MonthKey>(month);
  const [rangeTo, setRangeTo] = React.useState<MonthKey>(() => addMonths(month, 5));
  const [year, setYear] = React.useState(() => Number(month.slice(0, 4)));

  const window = React.useMemo(() => {
    if (mode === "month") {
      return {
        from: monthStart(month),
        to: monthEnd(month),
        granularity: "day" as Granularity,
        caption: `${monthLabel(month, settings.locale, "long")}, day by day`,
      };
    }

    if (mode === "year") {
      return {
        from: `${year}-01-01`,
        to: `${year}-12-31`,
        granularity: "month" as Granularity,
        caption: `${year}, month by month`,
      };
    }

    // Two pickers can be set in either order; read them as a span, not a pair.
    const [start, end] = rangeFrom <= rangeTo ? [rangeFrom, rangeTo] : [rangeTo, rangeFrom];
    return {
      from: monthStart(start),
      to: monthEnd(end),
      granularity: "month" as Granularity,
      caption: `${monthLabel(start, settings.locale, "long")} to ${monthLabel(
        end,
        settings.locale,
        "long",
      )}`,
    };
  }, [mode, month, rangeFrom, rangeTo, year, settings.locale]);

  const { data, loading } = useOutlook(
    window.from,
    window.to,
    settings.locale,
    window.granularity,
  );
  const { outlook, entries } = data;
  const { totals } = outlook;

  return (
    <section className="space-y-4">
      <ChartCard
        title="Outlook"
        description={`Projected from what is logged plus what is scheduled - ${window.caption}.`}
        legend={<OutlookLegend />}
        table={<OutlookTable outlook={outlook} />}
        actions={
          <TimeframeControls
            mode={mode}
            onModeChange={setMode}
            rangeFrom={rangeFrom}
            rangeTo={rangeTo}
            onRangeFrom={setRangeFrom}
            onRangeTo={setRangeTo}
            year={year}
            onYear={setYear}
          />
        }
      >
        {totals.loggedCount + totals.plannedCount === 0 ? (
          <EmptyState
            icon={Telescope}
            title={loading ? "Working it out" : "Nothing falls in this window"}
            description="Add a planned payment, or widen the timeframe."
          />
        ) : (
          <>
            <div className="border-border mb-4 grid gap-4 border-b pb-4 sm:grid-cols-3">
              <Metric
                label="Expected income"
                minor={totals.incomeMinor}
                direction="in"
                hint={monthlyRate(
                  totals.incomeMinor,
                  outlook.buckets.length,
                  outlook.granularity,
                  settings.locale,
                )}
              />
              <Metric
                label="Expected spending"
                minor={totals.expenseMinor}
                direction="out"
                hint={monthlyRate(
                  totals.expenseMinor,
                  outlook.buckets.length,
                  outlook.granularity,
                  settings.locale,
                )}
              />
              <Metric
                label="Projected net"
                minor={totals.netMinor}
                direction="auto"
                hint={
                  totals.plannedCount > 0
                    ? `${totals.loggedCount} logged · ${totals.plannedCount} still planned`
                    : "all logged"
                }
              />
            </div>
            <OutlookChart outlook={outlook} />
          </>
        )}
      </ChartCard>

      <EntryList entries={entries} caption={window.caption} />
    </section>
  );
}

/**
 * Rough per-month equivalent, so a 3-month window and a 12-month one can be
 * compared at a glance rather than by dividing in your head.
 */
function monthlyRate(minor: number, buckets: number, granularity: Granularity, locale: string): string {
  const months =
    granularity === "day" ? 1 : granularity === "month" ? Math.max(buckets, 1) : buckets * 12;
  const perMonth = Math.round(minor / Math.max(months, 1)) / 100;
  const compact = new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(perMonth);
  return `about ${compact} a month`;
}

function Metric({
  label,
  minor,
  direction,
  hint,
}: {
  label: string;
  minor: number;
  direction: "in" | "out" | "auto";
  hint: string;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-[11px] font-bold tracking-wide uppercase">{label}</p>
      <Amount
        minor={minor}
        direction={direction}
        signed={false}
        className="mt-1 block text-xl font-extrabold tracking-tight"
      />
      <p className="text-muted-foreground mt-0.5 text-[12px]">{hint}</p>
    </div>
  );
}

function TimeframeControls({
  mode,
  onModeChange,
  rangeFrom,
  rangeTo,
  onRangeFrom,
  onRangeTo,
  year,
  onYear,
}: {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  rangeFrom: MonthKey;
  rangeTo: MonthKey;
  onRangeFrom: (month: MonthKey) => void;
  onRangeTo: (month: MonthKey) => void;
  year: number;
  onYear: (year: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {mode === "range" ? (
        <div className="flex items-center gap-1.5">
          <Input
            type="month"
            aria-label="From month"
            value={rangeFrom}
            onChange={(event) => event.target.value && onRangeFrom(event.target.value)}
            className="h-8 w-[9.5rem] text-[13px]"
          />
          <span className="text-muted-foreground text-[12px]">to</span>
          <Input
            type="month"
            aria-label="To month"
            value={rangeTo}
            onChange={(event) => event.target.value && onRangeTo(event.target.value)}
            className="h-8 w-[9.5rem] text-[13px]"
          />
        </div>
      ) : null}

      {mode === "year" ? (
        <div className="border-border bg-card flex h-8 items-center gap-1 rounded-lg border px-1">
          <Button variant="ghost" size="icon-sm" onClick={() => onYear(year - 1)} aria-label="Previous year">
            <ChevronLeft />
          </Button>
          <span className="num min-w-12 text-center text-[13px] font-bold">{year}</span>
          <Button variant="ghost" size="icon-sm" onClick={() => onYear(year + 1)} aria-label="Next year">
            <ChevronRight />
          </Button>
        </div>
      ) : null}

      {mode === "month" ? (
        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[12px]">
          <CalendarRange className="size-3.5" />
          follows the month above
        </span>
      ) : null}

      <Tabs value={mode} onValueChange={(value) => onModeChange(value as Mode)}>
        <TabsList className="h-8">
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="range">Range</TabsTrigger>
          <TabsTrigger value="year">Year</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}

function EntryList({ entries, caption }: { entries: OutlookEntry[]; caption: string }) {
  const { settings } = useSettings();
  const today = todayIso();
  const shown = entries.slice(0, LIST_LIMIT);

  const plannedTotal = entries
    .filter((entry) => entry.kind === "planned")
    .reduce((sum, entry) => sum + (entry.direction === "income" ? entry.amountMinor : -entry.amountMinor), 0);

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
        <div>
          <h3 className="text-[15px] leading-none font-bold">What makes it up</h3>
          <p className="text-muted-foreground mt-1.5 text-[13px]">
            Every record and scheduled payment in {caption.toLowerCase()}.
          </p>
        </div>
        <p className="text-muted-foreground text-[12px]">
          {entries.length} {entries.length === 1 ? "item" : "items"}
          {plannedTotal !== 0 ? (
            <>
              {" · "}
              <Amount minor={plannedTotal} direction="auto" hideCents className="text-[12px]" />
              {" still only planned"}
            </>
          ) : null}
        </p>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={Telescope}
          title="Nothing in this window"
          description="Nothing is logged here and nothing is scheduled to land."
        />
      ) : (
        <>
          <ul
            data-testid="outlook-entries"
            className="max-h-[26rem] divide-y divide-border overflow-y-auto"
          >
            {shown.map((entry) => (
              <li
                key={entry.id}
                className={cn(
                  "flex items-center gap-3 px-5 py-2.5",
                  entry.kind === "planned" && "bg-muted/20",
                )}
              >
                {entry.direction === "income" && entry.sourceLogo ? (
                  <BrandMark logo={entry.sourceLogo} size="sm" />
                ) : (
                  <CategoryIcon icon={entry.categoryIcon} color={entry.categoryColor} size="sm" />
                )}

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[13.5px] font-semibold">{entry.label}</span>
                    {entry.kind === "planned" ? (
                      <Badge variant="neutral">planned</Badge>
                    ) : (
                      <Badge variant="good">logged</Badge>
                    )}
                  </span>
                  <span className="text-muted-foreground flex items-center gap-1.5 truncate text-[12px]">
                    {dateLabel(entry.date, settings.locale)}
                    <span aria-hidden="true">·</span>
                    {entry.date >= today ? relativeDayLabel(entry.date, today) : "already past"}
                    {entry.categoryName ? (
                      <>
                        <span aria-hidden="true">·</span>
                        {entry.categoryName}
                      </>
                    ) : null}
                    {entry.accountName ? (
                      <>
                        <span aria-hidden="true">·</span>
                        {entry.accountName}
                      </>
                    ) : null}
                  </span>
                </span>

                <Amount
                  minor={entry.amountMinor}
                  direction={entry.direction === "income" ? "in" : "out"}
                  className="shrink-0 text-[13.5px]"
                />
              </li>
            ))}
          </ul>

          {entries.length > shown.length ? (
            <CardContent className="border-border border-t py-3">
              <p className="text-muted-foreground text-[12px]">
                Showing the first {shown.length} of {entries.length}. Narrow the timeframe to see
                the rest.
              </p>
            </CardContent>
          ) : null}
        </>
      )}
    </Card>
  );
}

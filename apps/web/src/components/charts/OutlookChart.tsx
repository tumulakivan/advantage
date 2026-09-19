import { formatPercent, type Outlook, type OutlookBucket } from "@advantage/core";
import { SERIES } from "@advantage/theme";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartLegend } from "@/components/charts/ChartCard";
import { Amount } from "@/components/common/Amount";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { AXIS, compactMinor, CURSOR_FILL, GRID } from "@/lib/chart";
import { useMoney } from "@/providers/SettingsProvider";

/**
 * The same grammar as the cash-flow chart - income above the baseline, spending
 * below, net as a line - pointed forward instead of back.
 *
 * What separates fact from forecast is the "today" marker, not a second colour:
 * everything left of it is a record, everything right of it is a schedule that
 * has not happened yet. Position already tells you which, so the palette does
 * not have to carry a meaning it would carry badly.
 */
export function OutlookChart({ outlook }: { outlook: Outlook }) {
  const money = useMoney();
  const animate = !useReducedMotion();
  const { buckets, granularity, todayBucket } = outlook;

  // Daily windows run to ~60 bars; thin them so the labels do not collide.
  const tickInterval =
    granularity === "day" ? Math.max(0, Math.ceil(buckets.length / 8) - 1) : 0;

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={buckets} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barGap={2}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="label" {...AXIS} dy={6} interval={tickInterval} />
          <YAxis {...AXIS} tickFormatter={compactMinor} width={56} />
          <ReferenceLine y={0} stroke={AXIS.stroke} strokeOpacity={0.5} />

          {todayBucket ? (
            <ReferenceLine
              x={buckets.find((bucket) => bucket.key === todayBucket)?.label}
              stroke={AXIS.stroke}
              strokeDasharray="3 3"
              strokeOpacity={0.9}
              label={{
                value: "today",
                position: "insideTopLeft",
                fill: AXIS.stroke,
                fontSize: 10,
              }}
            />
          ) : null}

          <Tooltip
            cursor={{ fill: CURSOR_FILL }}
            content={(props) => (
              <OutlookTooltip
                active={props.active}
                label={props.label as string | undefined}
                payload={props.payload as OutlookTooltipProps["payload"]}
                money={money}
              />
            )}
          />

          <Bar
            dataKey="incomeMinor"
            name="Income"
            fill={SERIES.income}
            radius={[4, 4, 0, 0]}
            maxBarSize={granularity === "day" ? 12 : 26}
            isAnimationActive={animate}
          />
          <Bar
            dataKey="expenseSignedMinor"
            name="Spending"
            fill={SERIES.expense}
            radius={[0, 0, 4, 4]}
            maxBarSize={granularity === "day" ? 12 : 26}
            isAnimationActive={animate}
          />
          <Line
            type="monotone"
            dataKey="netLineMinor"
            name="Net"
            stroke={SERIES.net}
            strokeWidth={2}
            connectNulls={false}
            dot={{ r: 2, strokeWidth: 0, fill: SERIES.net }}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--chart-surface)" }}
            isAnimationActive={animate}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function OutlookLegend() {
  return (
    <ChartLegend
      items={[
        { label: "Income", color: SERIES.income },
        { label: "Spending", color: SERIES.expense },
        { label: "Net", color: SERIES.net, shape: "line" },
      ]}
    />
  );
}

interface OutlookTooltipProps {
  active?: boolean;
  label?: string | undefined;
  payload?: readonly { readonly payload?: OutlookBucket }[] | undefined;
  money: (minor: number, options?: { signed?: boolean }) => string;
}

function OutlookTooltip({ active, payload, label, money }: OutlookTooltipProps) {
  const bucket = payload?.[0]?.payload;
  if (!active || !bucket) return null;

  if (!bucket.hasEntries) {
    return (
      <div className="bg-popover border-border rounded-lg border p-3 shadow-xl">
        <p className="text-[12px] font-bold">{String(label)}</p>
        <p className="text-muted-foreground mt-1 text-[12px]">Nothing due</p>
      </div>
    );
  }

  return (
    <div className="bg-popover border-border min-w-48 rounded-lg border p-3 shadow-xl">
      <p className="text-[12px] font-bold">{String(label)}</p>
      <dl className="mt-2 space-y-1.5">
        <Row color={SERIES.income} label="Income" value={money(bucket.incomeMinor)} />
        <Row color={SERIES.expense} label="Spending" value={money(-bucket.expenseMinor)} />
        <Row
          color={SERIES.net}
          label="Net"
          value={money(bucket.netMinor, { signed: true })}
          emphasis
        />
      </dl>
      <p className="text-muted-foreground border-border mt-2 border-t pt-2 text-[11.5px]">
        {bucket.entryCount} {bucket.entryCount === 1 ? "item" : "items"}
        {bucket.plannedShare > 0
          ? ` · ${formatPercent(bucket.plannedShare)} still only planned`
          : " · all logged"}
      </p>
    </div>
  );
}

function Row({
  color,
  label,
  value,
  emphasis,
}: {
  color: string;
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <dt className="text-muted-foreground flex items-center gap-2 text-[12px] font-medium">
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-[3px]"
          style={{ backgroundColor: color }}
        />
        {label}
      </dt>
      <dd className={emphasis ? "num text-[12.5px] font-bold" : "num text-[12.5px] font-semibold"}>
        {value}
      </dd>
    </div>
  );
}

export function OutlookTable({ outlook }: { outlook: Outlook }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Period</TableHead>
          <TableHead className="text-right">Income</TableHead>
          <TableHead className="text-right">Spending</TableHead>
          <TableHead className="text-right">Net</TableHead>
          <TableHead className="text-right">Planned</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {outlook.buckets
          .filter((bucket) => bucket.hasEntries)
          .map((bucket) => (
            <TableRow key={bucket.key}>
              <TableCell className="font-semibold">{bucket.label}</TableCell>
              <TableCell className="text-right">
                <Amount minor={bucket.incomeMinor} direction="in" signed={false} hideCents />
              </TableCell>
              <TableCell className="text-right">
                <Amount minor={bucket.expenseMinor} direction="out" signed={false} hideCents />
              </TableCell>
              <TableCell className="text-right">
                <Amount minor={bucket.netMinor} direction="auto" hideCents />
              </TableCell>
              <TableCell className="text-right">
                {bucket.plannedShare > 0 ? (
                  <Badge variant="neutral">{formatPercent(bucket.plannedShare)}</Badge>
                ) : (
                  <Badge variant="good">logged</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );
}

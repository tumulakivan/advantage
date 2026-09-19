import type { CashflowPoint } from "@advantage/core";
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

import { Amount } from "@/components/common/Amount";
import { ChartLegend } from "@/components/charts/ChartCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { AXIS, compactMinor, CURSOR_FILL, GRID } from "@/lib/chart";
import { useMoney } from "@/providers/SettingsProvider";

/**
 * Income above the baseline, spending below it, net as a line.
 *
 * Position carries the direction, so the green/red pairing only reinforces
 * something the layout already says - which is what makes that pair legal at a
 * deuteranopic separation of 7.6. One money axis; the net line shares it
 * because it is the same unit, and a second scale would be a lie.
 */
export function CashflowChart({ data }: { data: CashflowPoint[] }) {
  const money = useMoney();
  const animate = !useReducedMotion();

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barGap={2}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="label" {...AXIS} dy={6} />
          <YAxis {...AXIS} tickFormatter={compactMinor} width={56} />
          <ReferenceLine y={0} stroke={AXIS.stroke} strokeOpacity={0.5} />
          <Tooltip
            cursor={{ fill: CURSOR_FILL }}
            content={(props) => (
              <CashflowTooltip
                active={props.active}
                label={props.label as string | undefined}
                payload={props.payload as CashflowTooltipProps["payload"]}
                money={money}
              />
            )}
          />
          <Bar
            dataKey="incomeMinor"
            name="Income"
            fill={SERIES.income}
            radius={[4, 4, 0, 0]}
            maxBarSize={26}
            isAnimationActive={animate}
          />
          <Bar
            dataKey="expenseSignedMinor"
            name="Spending"
            fill={SERIES.expense}
            radius={[0, 0, 4, 4]}
            maxBarSize={26}
            isAnimationActive={animate}
          />
          <Line
            type="monotone"
            dataKey="netLineMinor"
            name="Net"
            stroke={SERIES.net}
            strokeWidth={2}
            connectNulls={false}
            dot={{ r: 2.5, strokeWidth: 0, fill: SERIES.net }}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--chart-surface)" }}
            isAnimationActive={animate}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CashflowLegend() {
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

interface CashflowTooltipProps {
  active?: boolean;
  label?: string | undefined;
  payload?: readonly { readonly payload?: CashflowPoint }[] | undefined;
  money: (minor: number, options?: { signed?: boolean }) => string;
}

function CashflowTooltip({ active, payload, label, money }: CashflowTooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  if (!point.hasRecords) {
    return (
      <div className="bg-popover border-border rounded-lg border p-3 shadow-xl">
        <p className="text-[12px] font-bold">{String(label)}</p>
        <p className="text-muted-foreground mt-1 text-[12px]">No records</p>
      </div>
    );
  }

  return (
    <div className="bg-popover border-border min-w-44 rounded-lg border p-3 shadow-xl">
      <p className="text-[12px] font-bold">{String(label)}</p>
      <dl className="mt-2 space-y-1.5">
        <Row color={SERIES.income} label="Income" value={money(point.incomeMinor)} />
        <Row color={SERIES.expense} label="Spending" value={money(-point.expenseMinor)} />
        <Row
          color={SERIES.net}
          label="Net"
          value={money(point.netMinor, { signed: true })}
          emphasis
        />
      </dl>
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

export function CashflowTable({ data }: { data: CashflowPoint[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Month</TableHead>
          <TableHead className="text-right">Income</TableHead>
          <TableHead className="text-right">Spending</TableHead>
          <TableHead className="text-right">Net</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((point) => (
          <TableRow key={point.month}>
            <TableCell className="font-semibold">{point.label}</TableCell>
            {point.hasRecords ? (
              <>
                <TableCell className="text-right">
                  <Amount minor={point.incomeMinor} direction="in" signed={false} hideCents />
                </TableCell>
                <TableCell className="text-right">
                  <Amount minor={point.expenseMinor} direction="out" signed={false} hideCents />
                </TableCell>
                <TableCell className="text-right">
                  <Amount minor={point.netMinor} direction="auto" hideCents />
                </TableCell>
              </>
            ) : (
              <TableCell colSpan={3} className="text-muted-foreground text-right text-[13px]">
                No records
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

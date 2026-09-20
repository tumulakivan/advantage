import { formatPercent, relativeDayLabel } from "@advantage/core";
import { slotColor, SERIES } from "@advantage/theme";
import type { PlannedRow } from "@advantage/api-client";
import { postPlanned } from "@advantage/api-client";
import {
  CalendarClock,
  CircleAlert,
  Plus,
  Receipt,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import * as React from "react";
import { Link } from "react-router-dom";

import { SourceChip } from "@/components/transactions/SourcePicker";
import { CashflowChart, CashflowLegend, CashflowTable } from "@/components/charts/CashflowChart";
import { ChartCard } from "@/components/charts/ChartCard";
import { OutlookCard } from "@/components/dashboard/OutlookCard";
import { WalletCard } from "@/components/dashboard/WalletCard";
import { BreakdownTable, SpendingBreakdown } from "@/components/charts/SpendingBreakdown";
import { Amount } from "@/components/common/Amount";
import { CategoryIcon } from "@/components/common/CategoryChip";
import { DeltaPill } from "@/components/common/DeltaPill";
import { EmptyState } from "@/components/common/EmptyState";
import { KpiTile } from "@/components/common/KpiTile";
import { MonthSwitcher } from "@/components/layout/MonthSwitcher";
import { PageHeader } from "@/components/layout/PageHeader";
import { TransactionForm } from "@/components/transactions/TransactionForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useBudgets, useDashboard, useUpcoming } from "@/hooks/useData";
import { useMutation } from "@/hooks/useLiveQuery";
import { useMonth } from "@/hooks/useMonth";
import { useApi } from "@/providers/SessionProvider";
import { useSettings } from "@/providers/SettingsProvider";

export function DashboardPage() {
  const { month, isCurrent } = useMonth();
  const { settings } = useSettings();
  const [formOpen, setFormOpen] = React.useState(false);

  const { data, stale } = useDashboard(month, settings.locale);
  const budgets = useBudgets(month).data;
  const upcoming = useUpcoming(21).data;

  const icons = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const slice of data.breakdown.slices) {
      const icon = (slice as { icon?: string }).icon;
      if (icon) map[slice.key] = icon;
    }
    return map;
  }, [data.breakdown.slices]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description={
          isCurrent
            ? "Where this month stands, and what is still coming."
            : "A closed month, exactly as it happened."
        }
        actions={
          <>
            <MonthSwitcher />
            <Button onClick={() => setFormOpen(true)}>
              <Plus />
              New record
            </Button>
          </>
        }
      />

      {/* While the figures for a newly picked month are in flight, show the
          skeleton rather than last month's numbers under this month's heading.
          Wallet and Outlook are left mounted below: they run their own queries,
          handle their own staleness, and hold view state a remount would lose. */}
      {stale ? <DashboardSkeleton /> : null}

      <div className={stale ? "hidden" : "grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4"}>
        <KpiTile
          label="Income"
          minor={data.kpis.incomeMinor}
          direction="in"
          icon={TrendingUp}
          accent={SERIES.income}
          footer={<DeltaPill ratio={data.kpis.incomeDelta} goodWhen="up" />}
        />
        <KpiTile
          label="Spending"
          minor={data.kpis.expenseMinor}
          direction="out"
          icon={TrendingDown}
          accent={SERIES.expense}
          footer={<DeltaPill ratio={data.kpis.expenseDelta} goodWhen="down" />}
        />
        <KpiTile
          label="Net saved"
          minor={data.kpis.netMinor}
          direction="auto"
          icon={Target}
          accent={SERIES.net}
          footer={
            <p className="text-muted-foreground text-[12px] font-medium">
              <span className="num text-foreground font-bold">
                {formatPercent(data.kpis.savingsRate, settings.locale)}
              </span>{" "}
              of income kept
            </p>
          }
        />
        <KpiTile
          label="Net worth"
          minor={data.netWorthMinor}
          icon={Wallet}
          footer={
            <p className="text-muted-foreground text-[12px] font-medium">
              across every account
            </p>
          }
        />
      </div>

      <div className={stale ? "hidden" : "grid gap-4 xl:grid-cols-[1.55fr_1fr]"}>
        <ChartCard
          title="Cash flow"
          description="Last six months. Income above the line, spending below it."
          legend={<CashflowLegend />}
          table={<CashflowTable data={data.cashflow} />}
        >
          <CashflowChart data={data.cashflow} />
        </ChartCard>

        <ChartCard
          title="Where it went"
          description="Spending by group this month."
          table={<BreakdownTable breakdown={data.breakdown} />}
        >
          {data.breakdown.slices.length > 0 ? (
            <SpendingBreakdown breakdown={data.breakdown} icons={icons} />
          ) : (
            <EmptyState
              icon={Receipt}
              title="Nothing spent yet"
              description="Log an expense and the breakdown builds itself."
            />
          )}
        </ChartCard>
      </div>

      <WalletCard />

      <OutlookCard />

      <div className={stale ? "hidden" : "grid gap-4 xl:grid-cols-3"}>
        <IncomeSources sources={data.sources} totalMinor={data.kpis.incomeMinor} />
        <UpcomingCard rows={upcoming} />
        <BudgetsCard budgets={budgets} />
      </div>

      <Card className={stale ? "hidden" : undefined}>
        <CardHeader>
          <CardTitle>Biggest expenses this month</CardTitle>
        </CardHeader>
        <CardContent className="px-2">
          {data.largest.length === 0 ? (
            <EmptyState icon={Receipt} title="No expenses in this month" />
          ) : (
            <ul className="divide-border divide-y">
              {data.largest.map((row) => (
                <li key={row.id} className="flex items-center gap-3 px-3 py-2.5">
                  <CategoryIcon icon={row.categoryIcon} color={row.categoryColor} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold">
                      {row.payee || row.categoryName || "Untitled"}
                    </span>
                    <span className="text-muted-foreground block truncate text-[12px]">
                      {row.categoryName} &middot; {row.accountName} &middot; {row.date}
                    </span>
                  </span>
                  <Amount minor={row.amountMinor} direction="out" className="text-[13.5px]" />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <TransactionForm open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}

function IncomeSources({
  sources,
  totalMinor,
}: {
  sources: { id: string; name: string; shortName: string; logo: string | null; color: string | null; amountMinor: number }[];
  totalMinor: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Income by source</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sources.map((source) => {
          const share = totalMinor > 0 ? source.amountMinor / totalMinor : 0;
          return (
            <div key={source.id} className="flex items-center gap-3">
              <SourceChip source={source} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-[13.5px] font-semibold">{source.shortName}</p>
                  <Amount minor={source.amountMinor} direction="in" signed={false} hideCents />
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <Progress
                    value={share * 100}
                    className="h-1.5 flex-1"
                    indicatorClassName="bg-money-in"
                  />
                  <span className="num text-muted-foreground w-9 text-right text-[11.5px] font-semibold">
                    {formatPercent(share)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {sources.every((source) => source.amountMinor === 0) ? (
          <p className="text-muted-foreground text-[12.5px] leading-relaxed">
            No income logged this month yet.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function UpcomingCard({ rows }: { rows: PlannedRow[] }) {
  const api = useApi();
  const { run, pending } = useMutation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Coming up</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/planned">All planned</Link>
        </Button>
      </CardHeader>
      <CardContent className="px-2">
        {rows.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="Nothing due"
            description="Add a recurring bill so it stops living in your head."
          />
        ) : (
          <ul className="divide-border divide-y">
            {rows.slice(0, 6).map((row) => {
              const overdue = (row.daysUntilDue ?? 0) < 0 && !row.postedForCurrent;
              return (
                <li key={row.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span
                    aria-hidden="true"
                    className="h-8 w-0.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        row.type === "income" ? SERIES.income : slotColor(row.categoryColor),
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold">{row.name}</span>
                    <span className="text-muted-foreground flex items-center gap-1.5 text-[12px]">
                      {row.nextDueDate ? relativeDayLabel(row.nextDueDate) : "no next date"}
                      {overdue ? (
                        <Badge variant="critical" className="px-1.5 py-0">
                          <CircleAlert />
                          overdue
                        </Badge>
                      ) : null}
                      {row.postedForCurrent ? (
                        <Badge variant="good" className="px-1.5 py-0">
                          paid
                        </Badge>
                      ) : null}
                    </span>
                  </span>

                  <Amount
                    minor={row.amountMinor}
                    direction={row.type === "income" ? "in" : "out"}
                    hideCents
                    className="text-[13px]"
                  />

                  {!row.postedForCurrent ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => void run(() => postPlanned(api, row.id))}
                    >
                      Log it
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function BudgetsCard({ budgets }: { budgets: { id: string; categoryName: string | null; categoryIcon: string | null; categoryColor: string | null; spentMinor: number; amountMinor: number; verdict: { ratio: number; state: "ok" | "warning" | "over"; offPace: boolean } }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Budgets</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/budgets">Manage</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3.5">
        {budgets.length === 0 ? (
          <EmptyState
            icon={Target}
            title="No budgets set"
            description="Cap the groups that tend to run away."
          />
        ) : (
          budgets.slice(0, 5).map((budget) => (
            <div key={budget.id} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <CategoryIcon icon={budget.categoryIcon} color={budget.categoryColor} size="sm" />
                <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                  {budget.categoryName ?? "Everything"}
                </p>
                <span className="num text-muted-foreground text-[12px] font-semibold">
                  <Amount
                    minor={budget.spentMinor}
                    signed={false}
                    hideCents
                    className="text-foreground text-[12px]"
                  />
                  {" / "}
                  <Amount minor={budget.amountMinor} signed={false} hideCents className="text-[12px]" />
                </span>
              </div>
              <Progress
                value={budget.verdict.ratio * 100}
                indicatorClassName={
                  budget.verdict.state === "over"
                    ? "bg-critical"
                    : budget.verdict.state === "warning" || budget.verdict.offPace
                      ? "bg-warning"
                      : "bg-primary"
                }
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="h-[124px] rounded-xl" />
      ))}
    </div>
  );
}

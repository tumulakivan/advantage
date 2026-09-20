import { formatPercent, type BudgetVerdict } from "@advantage/core";
import { deleteBudget, upsertBudget, type BudgetRow } from "@advantage/api-client";
import { Loader2, Plus, Target, Trash2, TriangleAlert } from "lucide-react";
import * as React from "react";

import { Amount } from "@/components/common/Amount";
import { CategoryIcon } from "@/components/common/CategoryChip";
import { EmptyState } from "@/components/common/EmptyState";
import { MonthSwitcher } from "@/components/layout/MonthSwitcher";
import { PageHeader } from "@/components/layout/PageHeader";
import { AmountField } from "@/components/transactions/AmountField";
import { CategorySelect } from "@/components/transactions/CategorySelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useBudgets, useCategoryOptions } from "@/hooks/useData";
import { useMutation } from "@/hooks/useLiveQuery";
import { useMonth } from "@/hooks/useMonth";
import { cn } from "@/lib/utils";
import { useApi } from "@/providers/SessionProvider";
import { useSettings } from "@/providers/SettingsProvider";

export function BudgetsPage() {
  const { month, label } = useMonth();
  const { data: budgets } = useBudgets(month);
  const [editing, setEditing] = React.useState<BudgetRow | null>(null);
  const [open, setOpen] = React.useState(false);

  const totals = budgets.reduce(
    (sum, budget) => ({
      limit: sum.limit + budget.amountMinor,
      spent: sum.spent + budget.spentMinor,
    }),
    { limit: 0, spent: 0 },
  );
  const overCount = budgets.filter((budget) => budget.verdict.state === "over").length;
  const paceCount = budgets.filter((budget) => budget.verdict.offPace).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Budgets"
        description={`Monthly limits, measured against what ${label} has actually cost.`}
        actions={
          <>
            <MonthSwitcher />
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus />
              Set a budget
            </Button>
          </>
        }
      />

      {budgets.length > 0 ? (
        <Card>
          <CardContent className="grid gap-5 py-5 sm:grid-cols-3">
            <Metric label="Budgeted" node={<Amount minor={totals.limit} signed={false} />} />
            <Metric
              label="Spent"
              node={<Amount minor={totals.spent} signed={false} />}
              hint={`${formatPercent(totals.limit > 0 ? totals.spent / totals.limit : 0)} of the total`}
            />
            <Metric
              label="Left"
              node={<Amount minor={totals.limit - totals.spent} direction="auto" />}
              hint={
                overCount > 0
                  ? `${overCount} ${overCount === 1 ? "budget" : "budgets"} over the limit`
                  : paceCount > 0
                    ? `${paceCount} ${paceCount === 1 ? "budget" : "budgets"} running hot`
                    : "all on pace"
              }
            />
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden p-0">
        {budgets.length === 0 ? (
          <EmptyState
            icon={Target}
            title="No budgets yet"
            description="Pick the groups that tend to run away - utilities, installments, food - and give each a ceiling."
            action={
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                <Plus />
                Set a budget
              </Button>
            }
          />
        ) : (
          <ul className="divide-border divide-y">
            {budgets.map((budget) => (
              <li key={budget.id}>
                <BudgetRowView
                  budget={budget}
                  onEdit={() => {
                    setEditing(budget);
                    setOpen(true);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <BudgetDialog open={open} onOpenChange={setOpen} budget={editing} month={month} />
    </div>
  );
}

function Metric({
  label,
  node,
  hint,
}: {
  label: string;
  node: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-[11px] font-bold tracking-wide uppercase">{label}</p>
      <p className="mt-1.5 text-xl font-extrabold tracking-tight">{node}</p>
      {hint ? <p className="text-muted-foreground mt-0.5 text-[12px]">{hint}</p> : null}
    </div>
  );
}

function verdictBadge(verdict: BudgetVerdict) {
  if (verdict.state === "over") {
    return (
      <Badge variant="critical">
        <TriangleAlert />
        over by {formatPercent(verdict.ratio - 1)}
      </Badge>
    );
  }
  if (verdict.offPace) {
    return (
      <Badge variant="warning">
        <TriangleAlert />
        on pace to overspend
      </Badge>
    );
  }
  if (verdict.state === "warning") {
    return <Badge variant="warning">nearly spent</Badge>;
  }
  return <Badge variant="good">on track</Badge>;
}

function BudgetRowView({ budget, onEdit }: { budget: BudgetRow; onEdit: () => void }) {
  const api = useApi();
  const { run, pending } = useMutation();
  const { settings } = useSettings();

  return (
    <div className="flex flex-wrap items-center gap-4 px-5 py-4">
      <CategoryIcon icon={budget.categoryIcon} color={budget.categoryColor} size="lg" />

      <div className="min-w-[14rem] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14px] font-bold">{budget.categoryName ?? "Everything"}</p>
          {verdictBadge(budget.verdict)}
        </div>

        <div className="mt-2 flex items-center gap-3">
          <Progress
            value={budget.verdict.ratio * 100}
            className="h-2 flex-1"
            indicatorClassName={
              budget.verdict.state === "over"
                ? "bg-critical"
                : budget.verdict.state === "warning" || budget.verdict.offPace
                  ? "bg-warning"
                  : "bg-primary"
            }
          />
          <span className="num text-muted-foreground w-11 text-right text-[12px] font-bold">
            {formatPercent(budget.verdict.ratio, settings.locale)}
          </span>
        </div>

        <p className="text-muted-foreground mt-1.5 text-[12px]">
          <Amount minor={budget.spentMinor} signed={false} className="text-foreground text-[12px]" />
          {" spent of "}
          <Amount minor={budget.amountMinor} signed={false} className="text-[12px]" />
          {" · projected "}
          <Amount minor={budget.verdict.projectedMinor} signed={false} className="text-[12px]" />
          {" by month end"}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <div className="text-right">
          <p className="text-muted-foreground text-[11px] font-bold tracking-wide uppercase">
            {budget.verdict.remainingMinor < 0 ? "Over" : "Left"}
          </p>
          {/* The label already says "Over", so the number does not repeat it. */}
          <Amount
            minor={Math.abs(budget.verdict.remainingMinor)}
            signed={false}
            className={cn(
              "text-[15px] font-extrabold",
              budget.verdict.remainingMinor < 0 && "text-money-out",
            )}
          />
        </div>

        <Button variant="outline" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={pending}
          onClick={() => void run(() => deleteBudget(api, budget.id))}
          title="Remove budget"
        >
          <Trash2 className="text-destructive" />
        </Button>
      </div>
    </div>
  );
}

function BudgetDialog({
  open,
  onOpenChange,
  budget,
  month,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget: BudgetRow | null;
  month: string;
}) {
  const api = useApi();
  const { run, pending, error } = useMutation();
  const options = useCategoryOptions("expense").data;
  const [categoryId, setCategoryId] = React.useState<string | null>(null);
  const [amountMinor, setAmountMinor] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setCategoryId(budget?.categoryId ?? null);
    setAmountMinor(budget?.amountMinor ?? null);
  }, [open, budget]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!amountMinor) return;
    const saved = await run(() =>
      upsertBudget(api, { categoryId, amountMinor, startMonth: month }),
    );
    if (saved !== null) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{budget ? "Edit budget" : "Set a budget"}</DialogTitle>
            <DialogDescription>
              A budget on a group counts its subcategories too, so a cap on Food covers groceries
              and coffee without setting either.
            </DialogDescription>
          </DialogHeader>

          <Field label="Category" hint="Leave empty for an overall spending cap.">
            <CategorySelect
              options={options}
              value={categoryId}
              onChange={setCategoryId}
              placeholder="Everything"
            />
          </Field>

          <Field label="Monthly limit">
            <AmountField value={amountMinor} onChange={setAmountMinor} direction="neutral" />
          </Field>

          {error ? (
            <p className="text-destructive text-[13px] font-medium">{error}</p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !amountMinor}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Save budget
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

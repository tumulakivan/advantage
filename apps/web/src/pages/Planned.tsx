import {
  FREQUENCIES,
  relativeDayLabel,
  todayIso,
  type Frequency,
} from "@advantage/core";
import {
  createPlanned,
  deletePlanned,
  postPlanned,
  unpostPlanned,
  updatePlanned,
  type IncomeSource,
  type PlannedRow,
} from "@advantage/api-client";
import { CalendarClock, Check, Loader2, Plus, Trash2, Undo2 } from "lucide-react";
import * as React from "react";

import { SourceChip } from "@/components/transactions/SourcePicker";
import { Amount } from "@/components/common/Amount";
import { CategoryIcon } from "@/components/common/CategoryChip";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { AccountSelect } from "@/components/transactions/AccountSelect";
import { AmountField } from "@/components/transactions/AmountField";
import { CategorySelect } from "@/components/transactions/CategorySelect";
import { SourcePicker } from "@/components/transactions/SourcePicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAccounts, useCategoryOptions, useIncomeSources, usePlanned } from "@/hooks/useData";
import { useMutation } from "@/hooks/useLiveQuery";
import { useApi } from "@/providers/SessionProvider";
import { cn } from "@/lib/utils";

const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  once: "One off",
};

/**
 * The recurring ledger. This is the screen that replaces the spreadsheet: every
 * fixed bill, installment and payout, with one tap to turn a due item into a
 * real record.
 */
export function PlannedPage() {
  const { data: rows } = usePlanned(true);
  const [editing, setEditing] = React.useState<PlannedRow | null>(null);
  const [open, setOpen] = React.useState(false);

  const active = rows.filter((row) => row.active);
  // No next date means it has come and gone - a one-off that fired, or a series
  // past its end date. Either way it is history, not a plan, so it drops out of
  // the queue rather than sitting in "Later" forever with no date.
  const settled = active.filter((row) => row.nextDueDate === null);
  const pending = active.filter((row) => !settled.includes(row));

  const groups = {
    overdue: pending.filter((row) => (row.daysUntilDue ?? 0) < 0 && !row.postedForCurrent),
    soon: pending.filter((row) => (row.daysUntilDue ?? 99) >= 0 && (row.daysUntilDue ?? 99) <= 7),
    later: pending.filter((row) => (row.daysUntilDue ?? 99) > 7),
    settled,
    paused: rows.filter((row) => !row.active),
  };

  // Weekly items are annualised to a month so the two sides compare honestly:
  // a weekly payout is not a monthly one, but leaving it out understates income.
  const perMonth = (row: PlannedRow) =>
    row.frequency === "weekly"
      ? Math.round((row.amountMinor * 52) / 12)
      : row.frequency === "monthly"
        ? row.amountMinor
        : 0;

  const monthlyOut = pending
    .filter((row) => row.type === "expense")
    .reduce((total, row) => total + perMonth(row), 0);
  const monthlyIn = pending
    .filter((row) => row.type === "income")
    .reduce((total, row) => total + perMonth(row), 0);

  const oneOffOut = pending
    .filter((row) => row.type === "expense" && row.frequency === "once")
    .reduce((total, row) => total + row.amountMinor, 0);

  function add() {
    setEditing(null);
    setOpen(true);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Planned payments"
        description="Bills, installments and payouts that repeat. Mark one paid and it becomes a record."
        actions={
          <Button onClick={add}>
            <Plus />
            Add planned
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-muted-foreground text-[11px] font-bold tracking-wide uppercase">
            Recurring income, monthly
          </p>
          <Amount
            minor={monthlyIn}
            direction="in"
            signed={false}
            className="mt-2 block text-xl font-extrabold"
          />
        </Card>
        <Card className="p-5">
          <p className="text-muted-foreground text-[11px] font-bold tracking-wide uppercase">
            Recurring bills, monthly
          </p>
          <Amount
            minor={monthlyOut}
            direction="out"
            signed={false}
            className="mt-2 block text-xl font-extrabold"
          />
        </Card>
        <Card className="p-5">
          <p className="text-muted-foreground text-[11px] font-bold tracking-wide uppercase">
            Left over each month
          </p>
          <Amount
            minor={monthlyIn - monthlyOut}
            direction="auto"
            className="mt-2 block text-xl font-extrabold"
          />
          {oneOffOut > 0 ? (
            <p className="text-muted-foreground mt-1 text-[12px]">
              before{" "}
              <Amount minor={oneOffOut} signed={false} className="text-[12px]" /> of one-off
              payments still scheduled
            </p>
          ) : null}
        </Card>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarClock}
            title="Nothing planned yet"
            description="Add the bills you pay every month - internet, electricity, installments - and stop tracking them in your head."
            action={
              <Button size="sm" onClick={add}>
                <Plus />
                Add planned
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <Section title="Overdue" tone="critical" rows={groups.overdue} onEdit={setEditingOpen} />
          <Section title="Next 7 days" rows={groups.soon} onEdit={setEditingOpen} />
          <Section title="Later" rows={groups.later} onEdit={setEditingOpen} />
          <Section title="Done" rows={groups.settled} onEdit={setEditingOpen} muted />
          <Section title="Paused" rows={groups.paused} onEdit={setEditingOpen} muted />
        </div>
      )}

      <PlannedDialog open={open} onOpenChange={setOpen} planned={editing} />
    </div>
  );

  function setEditingOpen(row: PlannedRow) {
    setEditing(row);
    setOpen(true);
  }
}

function Section({
  title,
  rows,
  onEdit,
  tone,
  muted,
}: {
  title: string;
  rows: PlannedRow[];
  onEdit: (row: PlannedRow) => void;
  tone?: "critical";
  muted?: boolean;
}) {
  if (rows.length === 0) return null;

  return (
    <Card className={cn("overflow-hidden p-0", muted && "opacity-70")}>
      <CardHeader className="pb-2">
        <CardTitle className={cn("text-[13px]", tone === "critical" && "text-critical")}>
          {title}
          <span className="text-muted-foreground ml-2 font-semibold">{rows.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <ul className="divide-border divide-y">
          {rows.map((row) => (
            <li key={row.id}>
              <PlannedRowView row={row} onEdit={() => onEdit(row)} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function PlannedRowView({ row, onEdit }: { row: PlannedRow; onEdit: () => void }) {
  const api = useApi();
  const { run, pending } = useMutation();
  const overdue = (row.daysUntilDue ?? 0) < 0 && !row.postedForCurrent;

  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
      {row.type === "income" && row.sourceName ? (
        <SourceChip source={{ shortName: row.sourceName, name: row.name, color: row.sourceColor }} />
      ) : (
        <CategoryIcon icon={row.categoryIcon} color={row.categoryColor} size="md" />
      )}

      <div className="min-w-[12rem] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13.5px] font-bold">{row.name}</p>
          <Badge variant="neutral">{FREQUENCY_LABELS[row.frequency]}</Badge>
          {row.postedForCurrent ? (
            <Badge variant="good">
              <Check />
              logged
            </Badge>
          ) : null}
          {overdue ? <Badge variant="critical">overdue</Badge> : null}
        </div>
        <p className="text-muted-foreground mt-0.5 text-[12px]">
          {row.nextDueDate
            ? `Due ${row.nextDueDate} · ${relativeDayLabel(row.nextDueDate)}`
            : "No upcoming date"}
          {row.categoryName ? ` · ${row.categoryName}` : ""}
          {row.accountName ? ` · ${row.accountName}` : ""}
        </p>
      </div>

      <Amount
        minor={row.amountMinor}
        direction={row.type === "income" ? "in" : "out"}
        className="text-[14px]"
      />

      <div className="flex items-center gap-2">
        {row.active && !row.postedForCurrent ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => void run(() => postPlanned(api, row.id))}
          >
            Log it
          </Button>
        ) : null}

        {row.postedForCurrent ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => void run(() => unpostPlanned(api, row.id))}
            title="Delete the record this created and mark it unpaid again"
          >
            <Undo2 />
            Undo
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={pending}
          onClick={() => void run(() => deletePlanned(api, row.id))}
          title="Delete"
        >
          <Trash2 className="text-destructive" />
        </Button>
      </div>
    </div>
  );
}

interface PlannedFormState {
  name: string;
  type: "expense" | "income";
  amountMinor: number | null;
  frequency: Frequency;
  anchorDate: string;
  accountId: string | null;
  categoryId: string | null;
  incomeSourceId: string | null;
  note: string;
  active: boolean;
}

function PlannedDialog({
  open,
  onOpenChange,
  planned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planned: PlannedRow | null;
}) {
  const api = useApi();
  const { run, pending, error } = useMutation();
  const accounts = useAccounts().data;
  const sources = useIncomeSources().data;
  const [state, setState] = React.useState<PlannedFormState>(() => blank());
  const categories = useCategoryOptions(state.type).data;

  function blank(): PlannedFormState {
    return {
      name: "",
      type: "expense",
      amountMinor: null,
      frequency: "monthly",
      anchorDate: todayIso(),
      accountId: null,
      categoryId: null,
      incomeSourceId: null,
      note: "",
      active: true,
    };
  }

  React.useEffect(() => {
    if (!open) return;
    setState(
      planned
        ? {
            name: planned.name,
            type: planned.type,
            amountMinor: planned.amountMinor,
            frequency: planned.frequency,
            anchorDate: planned.anchorDate,
            accountId: planned.accountId,
            categoryId: planned.categoryId,
            incomeSourceId: planned.incomeSourceId,
            note: planned.note ?? "",
            active: planned.active,
          }
        : blank(),
    );
  }, [open, planned]);

  React.useEffect(() => {
    if (state.accountId || accounts.length === 0) return;
    setState((current) => ({ ...current, accountId: accounts[0]?.id ?? null }));
  }, [accounts, state.accountId]);

  const patch = (next: Partial<PlannedFormState>) =>
    setState((current) => ({ ...current, ...next }));

  const invalid = !state.name.trim() || !state.amountMinor || !state.accountId;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (invalid) return;

    const payload = {
      name: state.name.trim(),
      type: state.type,
      amountMinor: state.amountMinor ?? 0,
      frequency: state.frequency,
      anchorDate: state.anchorDate,
      accountId: state.accountId,
      categoryId: state.categoryId,
      incomeSourceId: state.type === "income" ? state.incomeSourceId : null,
      note: state.note.trim() || null,
      active: state.active,
    };

    const saved = await run(async () => {
      if (planned) await updatePlanned(api, planned.id, payload);
      else await createPlanned(api, payload);
      return true;
    });
    if (saved) onOpenChange(false);
  }

  function pickSource(source: IncomeSource) {
    patch({
      incomeSourceId: source.id,
      categoryId: state.categoryId ?? source.defaultCategoryId ?? null,
      name: state.name || source.name,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{planned ? "Edit planned payment" : "Add a planned payment"}</DialogTitle>
            <DialogDescription>
              The due day comes from the date below - set it to the next time this lands.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
            {(["expense", "income"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => patch({ type: value, categoryId: null, incomeSourceId: null })}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[13px] font-bold capitalize transition-colors",
                  state.type === value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {value === "expense" ? "Bill or payment" : "Income"}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="planned-name">
              <Input
                id="planned-name"
                value={state.name}
                onChange={(event) => patch({ name: event.target.value })}
                placeholder="Converge, VECO, Shopee installment"
              />
            </Field>

            <Field label="Amount">
              <AmountField
                value={state.amountMinor}
                onChange={(minor) => patch({ amountMinor: minor })}
                direction={state.type === "income" ? "in" : "out"}
                id="planned-amount"
              />
            </Field>
          </div>

          {state.type === "income" ? (
            <Field label="Income source">
              <SourcePicker
                sources={sources}
                value={state.incomeSourceId}
                onChange={pickSource}
              />
            </Field>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Repeats">
              <Select
                value={state.frequency}
                onValueChange={(value) => patch({ frequency: value as Frequency })}
              >
                <SelectTrigger aria-label="Frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((frequency) => (
                    <SelectItem key={frequency} value={frequency}>
                      {FREQUENCY_LABELS[frequency]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Next due" htmlFor="planned-date">
              <Input
                id="planned-date"
                type="date"
                value={state.anchorDate}
                onChange={(event) => patch({ anchorDate: event.target.value })}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category">
              <CategorySelect
                options={categories}
                value={state.categoryId}
                onChange={(id) => patch({ categoryId: id })}
              />
            </Field>

            <Field label="Paid from">
              <AccountSelect
                accounts={accounts}
                value={state.accountId}
                onChange={(id) => patch({ accountId: id })}
              />
            </Field>
          </div>

          <Field label="Note" htmlFor="planned-note">
            <Textarea
              id="planned-note"
              rows={2}
              value={state.note}
              onChange={(event) => patch({ note: event.target.value })}
            />
          </Field>

          <label className="border-border flex items-center justify-between gap-4 rounded-lg border px-3.5 py-2.5">
            <span>
              <span className="block text-[13px] font-semibold">Active</span>
              <span className="text-muted-foreground block text-[12px]">
                Paused items keep their history but stop showing up as due.
              </span>
            </span>
            <Switch
              checked={state.active}
              onCheckedChange={(checked) => patch({ active: checked })}
            />
          </label>

          {error ? <p className="text-destructive text-[13px] font-medium">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || invalid}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {planned ? "Save changes" : "Add planned"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

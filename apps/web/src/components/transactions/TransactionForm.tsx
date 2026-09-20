import { todayIso, type TransactionType } from "@advantage/core";
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
  type IncomeSource,
  type TransactionRow,
} from "@advantage/api-client";
import { ArrowLeftRight, Loader2, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import * as React from "react";

import { AccountSelect } from "@/components/transactions/AccountSelect";
import { AmountField } from "@/components/transactions/AmountField";
import { CategorySelect } from "@/components/transactions/CategorySelect";
import { SourcePicker } from "@/components/transactions/SourcePicker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogTitle,
  SheetContent,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/label";
import { Input, Textarea } from "@/components/ui/input";
import { useAccounts, useCategoryOptions, useIncomeSources } from "@/hooks/useData";
import { useMutation } from "@/hooks/useLiveQuery";
import { useApi } from "@/providers/SessionProvider";
import { cn } from "@/lib/utils";

interface FormState {
  type: TransactionType;
  amountMinor: number | null;
  date: string;
  accountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  incomeSourceId: string | null;
  payee: string;
  note: string;
}

function initialState(record?: TransactionRow | null, type: TransactionType = "expense"): FormState {
  return {
    type: record?.type ?? type,
    amountMinor: record?.amountMinor ?? null,
    date: record?.date ?? todayIso(),
    accountId: record?.accountId ?? null,
    toAccountId: record?.toAccountId ?? null,
    categoryId: record?.categoryId ?? null,
    incomeSourceId: record?.incomeSourceId ?? null,
    payee: record?.payee ?? "",
    note: record?.note ?? "",
  };
}

const TYPES: { value: TransactionType; label: string; icon: typeof TrendingUp }[] = [
  { value: "expense", label: "Expense", icon: TrendingDown },
  { value: "income", label: "Income", icon: TrendingUp },
  { value: "transfer", label: "Transfer", icon: ArrowLeftRight },
];

/**
 * One sheet for all three kinds of record. The type switch is the first control
 * because it decides what the rest of the form even means; everything below it
 * is the shortest set of fields that kind needs and nothing more.
 */
export function TransactionForm({
  open,
  onOpenChange,
  record,
  defaultType = "expense",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record?: TransactionRow | null;
  defaultType?: TransactionType;
}) {
  const api = useApi();
  const { run, pending, error } = useMutation();
  const [state, setState] = React.useState<FormState>(() => initialState(record, defaultType));
  const [touched, setTouched] = React.useState(false);

  const accounts = useAccounts().data;
  const sources = useIncomeSources().data;
  const categories = useCategoryOptions(state.type === "income" ? "income" : "expense").data;

  // Reopening the sheet is a fresh form; editing loads that record.
  React.useEffect(() => {
    if (open) {
      setState(initialState(record, defaultType));
      setTouched(false);
    }
  }, [open, record, defaultType]);

  // Default the account once they load, so the common case is one tap shorter.
  React.useEffect(() => {
    if (state.accountId || accounts.length === 0) return;
    setState((current) => ({ ...current, accountId: accounts[0]?.id ?? null }));
  }, [accounts, state.accountId]);

  const patch = (next: Partial<FormState>) => setState((current) => ({ ...current, ...next }));

  function pickSource(source: IncomeSource) {
    patch({
      incomeSourceId: source.id,
      categoryId: state.categoryId ?? source.defaultCategoryId ?? null,
      accountId: state.accountId ?? source.defaultAccountId ?? null,
      payee: state.payee || source.name,
    });
  }

  const problems: Partial<Record<keyof FormState, string>> = {};
  if (!state.amountMinor || state.amountMinor === 0) problems.amountMinor = "Enter an amount.";
  if (!state.date) problems.date = "Pick a date.";
  if (!state.accountId) problems.accountId = "Pick an account.";
  if (state.type === "expense" && !state.categoryId) problems.categoryId = "Pick a category.";
  if (state.type === "income" && !state.incomeSourceId) {
    problems.incomeSourceId = "Choose which business this came from.";
  }
  if (state.type === "transfer") {
    if (!state.toAccountId) problems.toAccountId = "Pick the destination account.";
    else if (state.toAccountId === state.accountId) {
      problems.toAccountId = "Pick a different destination.";
    }
  }
  const invalid = Object.keys(problems).length > 0;
  const showProblem = (key: keyof FormState) => (touched ? (problems[key] ?? null) : null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (invalid) return;

    const payload = {
      type: state.type,
      amountMinor: state.amountMinor ?? 0,
      date: state.date,
      accountId: state.accountId!,
      toAccountId: state.type === "transfer" ? state.toAccountId : null,
      categoryId: state.type === "transfer" ? null : state.categoryId,
      incomeSourceId: state.type === "income" ? state.incomeSourceId : null,
      payee: state.payee.trim() || null,
      note: state.note.trim() || null,
    };

    const saved = await run(async () => {
      if (record) await updateTransaction(api, record.id, payload);
      else await createTransaction(api, payload);
      return true;
    });
    if (saved) onOpenChange(false);
  }

  async function remove() {
    if (!record) return;
    const removed = await run(async () => {
      await deleteTransaction(api, record.id);
      return true;
    });
    if (removed) onOpenChange(false);
  }

  const direction = state.type === "income" ? "in" : state.type === "expense" ? "out" : "neutral";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent aria-describedby={undefined}>
        <form onSubmit={submit} className="flex h-full flex-col">
          <div className="border-border border-b px-6 py-5 pr-12">
            <DialogTitle>{record ? "Edit record" : "New record"}</DialogTitle>
            <DialogDescription>
              {record ? "Change anything and save." : "Log what moved, and where it went."}
            </DialogDescription>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div
              role="radiogroup"
              aria-label="Record type"
              className="bg-muted grid grid-cols-3 gap-1 rounded-lg p-1"
            >
              {TYPES.map((option) => {
                const active = state.type === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() =>
                      patch({
                        type: option.value,
                        categoryId: null,
                        incomeSourceId: null,
                        toAccountId: null,
                      })
                    }
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-bold transition-colors",
                      active
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <option.icon className="size-3.5" />
                    {option.label}
                  </button>
                );
              })}
            </div>

            <Field label="Amount" htmlFor="amount" error={showProblem("amountMinor")}>
              <AmountField
                value={state.amountMinor}
                onChange={(minor) => patch({ amountMinor: minor })}
                direction={direction}
                autoFocus
              />
            </Field>

            {state.type === "income" ? (
              <Field
                label="Income source"
                error={showProblem("incomeSourceId")}
                hint={sources.length === 0 ? "Add a source in Settings first." : undefined}
              >
                <SourcePicker
                  sources={sources}
                  value={state.incomeSourceId}
                  onChange={pickSource}
                />
              </Field>
            ) : null}

            {state.type !== "transfer" ? (
              <Field label="Category" htmlFor="category" error={showProblem("categoryId")}>
                <CategorySelect
                  id="category"
                  options={categories}
                  value={state.categoryId}
                  onChange={(id) => patch({ categoryId: id })}
                  placeholder={
                    state.type === "income" ? "Pick an income type" : "Pick a category"
                  }
                />
              </Field>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={state.type === "transfer" ? "From" : "Account"}
                htmlFor="account"
                error={showProblem("accountId")}
              >
                <AccountSelect
                  id="account"
                  accounts={accounts}
                  value={state.accountId}
                  onChange={(id) => patch({ accountId: id })}
                />
              </Field>

              {state.type === "transfer" ? (
                <Field label="To" htmlFor="to-account" error={showProblem("toAccountId")}>
                  <AccountSelect
                    id="to-account"
                    accounts={accounts}
                    value={state.toAccountId}
                    onChange={(id) => patch({ toAccountId: id })}
                    exclude={state.accountId}
                    placeholder="Destination"
                  />
                </Field>
              ) : (
                <Field label="Date" htmlFor="date" error={showProblem("date")}>
                  <Input
                    id="date"
                    type="date"
                    value={state.date}
                    onChange={(event) => patch({ date: event.target.value })}
                  />
                </Field>
              )}
            </div>

            {state.type === "transfer" ? (
              <Field label="Date" htmlFor="date" error={showProblem("date")}>
                <Input
                  id="date"
                  type="date"
                  value={state.date}
                  onChange={(event) => patch({ date: event.target.value })}
                />
              </Field>
            ) : (
              <Field
                label={state.type === "income" ? "Payer" : "Payee"}
                htmlFor="payee"
                hint="Optional - who the money went to or came from."
              >
                <Input
                  id="payee"
                  value={state.payee}
                  onChange={(event) => patch({ payee: event.target.value })}
                  placeholder={state.type === "income" ? "Mentis Global" : "Shopee, VECO, Metro"}
                />
              </Field>
            )}

            <Field label="Note" htmlFor="note">
              <Textarea
                id="note"
                value={state.note}
                onChange={(event) => patch({ note: event.target.value })}
                placeholder="Anything you will want to remember later."
                rows={2}
              />
            </Field>

            {error ? (
              <p className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-[13px] font-medium">
                {error}
              </p>
            ) : null}
          </div>

          <div className="border-border flex items-center gap-2 border-t px-6 py-4">
            {record ? (
              <Button type="button" variant="ghost" size="icon" onClick={remove} title="Delete">
                <Trash2 className="text-destructive" />
                <span className="sr-only">Delete record</span>
              </Button>
            ) : null}

            <Button
              type="button"
              variant="outline"
              className="ml-auto"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>

            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {record ? "Save changes" : "Add record"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Dialog>
  );
}

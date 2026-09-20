import { monthEnd, monthStart, type TransactionType } from "@advantage/core";
import type { TransactionFilters, TransactionRow } from "@advantage/api-client";
import { Plus, Receipt, Search, X } from "lucide-react";
import * as React from "react";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { MonthSwitcher } from "@/components/layout/MonthSwitcher";
import { PageHeader } from "@/components/layout/PageHeader";
import { AccountSelect } from "@/components/transactions/AccountSelect";
import { CategorySelect } from "@/components/transactions/CategorySelect";
import { TransactionForm } from "@/components/transactions/TransactionForm";
import { TransactionList } from "@/components/transactions/TransactionList";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccounts, useCategoryOptions, useTransactions } from "@/hooks/useData";
import { useMonth } from "@/hooks/useMonth";

type Scope = "month" | "all";
type TypeFilter = "all" | TransactionType;

export function TransactionsPage() {
  const { month, label } = useMonth();
  const [scope, setScope] = React.useState<Scope>("month");
  const [type, setType] = React.useState<TypeFilter>("all");
  const [search, setSearch] = React.useState("");
  const [accountId, setAccountId] = React.useState<string | null>(null);
  const [categoryId, setCategoryId] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<TransactionRow | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);

  const accounts = useAccounts().data;
  const categoryOptions = useCategoryOptions(type === "income" ? "income" : "expense").data;

  const filters = React.useMemo<TransactionFilters>(
    () => ({
      types: type === "all" ? undefined : [type],
      accountId: accountId ?? undefined,
      categoryId: categoryId ?? undefined,
      search: search.trim() || undefined,
      dateFrom: scope === "month" ? monthStart(month) : undefined,
      dateTo: scope === "month" ? monthEnd(month) : undefined,
      limit: 500,
    }),
    [type, accountId, categoryId, search, scope, month],
  );

  const { data: rows, loading } = useTransactions(filters);

  const totals = React.useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const row of rows) {
      if (row.type === "income") income += row.amountMinor;
      if (row.type === "expense") expense += row.amountMinor;
    }
    return { income, expense, net: income - expense };
  }, [rows]);

  const filtered = Boolean(search || accountId || categoryId || type !== "all");

  function clear() {
    setSearch("");
    setAccountId(null);
    setCategoryId(null);
    setType("all");
  }

  function edit(row: TransactionRow) {
    setEditing(row);
    setFormOpen(true);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Transactions"
        description={
          scope === "month" ? `Everything logged in ${label}.` : "Everything you have ever logged."
        }
        actions={
          <>
            {scope === "month" ? <MonthSwitcher /> : null}
            <Tabs value={scope} onValueChange={(value) => setScope(value as Scope)}>
              <TabsList>
                <TabsTrigger value="month">Month</TabsTrigger>
                <TabsTrigger value="all">All time</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus />
              New record
            </Button>
          </>
        }
      />

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={type} onValueChange={(value) => setType(value as TypeFilter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="expense">Expenses</TabsTrigger>
              <TabsTrigger value="income">Income</TabsTrigger>
              <TabsTrigger value="transfer">Transfers</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative min-w-[12rem] flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search payee or note"
              className="pl-8"
              aria-label="Search records"
            />
          </div>

          <div className="w-full sm:w-[12rem]">
            <AccountSelect
              accounts={accounts}
              value={accountId}
              onChange={setAccountId}
              placeholder="Any account"
            />
          </div>

          {type !== "transfer" ? (
            <div className="w-full sm:w-[14rem]">
              <CategorySelect
                options={categoryOptions}
                value={categoryId}
                onChange={setCategoryId}
                placeholder="Any category"
              />
            </div>
          ) : null}

          {filtered ? (
            <Button variant="ghost" size="sm" onClick={clear}>
              <X />
              Clear
            </Button>
          ) : null}
        </div>

        <div className="border-border mt-3 grid grid-cols-2 gap-x-6 gap-y-2 border-t pt-3 sm:flex sm:flex-wrap sm:items-center sm:gap-y-1">
          <Summary label="Records" value={String(rows.length)} />
          <Summary label="Income" node={<Amount minor={totals.income} direction="in" signed={false} />} />
          <Summary label="Spending" node={<Amount minor={totals.expense} direction="out" signed={false} />} />
          <Summary label="Net" node={<Amount minor={totals.net} direction="auto" />} />
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        {rows.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={loading ? "Loading records" : filtered ? "Nothing matches those filters" : "No records yet"}
            description={
              filtered
                ? "Try widening the search, or clear the filters."
                : "Add your first expense or income and it shows up here."
            }
            action={
              filtered ? (
                <Button variant="outline" size="sm" onClick={clear}>
                  Clear filters
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  <Plus />
                  New record
                </Button>
              )
            }
          />
        ) : (
          <TransactionList rows={rows} onSelect={edit} />
        )}
      </Card>

      <TransactionForm open={formOpen} onOpenChange={setFormOpen} record={editing} />
    </div>
  );
}

function Summary({
  label,
  value,
  node,
}: {
  label: string;
  value?: string;
  node?: React.ReactNode;
}) {
  return (
    <p className="flex items-baseline gap-2">
      <span className="text-muted-foreground text-[11px] font-bold tracking-wide uppercase">
        {label}
      </span>
      {node ?? <span className="num text-[13.5px] font-bold">{value}</span>}
    </p>
  );
}

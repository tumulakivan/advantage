import { ACCOUNT_TYPE_LABELS, formatPercent, monthEnd, monthStart } from "@advantage/core";
import type { AccountActivity } from "@advantage/api-client";
import { Check, Wallet } from "lucide-react";
import * as React from "react";
import { Link } from "react-router-dom";

import { AccountIcon } from "@/components/brand/AccountIcon";
import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { TransactionList } from "@/components/transactions/TransactionList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTransactions, useWallet } from "@/hooks/useData";
import { useMonth } from "@/hooks/useMonth";
import { cn } from "@/lib/utils";
import { useMoney } from "@/providers/SettingsProvider";

const ALL = "__all__";

/**
 * Wallet: where the money actually sits.
 *
 * Balance is all-time, because that is what an account holds. Spent and
 * received are scoped to the selected month, because that is what the account
 * has been doing lately. Keeping the two apart is what stops a balance from
 * looking wrong.
 */
export function WalletCard() {
  const { month, label } = useMonth();
  const money = useMoney();
  const { data: wallet } = useWallet(month);
  const [selected, setSelected] = React.useState<string>(ALL);

  const accounts = wallet.accounts;
  const active = accounts.find((account) => account.id === selected);

  // An account can be archived away underneath the selection.
  React.useEffect(() => {
    if (selected !== ALL && !accounts.some((account) => account.id === selected)) {
      setSelected(ALL);
    }
  }, [accounts, selected]);

  const view = active
    ? {
        balanceMinor: active.balanceMinor,
        spentMinor: active.spentMinor,
        receivedMinor: active.receivedMinor,
        count: active.monthCount,
        subtitle: `${ACCOUNT_TYPE_LABELS[active.type]} · opened with ${money(
          active.openingBalanceMinor,
        )}`,
      }
    : {
        balanceMinor: wallet.totals.balanceMinor,
        spentMinor: wallet.totals.spentMinor,
        receivedMinor: wallet.totals.receivedMinor,
        count: wallet.totals.monthCount,
        subtitle: `across ${wallet.totals.accountCount} ${
          wallet.totals.accountCount === 1 ? "account" : "accounts"
        }`,
      };

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Wallet</CardTitle>
          <CardDescription>
            Balances are derived from every record, never typed in.
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/accounts">Manage</Link>
        </Button>
      </CardHeader>

      <CardContent className="space-y-5">
        {accounts.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No accounts yet"
            description="Add the wallets your money passes through."
            action={
              <Button size="sm" asChild>
                <Link to="/accounts">Add an account</Link>
              </Button>
            }
          />
        ) : (
          <>
            <div
              role="radiogroup"
              aria-label="Account"
              className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
            >
              <Chip
                active={selected === ALL}
                onClick={() => setSelected(ALL)}
                label="All accounts"
                icon={
                  <span className="bg-primary/15 text-primary flex size-7 shrink-0 items-center justify-center rounded-md">
                    <Wallet className="size-3.5" />
                  </span>
                }
              />
              {accounts.map((account) => (
                <Chip
                  key={account.id}
                  active={selected === account.id}
                  onClick={() => setSelected(account.id)}
                  label={account.name}
                  icon={<AccountIcon logoUrl={account.logoUrl} icon={account.icon} name={account.name} size="sm" />}
                />
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Stat label="Balance" minor={view.balanceMinor} direction="auto" hint={view.subtitle} />
              <Stat
                label={`Spent in ${label.split(" ")[0]}`}
                minor={view.spentMinor}
                direction="out"
                hint={`${view.count} ${view.count === 1 ? "record" : "records"} this month`}
              />
              <Stat
                label={`Received in ${label.split(" ")[0]}`}
                minor={view.receivedMinor}
                direction="in"
                hint={
                  view.receivedMinor > 0
                    ? `${formatPercent(
                        Math.min(view.spentMinor / view.receivedMinor, 9.99),
                      )} of it spent`
                    : "nothing received yet"
                }
              />
            </div>

            {active ? (
              <AccountDetail account={active} />
            ) : (
              <AccountBreakdown accounts={accounts} onSelect={setSelected} />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Chip({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "focus-visible:ring-ring/50 flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[13px] font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none",
        active
          ? "border-primary/60 bg-primary/10 text-foreground"
          : "border-border bg-background text-muted-foreground hover:border-input hover:text-foreground",
      )}
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
      {active ? <Check className="text-primary size-3.5" strokeWidth={3} /> : null}
    </button>
  );
}

function Stat({
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
      <p className="text-muted-foreground mt-0.5 truncate text-[12px]">{hint}</p>
    </div>
  );
}

/** Every account at once: balance, and how much of the month it carried. */
function AccountBreakdown({
  accounts,
  onSelect,
}: {
  accounts: AccountActivity[];
  onSelect: (id: string) => void;
}) {
  const widest = Math.max(...accounts.map((account) => account.spentMinor), 1);

  return (
    <ul className="border-border space-y-1 border-t pt-4" data-testid="wallet-accounts">
      {accounts.map((account) => (
        <li key={account.id}>
          <button
            type="button"
            onClick={() => onSelect(account.id)}
            className="hover:bg-muted/50 flex w-full items-center gap-3 rounded-lg px-1.5 py-2 text-left transition-colors"
          >
            <AccountIcon logoUrl={account.logoUrl} icon={account.icon} name={account.name} size="md" />

            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[13.5px] font-semibold">{account.name}</span>
                <Amount minor={account.balanceMinor} direction="auto" signed={false} />
              </span>

              <span className="mt-1.5 flex items-center gap-2">
                <span className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                  <span
                    className="bg-money-out block h-full rounded-full"
                    style={{
                      width: `${account.spentMinor > 0 ? Math.max((account.spentMinor / widest) * 100, 3) : 0}%`,
                    }}
                  />
                </span>
                <span className="num text-muted-foreground w-24 text-right text-[11.5px] font-semibold">
                  {account.spentMinor > 0 ? (
                    <Amount
                      minor={account.spentMinor}
                      direction="out"
                      signed={false}
                      hideCents
                      className="text-[11.5px]"
                    />
                  ) : (
                    "no spending"
                  )}
                </span>
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** One account: its records for the selected month. */
function AccountDetail({ account }: { account: AccountActivity }) {
  const { month } = useMonth();
  const { data: rows } = useTransactions({
    accountId: account.id,
    dateFrom: monthStart(month),
    dateTo: monthEnd(month),
    limit: 50,
  });

  return (
    <div className="border-border -mx-5 border-t" data-testid="wallet-detail">
      <div className="flex items-center gap-2 px-5 pt-4 pb-1">
        <h4 className="text-[13px] font-bold">Activity this month</h4>
        <Badge variant="neutral">{ACCOUNT_TYPE_LABELS[account.type]}</Badge>
        {account.excludeFromTotals ? <Badge variant="outline">off totals</Badge> : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Nothing moved through this account"
          description="No records on it for the selected month."
        />
      ) : (
        <TransactionList rows={rows} />
      )}
    </div>
  );
}

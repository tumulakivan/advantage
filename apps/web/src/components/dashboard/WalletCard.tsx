import { ACCOUNT_TYPE_LABELS, formatPercent } from "@advantage/core";
import type { AccountActivity, AccountBreakdownLine } from "@advantage/api-client";
import { ChevronRight, Wallet, X } from "lucide-react";
import * as React from "react";
import { Link } from "react-router-dom";

import { AccountIcon } from "@/components/brand/AccountIcon";
import { CashflowChart, CashflowLegend } from "@/components/charts/CashflowChart";
import { Amount } from "@/components/common/Amount";
import { CategoryIcon } from "@/components/common/CategoryChip";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccountActivity, useWallet } from "@/hooks/useData";
import { useMonth } from "@/hooks/useMonth";
import { cn } from "@/lib/utils";
import { useMoney, useSettings } from "@/providers/SettingsProvider";

/** Matches the panel's `duration-200`, so it unmounts once it has faded out. */
const EXIT_MS = 200;
/** Sized to fill the left column beside the breakdown at the wallet's usual height. */
const CHART_HEIGHT = 220;

/**
 * Wallet: where the money actually sits.
 *
 * The headline is always the whole wallet: balance all-time, spent and received
 * for the selected month. Each account is one row - what it holds and what
 * moved through it - and clicking one opens a card over the widget with that
 * account's own cash flow and its month broken down by category.
 */
export function WalletCard() {
  const { month, label } = useMonth();
  const money = useMoney();
  const { data: wallet } = useWallet(month);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const triggerRef = React.useRef<HTMLElement | null>(null);

  const accounts = wallet.accounts;
  const open = accounts.find((account) => account.id === openId) ?? null;
  const monthName = label.split(" ")[0] ?? label;
  const { totals } = wallet;

  // An account can be archived away while its card is open.
  React.useEffect(() => {
    if (openId && !accounts.some((account) => account.id === openId)) setOpenId(null);
  }, [accounts, openId]);

  const close = React.useCallback(() => {
    setOpenId(null);
    // Back to the row that opened it, so a keyboard user does not lose their place.
    triggerRef.current?.focus();
  }, []);

  return (
    <Card className="relative overflow-hidden">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Wallet</CardTitle>
          <CardDescription>Balances are derived from every record, never typed in.</CardDescription>
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
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat
                label="Balance"
                minor={totals.balanceMinor}
                direction="auto"
                hint={`across ${totals.accountCount} ${
                  totals.accountCount === 1 ? "account" : "accounts"
                }`}
              />
              <Stat
                label={`Spent in ${monthName}`}
                minor={totals.spentMinor}
                direction="out"
                hint={`${totals.monthCount} ${totals.monthCount === 1 ? "record" : "records"} this month`}
              />
              <Stat
                label={`Received in ${monthName}`}
                minor={totals.receivedMinor}
                direction="in"
                hint={
                  totals.receivedMinor > 0
                    ? `${formatPercent(
                        Math.min(totals.spentMinor / totals.receivedMinor, 9.99),
                      )} of it spent`
                    : "nothing received yet"
                }
              />
            </div>

            <ul className="border-border space-y-0.5 border-t pt-3" data-testid="wallet-accounts">
              {accounts.map((account) => (
                <li key={account.id}>
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-expanded={openId === account.id}
                    onClick={(event) => {
                      triggerRef.current = event.currentTarget;
                      setOpenId(account.id);
                    }}
                    className="hover:bg-muted/50 focus-visible:ring-ring/50 group flex w-full items-center gap-3 rounded-lg px-1.5 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <AccountIcon
                      logoUrl={account.logoUrl}
                      icon={account.icon}
                      name={account.name}
                      size="md"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold">
                        {account.name}
                      </span>
                      <span className="text-muted-foreground block truncate text-[12px]">
                        {movementLine(account, monthName, money)}
                      </span>
                    </span>
                    <Amount
                      minor={account.balanceMinor}
                      direction="auto"
                      signed={false}
                      className="text-[13.5px]"
                    />
                    <ChevronRight className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>

      <AccountPopup account={open} monthName={monthName} onClose={close} />
    </Card>
  );
}

/** "₱5,000 in · ₱1,250 out in October", in words rather than a bar. */
function movementLine(
  account: AccountActivity,
  monthName: string,
  money: (minor: number) => string,
): string {
  const parts: string[] = [];
  if (account.receivedMinor > 0) parts.push(`${money(account.receivedMinor)} in`);
  if (account.spentMinor > 0) parts.push(`${money(account.spentMinor)} out`);
  if (parts.length === 0) {
    return account.monthCount > 0
      ? `only transfers in ${monthName}`
      : `no activity in ${monthName}`;
  }
  return `${parts.join(" · ")} in ${monthName}`;
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

/**
 * The card that opens over the widget. It stays mounted through its exit so it
 * can fade out instead of vanishing, and it keeps showing the account it was
 * opened for while it does.
 */
function AccountPopup({
  account,
  monthName,
  onClose,
}: {
  account: AccountActivity | null;
  monthName: string;
  onClose: () => void;
}) {
  const [shown, setShown] = React.useState<AccountActivity | null>(account);
  const [visible, setVisible] = React.useState(false);
  const closeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (account) {
      setShown(account);
      // Two frames: the first paints the closed state, the second starts the
      // transition from it. One frame can be batched into the same paint.
      let second = 0;
      const first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(first);
        cancelAnimationFrame(second);
      };
    }

    setVisible(false);
    const timer = window.setTimeout(() => setShown(null), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [account]);

  React.useEffect(() => {
    if (!visible) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visible, onClose]);

  if (!shown) return null;

  return (
    <div
      className={cn(
        "absolute inset-0 z-10 flex items-center justify-center p-3 transition-opacity duration-200 ease-out motion-reduce:transition-none",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div
        aria-hidden="true"
        className="bg-background/70 absolute inset-0 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-labelledby="wallet-popup-title"
        data-testid="wallet-detail"
        className={cn(
          "bg-card border-border relative flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl border shadow-2xl sm:h-full transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none",
          visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-3 scale-[0.98] opacity-0",
        )}
      >
        <div className="border-border flex items-center gap-3 border-b px-4 py-3">
          <AccountIcon logoUrl={shown.logoUrl} icon={shown.icon} name={shown.name} size="md" />
          <div className="min-w-0 flex-1">
            <h3 id="wallet-popup-title" className="truncate text-[15px] leading-tight font-bold">
              {shown.name}
            </h3>
            <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[12px]">
              {ACCOUNT_TYPE_LABELS[shown.type]}
              {shown.excludeFromTotals ? <Badge variant="outline">off totals</Badge> : null}
            </p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground text-[10.5px] font-bold tracking-wide uppercase">
              Balance
            </p>
            <Amount
              minor={shown.balanceMinor}
              direction="auto"
              signed={false}
              className="text-[15px] font-extrabold"
            />
          </div>
          <Button
            ref={closeRef}
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close"
          >
            <X />
          </Button>
        </div>

        {/* On a phone the whole body scrolls; wider, each column handles its own. */}
        <div className="min-h-0 flex-1 overflow-y-auto sm:overflow-hidden">
          <AccountPopupBody account={shown} monthName={monthName} />
        </div>
      </div>
    </div>
  );
}

function AccountPopupBody({ account, monthName }: { account: AccountActivity; monthName: string }) {
  const { month } = useMonth();
  const { settings } = useSettings();
  const money = useMoney();
  const { data, stale } = useAccountActivity(account.id, month, settings.locale);
  // The previous account's figures must not sit under this one's name.
  const ready = !stale && data.accountId === account.id;

  const net = account.receivedMinor - account.spentMinor;
  const extras = [
    data.transferredInMinor > 0 ? `${money(data.transferredInMinor)} transferred in` : null,
    data.transferredOutMinor > 0 ? `${money(data.transferredOutMinor)} transferred out` : null,
    data.adjustmentsMinor !== 0 ? `${money(data.adjustmentsMinor)} in balance corrections` : null,
  ].filter(Boolean);

  // Side by side from `sm` up: the chart holds still on the left while the
  // breakdown, which grows with the month, scrolls on the right.
  return (
    <div className="grid sm:h-full sm:grid-cols-2 sm:grid-rows-[minmax(0,1fr)]">
      <div className="border-border space-y-5 p-4 sm:min-h-0 sm:overflow-y-auto sm:border-r">
        <div className="grid grid-cols-3 gap-3">
          <MiniStat label={`In, ${monthName}`} minor={account.receivedMinor} direction="in" />
          <MiniStat label={`Out, ${monthName}`} minor={account.spentMinor} direction="out" />
          <MiniStat label="Net" minor={net} direction="auto" signed />
        </div>

        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-[13px] font-bold">Cash flow, last six months</h4>
            <CashflowLegend />
          </div>
          {ready ? (
            <CashflowChart data={data.cashflow} height={CHART_HEIGHT} />
          ) : (
            <div className="bg-muted/40 animate-pulse rounded-lg" style={{ height: CHART_HEIGHT }} />
          )}
        </section>
      </div>

      <div
        data-testid="wallet-breakdown"
        className="border-border space-y-5 border-t p-4 sm:min-h-0 sm:overflow-y-auto sm:border-t-0"
      >
        <BreakdownList
          title={`Money in, ${monthName}`}
          lines={ready ? data.income : []}
          totalMinor={account.receivedMinor}
          direction="in"
          empty={ready ? `Nothing received in ${monthName}.` : "Reading…"}
        />
        <BreakdownList
          title={`Money out, ${monthName}`}
          lines={ready ? data.spending : []}
          totalMinor={account.spentMinor}
          direction="out"
          empty={ready ? `Nothing spent in ${monthName}.` : "Reading…"}
        />

        {ready && extras.length > 0 ? (
          <p className="text-muted-foreground border-border border-t pt-3 text-[12px]">
            Not counted as income or spending: {extras.join(" · ")}.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  minor,
  direction,
  signed = false,
}: {
  label: string;
  minor: number;
  direction: "in" | "out" | "auto";
  signed?: boolean;
}) {
  return (
    <div className="bg-muted/30 rounded-lg px-3 py-2">
      <p className="text-muted-foreground truncate text-[10.5px] font-bold tracking-wide uppercase">
        {label}
      </p>
      <Amount
        minor={minor}
        direction={direction}
        signed={signed}
        className="mt-0.5 block text-[15px] font-extrabold"
      />
    </div>
  );
}

/** Category groups for one side of the month, each with its share of that side. */
function BreakdownList({
  title,
  lines,
  totalMinor,
  direction,
  empty,
}: {
  title: string;
  lines: AccountBreakdownLine[];
  totalMinor: number;
  direction: "in" | "out";
  empty: string;
}) {
  return (
    <section>
      <h4 className="mb-2 text-[13px] font-bold">{title}</h4>
      {lines.length === 0 ? (
        <p className="text-muted-foreground text-[12px]">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {lines.map((line) => (
            <li key={line.key} className="flex items-center gap-2.5">
              <CategoryIcon icon={line.icon} color={line.color} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{line.label}</span>
                <span className="text-muted-foreground block text-[11.5px]">
                  {line.count} {line.count === 1 ? "record" : "records"}
                  {totalMinor > 0 ? ` · ${formatPercent(line.amountMinor / totalMinor)}` : null}
                </span>
              </span>
              <Amount
                minor={line.amountMinor}
                direction={direction}
                signed={false}
                className="text-[13px]"
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

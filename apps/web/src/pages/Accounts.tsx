import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, type AccountType } from "@advantage/core";
import {
  addAccountFromCatalog,
  archiveAccount,
  createAccount,
  listCatalog,
  restoreAccount,
  updateAccount,
  type AccountWithBalance,
  type CatalogEntry,
} from "@advantage/api-client";
import { Archive, ArchiveRestore, Check, Loader2, Plus, Wallet } from "lucide-react";
import * as React from "react";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { AmountField } from "@/components/transactions/AmountField";
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
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAccounts } from "@/hooks/useData";
import { useLiveQuery, useMutation } from "@/hooks/useLiveQuery";
import { AccountIcon } from "@/components/brand/AccountIcon";
import { cn } from "@/lib/utils";
import { useApi } from "@/providers/SessionProvider";

const TYPE_ICONS: Record<AccountType, string> = {
  cash: "Banknote",
  bank: "Landmark",
  ewallet: "Smartphone",
  credit: "CreditCard",
  savings: "PiggyBank",
};

export function AccountsPage() {
  const [showArchived, setShowArchived] = React.useState(false);
  const { data: accounts } = useAccounts(showArchived);
  const [editing, setEditing] = React.useState<AccountWithBalance | null>(null);
  const [open, setOpen] = React.useState(false);
  const [browsing, setBrowsing] = React.useState(false);

  const live = accounts.filter((account) => !account.archivedAt);
  const total = live
    .filter((account) => !account.excludeFromTotals)
    .reduce((sum, account) => sum + account.balanceMinor, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Accounts"
        description="Every wallet the money passes through. Balances are derived from records, never typed in."
        actions={
          <>
            <Button
              variant={showArchived ? "secondary" : "outline"}
              onClick={() => setShowArchived((value) => !value)}
            >
              <Archive />
              {showArchived ? "Hide archived" : "Show archived"}
            </Button>
            <Button onClick={() => setBrowsing(true)}>
              <Plus />
              Add account
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-baseline justify-between gap-4 py-5">
          <div>
            <p className="text-muted-foreground text-[11px] font-bold tracking-wide uppercase">
              Net worth
            </p>
            <Amount minor={total} className="mt-1.5 block text-2xl font-extrabold tracking-tight" />
          </div>
          <p className="text-muted-foreground text-[12.5px]">
            {live.length} active {live.length === 1 ? "account" : "accounts"}
          </p>
        </CardContent>
      </Card>

      {accounts.length === 0 ? (
        <Card>
          <EmptyState icon={Wallet} title="No accounts" description="Add one to start logging." />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onEdit={() => {
                setEditing(account);
                setOpen(true);
              }}
            />
          ))}
        </div>
      )}

      <AccountDialog open={open} onOpenChange={setOpen} account={editing} />

      <CatalogDialog
        open={browsing}
        onOpenChange={setBrowsing}
        existing={accounts}
        onCustom={() => {
          setBrowsing(false);
          setEditing(null);
          setOpen(true);
        }}
      />
    </div>
  );
}

/**
 * Pick an account from the shared catalog.
 *
 * A new account starts with Cash and nothing else, because everyone has cash
 * and nobody has every bank. This is where the rest come from: the same
 * curated list for everybody, with the artwork an admin has published. What
 * the catalog does not have yet, "Something else" covers - waiting on someone
 * to add PayPal is not a reason to be unable to track your money.
 */
function CatalogDialog({
  open,
  onOpenChange,
  existing,
  onCustom,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: AccountWithBalance[];
  onCustom: () => void;
}) {
  const api = useApi();
  const { run, pending, error } = useMutation();
  const { data: catalog, loading } = useLiveQuery((client) => listCatalog(client), [], NO_CATALOG);

  // Already in the wallet, archived or not - offering it again would either
  // fail or quietly make a duplicate.
  const held = new Set(existing.map((account) => account.slug).filter(Boolean));

  async function add(entry: CatalogEntry) {
    const done = await run(() => addAccountFromCatalog(api, { catalogSlug: entry.slug }));
    if (done !== null) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <div className="space-y-5">
          <DialogHeader>
            <DialogTitle>Add an account</DialogTitle>
            <DialogDescription>
              Pick one of the accounts we know about, or set up your own.
            </DialogDescription>
          </DialogHeader>

          {loading && catalog.length === 0 ? (
            <p className="text-muted-foreground text-[13px]">Loading the catalog.</p>
          ) : (
            <div className="grid max-h-[22rem] gap-2 overflow-y-auto sm:grid-cols-2">
              {catalog.map((entry) => {
                const added = held.has(entry.slug);
                return (
                  <button
                    key={entry.id}
                    type="button"
                    disabled={added || pending}
                    onClick={() => void add(entry)}
                    className={cn(
                      "border-border flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                      added
                        ? "opacity-55"
                        : "hover:border-input hover:bg-accent/40 cursor-pointer",
                    )}
                  >
                    <AccountIcon logoUrl={entry.logoUrl} icon={entry.icon} name={entry.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-bold">{entry.name}</span>
                      <span className="text-muted-foreground block truncate text-[12px]">
                        {ACCOUNT_TYPE_LABELS[entry.type]}
                      </span>
                    </span>
                    {added ? <Check className="text-primary size-4 shrink-0" /> : null}
                  </button>
                );
              })}
            </div>
          )}

          {error ? <p className="text-destructive text-[13px] font-medium">{error}</p> : null}

          <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-muted-foreground text-[12px]">
              Not here? Set one up with a name and an icon.
            </p>
            <Button variant="outline" onClick={onCustom} disabled={pending}>
              Something else
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const NO_CATALOG: CatalogEntry[] = [];

function AccountCard({
  account,
  onEdit,
}: {
  account: AccountWithBalance;
  onEdit: () => void;
}) {
  const api = useApi();
  const { run, pending } = useMutation();
  const archived = Boolean(account.archivedAt);

  return (
    <Card className={archived ? "opacity-60" : undefined}>
      <CardContent className="space-y-4 py-5">
        <div className="flex items-start gap-3">
          <AccountIcon logoUrl={account.logoUrl} icon={account.icon} name={account.name} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-bold">{account.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="neutral">{ACCOUNT_TYPE_LABELS[account.type]}</Badge>
              {account.excludeFromTotals ? <Badge variant="outline">off totals</Badge> : null}
              {archived ? <Badge variant="outline">archived</Badge> : null}
            </div>
          </div>
        </div>

        <div>
          <p className="text-muted-foreground text-[11px] font-bold tracking-wide uppercase">
            Balance
          </p>
          <Amount
            minor={account.balanceMinor}
            direction="auto"
            signed={false}
            className="mt-1 block text-xl font-extrabold tracking-tight"
          />
          <p className="text-muted-foreground mt-1 text-[12px]">
            {account.transactionCount} records &middot; opened with{" "}
            <Amount minor={account.openingBalanceMinor} signed={false} className="text-[12px]" />
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              void run(() =>
                archived ? restoreAccount(api, account.id) : archiveAccount(api, account.id),
              )
            }
          >
            {archived ? <ArchiveRestore /> : <Archive />}
            {archived ? "Restore" : "Archive"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AccountDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: AccountWithBalance | null;
}) {
  const api = useApi();
  const { run, pending, error } = useMutation();
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<AccountType>("cash");
  const [openingBalanceMinor, setOpeningBalanceMinor] = React.useState<number | null>(0);
  const [excludeFromTotals, setExcludeFromTotals] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(account?.name ?? "");
    setType(account?.type ?? "cash");
    setOpeningBalanceMinor(account?.openingBalanceMinor ?? 0);
    setExcludeFromTotals(account?.excludeFromTotals ?? false);
  }, [open, account]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    const payload = {
      name: name.trim(),
      type,
      icon: TYPE_ICONS[type],
      openingBalanceMinor: openingBalanceMinor ?? 0,
      excludeFromTotals,
    };

    const saved = await run(async () => {
      if (account) await updateAccount(api, account.id, payload);
      else await createAccount(api, payload);
      return true;
    });
    if (saved) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{account ? "Edit account" : "Add an account"}</DialogTitle>
            <DialogDescription>
              The opening balance is what was in it before you started logging here.
            </DialogDescription>
          </DialogHeader>

          <Field label="Name" htmlFor="account-name">
            <Input
              id="account-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="GCash, BPI, Cash on hand"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type">
              <Select value={type} onValueChange={(value) => setType(value as AccountType)}>
                <SelectTrigger aria-label="Account type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {ACCOUNT_TYPE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Opening balance">
              <AmountField
                value={openingBalanceMinor}
                onChange={setOpeningBalanceMinor}
                direction="neutral"
                id="opening-balance"
              />
            </Field>
          </div>

          <label className="border-border flex items-center justify-between gap-4 rounded-lg border px-3.5 py-2.5">
            <span>
              <span className="block text-[13px] font-semibold">Exclude from net worth</span>
              <span className="text-muted-foreground block text-[12px]">
                For accounts that are not really yours to spend.
              </span>
            </span>
            <Switch checked={excludeFromTotals} onCheckedChange={setExcludeFromTotals} />
          </label>

          {error ? <p className="text-destructive text-[13px] font-medium">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {account ? "Save changes" : "Add account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

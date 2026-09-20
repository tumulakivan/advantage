import {
  archiveCatalogEntry,
  createCatalogEntry,
  listCatalogForAdmin,
  loadAdminMetrics,
  updateCatalogEntry,
  type AdminMetrics,
  type CatalogEntry,
} from "@advantage/api-client";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, ICON_CHOICES, type AccountType } from "@advantage/core";
import { Archive, ArchiveRestore, ImageUp, Loader2, Plus, Users, X } from "lucide-react";
import * as React from "react";

import { AccountIcon } from "@/components/brand/AccountIcon";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useLiveQuery, useMutation } from "@/hooks/useLiveQuery";
import { cn } from "@/lib/utils";
import { useApi } from "@/providers/SessionProvider";

/**
 * The admin screen: how the app is being used, and the shared account catalog.
 *
 * There is no way to read anyone's records from here, and that is deliberate
 * rather than unfinished. Running this thing means curating a list of accounts
 * and watching whether people come back - it does not mean being able to look
 * at somebody's salary, and the way to keep that true is for the endpoint not
 * to exist.
 */
const NO_CATALOG: CatalogEntry[] = [];

const EMPTY_METRICS: AdminMetrics = {
  users: { total: 0, verified: 0, newLast7: 0, newLast30: 0, activeLast7: 0, activeLast30: 0 },
  ledger: { transactions: 0, accounts: 0, plannedPayments: 0, budgets: 0, incomeSources: 0 },
  catalog: { total: 0, withLogo: 0 },
  signupsByWeek: [],
  accountPopularity: [],
  generatedAt: "",
};

export function AdminPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Admin"
        description="Usage, and the account catalog everyone picks from. No one's records are readable here."
      />
      <UsageCard />
      <CatalogCard />
    </div>
  );
}

function UsageCard() {
  const { data, loading } = useLiveQuery(
    (api, signal) => loadAdminMetrics(api, signal),
    [],
    EMPTY_METRICS,
  );

  const peak = Math.max(1, ...data.signupsByWeek.map((week) => week.signups));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="People" value={data.users.total} hint={`${data.users.verified} verified`} />
        <Stat
          label="Active this week"
          value={data.users.activeLast7}
          hint={`${data.users.activeLast30} in the last 30 days`}
        />
        <Stat
          label="New this week"
          value={data.users.newLast7}
          hint={`${data.users.newLast30} in the last 30 days`}
        />
        <Stat
          label="Records logged"
          value={data.ledger.transactions}
          hint="across every account"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Sign-ups</CardTitle>
              <CardDescription>The last twelve weeks, by week.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {loading && data.signupsByWeek.length === 0 ? (
              <p className="text-muted-foreground text-[13px]">Counting.</p>
            ) : (
              <div className="flex h-36 items-end gap-1.5">
                {data.signupsByWeek.map((week) => (
                  <div key={week.week} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                    <span className="num text-muted-foreground text-[11px] font-bold">
                      {week.signups || ""}
                    </span>
                    <div
                      title={`${week.signups} in the week of ${week.week}`}
                      style={{ height: `${Math.max((week.signups / peak) * 100, 2)}%` }}
                      className={cn(
                        "w-full rounded-t-sm",
                        week.signups > 0 ? "bg-primary" : "bg-muted",
                      )}
                    />
                    <span className="text-muted-foreground text-[10px]">
                      {week.week.slice(5).replace("-", "/")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>What people add</CardTitle>
              <CardDescription>
                Wallets carrying each catalog account - what to add next.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.accountPopularity.length === 0 ? (
              <p className="text-muted-foreground text-[13px]">Nothing added yet.</p>
            ) : (
              data.accountPopularity.map((row) => (
                <div key={row.slug} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                    {row.slug}
                  </span>
                  <span className="num text-muted-foreground text-[13px]">{row.wallets}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-wrap gap-x-8 gap-y-3 py-4 text-[13px]">
          <Tally label="Accounts" value={data.ledger.accounts} />
          <Tally label="Planned payments" value={data.ledger.plannedPayments} />
          <Tally label="Budgets" value={data.ledger.budgets} />
          <Tally label="Income sources" value={data.ledger.incomeSources} />
          <Tally label="Catalog" value={`${data.catalog.withLogo}/${data.catalog.total} with logos`} />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-bold tracking-wide uppercase">
          <Users className="size-3.5" />
          {label}
        </p>
        <p className="num mt-1.5 text-2xl font-extrabold tracking-tight">{value}</p>
        <p className="text-muted-foreground mt-0.5 text-[12px]">{hint}</p>
      </CardContent>
    </Card>
  );
}

function Tally({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-muted-foreground text-[11px] font-bold tracking-wide uppercase">
        {label}
      </span>
      <span className="num font-extrabold">{value}</span>
    </span>
  );
}

// ---- the catalog -------------------------------------------------------------

function CatalogCard() {
  const api = useApi();
  const { run, pending } = useMutation();
  const { data: catalog } = useLiveQuery((client) => listCatalogForAdmin(client), [], NO_CATALOG);
  const [editing, setEditing] = React.useState<CatalogEntry | null>(null);
  const [adding, setAdding] = React.useState(false);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Account catalog</CardTitle>
          <CardDescription>
            What everyone can add to their wallet. Editing a name or logo here changes the mark on
            every account carrying that slug, but never renames anybody's own account.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus />
          Add
        </Button>
      </CardHeader>

      <CardContent className="space-y-2">
        {catalog.length === 0 ? (
          <EmptyState
            icon={ImageUp}
            title="The catalog is empty"
            description="Add an account, or run the catalog seed script."
          />
        ) : null}

        {catalog.map((entry) => {
          const archived = Boolean(entry.archivedAt);
          return (
            <div
              key={entry.id}
              className={cn(
                "border-border flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5",
                archived && "opacity-60",
              )}
            >
              <AccountIcon logoUrl={entry.logoUrl} icon={entry.icon} name={entry.name} />

              <div className="min-w-[8rem] flex-1">
                <p className="flex items-center gap-2 truncate text-[13.5px] font-bold">
                  {entry.name}
                  {archived ? <Badge variant="neutral">hidden</Badge> : null}
                  {!entry.logoUrl ? <Badge variant="warning">no logo</Badge> : null}
                </p>
                <p className="text-muted-foreground truncate text-[12px]">
                  {ACCOUNT_TYPE_LABELS[entry.type]} &middot; {entry.slug}
                </p>
              </div>

              <Button variant="ghost" size="sm" onClick={() => setEditing(entry)}>
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => void run(() => archiveCatalogEntry(api, entry.id, !archived))}
              >
                {archived ? <ArchiveRestore /> : <Archive />}
                {archived ? "Show" : "Hide"}
              </Button>
            </div>
          );
        })}
      </CardContent>

      <CatalogDialog
        entry={editing}
        open={Boolean(editing) || adding}
        onOpenChange={(open) => {
          if (open) return;
          setEditing(null);
          setAdding(false);
        }}
      />
    </Card>
  );
}

interface PickedLogo {
  dataUrl: string;
  width: number;
  height: number;
  name: string;
}

function CatalogDialog({
  entry,
  open,
  onOpenChange,
}: {
  entry: CatalogEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const api = useApi();
  const { run, pending, error } = useMutation();
  const fileInput = React.useRef<HTMLInputElement>(null);

  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<AccountType>("bank");
  const [icon, setIcon] = React.useState("Landmark");
  const [logo, setLogo] = React.useState<PickedLogo | null>(null);
  const [removeLogo, setRemoveLogo] = React.useState(false);
  const [imageError, setImageError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setName(entry?.name ?? "");
    setType(entry?.type ?? "bank");
    setIcon(entry?.icon ?? "Landmark");
    setLogo(null);
    setRemoveLogo(false);
    setImageError(null);
  }, [open, entry]);

  /**
   * Check the aspect ratio here as well as on the server. The server is what
   * actually enforces it, but finding out before the upload - and being told
   * the dimensions - beats a round trip that comes back "that is 684x200".
   */
  async function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImageError(null);

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("That file could not be read."));
      reader.readAsDataURL(file);
    });

    const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("That file is not an image a browser can read."));
      image.src = dataUrl;
    }).catch((reason: Error) => {
      setImageError(reason.message);
      return null;
    });

    if (!size) return;

    if (size.width !== size.height) {
      setImageError(
        `A logo has to be square. That one is ${size.width}×${size.height} - crop it and try again.`,
      );
      return;
    }

    setLogo({ dataUrl, width: size.width, height: size.height, name: file.name });
    setRemoveLogo(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    const saved = await run(async () => {
      // Omitted means "leave the logo alone"; null means remove it.
      const logoField = logo ? { logo: logo.dataUrl } : removeLogo ? { logo: null } : {};

      if (entry) await updateCatalogEntry(api, entry.id, { name: trimmed, type, icon, ...logoField });
      else await createCatalogEntry(api, { name: trimmed, type, icon, ...logoField });
      return true;
    });

    if (saved) onOpenChange(false);
  }

  const showingLogo = logo?.dataUrl ?? (removeLogo ? null : entry?.logoUrl);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{entry ? "Edit catalog account" : "Add to the catalog"}</DialogTitle>
            <DialogDescription>
              Everyone will be able to add this to their wallet.
            </DialogDescription>
          </DialogHeader>

          <Field label="Name" htmlFor="catalog-name">
            <Input
              id="catalog-name"
              value={name}
              autoFocus
              placeholder="PayPal, BPI, Revolut"
              onChange={(event) => setName(event.target.value)}
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

            <Field label="Fallback icon" hint="Shown when there is no logo.">
              <Select value={icon} onValueChange={setIcon}>
                <SelectTrigger aria-label="Fallback icon">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ICON_CHOICES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field
            label="Logo"
            hint="Optional, and it has to be square - the mark is drawn full bleed in a square box. PNG, JPEG or WebP, under 512 KB."
          >
            <div className="flex flex-wrap items-center gap-3">
              <AccountIcon
                logoUrl={logo ? null : showingLogo}
                icon={icon}
                name={name}
                size="lg"
                className={logo ? "hidden" : undefined}
              />
              {logo ? (
                <img
                  src={logo.dataUrl}
                  alt=""
                  className="size-11 shrink-0 rounded-xl object-cover ring-1 ring-black/10"
                />
              ) : null}

              <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
                <ImageUp />
                {showingLogo ? "Replace" : "Upload"}
              </Button>

              {showingLogo ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setLogo(null);
                    setRemoveLogo(true);
                    setImageError(null);
                  }}
                >
                  <X />
                  Remove
                </Button>
              ) : null}

              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => void pick(event)}
              />
            </div>
          </Field>

          {logo ? (
            <p className="text-muted-foreground text-[12px]">
              {logo.name} &middot; {logo.width}&times;{logo.height}
            </p>
          ) : null}
          {imageError ? (
            <p className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-[13px]">
              {imageError}
            </p>
          ) : null}
          {error ? <p className="text-destructive text-[13px] font-medium">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {entry ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

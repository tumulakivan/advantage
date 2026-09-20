import {
  archiveIncomeSource,
  createIncomeSource,
  databaseStats,
  deleteMyAccount,
  exportBackup,
  importBackup,
  importPlan,
  importRecords,
  resetLedger,
  updateIncomeSource,
  type IncomeSource,
} from "@advantage/api-client";
import { DEFAULT_SETTINGS } from "@advantage/core";
import {
  Download,
  Loader2,
  Moon,
  Plus,
  ShieldCheck,
  Sun,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import * as React from "react";

import { SourceChip } from "@/components/transactions/SourcePicker";
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
import { Switch } from "@/components/ui/switch";
import { useIncomeSources } from "@/hooks/useData";
import { invalidateQueries, useLiveQuery, useMutation } from "@/hooks/useLiveQuery";
import { useApi, useSession } from "@/providers/SessionProvider";
import { useSettings } from "@/providers/SettingsProvider";

const CURRENCIES = ["PHP", "AUD", "USD", "EUR", "SGD", "JPY", "GBP"];
const LOCALES = ["en-PH", "en-AU", "en-US", "en-GB", "en-SG"];

export function SettingsPage() {
  const { settings, update } = useSettings();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="How the app reads, who it belongs to, and how to get your data back out."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Money and dates</CardTitle>
              <CardDescription>How amounts are written across the app.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Currency">
                <Select
                  value={settings.currency}
                  onValueChange={(value) => void update({ currency: value })}
                >
                  <SelectTrigger aria-label="Currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Number format">
                <Select
                  value={settings.locale}
                  onValueChange={(value) => void update({ locale: value })}
                >
                  <SelectTrigger aria-label="Locale">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCALES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <label className="border-border flex items-center justify-between gap-4 rounded-lg border px-3.5 py-2.5">
              <span className="flex items-center gap-2.5">
                {settings.theme === "dark" ? (
                  <Moon className="text-primary size-4" />
                ) : (
                  <Sun className="text-primary size-4" />
                )}
                <span>
                  <span className="block text-[13px] font-semibold">Dark theme</span>
                  <span className="text-muted-foreground block text-[12px]">
                    Graphite surfaces, lime accent. On by default.
                  </span>
                </span>
              </span>
              <Switch
                checked={settings.theme === "dark"}
                onCheckedChange={(checked) => void update({ theme: checked ? "dark" : "light" })}
              />
            </label>
          </CardContent>
        </Card>

        <IncomeSourcesCard />
      </div>

      <DataCard />
      <AccountCard />
    </div>
  );
}

function IncomeSourcesCard() {
  const { data: sources } = useIncomeSources();
  const [editing, setEditing] = React.useState<IncomeSource | null>(null);
  const [adding, setAdding] = React.useState(false);
  const api = useApi();
  const { run, pending } = useMutation();

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Income sources</CardTitle>
          <CardDescription>
            Whoever pays you - an employer, a client, a tenant. The income form offers these.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus />
          Add
        </Button>
      </CardHeader>

      <CardContent className="space-y-2">
        {sources.length === 0 ? (
          <p className="text-muted-foreground text-[13px] leading-relaxed">
            No income sources yet. Add one and the income form will ask which of them a payment
            came from.
          </p>
        ) : null}

        {sources.map((source) => (
          <div
            key={source.id}
            className="border-border flex items-center gap-3 rounded-lg border px-3 py-2.5"
          >
            <SourceChip source={source} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-bold">{source.shortName}</p>
              <p className="text-muted-foreground truncate text-[12px]">{source.name}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setEditing(source)}>
              Rename
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title={`Remove ${source.shortName}`}
              disabled={pending}
              className="text-destructive hover:bg-destructive/10"
              onClick={() => void run(() => archiveIncomeSource(api, source.id))}
            >
              <Trash2 />
              <span className="sr-only">Remove {source.shortName}</span>
            </Button>
          </div>
        ))}

        <p className="text-muted-foreground text-[12px] leading-relaxed">
          Removing one leaves the income already logged against it alone - the records keep saying
          where they came from.
        </p>
      </CardContent>

      <SourceDialog
        source={editing}
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

function SourceDialog({
  source,
  open,
  onOpenChange,
}: {
  /** Null while adding a new one. */
  source: IncomeSource | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const api = useApi();
  const { run, pending, error } = useMutation();
  const [name, setName] = React.useState("");
  const [shortName, setShortName] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setName(source?.name ?? "");
    setShortName(source?.shortName ?? "");
  }, [open, source]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    const result = await run(async () => {
      const short = shortName.trim() || trimmed;
      if (source) await updateIncomeSource(api, source.id, { name: trimmed, shortName: short });
      else await createIncomeSource(api, { name: trimmed, shortName: short });
      return true;
    });

    if (result !== null) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{source ? "Rename income source" : "Add an income source"}</DialogTitle>
            <DialogDescription>
              {source
                ? "Existing records keep pointing at it."
                : "Income can then be logged against it, and the dashboard splits by source."}
            </DialogDescription>
          </DialogHeader>

          <Field label="Full name" htmlFor="source-name">
            <Input
              id="source-name"
              value={name}
              autoFocus
              placeholder="Acme Corp, Unit 4B tenant, freelance"
              onChange={(event) => setName(event.target.value)}
            />
          </Field>

          <Field
            label="Short name"
            htmlFor="source-short"
            hint="Used in tight spaces. Left blank, it follows the full name."
          >
            <Input
              id="source-short"
              value={shortName}
              onChange={(event) => setShortName(event.target.value)}
            />
          </Field>

          {error ? <p className="text-destructive text-[13px] font-medium">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {source ? "Save" : "Add source"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const STAT_LABELS: Record<string, string> = {
  transactions: "Records",
  accounts: "Accounts",
  categories: "Categories",
  budgets: "Budgets",
  planned: "Planned",
  incomeSources: "Income sources",
};

function DataCard() {
  const api = useApi();
  const { run, pending, error } = useMutation();
  const [message, setMessage] = React.useState<string | null>(null);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const { data: stats } = useLiveQuery((client) => databaseStats(client), [], {});
  const stamp = new Date().toISOString().slice(0, 10);

  async function exportJson() {
    await run(async () => {
      const backup = await exportBackup(api);
      download(
        new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
        `advantage-backup-${stamp}.json`,
      );
      setMessage("Backup downloaded.");
    });
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";

    await run(async () => {
      const payload: unknown = JSON.parse(await file.text());
      const format = (payload as { format?: string }).format;

      if (format === "advantage-backup") {
        await importBackup(api, payload);
        setMessage("Backup restored.");
      } else if (format === "advantage-plan") {
        const summary = await importPlan(api, payload);
        setMessage(
          `Loaded ${summary.created} planned items` +
            (summary.removed ? `, replacing ${summary.removed}` : "") +
            (summary.unresolvedCategories.length
              ? `. Unmatched categories: ${summary.unresolvedCategories.join(", ")}`
              : ".") +
            " Nothing counts against your balances until you log it.",
        );
      } else if (format === "advantage-records") {
        const summary = await importRecords(api, payload);
        setMessage(
          `Imported ${summary.inserted} records` +
            (summary.skipped ? `, skipped ${summary.skipped}` : "") +
            (summary.unresolvedCategories.length
              ? `. Unmatched categories: ${summary.unresolvedCategories.join(", ")}`
              : "."),
        );
      } else {
        throw new Error("That file is neither an adVantage backup nor a records file.");
      }
      invalidateQueries();
    });
  }

  async function reset() {
    await run(async () => {
      await resetLedger(api);
      setConfirmReset(false);
      setMessage("Everything was erased. Reload to start fresh.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Your data</CardTitle>
          <CardDescription>
            Stored on the server, under your account and nobody else's.
          </CardDescription>
        </div>
        <Badge variant="good">
          <ShieldCheck />
          Yours to take
        </Badge>
      </CardHeader>

      <CardContent className="space-y-5">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Object.entries(stats).map(([label, count]) => (
            <div key={label} className="bg-muted/50 rounded-lg px-3 py-2">
              <dt className="text-muted-foreground text-[11px] font-bold tracking-wide uppercase">
                {STAT_LABELS[label] ?? label}
              </dt>
              <dd className="num mt-0.5 text-[15px] font-extrabold">{count}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void exportJson()} disabled={pending}>
            <Download />
            Download backup
          </Button>
          <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={pending}>
            <Upload />
            Import a file
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => void handleFile(event)}
          />
          <Button
            variant="ghost"
            className="text-destructive hover:bg-destructive/10"
            onClick={() => setConfirmReset(true)}
            disabled={pending}
          >
            Erase everything
          </Button>
        </div>

        {message ? (
          <p className="border-border bg-muted/50 rounded-lg border px-3 py-2 text-[13px]">
            {message}
          </p>
        ) : null}
        {error ? <p className="text-destructive text-[13px] font-medium">{error}</p> : null}

        <p className="text-muted-foreground text-[12px] leading-relaxed">
          A <strong className="text-foreground font-semibold">plan file</strong> is a dated
          schedule of what is still to come - it loads into Planned, not into your balances. A
          records file is a small JSON document with a list of
          {" "}<code className="bg-muted rounded px-1 py-0.5 text-[11px]">type</code>,
          {" "}<code className="bg-muted rounded px-1 py-0.5 text-[11px]">amount</code>,
          {" "}<code className="bg-muted rounded px-1 py-0.5 text-[11px]">date</code> and
          {" "}<code className="bg-muted rounded px-1 py-0.5 text-[11px]">category</code> entries -
          the shape a spreadsheet export lands in. The backup file is the same format the
          offline version wrote, so one exported from there imports here unchanged. Default
          settings: {DEFAULT_SETTINGS.currency}, {DEFAULT_SETTINGS.locale}.
        </p>
      </CardContent>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Erase everything?</DialogTitle>
            <DialogDescription>
              Every record, account, budget and planned payment on your account is deleted, and
              the app starts over with the default categories. Your sign-in stays. This cannot be
              undone - download a backup first if you are unsure.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReset(false)}>
              Keep my data
            </Button>
            <Button variant="destructive" onClick={() => void reset()} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Erase everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/**
 * Deleting the account genuinely deletes it: everything cascades from the user
 * row. Worth offering plainly rather than burying, since the app now holds
 * someone's financial history on a machine they do not own.
 */
function AccountCard() {
  const api = useApi();
  const { user, refresh } = useSession();
  const { run, pending, error } = useMutation();
  const [confirming, setConfirming] = React.useState(false);
  const [typed, setTyped] = React.useState("");

  async function remove() {
    await run(async () => {
      await deleteMyAccount(api);
      setConfirming(false);
      refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Account</CardTitle>
          <CardDescription>Signed in as {user?.email}.</CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          Deleting your account removes the sign-in and every record behind it. There is no
          recovery and no copy kept - download a backup first if you want to keep any of it.
        </p>

        <Button
          variant="ghost"
          className="text-destructive hover:bg-destructive/10"
          onClick={() => {
            setTyped("");
            setConfirming(true);
          }}
          disabled={pending}
        >
          <TriangleAlert />
          Delete my account
        </Button>

        {error ? <p className="text-destructive text-[13px] font-medium">{error}</p> : null}
      </CardContent>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void remove();
            }}
            className="space-y-5"
          >
            <DialogHeader>
              <DialogTitle>Delete your account?</DialogTitle>
              <DialogDescription>
                This deletes your sign-in and every record, account, budget and planned payment
                that belongs to it. It cannot be undone.
              </DialogDescription>
            </DialogHeader>

            <Field label="Type DELETE to confirm" htmlFor="confirm-delete">
              <Input
                id="confirm-delete"
                value={typed}
                autoComplete="off"
                onChange={(event) => setTyped(event.target.value)}
              />
            </Field>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
                Keep my account
              </Button>
              <Button type="submit" variant="destructive" disabled={pending || typed !== "DELETE"}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                Delete everything
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

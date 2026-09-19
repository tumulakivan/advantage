import { DEFAULT_SETTINGS } from "@advantage/core";
import {
  databaseStats,
  exportBackup,
  importBackup,
  importPlan,
  importRecords,
  updateIncomeSource,
  type IncomeSource,
} from "@advantage/db";
import {
  Database,
  Download,
  HardDriveDownload,
  Loader2,
  Moon,
  Sun,
  TriangleAlert,
  Upload,
} from "lucide-react";
import * as React from "react";

import { BrandMark } from "@/components/brand/BrandMark";
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
import { useConnection, useDb } from "@/providers/DbProvider";
import { useSettings } from "@/providers/SettingsProvider";

const CURRENCIES = ["PHP", "AUD", "USD", "EUR", "SGD", "JPY", "GBP"];
const LOCALES = ["en-PH", "en-AU", "en-US", "en-GB", "en-SG"];

export function SettingsPage() {
  const { settings, update } = useSettings();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="Everything here is stored in this browser. There is no account and no server."
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
    </div>
  );
}

function IncomeSourcesCard() {
  const { data: sources } = useIncomeSources();
  const [editing, setEditing] = React.useState<IncomeSource | null>(null);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Income sources</CardTitle>
          <CardDescription>
            The choice the income form offers. Logos are bundled with the app, not uploaded.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {sources.map((source) => (
          <div
            key={source.id}
            className="border-border flex items-center gap-3 rounded-lg border px-3 py-2.5"
          >
            <BrandMark logo={source.logo} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-bold">{source.shortName}</p>
              <p className="text-muted-foreground truncate text-[12px]">{source.name}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setEditing(source)}>
              Rename
            </Button>
          </div>
        ))}
      </CardContent>

      <SourceDialog
        source={editing}
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
      />
    </Card>
  );
}

function SourceDialog({
  source,
  open,
  onOpenChange,
}: {
  source: IncomeSource | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const db = useDb();
  const { run, pending } = useMutation();
  const [name, setName] = React.useState("");
  const [shortName, setShortName] = React.useState("");

  React.useEffect(() => {
    if (!source) return;
    setName(source.name);
    setShortName(source.shortName);
  }, [source]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!source || !name.trim()) return;
    const result = await run(() =>
      updateIncomeSource(db, source.id, { name: name.trim(), shortName: shortName.trim() }),
    );
    if (result !== null) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Rename income source</DialogTitle>
            <DialogDescription>Existing records keep pointing at it.</DialogDescription>
          </DialogHeader>

          <Field label="Full name" htmlFor="source-name">
            <Input
              id="source-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>

          <Field label="Short name" htmlFor="source-short" hint="Used in tight spaces.">
            <Input
              id="source-short"
              value={shortName}
              onChange={(event) => setShortName(event.target.value)}
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Save
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

function DataCard() {
  const db = useDb();
  const { connection } = useConnection();
  const { run, pending, error } = useMutation();
  const [message, setMessage] = React.useState<string | null>(null);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const { data: stats } = useLiveQuery((database) => databaseStats(database), [], {});
  const STAT_LABELS: Record<string, string> = {
    transactions: "Records",
    accounts: "Accounts",
    categories: "Categories",
    budgets: "Budgets",
    planned: "Planned",
    incomeSources: "Income sources",
  };
  const durable = connection?.storage === "opfs";
  const stamp = new Date().toISOString().slice(0, 10);

  async function exportJson() {
    await run(async () => {
      const backup = await exportBackup(db);
      download(
        new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
        `advantage-backup-${stamp}.json`,
      );
      setMessage("Backup downloaded.");
    });
  }

  async function exportSqlite() {
    if (!connection) return;
    await run(async () => {
      const bytes = await connection.bridge.exportBytes();
      download(
        new Blob([bytes as unknown as BlobPart], { type: "application/vnd.sqlite3" }),
        `advantage-${stamp}.sqlite3`,
      );
      setMessage("Database file downloaded. Open it with any SQLite tool.");
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
        await importBackup(db, payload);
        setMessage("Backup restored.");
      } else if (format === "advantage-plan") {
        const summary = await importPlan(db, payload);
        setMessage(
          `Loaded ${summary.created} planned items` +
            (summary.removed ? `, replacing ${summary.removed}` : "") +
            (summary.unresolvedCategories.length
              ? `. Unmatched categories: ${summary.unresolvedCategories.join(", ")}`
              : ".") +
            " Nothing counts against your balances until you log it.",
        );
      } else if (format === "advantage-records") {
        const summary = await importRecords(db, payload);
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
    if (!connection) return;
    await run(async () => {
      await connection.bridge.wipe();
      setConfirmReset(false);
      setMessage("Everything was erased. Reload to start fresh.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Data and storage</CardTitle>
          <CardDescription>
            SQLite compiled to WebAssembly, running in a worker in this tab.
          </CardDescription>
        </div>
        <Badge variant={durable ? "good" : "warning"}>
          <Database />
          {durable ? "Saved to this browser" : "In memory only"}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-5">
        {!durable ? (
          <p className="border-warning/40 bg-warning/10 text-warning flex gap-2 rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              This browser would not give the app persistent storage, so records live in memory and
              disappear on reload. Download a backup before you close the tab.
            </span>
          </p>
        ) : null}

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
          <Button variant="outline" onClick={() => void exportSqlite()} disabled={pending}>
            <HardDriveDownload />
            Download .sqlite3
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
          the shape a spreadsheet export lands in. Default settings: {DEFAULT_SETTINGS.currency},
          {" "}{DEFAULT_SETTINGS.locale}.
        </p>
      </CardContent>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Erase everything?</DialogTitle>
            <DialogDescription>
              Every record, account, budget and planned payment in this browser is deleted, and the
              app starts over with the default categories. This cannot be undone.
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

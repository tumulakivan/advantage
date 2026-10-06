import { fullDateLabel } from "@advantage/core";
import { deleteTransaction, type TransactionRow } from "@advantage/api-client";
import { Loader2, Trash2 } from "lucide-react";

import { Amount } from "@/components/common/Amount";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMutation } from "@/hooks/useLiveQuery";
import { useApi } from "@/providers/SessionProvider";
import { useSettings } from "@/providers/SettingsProvider";

/**
 * A balance adjustment, opened from the ledger. There is nothing to edit: the
 * amount is whatever it took to reach the balance someone confirmed, so the
 * only change that keeps that honest is taking it back out.
 */
export function AdjustmentDialog({
  record,
  onOpenChange,
}: {
  record: TransactionRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const api = useApi();
  const { settings } = useSettings();
  const { run, pending, error } = useMutation();

  async function remove() {
    if (!record) return;
    const removed = await run(async () => {
      await deleteTransaction(api, record.id);
      return true;
    });
    if (removed) onOpenChange(false);
  }

  return (
    <Dialog open={record !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <div className="space-y-5">
          <DialogHeader>
            <DialogTitle>Balance adjustment</DialogTitle>
            <DialogDescription>
              Recorded when the balance of {record?.accountName ?? "this account"} was set. It
              moves the balance but isn't counted as income or spending.
            </DialogDescription>
          </DialogHeader>

          {record ? (
            <dl className="border-border divide-border divide-y rounded-lg border text-[13px]">
              <Row label="Amount">
                <Amount minor={record.amountMinor} direction="auto" className="text-[14px]" />
              </Row>
              <Row label="Account">{record.accountName}</Row>
              <Row label="Date">{fullDateLabel(record.date, settings.locale)}</Row>
              {record.note ? <Row label="Note">{record.note}</Row> : null}
            </dl>
          ) : null}

          <p className="text-muted-foreground text-[12.5px]">
            To change it, delete it and set the balance again from Accounts.
          </p>

          {error ? <p className="text-destructive text-[13px] font-medium">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={remove}>
              {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Delete adjustment
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-3.5 py-2.5">
      <dt className="text-muted-foreground font-semibold">{label}</dt>
      <dd className="min-w-0 truncate text-right font-semibold">{children}</dd>
    </div>
  );
}

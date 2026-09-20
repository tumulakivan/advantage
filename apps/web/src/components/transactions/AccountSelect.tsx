import type { AccountWithBalance } from "@advantage/api-client";

import { AccountIcon } from "@/components/brand/AccountIcon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMoney } from "@/providers/SettingsProvider";

export function AccountSelect({
  accounts,
  value,
  onChange,
  exclude,
  placeholder = "Pick an account",
  id,
}: {
  accounts: AccountWithBalance[];
  value: string | null;
  onChange: (id: string) => void;
  exclude?: string | null;
  placeholder?: string;
  id?: string;
}) {
  const money = useMoney();
  const visible = accounts.filter((account) => account.id !== exclude);
  const selected = accounts.find((account) => account.id === value);

  return (
    <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger id={id} aria-label="Account">
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            <AccountIcon logoUrl={selected.logoUrl} icon={selected.icon} name={selected.name} size="sm" />
            <span className="truncate font-medium">{selected.name}</span>
          </span>
        ) : (
          <SelectValue placeholder={placeholder} />
        )}
      </SelectTrigger>

      <SelectContent>
        {visible.map((account) => {
          return (
            <SelectItem key={account.id} value={account.id}>
              <AccountIcon logoUrl={account.logoUrl} icon={account.icon} name={account.name} size="sm" />
              <span className="font-medium">{account.name}</span>
              <span className="num text-muted-foreground ml-auto pl-4 text-[12px]">
                {money(account.balanceMinor, { hideCents: true })}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

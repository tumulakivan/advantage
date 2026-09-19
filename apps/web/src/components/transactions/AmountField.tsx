import { currencySymbol, formatAmount, parseAmount } from "@advantage/core";
import * as React from "react";

import { cn } from "@/lib/utils";
import { useSettings } from "@/providers/SettingsProvider";

/**
 * The field the whole app exists for, so it gets the biggest type on the form
 * and forgiving parsing: commas, a currency symbol and stray spaces are all
 * accepted, because nobody should have to think about formatting while logging
 * a purchase.
 */
export function AmountField({
  value,
  onChange,
  direction,
  autoFocus,
  id = "amount",
}: {
  /** Minor units, or null while the field is empty. */
  value: number | null;
  onChange: (minor: number | null) => void;
  direction: "in" | "out" | "neutral";
  autoFocus?: boolean;
  id?: string;
}) {
  const { settings } = useSettings();
  const [text, setText] = React.useState(() => (value === null ? "" : formatAmount(value, settings.locale)));

  // Reformat only when the value changes from the outside (edit, reset).
  const lastEmitted = React.useRef(value);
  React.useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    setText(value === null ? "" : formatAmount(value, settings.locale));
  }, [value, settings.locale]);

  function handle(next: string) {
    setText(next);
    const minor = parseAmount(next);
    lastEmitted.current = minor;
    onChange(minor);
  }

  return (
    <div
      className={cn(
        "border-input bg-background focus-within:border-ring/60 focus-within:ring-ring/25 flex items-center gap-2 rounded-lg border px-3.5 py-2.5 shadow-sm transition-[border-color,box-shadow] focus-within:ring-2",
      )}
    >
      <span
        className={cn(
          // shrink-0 + nowrap: the sign and the symbol are one unit and must
          // not stack when the field gets narrow.
          "num shrink-0 text-lg font-bold whitespace-nowrap",
          direction === "in" && "text-money-in",
          direction === "out" && "text-money-out",
          direction === "neutral" && "text-muted-foreground",
        )}
      >
        {direction === "out" ? "-" : direction === "in" ? "+" : ""}
        {currencySymbol(settings.currency, settings.locale)}
      </span>

      <input
        id={id}
        inputMode="decimal"
        autoFocus={autoFocus}
        value={text}
        onChange={(event) => handle(event.target.value)}
        onBlur={() => {
          const minor = parseAmount(text);
          if (minor !== null) setText(formatAmount(minor, settings.locale));
        }}
        placeholder="0.00"
        aria-label="Amount"
        className="num placeholder:text-muted-foreground/50 w-full bg-transparent text-2xl font-extrabold tracking-tight outline-none"
      />
    </div>
  );
}

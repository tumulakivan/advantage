import { cn } from "@/lib/utils";
import { useMoney } from "@/providers/SettingsProvider";

type Direction = "in" | "out" | "neutral" | "auto";

/**
 * Money on screen. Tabular figures so columns line up, an explicit sign for
 * anything directional, and color that only ever reinforces a sign that is
 * already written - never the sole carrier of "this went out".
 */
export function Amount({
  minor,
  direction = "neutral",
  signed,
  hideCents,
  compact,
  className,
}: {
  minor: number;
  direction?: Direction;
  signed?: boolean;
  hideCents?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const money = useMoney();
  const resolved: Direction =
    direction === "auto" ? (minor < 0 ? "out" : minor > 0 ? "in" : "neutral") : direction;

  const value = direction === "out" && minor > 0 ? -minor : minor;

  return (
    <span
      className={cn(
        "num font-semibold",
        resolved === "in" && "text-money-in",
        resolved === "out" && "text-money-out",
        className,
      )}
    >
      {money(value, { signed: signed ?? resolved !== "neutral", hideCents, compact })}
    </span>
  );
}

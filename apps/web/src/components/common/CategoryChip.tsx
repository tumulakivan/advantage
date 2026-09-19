import { slotColor } from "@advantage/theme";

import { iconFor } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * Icon tile tinted with the category hue. The tint is 14% so the icon keeps
 * contrast against it - a full-strength swatch would make the glyph unreadable.
 */
export function CategoryIcon({
  icon,
  color,
  size = "md",
  className,
}: {
  icon: string | null | undefined;
  color: string | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const Icon = iconFor(icon);
  const hue = slotColor(color);
  const box = size === "sm" ? "size-7" : size === "lg" ? "size-11" : "size-9";
  const glyph = size === "sm" ? "size-3.5" : size === "lg" ? "size-5" : "size-4";

  return (
    <span
      className={cn("flex shrink-0 items-center justify-center rounded-lg", box, className)}
      style={{ backgroundColor: `color-mix(in oklab, ${hue} 16%, transparent)`, color: hue }}
    >
      <Icon className={glyph} strokeWidth={2.25} />
    </span>
  );
}

/** A small filled dot - the legend swatch shape used everywhere in the app. */
export function ColorDot({ color, className }: { color: string | null | undefined; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("size-2.5 shrink-0 rounded-[3px]", className)}
      style={{ backgroundColor: slotColor(color) }}
    />
  );
}

export function CategoryLabel({
  name,
  parentName,
  className,
}: {
  name: string | null | undefined;
  parentName?: string | null;
  className?: string;
}) {
  return (
    <span className={cn("flex min-w-0 flex-col", className)}>
      <span className="truncate text-[13.5px] font-semibold">{name ?? "Uncategorized"}</span>
      {parentName ? (
        <span className="text-muted-foreground truncate text-[12px]">{parentName}</span>
      ) : null}
    </span>
  );
}

import { iconFor } from "@/lib/icons";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Account marks are square app icons that carry their own background - GCash
 * blue, UnionBank orange, Wise green - so they are drawn full bleed in a fixed
 * rounded box. Same box for every account, logo or not, so a row of them lines
 * up.
 *
 * The artwork used to be bundled with the app and keyed by slug, which meant
 * adding one was a deploy. It now comes from the shared catalog as an ordinary
 * image URL, so an admin can add an account on a Tuesday afternoon and everyone
 * has it. A wallet the catalog does not know about falls back to its lucide
 * glyph, which is also what every custom account gets.
 */
const BOX = {
  sm: "size-7 rounded-md",
  md: "size-9 rounded-lg",
  lg: "size-11 rounded-xl",
} as const;

const GLYPH = { sm: "size-3.5", md: "size-4", lg: "size-5" } as const;

export function AccountIcon({
  logoUrl,
  icon,
  name,
  size = "md",
  className,
}: {
  /** Catalog logo path, as the API returns it. Null for a custom account. */
  logoUrl?: string | null;
  /** Lucide name, used when there is no logo. */
  icon?: string | null;
  name?: string | null;
  size?: keyof typeof BOX;
  className?: string;
}) {
  const src = api.assetUrl(logoUrl);

  if (!src) {
    const Icon = iconFor(icon);
    return (
      <span
        className={cn(
          "bg-muted text-muted-foreground flex shrink-0 items-center justify-center",
          BOX[size],
          className,
        )}
      >
        <Icon className={GLYPH[size]} />
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={name ?? ""}
      loading="lazy"
      className={cn("shrink-0 object-cover ring-1 ring-black/10", BOX[size], className)}
    />
  );
}

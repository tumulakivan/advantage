import gcashLogo from "@/assets/brands/gcash.png";
import maribankLogo from "@/assets/brands/maribank.png";
import unionbankLogo from "@/assets/brands/unionbank.png";
import wiseLogo from "@/assets/brands/wise.png";
import { iconFor } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * Account marks are square app icons that carry their own background - GCash
 * blue, UnionBank orange, Wise green - so they are drawn full bleed in a fixed
 * rounded box rather than on the white chip the income wordmarks need. Same box
 * for every account, logo or not, so a row of them lines up.
 */
const LOGOS: Record<string, { src: string; alt: string }> = {
  gcash: { src: gcashLogo, alt: "GCash" },
  maribank: { src: maribankLogo, alt: "Maribank" },
  unionbank: { src: unionbankLogo, alt: "UnionBank" },
  wise: { src: wiseLogo, alt: "Wise" },
};

const BOX = {
  sm: "size-7 rounded-md",
  md: "size-9 rounded-lg",
  lg: "size-11 rounded-xl",
} as const;

const GLYPH = { sm: "size-3.5", md: "size-4", lg: "size-5" } as const;

export function AccountIcon({
  slug,
  icon,
  size = "md",
  className,
}: {
  /** The account slug; seeded accounts carry a logo, user-made ones do not. */
  slug?: string | null;
  /** Lucide name, used when there is no logo for this account. */
  icon?: string | null;
  size?: keyof typeof BOX;
  className?: string;
}) {
  const logo = slug ? LOGOS[slug] : undefined;

  if (!logo) {
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
      src={logo.src}
      alt={logo.alt}
      loading="lazy"
      className={cn("shrink-0 object-cover ring-1 ring-black/10", BOX[size], className)}
    />
  );
}

export function hasAccountLogo(slug?: string | null): boolean {
  return Boolean(slug && slug in LOGOS);
}

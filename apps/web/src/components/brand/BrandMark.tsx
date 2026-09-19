import liveLuxeLogo from "@/assets/brands/live-luxe.webp";
import mentisLogo from "@/assets/brands/mentis.png";
import { cn } from "@/lib/utils";

/**
 * Both income-source logos are dark ink on a light ground, so on a graphite
 * surface they have to sit on their own light chip. That is also how a brand
 * lockup is supposed to be treated - never recolored, never knocked out.
 */
const LOGOS: Record<string, { src: string; alt: string; aspect: "square" | "wide" }> = {
  mentis: { src: mentisLogo, alt: "Mentis Global", aspect: "wide" },
  "live-luxe": { src: liveLuxeLogo, alt: "Live Luxe Rentals AU", aspect: "square" },
};

export function BrandMark({
  logo,
  className,
  size = "md",
}: {
  logo: string | null | undefined;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const entry = logo ? LOGOS[logo] : undefined;
  const box = size === "sm" ? "size-7" : size === "lg" ? "size-12" : "size-9";

  if (!entry) {
    return (
      <div
        className={cn(
          "bg-muted text-muted-foreground flex items-center justify-center rounded-lg text-[11px] font-bold",
          box,
          className,
        )}
      >
        {(logo ?? "?").slice(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1 shadow-sm ring-1 ring-black/5",
        box,
        className,
      )}
    >
      <img src={entry.src} alt={entry.alt} className="h-full w-full object-contain" loading="lazy" />
    </div>
  );
}

/** Wide lockup for a picker row, where the wordmark can breathe. */
export function BrandLockup({ logo, className }: { logo: string | null | undefined; className?: string }) {
  const entry = logo ? LOGOS[logo] : undefined;
  if (!entry) return null;
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center justify-center rounded-md bg-white px-2 shadow-sm ring-1 ring-black/5",
        className,
      )}
    >
      <img src={entry.src} alt={entry.alt} className="h-4 w-auto max-w-24 object-contain" />
    </span>
  );
}

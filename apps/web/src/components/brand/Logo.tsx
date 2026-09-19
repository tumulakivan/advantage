import { cn } from "@/lib/utils";

/**
 * The adVantage mark. Drawn, not imported: a rising step chart whose last bar
 * is the accent, which is the whole product in one glyph.
 */
export function Logo({
  className,
  accent = "var(--primary)",
}: {
  className?: string;
  /** The accent bar. The sidebar overrides it: that rail is dark in both themes. */
  accent?: string;
}) {
  return (
    <svg
      viewBox="0 0 28 28"
      aria-hidden="true"
      className={cn("size-7", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="0.5" y="0.5" width="27" height="27" rx="8" fill="currentColor" opacity="0.10" />
      <rect x="6" y="16" width="4" height="6" rx="1.5" fill="currentColor" opacity="0.45" />
      <rect x="12" y="12" width="4" height="10" rx="1.5" fill="currentColor" opacity="0.7" />
      <rect x="18" y="6" width="4" height="16" rx="1.5" fill={accent} />
    </svg>
  );
}

export function Wordmark({
  className,
  accent = "text-primary",
}: {
  className?: string;
  accent?: string;
}) {
  return (
    <span className={cn("text-[17px] leading-none font-extrabold tracking-tight", className)}>
      ad<span className={accent}>V</span>antage
    </span>
  );
}

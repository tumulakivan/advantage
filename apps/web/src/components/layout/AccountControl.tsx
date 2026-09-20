import { LogOut, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Who is signed in, the theme switch, and the way out - one cluster, top right.
 *
 * These three belong together: they are the only controls on screen that are
 * about the session rather than about money. Keeping them in one corner also
 * means the narrow layout has one thing to collapse rather than three, so the
 * address drops to an initial and everything else stays put.
 */
export function AccountControl({
  email,
  theme,
  onToggleTheme,
  onSignOut,
}: {
  email: string | null;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onSignOut: () => void;
}) {
  return (
    // `ml-auto` rather than relying on the header's justify-between: the line
    // to the left of this is a fact that may never arrive, and a lone flex
    // child under justify-between sits at the start.
    //
    // `shrink-0` because the other thing in the bar is a fact of arbitrary
    // length, and the address losing to it - down to "r..." - is the wrong way
    // round. The address is capped at 16rem below, so holding its ground here
    // cannot starve the rest of the bar either.
    <div className="ml-auto flex shrink-0 items-center gap-1.5">
      <span
        className="border-border bg-muted/60 flex min-w-0 items-center gap-2 rounded-full py-1 pr-1 pl-1 sm:border sm:py-0.5 sm:pr-3"
        title={email ?? ""}
      >
        <span
          aria-hidden="true"
          className="bg-primary/15 text-primary flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold uppercase"
        >
          {email?.[0] ?? "?"}
        </span>
        {/* The address is the first thing to go when there is no room for it;
            the initial above carries the same answer in a tenth of the space. */}
        <span className="text-muted-foreground hidden max-w-[16rem] truncate text-[12.5px] sm:block">
          {email ?? "Signed out"}
        </span>
      </span>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onToggleTheme}
        title={theme === "dark" ? "Switch to light" : "Switch to dark"}
      >
        {theme === "dark" ? <Moon /> : <Sun />}
        <span className="sr-only">Toggle theme</span>
      </Button>

      <Button variant="ghost" size="icon-sm" onClick={onSignOut} title="Sign out">
        <LogOut />
        <span className="sr-only">Sign out</span>
      </Button>
    </div>
  );
}

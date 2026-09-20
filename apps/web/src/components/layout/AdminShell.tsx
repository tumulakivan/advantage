import * as React from "react";
import { Outlet } from "react-router-dom";

import { Logo, Wordmark } from "@/components/brand/Logo";
import { AccountControl } from "@/components/layout/AccountControl";
import { ADMIN_NAV, MobileNav, Sidebar } from "@/components/layout/Sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { applyTheme, readStoredTheme } from "@/lib/theme";
import { useSession } from "@/providers/SessionProvider";

/**
 * The frame for an admin account, which is the same chrome around a much
 * smaller app.
 *
 * It is a separate shell rather than the usual one with items hidden, because
 * an admin account genuinely has less: no settings row, no ledger, no selected
 * month. Mounting `SettingsProvider` and `MonthProvider` for it would mean
 * fetching a currency and a locale that do not exist, to format amounts nothing
 * here displays. The theme is the one preference that still applies, and for
 * this app the browser holds it.
 */
export function AdminShell() {
  const [theme, setTheme] = React.useState(readStoredTheme);

  React.useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <TooltipProvider delayDuration={200}>
      <Frame theme={theme} onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")} />
    </TooltipProvider>
  );
}

function Frame({
  theme,
  onToggleTheme,
}: {
  theme: "dark" | "light";
  onToggleTheme: () => void;
}) {
  const { user, signOut } = useSession();

  return (
    <div className="bg-background flex min-h-screen">
      <Sidebar items={ADMIN_NAV} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border bg-card/80 sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b px-4 backdrop-blur-md lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5 lg:hidden">
            <Logo />
            <Wordmark />
          </div>

          <p className="text-muted-foreground hidden min-w-0 truncate text-[12.5px] lg:block">
            Administering the service - this account has no ledger of its own.
          </p>

          <AccountControl
            email={user?.email ?? null}
            theme={theme}
            onToggleTheme={onToggleTheme}
            onSignOut={() => void signOut()}
          />
        </header>

        <MobileNav items={ADMIN_NAV} />

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 lg:px-8 lg:py-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

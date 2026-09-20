import { Outlet } from "react-router-dom";

import { Logo, Wordmark } from "@/components/brand/Logo";
import { AccountControl } from "@/components/layout/AccountControl";
import { RandomFact } from "@/components/layout/RandomFact";
import { MobileNav, Sidebar } from "@/components/layout/Sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MonthProvider } from "@/hooks/useMonth";
import { useSession } from "@/providers/SessionProvider";
import { SettingsProvider, useSettings } from "@/providers/SettingsProvider";

/**
 * The frame for a personal account: dark rail on the left, a thin top bar,
 * content in the middle.
 *
 * The session is already resolved by the time this mounts, and so is whether
 * this is an admin - the router will not render it otherwise - so there is no
 * loading state left to handle here. An admin account never reaches this shell
 * at all; it gets `AdminShell`, which needs none of these providers.
 */
export function AppShell() {
  return (
    <SettingsProvider>
      <MonthProvider>
        <TooltipProvider delayDuration={200}>
          <Frame />
        </TooltipProvider>
      </MonthProvider>
    </SettingsProvider>
  );
}

function Frame() {
  const { user, signOut } = useSession();
  const { settings, toggleTheme } = useSettings();

  return (
    <div className="bg-background flex min-h-screen">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border bg-card/80 sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b px-4 backdrop-blur-md lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5 lg:hidden">
            <Logo />
            <Wordmark />
          </div>

          <RandomFact className="text-muted-foreground hidden min-w-0 flex-1 truncate text-[12.5px] lg:block" />

          <AccountControl
            email={user?.email ?? null}
            theme={settings.theme}
            onToggleTheme={toggleTheme}
            onSignOut={() => void signOut()}
          />
        </header>

        <MobileNav />

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 lg:px-8 lg:py-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

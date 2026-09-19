import { CircleAlert, Loader2, Moon, Sun } from "lucide-react";
import { Outlet } from "react-router-dom";

import { Logo, Wordmark } from "@/components/brand/Logo";
import { MobileNav, Sidebar } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MonthProvider } from "@/hooks/useMonth";
import { useConnection } from "@/providers/DbProvider";
import { SettingsProvider, useSettings } from "@/providers/SettingsProvider";

/**
 * The frame: dark rail on the left, a thin top bar, content in the middle.
 * Nothing renders until the database is open, because every screen in here
 * reads from it - a half-loaded dashboard would just be a flash of zeroes.
 */
export function AppShell() {
  const { status, error, retry } = useConnection();

  if (status === "connecting") return <Booting />;
  if (status === "locked") return <AlreadyOpen onRetry={retry} />;
  if (status === "error") return <FailedToOpen error={error} onRetry={retry} />;

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
  const { connection } = useConnection();
  const { settings, toggleTheme } = useSettings();

  return (
    <div className="bg-background flex min-h-screen">
      <Sidebar storage={connection?.storage ?? null} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border bg-card/80 sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b px-5 backdrop-blur-md lg:px-8">
          <div className="flex items-center gap-2.5 lg:hidden">
            <Logo />
            <Wordmark />
          </div>

          <p className="text-muted-foreground hidden text-[12.5px] lg:block">
            Private by construction - your records never leave this browser.
          </p>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleTheme}
            title={settings.theme === "dark" ? "Switch to light" : "Switch to dark"}
          >
            {settings.theme === "dark" ? <Moon /> : <Sun />}
            <span className="sr-only">Toggle theme</span>
          </Button>
        </header>

        <MobileNav />

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 lg:px-8 lg:py-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Booting() {
  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center gap-4">
      <Logo className="text-foreground size-10" />
      <p className="text-muted-foreground flex items-center gap-2 text-[13px]">
        <Loader2 className="size-4 animate-spin" />
        Opening your database
      </p>
    </div>
  );
}

function AlreadyOpen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-6">
      <div className="border-border bg-card w-full max-w-md space-y-4 rounded-2xl border p-6 shadow-lg">
        <span className="bg-warning/15 text-warning flex size-10 items-center justify-center rounded-xl">
          <CircleAlert className="size-5" />
        </span>
        <div className="space-y-1.5">
          <h1 className="text-lg font-bold">Already open in another tab</h1>
          <p className="text-muted-foreground text-[13px] leading-relaxed">
            The database allows one connection at a time, so only one tab can hold it. Close the
            other adVantage tab and try again - nothing has been lost.
          </p>
        </div>
        <Button onClick={onRetry}>Try again</Button>
      </div>
    </div>
  );
}

function FailedToOpen({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-6">
      <div className="border-border bg-card w-full max-w-md space-y-4 rounded-2xl border p-6 shadow-lg">
        <span className="bg-destructive/15 text-destructive flex size-10 items-center justify-center rounded-xl">
          <CircleAlert className="size-5" />
        </span>
        <div className="space-y-1.5">
          <h1 className="text-lg font-bold">The database would not open</h1>
          <p className="text-muted-foreground text-[13px] leading-relaxed">
            adVantage runs SQLite inside this browser. This usually means the tab is blocking
            workers or storage - a private window or a hardened browser profile will do it.
          </p>
        </div>
        {error ? (
          <p className="bg-muted text-muted-foreground rounded-lg px-3 py-2 font-mono text-[12px] break-words">
            {error}
          </p>
        ) : null}
        <Button onClick={onRetry}>Try again</Button>
      </div>
    </div>
  );
}

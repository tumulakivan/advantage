import {
  ArrowLeftRight,
  CalendarClock,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Tag,
  Target,
  Wallet,
} from "lucide-react";
import { NavLink } from "react-router-dom";

import { Logo, Wordmark } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";

export interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end: boolean;
}

/** The personal app: everything a ledger needs. */
export const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight, end: false },
  { to: "/budgets", label: "Budgets", icon: Target, end: false },
  { to: "/planned", label: "Planned", icon: CalendarClock, end: false },
  { to: "/accounts", label: "Accounts", icon: Wallet, end: false },
  { to: "/categories", label: "Categories", icon: Tag, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
];

/**
 * The admin app, which is one screen. An admin account administers the service
 * and has no ledger of its own, so there is nothing else to navigate to.
 */
export const ADMIN_NAV: NavItem[] = [
  { to: "/admin", label: "Admin", icon: ShieldCheck, end: false },
];

/**
 * Fixed-width dark rail, translucent hover, one accent bar on the active item.
 * The chrome stays dark in both themes so the app always reads as one product.
 */
export function Sidebar({ items = NAV }: { items?: NavItem[] }) {
  return (
    <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border hidden w-60 shrink-0 flex-col border-r lg:flex">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <Logo className="text-sidebar-foreground size-7" accent="var(--sidebar-primary)" />
        <Wordmark accent="text-sidebar-primary" />
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "group relative flex items-center gap-3 rounded-md px-3 py-2 text-[13.5px] font-semibold transition-colors",
                isActive
                  ? "bg-sidebar-active text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  aria-hidden="true"
                  className={cn(
                    "bg-sidebar-primary absolute left-0 h-4 w-0.5 rounded-r-full transition-opacity",
                    isActive ? "opacity-100" : "opacity-0",
                  )}
                />
                <item.icon className="size-4 shrink-0" strokeWidth={2.25} />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

    </aside>
  );
}

/**
 * The same nav as a horizontal strip, for narrow screens.
 *
 * Unlike the rail, this one follows the theme. The rail is a full-height edge
 * and reads as structure whatever colour the page is; a dark band wedged
 * between a white header and a white page reads as something that failed to
 * load. So it takes the card surface and the ordinary accent, which makes it
 * graphite with lime in the dark and white with green in the light.
 */
export function MobileNav({ items = NAV }: { items?: NavItem[] }) {
  return (
    <nav
      data-testid="mobile-nav"
      className="bg-card border-border flex items-center gap-1 overflow-x-auto border-b px-3 py-2 lg:hidden"
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              "flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors",
              isActive
                ? "bg-primary/12 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )
          }
        >
          <item.icon className="size-3.5" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

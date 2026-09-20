import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router-dom";

import { Logo } from "@/components/brand/Logo";
import { AdminShell } from "@/components/layout/AdminShell";
import { AppShell } from "@/components/layout/AppShell";
import { AccountsPage } from "@/pages/Accounts";
import { AdminPage } from "@/pages/Admin";
import { BudgetsPage } from "@/pages/Budgets";
import { CategoriesPage } from "@/pages/Categories";
import { DashboardPage } from "@/pages/Dashboard";
import { PlannedPage } from "@/pages/Planned";
import { SettingsPage } from "@/pages/Settings";
import { SignInPage, SignUpPage } from "@/pages/SignIn";
import { TransactionsPage } from "@/pages/Transactions";
import { SessionProvider, useSession } from "@/providers/SessionProvider";

/**
 * Nothing behind this renders without a session. The check is here rather than
 * per route so a screen can never be written that forgets it - the same reason
 * the server keeps its tenant handle out of reach of route code.
 */
function RequireSession() {
  const { status } = useSession();

  if (status === "loading") return <Resolving />;
  if (status === "signed-out") return <Navigate to="/signin" replace />;
  return <Outlet />;
}

/** The inverse: an already-signed-in person has no use for the sign-in page. */
function RequireNoSession() {
  const { status, user } = useSession();

  if (status === "loading") return <Resolving />;
  if (status === "signed-in") return <Navigate to={user?.isAdmin ? "/admin" : "/"} replace />;
  return <Outlet />;
}

/**
 * There are two apps behind the sign-in, and an account is in exactly one.
 *
 * A personal account has a ledger and none of the administration. An admin
 * account administers the service and has no ledger at all - not hidden, not
 * empty, not there: the server refuses it and the seed never builds one.
 * Someone who wants both keeps two accounts, which is the arrangement worth
 * having anyway.
 *
 * Each area sends the wrong sort of account to the other, so there is no URL
 * either of them can type that lands on a screen of refused requests.
 */
function AdminArea() {
  const { user, adminResolved } = useSession();

  if (!adminResolved) return <Resolving />;
  if (!user?.isAdmin) return <Navigate to="/" replace />;
  return <AdminShell />;
}

function PersonalArea() {
  const { user, adminResolved } = useSession();

  if (!adminResolved) return <Resolving />;
  if (user?.isAdmin) return <Navigate to="/admin" replace />;
  return <AppShell />;
}

function Resolving() {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center">
      <Logo className="size-10 animate-pulse" />
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <RequireNoSession />,
    children: [
      { path: "/signin", element: <SignInPage /> },
      { path: "/signup", element: <SignUpPage /> },
    ],
  },
  {
    element: <RequireSession />,
    children: [
      {
        element: <AdminArea />,
        children: [{ path: "/admin", element: <AdminPage /> }],
      },
      {
        element: <PersonalArea />,
        children: [
          { path: "/", element: <DashboardPage /> },
          { path: "/transactions", element: <TransactionsPage /> },
          { path: "/budgets", element: <BudgetsPage /> },
          { path: "/planned", element: <PlannedPage /> },
          { path: "/accounts", element: <AccountsPage /> },
          { path: "/categories", element: <CategoriesPage /> },
          { path: "/settings", element: <SettingsPage /> },
          { path: "*", element: <DashboardPage /> },
        ],
      },
    ],
  },
]);

export function App() {
  return (
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  );
}

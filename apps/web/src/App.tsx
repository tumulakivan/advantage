import * as React from "react";
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router-dom";

import { Logo } from "@/components/brand/Logo";
import { AdminShell } from "@/components/layout/AdminShell";
import { AppShell } from "@/components/layout/AppShell";
import { AccountsPage } from "@/pages/Accounts";
import { AdminPage } from "@/pages/Admin";
import { BudgetsPage } from "@/pages/Budgets";
import { CategoriesPage } from "@/pages/Categories";
import { DashboardPage } from "@/pages/Dashboard";
import { ForgotPasswordPage } from "@/pages/ForgotPassword";
import { PlannedPage } from "@/pages/Planned";
import { ResetPasswordPage } from "@/pages/ResetPassword";
import { SettingsPage } from "@/pages/Settings";
import { SignInPage, SignUpPage } from "@/pages/SignIn";
import { TransactionsPage } from "@/pages/Transactions";
import { VerifyEmailPage } from "@/pages/VerifyEmail";
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

/**
 * The inverse: an already-signed-in person has no use for the sign-in page.
 *
 * The splash is for the first answer only. For someone who is signed out, the
 * auth client reports "loading" again every time it re-reads the session - after
 * a sign-up, when the tab regains focus - and swapping the page for a blank
 * splash each time unmounts it. That threw away whatever was typed into the
 * form, and it wiped the "check your email" screen a moment after it appeared.
 * Once there has been an answer, the page stays put while the next one loads.
 */
function RequireNoSession() {
  const { status, user } = useSession();
  const answered = React.useRef(false);

  if (status !== "loading") answered.current = true;
  if (status === "loading" && !answered.current) return <Resolving />;
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
      // A signed-in visitor is forwarded to the app, which is right for an
      // emailed confirmation link: by the time it lands here the server has
      // already signed them in, so this only renders when something failed.
      { path: "/verify", element: <VerifyEmailPage /> },
      { path: "/forgot-password", element: <ForgotPasswordPage /> },
    ],
  },
  // Outside both guards. Someone signed in on this browser who follows a reset
  // link still means to reset, and a guard that bounced them to the dashboard
  // would swallow the link.
  { path: "/reset-password", element: <ResetPasswordPage /> },
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

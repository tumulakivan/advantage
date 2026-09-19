import { createBrowserRouter, RouterProvider } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
import { AccountsPage } from "@/pages/Accounts";
import { BudgetsPage } from "@/pages/Budgets";
import { CategoriesPage } from "@/pages/Categories";
import { DashboardPage } from "@/pages/Dashboard";
import { PlannedPage } from "@/pages/Planned";
import { SettingsPage } from "@/pages/Settings";
import { TransactionsPage } from "@/pages/Transactions";
import { DbProvider } from "@/providers/DbProvider";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "transactions", element: <TransactionsPage /> },
      { path: "budgets", element: <BudgetsPage /> },
      { path: "planned", element: <PlannedPage /> },
      { path: "accounts", element: <AccountsPage /> },
      { path: "categories", element: <CategoriesPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "*", element: <DashboardPage /> },
    ],
  },
]);

export function App() {
  return (
    <DbProvider>
      <RouterProvider router={router} />
    </DbProvider>
  );
}

import type { DashboardData, OutlookData } from "@advantage/api-client/types";
import {
  buildBreakdown,
  buildCashflowSeries,
  buildOutlook,
  computeKpis,
  monthRange,
  todayIso,
  type Granularity,
  type IsoDate,
  type MonthKey,
} from "@advantage/core";

import type { Tenant } from "../db/tenant";
import {
  incomeBySource,
  largestExpenses,
  monthTotals,
  monthlyTotals,
  netWorth,
  spendByGroup,
} from "./analytics";
import { outlookEntries } from "./outlook";

/**
 * Whole screens, assembled in one place.
 *
 * The dashboard used to fan out about twelve queries from the browser, which is
 * free against a local file and a thundering herd over a network. The fan-out
 * still happens - it just happens here, next to the database, and the browser
 * makes one request.
 *
 * The derivation itself is still `@advantage/core`, unchanged and untouched by
 * the move to a server. It is the reason this was a port and not a rewrite.
 */
export async function loadDashboard(
  tenant: Tenant,
  month: MonthKey,
  locale: string,
): Promise<DashboardData> {
  const months = monthRange(month, 6);
  const previousMonth = months.at(-2) ?? month;

  const [current, previous, series, groups, sources, largest, worth] = await Promise.all([
    monthTotals(tenant, month),
    monthTotals(tenant, previousMonth),
    monthlyTotals(tenant, months[0] ?? month, month),
    spendByGroup(tenant, month),
    incomeBySource(tenant, month),
    largestExpenses(tenant, month, 5),
    netWorth(tenant),
  ]);

  return {
    kpis: computeKpis(current, previous),
    cashflow: buildCashflowSeries(series, months, locale),
    breakdown: buildBreakdown(groups),
    sources,
    largest,
    netWorthMinor: worth,
  };
}

/**
 * The forward view: logged records and the schedule occurrences that have not
 * happened yet, over any window. The bucket size follows the span unless the
 * caller pins it.
 */
export async function loadOutlook(
  tenant: Tenant,
  from: IsoDate,
  to: IsoDate,
  locale: string,
  granularity?: Granularity,
): Promise<OutlookData> {
  const entries = await outlookEntries(tenant, from, to);
  return {
    entries,
    outlook: buildOutlook(entries, from, to, { locale, granularity, today: todayIso() }),
  };
}

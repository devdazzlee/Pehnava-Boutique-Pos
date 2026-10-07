import { useCallback, useEffect, useState } from "react";
import { getDefaultDashboardTab } from "@/lib/role-utils";

/** Every tab id handled by `Dashboard.renderContent`. */
export const DASHBOARD_TAB_IDS = new Set([
  "dashboard",
  "today-revenue",
  "today-cash-sales",
  "today-credit-sales",
  "today-expenses",
  "barcode-generator",
  "new-sale",
  "orders",
  "units",
  "sales-history",
  "register-report",
  "till",
  "sales-report",
  "brand",
  "colors",
  "sizes",
  "returns",
  "exchanges",
  "reservations",
  "layaway-holds",
  "inventory",
  "categories",
  "sub-categories",
  "branches",
  "suppliers",
  "purchase-orders",
  "pricing",
  "customers",
  "loyalty",
  "gift-cards",
  "stock-management",
  "inventory-dashboard",
  "purchases",
  "transfers",
  "stock-out",
  "stock-movement-log",
  "stock-adjustment",
  "stock-view",
  "bulk-product-upload",
  "inventory-reports",
  "purchase-report",
  "stock-quantity-report",
  "inventory-audit",
  "designation",
  "employees",
  "shifts",
  "salaries",
  "commissions",
  "promotions",
  "expenses",
  "tax-management",
  "reports",
  "insights",
  "financial-statement",
  "profit-loss",
  "balance-sheet",
  "trial-balance",
  "chart-of-accounts",
  "journal-vouchers",
  "expense-breakdown",
  "budgets",
  "close-books",
  "product-sales-profit",
  "audit",
  "users",
  "multi-location",
  "integrations",
  "backup",
  "settings",
  "printer-settings",
  "product-export",
]);

export const DASHBOARD_TAB_PARAM = "tab";
export const INSIGHTS_REPORT_PARAM = "report";
export const INSIGHTS_DIMENSION_PARAM = "dimension";

export const INSIGHTS_REPORT_IDS = new Set([
  "sales-by",
  "slow",
  "customers",
  "suppliers",
  "prices",
  "aging",
  "cash-flow",
  "cash-book",
  "bank-book",
  "tax",
]);

export const SALES_BY_DIMENSION_IDS = new Set([
  "category",
  "subcategory",
  "brand",
  "collection",
  "size",
  "color",
  "supplier",
  "product",
]);

export function buildDashboardTabHref(
  tab: string,
  extra?: { report?: string; dimension?: string }
): string {
  const params = new URLSearchParams();
  params.set(DASHBOARD_TAB_PARAM, tab);
  if (
    tab === "insights" &&
    extra?.report &&
    INSIGHTS_REPORT_IDS.has(extra.report)
  ) {
    params.set(INSIGHTS_REPORT_PARAM, extra.report);
    if (
      extra.report === "sales-by" &&
      extra.dimension &&
      SALES_BY_DIMENSION_IDS.has(extra.dimension)
    ) {
      params.set(INSIGHTS_DIMENSION_PARAM, extra.dimension);
    }
  }
  return `/?${params.toString()}`;
}

export function readInsightsReportFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const id = new URLSearchParams(window.location.search).get(
    INSIGHTS_REPORT_PARAM
  );
  return id && INSIGHTS_REPORT_IDS.has(id) ? id : null;
}

export function readSalesByDimensionFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const id = new URLSearchParams(window.location.search).get(
    INSIGHTS_DIMENSION_PARAM
  );
  return id && SALES_BY_DIMENSION_IDS.has(id) ? id : null;
}

export function writeInsightsParamsToUrl(
  report: string,
  dimension?: string | null
): void {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set(DASHBOARD_TAB_PARAM, "insights");
  if (INSIGHTS_REPORT_IDS.has(report)) {
    url.searchParams.set(INSIGHTS_REPORT_PARAM, report);
  } else {
    url.searchParams.delete(INSIGHTS_REPORT_PARAM);
  }
  if (
    report === "sales-by" &&
    dimension &&
    SALES_BY_DIMENSION_IDS.has(dimension)
  ) {
    url.searchParams.set(INSIGHTS_DIMENSION_PARAM, dimension);
  } else {
    url.searchParams.delete(INSIGHTS_DIMENSION_PARAM);
  }
  window.history.replaceState(window.history.state, "", url.toString());
}

/** True for a normal left-click that should stay in-app (not new tab/window). */
export function isInAppNavClick(event: {
  defaultPrevented: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  button: number;
}): boolean {
  return (
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    event.button === 0
  );
}

export function isDashboardTab(tab: string | null | undefined): tab is string {
  return !!tab && DASHBOARD_TAB_IDS.has(tab);
}

export function readTabFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return new URLSearchParams(window.location.search).get(DASHBOARD_TAB_PARAM);
}

export function writeTabToUrl(tab: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set(DASHBOARD_TAB_PARAM, tab);
  if (tab !== "insights") {
    url.searchParams.delete(INSIGHTS_REPORT_PARAM);
    url.searchParams.delete(INSIGHTS_DIMENSION_PARAM);
  }
  window.history.replaceState(window.history.state, "", url.toString());
}

export function clearTabFromUrl(): void {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete(DASHBOARD_TAB_PARAM);
  window.history.replaceState(window.history.state, "", url.toString());
}

export function resolveDashboardTab(
  tabFromUrl: string | null,
  role: string | null
): string {
  if (isDashboardTab(tabFromUrl)) {
    return tabFromUrl;
  }

  return getDefaultDashboardTab(role);
}

export function useDashboardTab() {
  const [activeTab, setActiveTabState] = useState(() =>
    resolveDashboardTab(readTabFromUrl(), localStorage.getItem("role"))
  );

  const setActiveTab = useCallback((tab: string) => {
    const nextTab = isDashboardTab(tab)
      ? tab
      : getDefaultDashboardTab(localStorage.getItem("role"));

    setActiveTabState(nextTab);
    writeTabToUrl(nextTab);
  }, []);

  useEffect(() => {
    const tab = resolveDashboardTab(readTabFromUrl(), localStorage.getItem("role"));
    setActiveTabState(tab);

    if (readTabFromUrl() !== tab) {
      writeTabToUrl(tab);
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setActiveTabState(
        resolveDashboardTab(readTabFromUrl(), localStorage.getItem("role"))
      );
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  return { activeTab, setActiveTab };
}

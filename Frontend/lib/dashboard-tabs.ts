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
  "financial-statement",
  "profit-loss",
  "balance-sheet",
  "trial-balance",
  "product-sales-profit",
  "audit",
  "multi-location",
  "integrations",
  "backup",
  "settings",
  "printer-settings",
  "product-export",
]);

export const DASHBOARD_TAB_PARAM = "tab";

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

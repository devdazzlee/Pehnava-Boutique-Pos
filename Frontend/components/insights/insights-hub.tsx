"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildDashboardTabHref,
  INSIGHTS_REPORT_IDS,
  isInAppNavClick,
  readInsightsReportFromUrl,
  writeInsightsParamsToUrl,
} from "@/lib/dashboard-tabs";
import { BadgePercent, BookOpen, Clock4, Landmark, Layers, Receipt, Snail, Tags, Truck, Users, Wallet, type LucideIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import apiClient from "@/lib/apiClient";
import { usePermissions } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { defaultPeriod, Period, PeriodPicker, PERIOD_PRESETS, Toolbar } from "./insights-shared";
import { SavedViews } from "./saved-views";
import {
  BookReport,
  CashFlowReport,
  CustomersReport,
  PayablesAgingReport,
  PurchasePricesReport,
  SalesByReport,
  SlowMoversReport,
  SuppliersReport,
  TaxReport,
} from "./insights-reports";

type ReportId = "sales-by" | "slow" | "customers" | "suppliers" | "prices" | "aging" | "cash-flow" | "cash-book" | "bank-book" | "tax";

const REPORTS: { id: ReportId; group: string; label: string; help: string; icon: LucideIcon; financial?: boolean; period?: boolean; branch?: boolean }[] = [
  { id: "sales-by", group: "Sales", label: "Sales by attribute", help: "Category, brand, collection, size, colour, supplier", icon: Tags, period: true, branch: true },
  { id: "customers", group: "Sales", label: "Customer segments", help: "Top, new, repeat and inactive customers", icon: Users, period: true, branch: true },
  { id: "slow", group: "Stock", label: "Slow movers", help: "Stock that isn't selling", icon: Snail, branch: true },
  { id: "prices", group: "Stock", label: "Purchase price history", help: "How your cost prices changed", icon: Layers, period: true },
  { id: "suppliers", group: "Suppliers", label: "Supplier performance", help: "Purchases, returns, sell-through", icon: Truck, financial: true, period: true, branch: true },
  { id: "aging", group: "Suppliers", label: "Payables aging", help: "What you owe and how old it is", icon: Clock4, financial: true },
  { id: "cash-flow", group: "Money", label: "Cash flow summary", help: "Money in vs money out", icon: Wallet, financial: true, period: true, branch: true },
  { id: "cash-book", group: "Money", label: "Cash book", help: "Every cash receipt & payment", icon: BookOpen, financial: true, period: true, branch: true },
  { id: "bank-book", group: "Money", label: "Bank book", help: "Card, bank and wallet movements", icon: Landmark, financial: true, period: true, branch: true },
  { id: "tax", group: "Money", label: "Tax report", help: "Output vs input tax", icon: BadgePercent, financial: true, period: true, branch: true },
];

const STORE_KEY = "insights_report";

export function InsightsHub() {
  const perms = usePermissions();
  const isAdmin = perms.role === "SUPER_ADMIN" || perms.role === "ADMIN";
  const available = REPORTS.filter((r) => !r.financial || perms.can("reports.financial"));
  const [report, setReportState] = useState<ReportId>(() => {
    const fromUrl = readInsightsReportFromUrl();
    if (fromUrl && INSIGHTS_REPORT_IDS.has(fromUrl)) {
      return fromUrl as ReportId;
    }
    return "sales-by";
  });

  const setReport = useCallback((next: ReportId) => {
    setReportState(next);
    writeInsightsParamsToUrl(next);
  }, []);
  const [period, setPeriod] = useState<Period>(defaultPeriod("30d"));
  const [branchId, setBranchId] = useState("all");
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const fromUrl = readInsightsReportFromUrl();
    if (fromUrl && INSIGHTS_REPORT_IDS.has(fromUrl)) {
      setReportState(fromUrl as ReportId);
      return;
    }
    try {
      const saved = localStorage.getItem(STORE_KEY) as ReportId | null;
      if (saved && REPORTS.some((r) => r.id === saved)) {
        setReportState(saved);
        writeInsightsParamsToUrl(saved);
      } else {
        writeInsightsParamsToUrl("sales-by");
      }
    } catch {
      writeInsightsParamsToUrl("sales-by");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, report);
    } catch {
      /* ignore */
    }
  }, [report]);
  useEffect(() => {
    const onPopState = () => {
      const fromUrl = readInsightsReportFromUrl();
      if (fromUrl && INSIGHTS_REPORT_IDS.has(fromUrl)) {
        setReportState(fromUrl as ReportId);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    if (!isAdmin) return;
    apiClient
      .get("/branches", { params: { limit: 100 } })
      .then((r) => {
        const list = r.data?.data;
        setBranches(Array.isArray(list) ? list : Array.isArray(list?.data) ? list.data : []);
      })
      .catch(() => setBranches([]));
  }, [isAdmin]);

  const current = available.find((r) => r.id === report) ?? available[0];
  const scope = { period, branchId: branchId === "all" ? undefined : branchId };
  const groups = [...new Set(available.map((r) => r.group))];

  return (
    <div className="min-h-full bg-[#f8f6f2] p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#2a2012]">Business Insights</h1>
            <p className="text-sm text-stone-500">Sales mix, slow stock, customers, suppliers, cash and tax — with fortnightly and quarterly periods and Excel export.</p>
          </div>
          <SavedViews
            scope="insights"
            current={{ report, preset: period.preset, from: period.from, to: period.to, branchId }}
            onApply={(p) => {
              if (typeof p.report === "string" && REPORTS.some((r) => r.id === p.report)) setReport(p.report as ReportId);
              const preset = PERIOD_PRESETS.find((x) => x.id === p.preset);
              // Preset views move with time ("this quarter" stays this quarter); custom ones keep their dates.
              if (preset) setPeriod({ ...preset.make(), preset: preset.id });
              else if (typeof p.from === "string" && typeof p.to === "string") setPeriod({ from: p.from, to: p.to, preset: "custom" });
              if (typeof p.branchId === "string") setBranchId(p.branchId);
            }}
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
          {/* report menu */}
          <nav className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            {/* phone: one dropdown */}
            <div className="lg:hidden">
              <Select value={current?.id} onValueChange={(v) => setReport(v as ReportId)}>
                <SelectTrigger className="h-10 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {available.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.group} · {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="hidden space-y-4 rounded-xl border border-stone-200 bg-white p-2 lg:block">
              {groups.map((g) => (
                <div key={g}>
                  <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-400">{g}</div>
                  {available
                    .filter((r) => r.group === g)
                    .map((r) => {
                      const href = buildDashboardTabHref("insights", { report: r.id });
                      return (
                        <a
                          key={r.id}
                          href={href}
                          onClick={(e) => {
                            if (!isInAppNavClick(e)) {
                              return;
                            }
                            e.preventDefault();
                            setReport(r.id);
                          }}
                          className={cn(
                            "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                            current?.id === r.id ? "bg-[#2a2012] text-white" : "text-stone-700 hover:bg-stone-100",
                          )}
                        >
                          <r.icon className={cn("mt-0.5 h-4 w-4 shrink-0", current?.id === r.id ? "text-[#e6c98f]" : "text-[#a67c2e]")} />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium">{r.label}</span>
                            <span className={cn("block text-xs", current?.id === r.id ? "text-stone-300" : "text-stone-500")}>{r.help}</span>
                          </span>
                        </a>
                      );
                    })}
                </div>
              ))}
            </div>
          </nav>

          <main className="min-w-0 space-y-4">
            {current && (current.period || (current.branch && isAdmin && branches.length > 1)) && (
              <Toolbar>
                {current.period && <PeriodPicker value={period} onChange={setPeriod} />}
                {current.branch && isAdmin && branches.length > 1 && (
                  <Select value={branchId} onValueChange={setBranchId}>
                    <SelectTrigger className="h-9 w-48 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All branches</SelectItem>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Toolbar>
            )}

            {current?.id === "sales-by" && <SalesByReport {...scope} />}
            {current?.id === "customers" && <CustomersReport {...scope} />}
            {current?.id === "slow" && <SlowMoversReport {...scope} />}
            {current?.id === "prices" && <PurchasePricesReport {...scope} />}
            {current?.id === "suppliers" && <SuppliersReport {...scope} />}
            {current?.id === "aging" && <PayablesAgingReport />}
            {current?.id === "cash-flow" && <CashFlowReport {...scope} />}
            {current?.id === "cash-book" && <BookReport key="cash" {...scope} book="cash" />}
            {current?.id === "bank-book" && <BookReport key="bank" {...scope} book="bank" />}
            {current?.id === "tax" && <TaxReport {...scope} />}
            {!current && (
              <div className="rounded-xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
                <Receipt className="mx-auto mb-2 h-6 w-6 text-stone-300" />
                You don&apos;t have access to any reports.
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

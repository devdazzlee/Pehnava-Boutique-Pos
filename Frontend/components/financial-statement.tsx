"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Download, Printer, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DateField } from "@/components/ui/date-picker";
import { PageLoader } from "@/components/ui/page-loader";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { ymd, rangeForPreset } from "@/lib/business-timezone";
import { downloadFinancialStatementPdf } from "@/lib/financial-statement-pdf";
import { CompactReportFilters } from "@/components/report-filters-shell";

type Preset =
  | "all"
  | "today"
  | "yesterday"
  | "thisWeek"
  | "lastWeek"
  | "last7"
  | "last30"
  | "last90"
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "custom";

interface StatementData {
  period: { from: string; to: string };
  branches: { id: string; name: string; code: string }[];
  expenseCategories: { id: string; name: string }[];
  cashiers: { id: string; name: string; email: string; role: string }[];
  paymentMethods: string[];
  income: {
    grossSales: number;
    discounts: number;
    returns: number;
    tax: number;
    netRevenue: number;
    billCount: number;
  };
  cogs: {
    soldCost: number;
    purchasesInPeriod: number;
    purchaseReturnsInPeriod: number;
  };
  grossProfit: number;
  marginPercent: number;
  expenses: {
    operating: number;
    salaries: number;
    total: number;
    byCategory: { name: string; amount: number; count: number }[];
  };
  netProfit: number;
  byBranch: { id: string; name: string; code: string; revenue: number; cogs: number; grossProfit: number; bills: number }[];
  byPaymentMethod: { method: string; revenue: number; bills: number }[];
  byCashier: { id: string; name: string; revenue: number; bills: number; cogs: number; grossProfit: number }[];
  lines: { label: string; amount: number; section: string; emphasis?: boolean }[];
}

const PRESETS: { id: Preset; label: string }[] = [
  { id: "all", label: "All dates" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "thisWeek", label: "This Week" },
  { id: "lastWeek", label: "Last Week" },
  { id: "last7", label: "Last 7 Days" },
  { id: "last30", label: "Last 30 Days" },
  { id: "last90", label: "Last 90 Days" },
  { id: "thisMonth", label: "This Month" },
  { id: "lastMonth", label: "Last Month" },
  { id: "thisYear", label: "This Year" },
  { id: "custom", label: "Custom Range" },
];

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  MOBILE_MONEY: "Mobile money",
  BANK_TRANSFER: "Bank transfer",
  CREDIT: "Credit",
};

const SALE_TYPES = [
  { id: "ALL", label: "All sales & returns" },
  { id: "SALES", label: "Sales only" },
  { id: "RETURNS", label: "Returns only" },
];

const rangeFor = (preset: Exclude<Preset, "custom">) => rangeForPreset(preset);

const money = (value: number) =>
  `PKR ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const periodLabel = (from: string, to: string) =>
  from === "2000-01-01"
    ? "All dates"
    : `${format(new Date(`${from}T00:00:00`), "dd MMM yyyy")} – ${format(new Date(`${to}T00:00:00`), "dd MMM yyyy")}`;

export function FinancialStatement() {
  const { toast } = useToast();
  const initial = rangeFor("last30");
  const [preset, setPreset] = useState<Preset>("last30");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [draftFrom, setDraftFrom] = useState(initial.from);
  const [draftTo, setDraftTo] = useState(initial.to);
  const [branchId, setBranchId] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("ALL");
  const [cashierId, setCashierId] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [saleType, setSaleType] = useState("ALL");
  const [includeSalaries, setIncludeSalaries] = useState("yes");
  const [includePurchases, setIncludePurchases] = useState("yes");
  const [report, setReport] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        from,
        to,
        saleType,
        includeSalaries: includeSalaries === "yes" ? "true" : "false",
        includePurchases: includePurchases === "yes" ? "true" : "false",
      };
      if (branchId !== "all") params.branchId = branchId;
      if (paymentMethod !== "ALL") params.paymentMethod = paymentMethod;
      if (cashierId !== "all") params.cashierId = cashierId;
      if (categoryId !== "all") params.categoryId = categoryId;
      const response = await apiClient.get("/financial-statement", { params });
      setReport(response.data.data);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not load financial statement",
        description: error?.response?.data?.message || error?.message || "Try again",
      });
    } finally {
      setLoading(false);
    }
  }, [from, to, branchId, paymentMethod, cashierId, categoryId, saleType, includeSalaries, includePurchases, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const applyPreset = (next: Preset) => {
    setPreset(next);
    if (next === "custom") return;
    const range = rangeFor(next);
    setFrom(range.from);
    setTo(range.to);
    setDraftFrom(range.from);
    setDraftTo(range.to);
  };

  const applyCustomDates = () => {
    if (draftTo < draftFrom) {
      toast({ variant: "destructive", title: "To Date cannot be earlier than From Date" });
      return;
    }
    setPreset("custom");
    setFrom(draftFrom);
    setTo(draftTo);
  };

  const clearFilters = () => {
    const range = rangeFor("last30");
    setPreset("last30");
    setFrom(range.from);
    setTo(range.to);
    setDraftFrom(range.from);
    setDraftTo(range.to);
    setBranchId("all");
    setPaymentMethod("ALL");
    setCashierId("all");
    setCategoryId("all");
    setSaleType("ALL");
    setIncludeSalaries("yes");
    setIncludePurchases("yes");
  };

  const branchLabel =
    branchId === "all"
      ? "All branches"
      : report?.branches.find((branch) => branch.id === branchId)?.name || "Branch";
  const paymentLabel = paymentMethod === "ALL" ? "All payments" : PAYMENT_LABELS[paymentMethod] || paymentMethod;

  const printReport = () => {
    if (!report) return;
    const win = window.open("", "_blank");
    if (!win) return;
    const rows = report.lines
      .map(
        (line) => `<tr class="${line.emphasis ? "emph" : ""}">
          <td>${line.label}</td>
          <td style="text-align:right">${money(line.amount)}</td>
        </tr>`,
      )
      .join("");
    win.document.write(`<!DOCTYPE html><html><head><title>Financial Statement</title>
      <style>
        body{font-family:Georgia,serif;color:#2a2012;padding:28px}
        .top{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #a67c2e;padding-bottom:12px}
        img{height:56px}
        table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
        th{background:#2a2012;color:#fff;text-align:left;padding:8px}
        td{border-bottom:1px solid #e8dcc4;padding:8px}
        tr.emph td{font-weight:bold;background:#fcf8f2}
        .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px}
        .card{border:1px solid #e8dcc4;padding:12px;background:#fcf8f2}
        .meta{color:#786448;margin:4px 0 0;font-size:12px}
      </style></head><body>
      <div class="top"><img src="${window.location.origin}/logo.png" alt="Pehnawa" />
      <div style="text-align:right"><h1 style="margin:0">Financial Statement</h1>
      <p class="meta">${periodLabel(from, to)} · ${branchLabel}</p>
      <p class="meta">${paymentLabel}</p></div></div>
      <div class="cards">
        <div class="card"><div>Net revenue</div><strong>${money(report.income.netRevenue)}</strong></div>
        <div class="card"><div>Gross profit</div><strong>${money(report.grossProfit)}</strong></div>
        <div class="card"><div>Expenses</div><strong>${money(report.expenses.total)}</strong></div>
        <div class="card"><div>Net profit</div><strong>${money(report.netProfit)}</strong></div>
      </div>
      <table><thead><tr><th>Particulars</th><th>Amount</th></tr></thead>
      <tbody>${rows}</tbody></table>
      </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financial Statement</h1>
          <p className="text-sm text-gray-500">
            {periodLabel(from, to)} · {branchLabel}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
          <Button variant="outline" onClick={printReport} disabled={!report || loading}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          <Button
            variant="outline"
            disabled={!report || loading}
            onClick={() =>
              report &&
              downloadFinancialStatementPdf(report, {
                from,
                to,
                branchLabel: `${branchLabel} · ${paymentLabel}`,
              })
            }
          >
            <Download className="mr-2 h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      <CompactReportFilters
        summary={`${periodLabel(from, to)} · ${branchLabel} · ${paymentLabel}`}
        actions={
          <>
            <Button size="sm" className="h-8" onClick={applyCustomDates}>
              Apply
            </Button>
            <Button size="sm" variant="outline" className="h-8 border-rose-200 bg-rose-50 text-rose-700 shadow-sm hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800" onClick={clearFilters}>
              <X className="mr-1 h-3.5 w-3.5" />
              Clear
            </Button>
          </>
        }
        primary={
          <>
            <div className="space-y-1">
              <Label>Date range</Label>
              <Select value={preset} onValueChange={(value) => applyPreset(value as Preset)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESETS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DateField
              label="From date"
              value={draftFrom}
              onChange={(value) => {
                setDraftFrom(value);
                setPreset("custom");
              }}
            />
            <DateField
              label="To date"
              value={draftTo}
              onChange={(value) => {
                setDraftTo(value);
                setPreset("custom");
              }}
            />
            <div className="space-y-1">
              <Label>Branch</Label>
              {loading && !report ? (
                <Skeleton className="h-9 w-full rounded-md" />
              ) : (
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All branches</SelectItem>
                    {(report?.branches || []).map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name} ({branch.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </>
        }
        advanced={
          <>
            <div className="space-y-1">
              <Label>Payment method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All payments</SelectItem>
                  {(report?.paymentMethods || Object.keys(PAYMENT_LABELS)).map((method) => (
                    <SelectItem key={method} value={method}>
                      {PAYMENT_LABELS[method] || method}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Cashier</Label>
              <Select value={cashierId} onValueChange={setCashierId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All cashiers</SelectItem>
                  {(report?.cashiers || []).map((cashier) => (
                    <SelectItem key={cashier.id} value={cashier.id}>
                      {cashier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Sale type</Label>
              <Select value={saleType} onValueChange={setSaleType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SALE_TYPES.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Expense category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {(report?.expenseCategories || []).map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Include salaries</Label>
              <Select value={includeSalaries} onValueChange={setIncludeSalaries}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Include purchases memo</Label>
              <Select value={includePurchases} onValueChange={setIncludePurchases}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        }
      />

      {loading ? (
        <Card>
          <CardContent className="p-0">
            <PageLoader message="Loading financial statement..." />
          </CardContent>
        </Card>
      ) : (
        <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Net revenue" value={money(report?.income.netRevenue || 0)} />
        <SummaryCard label="Gross profit" value={money(report?.grossProfit || 0)} />
        <SummaryCard label="Expenses" value={money(report?.expenses.total || 0)} />
        <SummaryCard
          label="Net profit"
          value={money(report?.netProfit || 0)}
          emphasis
          hint={report ? `Margin ${report.marginPercent.toFixed(1)}%` : undefined}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardContent className="p-0">
            <div className="border-b px-4 py-3 font-semibold">Income statement</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Particulars</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!report || report.lines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="py-10 text-center text-gray-500">
                      {loading ? "Loading statement…" : "No financial activity in this period."}
                    </TableCell>
                  </TableRow>
                ) : (
                  report.lines.map((line, index) => (
                    <TableRow key={`${line.label}-${index}`} className={line.emphasis ? "bg-[#fcf8f2]" : undefined}>
                      <TableCell className={line.emphasis ? "font-semibold" : undefined}>{line.label}</TableCell>
                      <TableCell className={cn("text-right", line.emphasis && "font-semibold")}>
                        {money(line.amount)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-2 p-4">
              <h2 className="font-semibold">Sales snapshot</h2>
              <Row label="Bills" value={String(report?.income.billCount || 0)} />
              <Row label="Gross sales" value={money(report?.income.grossSales || 0)} />
              <Row label="Discounts" value={money(report?.income.discounts || 0)} />
              <Row label="Returns" value={money(report?.income.returns || 0)} />
              <Row label="Tax collected" value={money(report?.income.tax || 0)} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2 p-4">
              <h2 className="font-semibold">Cost & buying</h2>
              <Row label="COGS (sold pieces)" value={money(report?.cogs.soldCost || 0)} />
              <Row label="Purchases in period" value={money(report?.cogs.purchasesInPeriod || 0)} />
              <Row label="Purchase returns" value={money(report?.cogs.purchaseReturnsInPeriod || 0)} />
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <div className="border-b px-4 py-3 font-semibold">Expenses by category</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(report?.expenses.byCategory || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-gray-500">
                      No expenses in this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  report?.expenses.byCategory.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                      <TableCell className="text-right">{money(row.amount)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-0">
            <div className="border-b px-4 py-3 font-semibold">By payment method</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Bills</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(report?.byPaymentMethod || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-gray-500">
                      No payment breakdown in this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  report?.byPaymentMethod.map((row) => (
                    <TableRow key={row.method}>
                      <TableCell>{PAYMENT_LABELS[row.method] || row.method}</TableCell>
                      <TableCell className="text-right">{row.bills}</TableCell>
                      <TableCell className="text-right">{money(row.revenue)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <div className="border-b px-4 py-3 font-semibold">By branch</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Gross profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(report?.byBranch || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-gray-500">
                      No branch sales in this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  report?.byBranch.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div>{row.name}</div>
                        <div className="text-xs text-gray-500">{row.bills} bills</div>
                      </TableCell>
                      <TableCell className="text-right">{money(row.revenue)}</TableCell>
                      <TableCell className="text-right">{money(row.grossProfit)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-0">
            <div className="border-b px-4 py-3 font-semibold">By cashier</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cashier</TableHead>
                  <TableHead className="text-right">Bills</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Gross profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(report?.byCashier || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-gray-500">
                      No cashier sales in this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  report?.byCashier.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="text-right">{row.bills}</TableCell>
                      <TableCell className="text-right">{money(row.revenue)}</TableCell>
                      <TableCell className="text-right">{money(row.grossProfit)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  emphasis,
  hint,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  hint?: string;
}) {
  return (
    <Card className={emphasis ? "border-[#a67c2e]/40 bg-[#fcf8f2]" : undefined}>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
        <p className="mt-1 text-xl font-semibold text-gray-900">{value}</p>
        {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

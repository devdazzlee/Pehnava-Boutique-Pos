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
import { CompactReportFilters } from "@/components/report-filters-shell";
import { downloadTrialBalancePdf } from "@/lib/trial-balance-pdf";

type Preset = "all" | "today" | "yesterday" | "last7" | "last30" | "custom";

interface TrialBalanceData {
  period: { from: string; to: string };
  asOf: string;
  branches: { id: string; name: string; code: string }[];
  accounts: {
    code: string;
    account: string;
    type: string;
    debit: number;
    credit: number;
  }[];
  totals: {
    debit: number;
    credit: number;
    difference: number;
    balanced: boolean;
    accountCount: number;
  };
  byType: {
    asset: number;
    liability: number;
    equity: number;
    income: number;
    expense: number;
  };
  memo: {
    periodNetProfit: number;
    grossProfit: number;
    netRevenue: number;
  };
}

const PRESETS: { id: Preset; label: string }[] = [
  { id: "all", label: "All dates" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "Last 7 Days" },
  { id: "last30", label: "Last 30 Days" },
  { id: "custom", label: "Custom Range" },
];

const TYPE_LABELS: Record<string, string> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  income: "Income",
  expense: "Expense",
};

const rangeFor = (preset: Exclude<Preset, "custom">) => rangeForPreset(preset);

const money = (value: number) =>
  `PKR ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const moneyOrDash = (value: number) => (Math.abs(value) < 0.005 ? "—" : money(value));

const periodLabel = (from: string, to: string) =>
  from === "2000-01-01"
    ? "All dates"
    : `${format(new Date(`${from}T00:00:00`), "dd MMM yyyy")} – ${format(new Date(`${to}T00:00:00`), "dd MMM yyyy")}`;

export function TrialBalance() {
  const { toast } = useToast();
  const initial = rangeFor("last30");
  const [preset, setPreset] = useState<Preset>("last30");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [draftFrom, setDraftFrom] = useState(initial.from);
  const [draftTo, setDraftTo] = useState(initial.to);
  const [branchId, setBranchId] = useState("all");
  const [report, setReport] = useState<TrialBalanceData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { from, to };
      if (branchId !== "all") params.branchId = branchId;
      const response = await apiClient.get("/trial-balance", { params });
      setReport(response.data.data);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not load trial balance",
        description: error?.response?.data?.message || error?.message || "Try again",
      });
    } finally {
      setLoading(false);
    }
  }, [from, to, branchId, toast]);

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

  const applyCustom = () => {
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
  };

  const branchLabel =
    branchId === "all"
      ? "All branches"
      : report?.branches.find((branch) => branch.id === branchId)?.name || "Branch";

  const printReport = () => {
    if (!report) return;
    const win = window.open("", "_blank");
    if (!win) return;
    const rows = report.accounts
      .map(
        (row) => `<tr>
          <td>${row.code}</td>
          <td>${row.account}</td>
          <td>${TYPE_LABELS[row.type] || row.type}</td>
          <td style="text-align:right">${row.debit ? money(row.debit) : "—"}</td>
          <td style="text-align:right">${row.credit ? money(row.credit) : "—"}</td>
        </tr>`,
      )
      .join("");
    win.document.write(`<!DOCTYPE html><html><head><title>Trial Balance</title>
      <style>
        body{font-family:Georgia,serif;color:#2a2012;padding:28px}
        .top{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #a67c2e;padding-bottom:12px}
        img{height:56px}
        table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
        th{background:#2a2012;color:#fff;text-align:left;padding:8px}
        td{border-bottom:1px solid #e8dcc4;padding:8px}
        tfoot td{font-weight:bold;background:#fcf8f2}
        .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px}
        .card{border:1px solid #e8dcc4;padding:12px;background:#fcf8f2}
      </style></head><body>
      <div class="top"><img src="${window.location.origin}/logo.png" alt="Pehnawa" />
      <div style="text-align:right"><h1 style="margin:0">Trial Balance</h1>
      <p style="margin:4px 0 0;color:#786448">As of ${format(new Date(`${report.asOf}T00:00:00`), "dd MMM yyyy")} · ${branchLabel}</p>
      <p style="margin:2px 0 0;color:#786448">${periodLabel(from, to)}</p></div></div>
      <div class="cards">
        <div class="card"><div>Total debit</div><strong>${money(report.totals.debit)}</strong></div>
        <div class="card"><div>Total credit</div><strong>${money(report.totals.credit)}</strong></div>
        <div class="card"><div>Status</div><strong>${report.totals.balanced ? "Balanced" : "Check"}</strong></div>
      </div>
      <table><thead><tr><th>Code</th><th>Account</th><th>Type</th><th>Debit</th><th>Credit</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="3">Total</td><td style="text-align:right">${money(report.totals.debit)}</td><td style="text-align:right">${money(report.totals.credit)}</td></tr></tfoot>
      </table>
      </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trial Balance</h1>
          <p className="text-sm text-gray-500">
            As of {format(new Date(`${to}T00:00:00`), "dd MMM yyyy")} · {branchLabel}
          </p>
          <p className="text-xs text-gray-400">
            Assets/liabilities as of end date · Income/expenses for {periodLabel(from, to)}
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
              downloadTrialBalancePdf(report, { from, to, branchLabel })
            }
          >
            <Download className="mr-2 h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      <CompactReportFilters
        summary={`${periodLabel(from, to)} · ${branchLabel}`}
        actions={
          <>
            <Button size="sm" className="h-8" onClick={applyCustom}>
              Apply
            </Button>
            <Button size="sm" variant="outline" className="h-8" onClick={clearFilters}>
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
      />

      {loading ? (
        <Card>
          <CardContent className="p-0">
            <PageLoader message="Loading trial balance..." />
          </CardContent>
        </Card>
      ) : (
        <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total debit" value={money(report?.totals.debit || 0)} />
        <SummaryCard label="Total credit" value={money(report?.totals.credit || 0)} />
        <SummaryCard label="Accounts" value={String(report?.totals.accountCount || 0)} />
        <SummaryCard
          label="Status"
          value={report?.totals.balanced ? "Balanced" : "Check"}
          emphasis
          hint={report ? `Difference ${money(report.totals.difference)}` : undefined}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardContent className="p-0">
            <div className="border-b px-4 py-3 font-semibold">Accounts</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!report || report.accounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-gray-500">
                      {loading ? "Loading trial balance…" : "No accounts for this period."}
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {report.accounts.map((row) => (
                      <TableRow key={`${row.code}-${row.account}`}>
                        <TableCell className="font-mono text-xs">{row.code}</TableCell>
                        <TableCell>{row.account}</TableCell>
                        <TableCell className="text-gray-600">{TYPE_LABELS[row.type] || row.type}</TableCell>
                        <TableCell className="text-right">{moneyOrDash(row.debit)}</TableCell>
                        <TableCell className="text-right">{moneyOrDash(row.credit)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-[#fcf8f2] font-semibold">
                      <TableCell colSpan={3}>Total</TableCell>
                      <TableCell className="text-right">{money(report.totals.debit)}</TableCell>
                      <TableCell className="text-right">{money(report.totals.credit)}</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-2 p-4">
              <h2 className="font-semibold">By type</h2>
              <Row label="Assets" value={money(report?.byType.asset || 0)} />
              <Row label="Liabilities" value={money(report?.byType.liability || 0)} />
              <Row label="Equity" value={money(report?.byType.equity || 0)} />
              <Row label="Income" value={money(report?.byType.income || 0)} />
              <Row label="Expenses" value={money(report?.byType.expense || 0)} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2 p-4">
              <h2 className="font-semibold">Period memo</h2>
              <Row label="Net revenue" value={money(report?.memo.netRevenue || 0)} />
              <Row label="Gross profit" value={money(report?.memo.grossProfit || 0)} />
              <Row label="Net profit" value={money(report?.memo.periodNetProfit || 0)} />
              <p className="pt-1 text-xs text-gray-500">
                Balance-sheet accounts use the end date. Income and expense accounts use the selected date range.
              </p>
            </CardContent>
          </Card>
        </div>
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

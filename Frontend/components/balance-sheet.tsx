"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Download, Printer, RefreshCw } from "lucide-react";
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
import { downloadBalanceSheetPdf } from "@/lib/balance-sheet-pdf";

type Preset = "all" | "today" | "yesterday" | "last7" | "last30" | "custom";

interface BalanceSheetData {
  period: { from: string; to: string };
  asOf: string;
  branches: { id: string; name: string; code: string }[];
  assets: {
    cashOnHand: number;
    inventory: number;
    inventoryQty: number;
    accountsReceivable: number;
    total: number;
    cashByBranch: { id: string; name: string; code: string; amount: number; status: string }[];
    inventoryByBranch: { id: string; name: string; code: string; value: number; qty: number }[];
    topReceivables: { id: string; name: string; balance: number }[];
  };
  liabilities: {
    accountsPayable: number;
    customerCredits: number;
    total: number;
    topPayables: { id: string; supplier: string; invoice: string; balance: number }[];
  };
  equity: {
    ownersEquity: number;
    periodNetProfit: number;
    total: number;
  };
  totals: {
    assets: number;
    liabilitiesAndEquity: number;
    balanced: boolean;
  };
  lines: { side: string; label: string; amount: number; emphasis?: boolean }[];
}

const PRESETS: { id: Preset; label: string }[] = [
  { id: "all", label: "All dates" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "Last 7 Days" },
  { id: "last30", label: "Last 30 Days" },
  { id: "custom", label: "Custom Range" },
];

const rangeFor = (preset: Exclude<Preset, "custom">) => rangeForPreset(preset);

const money = (value: number) =>
  `PKR ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const periodLabel = (from: string, to: string) =>
  from === "2000-01-01"
    ? "All dates"
    : `${format(new Date(`${from}T00:00:00`), "dd MMM yyyy")} – ${format(new Date(`${to}T00:00:00`), "dd MMM yyyy")}`;

export function BalanceSheet() {
  const { toast } = useToast();
  const initial = rangeFor("last30");
  const [preset, setPreset] = useState<Preset>("last30");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [draftFrom, setDraftFrom] = useState(initial.from);
  const [draftTo, setDraftTo] = useState(initial.to);
  const [branchId, setBranchId] = useState("all");
  const [report, setReport] = useState<BalanceSheetData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { from, to };
      if (branchId !== "all") params.branchId = branchId;
      const response = await apiClient.get("/balance-sheet", { params });
      setReport(response.data.data);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not load balance sheet",
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
    setFrom(draftFrom);
    setTo(draftTo);
  };

  const branchLabel =
    branchId === "all"
      ? "All branches"
      : report?.branches.find((branch) => branch.id === branchId)?.name || "Branch";

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
    win.document.write(`<!DOCTYPE html><html><head><title>Balance Sheet</title>
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
      </style></head><body>
      <div class="top"><img src="${window.location.origin}/logo.png" alt="Pehnawa" />
      <div style="text-align:right"><h1 style="margin:0">Balance Sheet</h1>
      <p style="margin:4px 0 0;color:#786448">As of ${format(new Date(`${report.asOf}T00:00:00`), "dd MMM yyyy")} · ${branchLabel}</p>
      <p style="margin:2px 0 0;color:#786448">${periodLabel(from, to)}</p></div></div>
      <div class="cards">
        <div class="card"><div>Cash</div><strong>${money(report.assets.cashOnHand)}</strong></div>
        <div class="card"><div>Inventory</div><strong>${money(report.assets.inventory)}</strong></div>
        <div class="card"><div>Receivables</div><strong>${money(report.assets.accountsReceivable)}</strong></div>
        <div class="card"><div>Total assets</div><strong>${money(report.assets.total)}</strong></div>
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
          <h1 className="text-2xl font-bold text-gray-900">Balance Sheet</h1>
          <p className="text-sm text-gray-500">
            As of {format(new Date(`${to}T00:00:00`), "dd MMM yyyy")} · {branchLabel}
          </p>
          <p className="text-xs text-gray-400">Period {periodLabel(from, to)} (for net profit memo)</p>
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
              report && downloadBalanceSheetPdf(report, { from, to, branchLabel })
            }
          >
            <Download className="mr-2 h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      <CompactReportFilters
        summary={`As of ${format(new Date(`${to}T00:00:00`), "dd MMM yyyy")} · ${branchLabel}`}
        actions={
          <>
            {preset === "custom" ? (
              <Button size="sm" className="h-8" onClick={applyCustom}>
                Apply
              </Button>
            ) : null}
            <Button size="sm" variant="outline" className="h-8" onClick={() => applyPreset("last30")}>
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
            <DateField label="From date" value={draftFrom} onChange={(value) => { setDraftFrom(value); setPreset("custom"); }} />
            <DateField label="To date" value={draftTo} onChange={(value) => { setDraftTo(value); setPreset("custom"); }} />
            <div className="space-y-1">
              <Label>Branch</Label>
              {loading && !report ? (
                <Skeleton className="h-9 w-full rounded-md" />
              ) : (
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger>
                    <SelectValue placeholder="All branches" />
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
            <PageLoader message="Loading balance sheet..." />
          </CardContent>
        </Card>
      ) : (
        <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Cash on hand" value={money(report?.assets.cashOnHand || 0)} />
        <SummaryCard label="Inventory" value={money(report?.assets.inventory || 0)} hint={report ? `${report.assets.inventoryQty.toLocaleString()} pcs` : undefined} />
        <SummaryCard label="Receivables" value={money(report?.assets.accountsReceivable || 0)} />
        <SummaryCard label="Total assets" value={money(report?.assets.total || 0)} emphasis />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardContent className="p-0">
            <div className="border-b px-4 py-3 font-semibold">Statement of financial position</div>
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
                      {loading ? "Loading balance sheet…" : "No balances available."}
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
            {report ? (
              <div className="border-t px-4 py-3 text-sm text-gray-600">
                {report.totals.balanced
                  ? "Assets balance with liabilities + equity."
                  : "Totals need review — assets and liabilities + equity differ."}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-2 p-4">
              <h2 className="font-semibold">Assets</h2>
              <Row label="Cash on hand" value={money(report?.assets.cashOnHand || 0)} />
              <Row label="Inventory" value={money(report?.assets.inventory || 0)} />
              <Row label="Accounts receivable" value={money(report?.assets.accountsReceivable || 0)} />
              <Row label="Total assets" value={money(report?.assets.total || 0)} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2 p-4">
              <h2 className="font-semibold">Liabilities & equity</h2>
              <Row label="Accounts payable" value={money(report?.liabilities.accountsPayable || 0)} />
              <Row label="Customer credits" value={money(report?.liabilities.customerCredits || 0)} />
              <Row label="Owner's equity" value={money(report?.equity.ownersEquity || 0)} />
              <Row label="Period net profit (memo)" value={money(report?.equity.periodNetProfit || 0)} />
              <p className="pt-1 text-xs text-gray-500">
                Position is as of the end date. Period range feeds the net profit memo only.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <div className="border-b px-4 py-3 font-semibold">Cash by branch</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Cash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(report?.assets.cashByBranch || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-gray-500">
                      No till sessions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  report?.assets.cashByBranch.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div>{row.name}</div>
                        <div className="text-xs text-gray-500">{row.code}</div>
                      </TableCell>
                      <TableCell>{row.status}</TableCell>
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
            <div className="border-b px-4 py-3 font-semibold">Inventory by branch</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(report?.assets.inventoryByBranch || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-gray-500">
                      No inventory value as of this date.
                    </TableCell>
                  </TableRow>
                ) : (
                  report?.assets.inventoryByBranch.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div>{row.name}</div>
                        <div className="text-xs text-gray-500">{row.code}</div>
                      </TableCell>
                      <TableCell className="text-right">{row.qty.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{money(row.value)}</TableCell>
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
            <div className="border-b px-4 py-3 font-semibold">Top receivables</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(report?.assets.topReceivables || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="py-8 text-center text-gray-500">
                      No receivables as of this date.
                    </TableCell>
                  </TableRow>
                ) : (
                  report?.assets.topReceivables.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="text-right">{money(row.balance)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="border-b px-4 py-3 font-semibold">Top payables</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier / invoice</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(report?.liabilities.topPayables || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="py-8 text-center text-gray-500">
                      No payables as of this date.
                    </TableCell>
                  </TableRow>
                ) : (
                  report?.liabilities.topPayables.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div>{row.supplier}</div>
                        <div className="text-xs text-gray-500">{row.invoice}</div>
                      </TableCell>
                      <TableCell className="text-right">{money(row.balance)}</TableCell>
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

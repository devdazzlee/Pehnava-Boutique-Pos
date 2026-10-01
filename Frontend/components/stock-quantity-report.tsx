"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Download, Printer, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { CompactReportFilters } from "@/components/report-filters-shell";
import { downloadStockQuantityReportPdf } from "@/lib/stock-quantity-report-pdf";
import { ymd, rangeForPreset } from "@/lib/business-timezone";

type Preset = "all" | "today" | "yesterday" | "last7" | "last30" | "custom";
type ItemType = "all" | "finished" | "loose";
type Activity = "all" | "moved";

interface Line {
  id: string;
  sku: string;
  item: string;
  dressName?: string;
  unit: string;
  category: string;
  opening: number;
  boughtQty: number;
  soldQty: number;
  inQty: number;
  outQty: number;
  closing: number;
  availableQty: number;
}

interface ReportData {
  categories: { id: string; name: string }[];
  branches: { id: string; name: string; code: string }[];
  lines: Line[];
  totals: {
    count: number;
    opening: number;
    boughtQty: number;
    soldQty: number;
    inQty: number;
    outQty: number;
    closing: number;
    availableQty: number;
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

const rangeFor = (preset: Exclude<Preset, "custom">) => rangeForPreset(preset);

const qty = (value: number) =>
  Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

const periodLabel = (from: string, to: string) =>
  from === "2000-01-01"
    ? "All dates"
    : `${format(new Date(`${from}T00:00:00`), "dd MMM yyyy")} – ${format(new Date(`${to}T00:00:00`), "dd MMM yyyy")}`;

export function StockQuantityReport() {
  const { toast } = useToast();
  const initial = rangeFor("last30");
  const [preset, setPreset] = useState<Preset>("last30");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [draftFrom, setDraftFrom] = useState(initial.from);
  const [draftTo, setDraftTo] = useState(initial.to);
  const [categoryId, setCategoryId] = useState("all");
  const [branchId, setBranchId] = useState("all");
  const [itemType, setItemType] = useState<ItemType>("all");
  const [activity, setActivity] = useState<Activity>("moved");
  const [search, setSearch] = useState("");
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { from, to, type: itemType, activity };
      if (categoryId !== "all") params.categoryId = categoryId;
      if (branchId !== "all") params.branchId = branchId;
      if (search.trim()) params.search = search.trim();
      const response = await apiClient.get("/stock-quantity-report", { params });
      setReport(response.data.data);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not load stock quantity report",
        description: error?.response?.data?.message || error?.message || "Try again",
      });
    } finally {
      setLoading(false);
    }
  }, [from, to, categoryId, branchId, itemType, activity, search, toast]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

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
    setCategoryId("all");
    setBranchId("all");
    setItemType("all");
    setActivity("moved");
    setSearch("");
  };

  const lines = report?.lines || [];
  const categoryName =
    categoryId === "all"
      ? "All categories"
      : report?.categories.find((category) => category.id === categoryId)?.name || "Category";
  const branchName =
    branchId === "all"
      ? "All locations"
      : report?.branches.find((branch) => branch.id === branchId)?.name || "Location";
  const filterLabel = `${categoryName} · ${branchName}`;

  const printReport = () => {
    const win = window.open("", "_blank");
    if (!win || !report) return;
    const rows = lines
      .map(
        (line) => `<tr>
          <td>${line.sku}</td>
          <td>${line.item}</td>
          <td>${line.unit}</td>
          <td style="text-align:right">${qty(line.opening)}</td>
          <td style="text-align:right">${qty(line.boughtQty)}</td>
          <td style="text-align:right">${qty(line.soldQty)}</td>
          <td style="text-align:right">${qty(line.closing)}</td>
          <td style="text-align:right">${qty(line.availableQty)}</td>
        </tr>`,
      )
      .join("");
    win.document.write(`<!DOCTYPE html><html><head><title>Stock Quantity Report</title>
      <style>
        body{font-family:Georgia,serif;color:#2a2012;padding:28px}
        .top{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #a67c2e;padding-bottom:12px}
        img{height:56px}
        table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}
        th{background:#2a2012;color:#fff;text-align:left;padding:6px}
        td{border-bottom:1px solid #e8dcc4;padding:6px}
        tfoot td{font-weight:bold;border-top:2px solid #a67c2e}
      </style></head><body>
      <div class="top"><img src="${window.location.origin}/logo.png" alt="Pehnawa" />
      <div style="text-align:right"><h1 style="margin:0">Stock Quantity Report</h1>
      <p style="margin:4px 0 0;color:#786448">${periodLabel(from, to)} · ${filterLabel}</p></div></div>
      <table><thead><tr>
        <th>SKU</th><th>Dress Name</th><th>Unit</th>
        <th>Opening</th><th>Bought</th><th>Sold</th><th>Closing</th><th>Available</th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="8">No dresses for this period.</td></tr>`}</tbody>
      <tfoot><tr><td colspan="3">${report.totals.count} dresses</td>
        <td style="text-align:right">${qty(report.totals.opening)}</td>
        <td style="text-align:right">${qty(report.totals.boughtQty)}</td>
        <td style="text-align:right">${qty(report.totals.soldQty)}</td>
        <td style="text-align:right">${qty(report.totals.closing)}</td>
        <td style="text-align:right">${qty(report.totals.availableQty)}</td></tr></tfoot>
      </table></body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  const totals = report?.totals;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Quantity Report</h1>
          <p className="text-sm text-gray-500">
            Search a dress name to see bought, sold, and remaining pieces · {periodLabel(from, to)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" onClick={printReport} disabled={!report}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          <Button
            variant="outline"
            disabled={!report}
            onClick={() => report && downloadStockQuantityReportPdf(report, { from, to, filterLabel })}
          >
            <Download className="mr-2 h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Dresses" value={String(totals?.count || 0)} />
        <SummaryCard label="Bought" value={qty(totals?.boughtQty || 0)} />
        <SummaryCard label="Sold" value={qty(totals?.soldQty || 0)} />
        <SummaryCard label="Closing qty" value={qty(totals?.closing || 0)} />
        <SummaryCard label="Available now" value={qty(totals?.availableQty || 0)} emphasis />
      </div>

      <CompactReportFilters
        defaultOpen
        summary={`${periodLabel(from, to)} · ${filterLabel}`}
        actions={
          <>
            {preset === "custom" ? (
              <Button size="sm" className="h-8" onClick={applyCustom}>
                Apply
              </Button>
            ) : null}
            <Button size="sm" variant="outline" className="h-8" onClick={clearFilters}>
              Clear
            </Button>
          </>
        }
        primary={
          <>
            <div className="space-y-1 sm:col-span-2">
              <Label>Dress name</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="h-9 pl-9"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Enter dress name, SKU, or code…"
                />
              </div>
            </div>
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
            <div className="space-y-1">
              <Label>Show</Label>
              <Select value={activity} onValueChange={(value) => setActivity(value as Activity)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="moved">With stock activity</SelectItem>
                  <SelectItem value="all">All dresses</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        }
        advanced={
          <>
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
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {(report?.categories || []).map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={itemType} onValueChange={(value) => setItemType(value as ItemType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All items</SelectItem>
                  <SelectItem value="finished">Finished pieces</SelectItem>
                  <SelectItem value="loose">Loose items</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(report?.branches.length || 0) > 0 ? (
              <div className="space-y-1">
                <Label>Location</Label>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger>
                    <SelectValue placeholder="All locations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All locations</SelectItem>
                    {report?.branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name} ({branch.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </>
        }
      />

      <Card>
        <CardContent className="p-0">
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Dress Name</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Opening</TableHead>
                  <TableHead className="text-right">Bought</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="text-right">Closing Qty</TableHead>
                  <TableHead className="text-right">Available Now</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-gray-500">
                      {loading ? "Loading stock…" : "No dresses found. Try another name or date range."}
                    </TableCell>
                  </TableRow>
                ) : (
                  lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="font-medium">{line.sku}</TableCell>
                      <TableCell>
                        <div>{line.item}</div>
                        <div className="text-xs text-gray-500">{line.category}</div>
                      </TableCell>
                      <TableCell>{line.unit}</TableCell>
                      <TableCell className="text-right tabular-nums">{qty(line.opening)}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-700">
                        {qty(line.boughtQty)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-rose-700">
                        {qty(line.soldQty)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {qty(line.closing)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-slate-900">
                        {qty(line.availableQty)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-6 border-t bg-gray-50 px-4 py-3 text-sm">
            <span className="mr-auto text-gray-500">{totals?.count || 0} dresses</span>
            <span>
              Bought <strong className="ml-2">{qty(totals?.boughtQty || 0)}</strong>
            </span>
            <span>
              Sold <strong className="ml-2">{qty(totals?.soldQty || 0)}</strong>
            </span>
            <span>
              Closing <strong className="ml-2">{qty(totals?.closing || 0)}</strong>
            </span>
            <span>
              Available <strong className="ml-2">{qty(totals?.availableQty || 0)}</strong>
            </span>
          </div>
        </CardContent>
      </Card>
      <p className="text-xs text-gray-500">
        Enter a dress name to filter. Bought = purchases in the period. Sold = sales in the period.
        Closing Qty = remaining pieces at period end. Available Now = current stock on hand.
      </p>
    </div>
  );
}

function SummaryCard({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <Card className={emphasis ? "border-[#a67c2e]/40 bg-[#fcf8f2]" : undefined}>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
        <p className="mt-1 text-xl font-semibold text-gray-900">{value}</p>
      </CardContent>
    </Card>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Download, Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { ReportItemCombobox } from "@/components/report-item-combobox";
import { PageLoader } from "@/components/ui/page-loader";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { ymd, rangeForPreset } from "@/lib/business-timezone";
import { downloadPurchaseReportPdf } from "@/lib/purchase-report-pdf";

type Preset = "all" | "today" | "yesterday" | "last7" | "last30" | "custom";
type Mode = "vendor" | "item";

interface Line {
  id: string;
  date: string;
  voucher: string;
  type: string;
  typeLabel: string;
  supplier: string;
  sku: string;
  item: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
}

interface ReportData {
  period: { from: string; to: string };
  suppliers: { id: string; name: string; code: string }[];
  products: { id: string; name: string; sku: string }[];
  lines: Line[];
  totals: { quantity: number; amount: number; count: number };
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

const qty = (value: number) =>
  Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const periodLabel = (from: string, to: string) =>
  from === "2000-01-01"
    ? "All dates"
    : `${format(new Date(`${from}T00:00:00`), "dd MMM yyyy")} – ${format(new Date(`${to}T00:00:00`), "dd MMM yyyy")}`;

export function PurchaseReport() {
  const { toast } = useToast();
  const initial = rangeFor("last30");
  const [preset, setPreset] = useState<Preset>("last30");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [draftFrom, setDraftFrom] = useState(initial.from);
  const [draftTo, setDraftTo] = useState(initial.to);
  const [mode, setMode] = useState<Mode>("vendor");
  const [supplierId, setSupplierId] = useState("all");
  const [productId, setProductId] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const searching = mode === "item" && search.trim() !== debouncedSearch;
  const isInitialLoad = loading && !report;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { from, to, mode };
      if (mode === "vendor" && supplierId !== "all") params.supplierId = supplierId;
      if (mode === "item" && productId !== "all") params.productId = productId;
      if (mode === "item" && debouncedSearch) params.search = debouncedSearch;
      const response = await apiClient.get("/purchase-report/itemwise", { params });
      setReport(response.data.data);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not load purchase report",
        description: error?.response?.data?.message || error?.message || "Try again",
      });
    } finally {
      setLoading(false);
    }
  }, [from, to, mode, supplierId, productId, debouncedSearch, toast]);

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

  const lines = report?.lines || [];
  const supplierName =
    supplierId === "all"
      ? "All vendors"
      : report?.suppliers.find((supplier) => supplier.id === supplierId)?.name || "Vendor";
  const itemName =
    productId === "all"
      ? "All items"
      : report?.products.find((product) => product.id === productId)?.name || "Item";

  const printReport = () => {
    const win = window.open("", "_blank");
    if (!win || !report) return;
    const rows = lines
      .map(
        (line) => `<tr>
          <td>${format(new Date(line.date), "dd-MMM-yy")}</td>
          <td>${line.voucher}</td>
          <td>${line.type}</td>
          <td>${line.supplier}</td>
          <td>${line.sku}</td>
          <td>${line.item}</td>
          <td>${line.unit}</td>
          <td style="text-align:right">${qty(line.quantity)}</td>
          <td style="text-align:right">${qty(line.rate)}</td>
          <td style="text-align:right">${qty(line.amount)}</td>
        </tr>`,
      )
      .join("");
    win.document.write(`<!DOCTYPE html><html><head><title>Purchase Report</title>
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
      <div style="text-align:right"><h1 style="margin:0">Purchase Report — Itemwise</h1>
      <p style="margin:4px 0 0;color:#786448">${periodLabel(from, to)} · ${mode === "vendor" ? supplierName : itemName}</p></div></div>
      <table><thead><tr><th>Date</th><th>Voucher</th><th>Type</th><th>Vendor</th><th>SKU</th><th>Item</th><th>Unit</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="10">No purchases in this period.</td></tr>`}</tbody>
      <tfoot><tr><td colspan="7">Total</td><td style="text-align:right">${qty(report.totals.quantity)}</td><td></td><td style="text-align:right">${qty(report.totals.amount)}</td></tr></tfoot>
      </table></body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchase Report — Itemwise</h1>
          <p className="text-sm text-gray-500">
            Reporting period: {periodLabel(from, to)} · {mode === "vendor" ? supplierName : itemName}
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
            onClick={() => report && downloadPurchaseReportPdf(report, { from, to, filterLabel: mode === "vendor" ? supplierName : itemName })}
          >
            <Download className="mr-2 h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1">
              <Label>Date range</Label>
              <Select value={preset} onValueChange={(value) => applyPreset(value as Preset)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRESETS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Show by</Label>
              <Select
                value={mode}
                onValueChange={(value) => {
                  setMode(value as Mode);
                  setSupplierId("all");
                  setProductId("all");
                  setSearch("");
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vendor">Vendor</SelectItem>
                  <SelectItem value="item">Item</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {mode === "vendor" ? (
              <div className="space-y-1 md:col-span-2">
                <Label>Vendor</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger><SelectValue placeholder="All vendors" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All vendors</SelectItem>
                    {(report?.suppliers || []).map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name} ({supplier.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <Label>Find item</Label>
                  <div className="relative">
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Name, SKU, or code"
                      className="pr-9"
                    />
                    {(searching || (loading && !!search.trim())) && (
                      <LoadingSpinner size="sm" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Item</Label>
                  <ReportItemCombobox
                    value={productId}
                    onChange={setProductId}
                    items={report?.products || []}
                    loading={isInitialLoad}
                    placeholder="All items"
                  />
                </div>
              </>
            )}
          </div>
          {preset === "custom" && (
            <div className="grid grid-cols-1 gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] lg:items-end">
              <DateField label="From date" value={draftFrom} onChange={setDraftFrom} />
              <DateField label="To date" value={draftTo} onChange={setDraftTo} />
              <Button className="h-10" onClick={applyCustom}>Apply</Button>
              <Button className="h-10" variant="outline" onClick={() => applyPreset("last30")}>Clear</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading || searching ? (
            <PageLoader
              message={
                mode === "item" && (searching || !!search.trim())
                  ? "Searching items..."
                  : "Loading purchase report..."
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Voucher</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-10 text-center text-gray-500">
                        No purchases in this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{format(new Date(line.date), "dd-MMM-yy")}</TableCell>
                        <TableCell>{line.voucher}</TableCell>
                        <TableCell>
                          <Badge variant={line.type === "PR" ? "secondary" : "default"}>{line.type}</Badge>
                        </TableCell>
                        <TableCell>{line.supplier}</TableCell>
                        <TableCell>{line.sku}</TableCell>
                        <TableCell>{line.item}</TableCell>
                        <TableCell>{line.unit}</TableCell>
                        <TableCell className="text-right">{qty(line.quantity)}</TableCell>
                        <TableCell className="text-right">{qty(line.rate)}</TableCell>
                        <TableCell className="text-right font-medium">{money(line.amount)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <div className="flex flex-wrap items-center justify-end gap-6 border-t bg-gray-50 px-4 py-3 text-sm">
                <span className="text-gray-500">{report?.totals.count || 0} lines</span>
                <span>Total qty <strong className="ml-2">{qty(report?.totals.quantity || 0)}</strong></span>
                <span>Total <strong className="ml-2">{money(report?.totals.amount || 0)}</strong></span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-gray-500">PP is a purchase into stock. PR is a return to the vendor and reduces quantity and amount.</p>
    </div>
  );
}

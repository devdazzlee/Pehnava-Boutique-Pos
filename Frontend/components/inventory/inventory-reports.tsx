"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  ArrowUpDown,
  Box,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  FileBarChart2,
  Gauge,
  History,
  Hourglass,
  Layers,
  Loader2,
  MapPin,
  Package,
  PackageX,
  PiggyBank,
  Receipt,
  RefreshCw,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Timer,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { DetailSheet, DetailSheetBody, DetailSheetFooter, DetailSheetHeader } from "@/components/ui/detail-sheet";
import { ReportItemCombobox } from "@/components/report-item-combobox";
import apiClient from "@/lib/apiClient";
import { toast } from "sonner";
import { usePosData } from "@/hooks/use-pos-data";
import { useLogoDataUri } from "@/hooks/use-logo-data-uri";
import { StockOpsActions } from "@/components/inventory/stock-ops/stock-ops-actions";
import { downloadExcel, downloadBrandedPdf, formatMoney, formatQty, yieldForUi } from "@/components/inventory/stock-ops/export-utils";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- types & config

type ReportType = "valuation" | "purchase" | "transfer" | "stockout" | "lowstock" | "aging" | "movement_summary";
type Icon = ComponentType<{ className?: string }>;
type Row = Record<string, any>;
type Group = { id: string; name: string; count: number; units: number; value: number; extra?: number };
type DatePreset = "all" | "today" | "7d" | "30d" | "month" | "custom";

interface ReportResponse {
  rows: Row[];
  summary: Record<string, any>;
  breakdown: Record<string, any>;
  viewTotals?: Record<string, number>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const REPORTS: {
  value: ReportType;
  label: string;
  short: string;
  icon: Icon;
  desc: string;
  dates: boolean;
  supplier: boolean;
  chipKey?: "stockStatus" | "status" | "movementType" | "ageBucket";
  sorts: { value: string; label: string }[];
  search: string;
}[] = [
  {
    value: "valuation",
    label: "Stock Valuation",
    short: "Valuation",
    icon: Box,
    desc: "What your stock on hand is worth at cost and at selling price",
    dates: false,
    supplier: true,
    chipKey: "stockStatus",
    search: "Search product, SKU, category…",
    sorts: [
      { value: "value_desc", label: "Highest value" },
      { value: "value_asc", label: "Lowest value" },
      { value: "retail_desc", label: "Highest retail" },
      { value: "qty_desc", label: "Most pieces" },
      { value: "qty_asc", label: "Fewest pieces" },
      { value: "margin_desc", label: "Best margin" },
      { value: "margin_asc", label: "Worst margin" },
      { value: "name", label: "Name A–Z" },
    ],
  },
  {
    value: "purchase",
    label: "Procurement",
    short: "Purchases",
    icon: Truck,
    desc: "Stock bought in — bills, suppliers, cost and expected margin",
    dates: true,
    supplier: true,
    search: "Search product, supplier, invoice…",
    sorts: [
      { value: "date_desc", label: "Newest first" },
      { value: "date_asc", label: "Oldest first" },
      { value: "amount_desc", label: "Highest amount" },
      { value: "qty_desc", label: "Most pieces" },
      { value: "name", label: "Name A–Z" },
    ],
  },
  {
    value: "transfer",
    label: "Transfers",
    short: "Transfers",
    icon: ArrowRightLeft,
    desc: "Stock moved between branches, status and delivery time",
    dates: true,
    supplier: false,
    chipKey: "status",
    search: "Search product, reference, branch…",
    sorts: [
      { value: "date_desc", label: "Newest first" },
      { value: "date_asc", label: "Oldest first" },
      { value: "qty_desc", label: "Most pieces" },
      { value: "value_desc", label: "Highest value" },
    ],
  },
  {
    value: "stockout",
    label: "Outflow",
    short: "Outflow",
    icon: TrendingDown,
    desc: "Stock that left — sales, damage, loss and expiry, with cost",
    dates: true,
    supplier: true,
    chipKey: "movementType",
    search: "Search product, branch, note…",
    sorts: [
      { value: "date_desc", label: "Newest first" },
      { value: "date_asc", label: "Oldest first" },
      { value: "qty_desc", label: "Most pieces" },
      { value: "value_desc", label: "Highest cost" },
    ],
  },
  {
    value: "lowstock",
    label: "Low Stock & Reorder",
    short: "Low stock",
    icon: AlertTriangle,
    desc: "Items at or below minimum, how long they last and what to reorder",
    dates: false,
    supplier: true,
    chipKey: "stockStatus",
    search: "Search product, supplier, branch…",
    sorts: [
      { value: "urgency", label: "Most urgent" },
      { value: "days_asc", label: "Runs out soonest" },
      { value: "shortfall_desc", label: "Biggest shortfall" },
      { value: "cost_desc", label: "Highest reorder cost" },
      { value: "name", label: "Name A–Z" },
    ],
  },
  {
    value: "aging",
    label: "Stock Aging",
    short: "Aging",
    icon: Clock,
    desc: "How long stock has been sitting since it last sold",
    dates: false,
    supplier: true,
    chipKey: "ageBucket",
    search: "Search product, SKU, branch…",
    sorts: [
      { value: "days_desc", label: "Oldest first" },
      { value: "days_asc", label: "Freshest first" },
      { value: "value_desc", label: "Highest value" },
      { value: "qty_desc", label: "Most pieces" },
      { value: "name", label: "Name A–Z" },
    ],
  },
  {
    value: "movement_summary",
    label: "Movement Summary",
    short: "Summary",
    icon: History,
    desc: "Every stock movement grouped by type — in, out and net",
    dates: true,
    supplier: true,
    search: "Search movement type…",
    sorts: [
      { value: "count_desc", label: "Most events" },
      { value: "value_desc", label: "Highest value" },
      { value: "net_desc", label: "Largest net in" },
    ],
  },
];

const PAGE_SIZES = [10, 25, 50, 100];

const rs = (n: unknown) => `Rs ${formatMoney(Number(n) || 0)}`;
const compact = (n: number) => {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 10_000_000) return `${sign}Rs ${(abs / 10_000_000).toFixed(2)} Cr`;
  if (abs >= 100_000) return `${sign}Rs ${(abs / 100_000).toFixed(2)} Lac`;
  return rs(n);
};
const pct = (n: unknown) => `${(Number(n) || 0).toFixed(1)}%`;
const fmtDate = (d: unknown) => (d ? format(new Date(d as string), "dd MMM yyyy") : "—");
const fmtDateTime = (d: unknown) => (d ? format(new Date(d as string), "dd MMM yyyy, hh:mm a") : "—");
const pretty = (s: unknown) =>
  String(s || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());

const TONES: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  rose: "bg-rose-50 text-rose-700 ring-rose-600/20",
  sky: "bg-sky-50 text-sky-700 ring-sky-600/20",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20",
  slate: "bg-slate-100 text-slate-700 ring-slate-500/20",
};
const DOTS: Record<string, string> = {
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  sky: "bg-sky-500",
  violet: "bg-violet-500",
  slate: "bg-slate-400",
};

const STATUS_META: Record<string, { label: string; tone: string }> = {
  // valuation
  ok: { label: "Healthy", tone: "emerald" },
  low: { label: "Low", tone: "amber" },
  out: { label: "Out of stock", tone: "rose" },
  negative: { label: "Negative", tone: "violet" },
  critical: { label: "Critical", tone: "rose" },
  // transfers
  PENDING: { label: "Pending", tone: "amber" },
  DISPATCHED: { label: "In transit", tone: "sky" },
  RECEIVED: { label: "Received", tone: "emerald" },
  CANCELLED: { label: "Cancelled", tone: "slate" },
  // outflow
  SALE: { label: "Sale", tone: "sky" },
  DAMAGE: { label: "Damage", tone: "rose" },
  LOSS: { label: "Loss", tone: "violet" },
  EXPIRED: { label: "Expired", tone: "amber" },
  // movement types
  PURCHASE: { label: "Purchase", tone: "emerald" },
  ADJUSTMENT: { label: "Adjustment", tone: "violet" },
  TRANSFER_IN: { label: "Transfer in", tone: "emerald" },
  TRANSFER_OUT: { label: "Transfer out", tone: "amber" },
  RETURN: { label: "Customer return", tone: "emerald" },
  PURCHASE_RETURN: { label: "Return to supplier", tone: "amber" },
  // delivery
  COMPLETE: { label: "Complete", tone: "emerald" },
  PARTIAL: { label: "Partial", tone: "amber" },
};

function Pill({ value, label }: { value: string; label?: string }) {
  const meta = STATUS_META[value] || { label: pretty(value), tone: "slate" };
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", TONES[meta.tone])}>
      <span className={cn("h-1.5 w-1.5 rounded-full", DOTS[meta.tone])} />
      {label || meta.label}
    </span>
  );
}

function agePill(days: number) {
  const tone = days > 180 ? "rose" : days > 90 ? "rose" : days > 60 ? "amber" : days > 30 ? "amber" : "emerald";
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ring-inset", TONES[tone])}>
      {days} days
    </span>
  );
}

// ---------------------------------------------------------------- columns

type Column = {
  key: string;
  header: string;
  align?: "right";
  render: (r: Row) => ReactNode;
  exportValue: (r: Row) => string | number;
  pdf?: number; // width in the PDF; omitted = excel only
};

const productCell = (r: Row) => (
  <div className="min-w-0">
    <p className="truncate font-medium text-slate-900">{r.name}</p>
    <p className="truncate text-[11px] text-slate-500">
      {r.sku ? <span className="font-mono">{r.sku}</span> : null}
      {r.sku && r.category ? " · " : ""}
      {r.category || ""}
    </p>
  </div>
);
const branchCell = (name: string) => (
  <span className="inline-flex items-center gap-1 whitespace-nowrap text-slate-700">
    <MapPin className="h-3 w-3 text-slate-400" />
    {name}
  </span>
);
const num = (v: unknown, cls?: string) => <span className={cn("tabular-nums", cls)}>{formatQty(v)}</span>;
const money = (v: unknown, cls?: string) => <span className={cn("whitespace-nowrap tabular-nums", cls)}>{rs(v)}</span>;

const COLUMNS: Record<ReportType, Column[]> = {
  valuation: [
    { key: "product", header: "Product", render: productCell, exportValue: (r) => r.name, pdf: 2 },
    { key: "sku", header: "SKU", render: () => null, exportValue: (r) => r.sku },
    { key: "category", header: "Category", render: () => null, exportValue: (r) => r.category },
    { key: "branch", header: "Branch", render: (r) => branchCell(r.branch), exportValue: (r) => r.branch, pdf: 1.2 },
    { key: "qty", header: "Qty", align: "right", render: (r) => num(r.qty, cn("font-semibold", r.qty < 0 && "text-rose-700")), exportValue: (r) => r.qty, pdf: 0.6 },
    { key: "unitCost", header: "Unit cost", align: "right", render: (r) => money(r.unitCost, "text-slate-600"), exportValue: (r) => r.unitCost, pdf: 0.9 },
    { key: "unitPrice", header: "Sale price", align: "right", render: (r) => money(r.unitPrice, "text-slate-600"), exportValue: (r) => r.unitPrice },
    { key: "costValue", header: "Value at cost", align: "right", render: (r) => money(r.costValue, "font-semibold text-slate-900"), exportValue: (r) => r.costValue, pdf: 1 },
    { key: "retailValue", header: "Value at retail", align: "right", render: (r) => money(r.retailValue, "text-slate-600"), exportValue: (r) => r.retailValue, pdf: 1 },
    { key: "margin", header: "Margin", align: "right", render: (r) => <span className={cn("tabular-nums text-xs font-semibold", r.margin >= 20 ? "text-emerald-700" : r.margin >= 10 ? "text-amber-600" : "text-rose-600")}>{pct(r.margin)}</span>, exportValue: (r) => r.margin, pdf: 0.6 },
    { key: "status", header: "Status", render: (r) => <Pill value={r.status} />, exportValue: (r) => STATUS_META[r.status]?.label || r.status },
  ],
  purchase: [
    { key: "date", header: "Date", render: (r) => <span className="whitespace-nowrap text-slate-600">{fmtDate(r.date)}</span>, exportValue: (r) => fmtDateTime(r.date), pdf: 0.9 },
    { key: "product", header: "Product", render: productCell, exportValue: (r) => r.name, pdf: 1.8 },
    { key: "sku", header: "SKU", render: () => null, exportValue: (r) => r.sku },
    { key: "supplier", header: "Supplier", render: (r) => <span className="text-slate-700">{r.supplier}</span>, exportValue: (r) => r.supplier, pdf: 1.2 },
    { key: "invoice", header: "Invoice", render: (r) => <span className="font-mono text-xs text-slate-500">{r.invoiceRef || "—"}</span>, exportValue: (r) => r.invoiceRef, pdf: 0.9 },
    { key: "branch", header: "Received at", render: (r) => branchCell(r.branch), exportValue: (r) => r.branch },
    { key: "qty", header: "Qty", align: "right", render: (r) => num(r.qty, "font-semibold"), exportValue: (r) => r.qty, pdf: 0.5 },
    { key: "unitCost", header: "Unit cost", align: "right", render: (r) => money(r.unitCost, "text-slate-600"), exportValue: (r) => r.unitCost, pdf: 0.8 },
    { key: "salePrice", header: "Sale price", align: "right", render: (r) => money(r.salePrice, "text-slate-600"), exportValue: (r) => r.salePrice },
    { key: "lineTotal", header: "Total", align: "right", render: (r) => money(r.lineTotal, "font-semibold text-slate-900"), exportValue: (r) => r.lineTotal, pdf: 1 },
    { key: "margin", header: "Exp. margin", align: "right", render: (r) => <span className="tabular-nums text-xs font-semibold text-slate-600">{pct(r.expectedMargin)}</span>, exportValue: (r) => r.expectedMargin },
  ],
  transfer: [
    { key: "date", header: "Date", render: (r) => <span className="whitespace-nowrap text-slate-600">{fmtDate(r.date)}</span>, exportValue: (r) => fmtDateTime(r.date), pdf: 0.9 },
    { key: "ref", header: "Reference", render: (r) => <span className="font-mono text-xs text-slate-500">{r.reference || "—"}</span>, exportValue: (r) => r.reference, pdf: 1 },
    { key: "product", header: "Product", render: productCell, exportValue: (r) => r.name, pdf: 1.7 },
    {
      key: "route",
      header: "Route",
      render: (r) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-slate-700">
          {r.from}
          <ArrowRightLeft className="h-3 w-3 text-slate-400" />
          {r.to}
        </span>
      ),
      exportValue: (r) => `${r.from} → ${r.to}`,
      pdf: 1.6,
    },
    { key: "qty", header: "Qty", align: "right", render: (r) => num(r.qty, "font-semibold"), exportValue: (r) => r.qty, pdf: 0.5 },
    { key: "value", header: "Value", align: "right", render: (r) => money(r.value, "text-slate-600"), exportValue: (r) => r.value, pdf: 0.9 },
    {
      key: "lead",
      header: "Delivery",
      align: "right",
      render: (r) =>
        r.leadDays != null ? (
          <span className="text-xs tabular-nums text-slate-600">{r.leadDays} d</span>
        ) : r.status === "PENDING" || r.status === "DISPATCHED" ? (
          <span className={cn("text-xs tabular-nums", r.ageDays > 3 ? "font-semibold text-rose-600" : "text-slate-500")}>{r.ageDays} d open</span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
      exportValue: (r) => (r.leadDays != null ? r.leadDays : ""),
    },
    { key: "status", header: "Status", render: (r) => <Pill value={r.status} />, exportValue: (r) => STATUS_META[r.status]?.label || r.status, pdf: 0.8 },
  ],
  stockout: [
    { key: "date", header: "Date", render: (r) => <span className="whitespace-nowrap text-slate-600">{fmtDateTime(r.date)}</span>, exportValue: (r) => fmtDateTime(r.date), pdf: 1.2 },
    { key: "product", header: "Product", render: productCell, exportValue: (r) => r.name, pdf: 1.8 },
    { key: "sku", header: "SKU", render: () => null, exportValue: (r) => r.sku },
    { key: "branch", header: "Branch", render: (r) => branchCell(r.branch), exportValue: (r) => r.branch, pdf: 1.1 },
    { key: "type", header: "Reason", render: (r) => <Pill value={r.type} />, exportValue: (r) => STATUS_META[r.type]?.label || r.type, pdf: 0.8 },
    { key: "qty", header: "Qty", align: "right", render: (r) => num(r.qty, "font-semibold text-rose-700"), exportValue: (r) => r.qty, pdf: 0.5 },
    { key: "costValue", header: "Cost", align: "right", render: (r) => money(r.costValue, "text-slate-700"), exportValue: (r) => r.costValue, pdf: 0.9 },
    { key: "stock", header: "Stock after", align: "right", render: (r) => num(r.after, "text-slate-500"), exportValue: (r) => r.after },
    { key: "notes", header: "Notes", render: () => null, exportValue: (r) => r.notes },
  ],
  lowstock: [
    { key: "product", header: "Product", render: productCell, exportValue: (r) => r.name, pdf: 1.8 },
    { key: "sku", header: "SKU", render: () => null, exportValue: (r) => r.sku },
    { key: "branch", header: "Branch", render: (r) => branchCell(r.branch), exportValue: (r) => r.branch, pdf: 1 },
    { key: "supplier", header: "Supplier", render: (r) => <span className="text-slate-600">{r.supplier}</span>, exportValue: (r) => r.supplier, pdf: 1.1 },
    {
      key: "qty",
      header: "In stock / min",
      align: "right",
      render: (r) => (
        <span className="whitespace-nowrap tabular-nums">
          <span className={cn("font-semibold", r.qty <= 0 ? "text-rose-700" : "text-slate-900")}>{formatQty(r.qty)}</span>
          <span className="text-slate-400"> / {formatQty(r.minQty)}</span>
        </span>
      ),
      exportValue: (r) => r.qty,
      pdf: 0.8,
    },
    { key: "min", header: "Minimum", render: () => null, exportValue: (r) => r.minQty },
    { key: "sold", header: "Sold 30d", align: "right", render: (r) => num(r.sold30, "text-slate-600"), exportValue: (r) => r.sold30 },
    {
      key: "days",
      header: "Lasts",
      align: "right",
      render: (r) =>
        r.qty <= 0 ? (
          <span className="text-xs font-semibold text-rose-600">Empty</span>
        ) : r.daysLeft != null ? (
          <span className={cn("text-xs font-semibold tabular-nums", r.daysLeft <= 7 ? "text-rose-600" : r.daysLeft <= 14 ? "text-amber-600" : "text-slate-600")}>{r.daysLeft} days</span>
        ) : (
          <span className="text-xs text-slate-400">No sales</span>
        ),
      exportValue: (r) => (r.daysLeft != null ? r.daysLeft : ""),
      pdf: 0.6,
    },
    { key: "reorder", header: "Reorder", align: "right", render: (r) => num(r.reorderQty, "font-semibold text-indigo-700"), exportValue: (r) => r.reorderQty, pdf: 0.6 },
    { key: "reorderCost", header: "Reorder cost", align: "right", render: (r) => money(r.reorderCost, "text-slate-700"), exportValue: (r) => r.reorderCost, pdf: 0.9 },
    { key: "status", header: "Status", render: (r) => <Pill value={r.status} />, exportValue: (r) => STATUS_META[r.status]?.label || r.status, pdf: 0.7 },
  ],
  aging: [
    { key: "product", header: "Product", render: productCell, exportValue: (r) => r.name, pdf: 1.9 },
    { key: "sku", header: "SKU", render: () => null, exportValue: (r) => r.sku },
    { key: "branch", header: "Branch", render: (r) => branchCell(r.branch), exportValue: (r) => r.branch, pdf: 1.1 },
    { key: "qty", header: "Qty", align: "right", render: (r) => num(r.qty, "font-semibold"), exportValue: (r) => r.qty, pdf: 0.5 },
    { key: "value", header: "Value at cost", align: "right", render: (r) => money(r.value, "text-slate-700"), exportValue: (r) => r.value, pdf: 0.9 },
    {
      key: "lastSale",
      header: "Last sold",
      render: (r) => (r.neverSold ? <span className="text-xs font-medium text-rose-600">Never sold</span> : <span className="whitespace-nowrap text-slate-600">{fmtDate(r.lastSale)}</span>),
      exportValue: (r) => (r.neverSold ? "Never" : fmtDate(r.lastSale)),
      pdf: 0.9,
    },
    { key: "lastIn", header: "Last received", render: (r) => <span className="whitespace-nowrap text-slate-500">{fmtDate(r.lastIn)}</span>, exportValue: (r) => fmtDate(r.lastIn) },
    { key: "age", header: "Idle", align: "right", render: (r) => agePill(r.daysIdle), exportValue: (r) => r.daysIdle, pdf: 0.6 },
  ],
  movement_summary: [
    { key: "type", header: "Movement type", render: (r) => <Pill value={r.type} />, exportValue: (r) => STATUS_META[r.type]?.label || pretty(r.type), pdf: 1.5 },
    { key: "count", header: "Events", align: "right", render: (r) => num(r.count, "font-semibold"), exportValue: (r) => r.count, pdf: 0.7 },
    {
      key: "share",
      header: "Share",
      render: (r) => (
        <div className="flex min-w-[110px] items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(2, r.share)}%` }} />
          </div>
          <span className="w-10 text-right text-[11px] tabular-nums text-slate-500">{pct(r.share)}</span>
        </div>
      ),
      exportValue: (r) => r.share,
    },
    { key: "in", header: "Units in", align: "right", render: (r) => num(r.unitsIn, "text-emerald-700"), exportValue: (r) => r.unitsIn, pdf: 0.8 },
    { key: "out", header: "Units out", align: "right", render: (r) => num(r.unitsOut, "text-rose-700"), exportValue: (r) => r.unitsOut, pdf: 0.8 },
    {
      key: "net",
      header: "Net",
      align: "right",
      render: (r) => <span className={cn("font-semibold tabular-nums", r.net > 0 ? "text-emerald-700" : r.net < 0 ? "text-rose-700" : "text-slate-600")}>{r.net > 0 ? "+" : ""}{formatQty(r.net)}</span>,
      exportValue: (r) => r.net,
      pdf: 0.7,
    },
    { key: "value", header: "Value at cost", align: "right", render: (r) => money(r.value, "text-slate-700"), exportValue: (r) => r.value, pdf: 1 },
    { key: "last", header: "Last activity", render: (r) => <span className="whitespace-nowrap text-slate-500">{fmtDateTime(r.lastAt)}</span>, exportValue: (r) => fmtDateTime(r.lastAt) },
  ],
};

// ---------------------------------------------------------------- component

export function InventoryReports() {
  const logoDataUri = useLogoDataUri();
  const { branches, suppliers, categories, fetchBranches, fetchSuppliers, fetchCategories } = usePosData();

  const [reportType, setReportType] = useState<ReportType>("valuation");
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loadedType, setLoadedType] = useState<ReportType | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [detail, setDetail] = useState<Row | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filterBranch, setFilterBranch] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterSupplier, setFilterSupplier] = useState("all");
  const [chip, setChip] = useState("all");
  const [sort, setSort] = useState(REPORTS[0].sorts[0].value);
  const [preset, setPreset] = useState<DatePreset>("30d");
  const [filterStart, setFilterStart] = useState<Date | undefined>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 29);
    return d;
  });
  const [filterEnd, setFilterEnd] = useState<Date | undefined>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const requestId = useRef(0);

  const active = REPORTS.find((r) => r.value === reportType)!;
  const columns = COLUMNS[reportType];

  useEffect(() => {
    fetchBranches();
    fetchSuppliers();
    fetchCategories();
  }, [fetchBranches, fetchSuppliers, fetchCategories]);

  // Debounced search.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search, filterBranch, filterCategory, filterSupplier, chip, sort, filterStart, filterEnd, pageSize]);

  const buildParams = useCallback(
    (extra: Record<string, string> = {}) => {
      const params: Record<string, string> = { type: reportType, sort, ...extra };
      if (filterBranch !== "all") params.branchId = filterBranch;
      if (filterCategory !== "all") params.categoryId = filterCategory;
      if (active.supplier && filterSupplier !== "all") params.supplierId = filterSupplier;
      if (search) params.q = search;
      if (active.chipKey && chip !== "all") params[active.chipKey] = chip;
      if (active.dates) {
        if (filterStart) params.startDate = filterStart.toISOString();
        if (filterEnd) {
          const e = new Date(filterEnd);
          e.setHours(23, 59, 59, 999);
          params.endDate = e.toISOString();
        }
      }
      return params;
    },
    [reportType, sort, filterBranch, filterCategory, filterSupplier, search, chip, filterStart, filterEnd, active],
  );

  const fetchReport = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiClient.get("/inventory/reports", { params: buildParams({ page: String(page), limit: String(pageSize) }) });
      if (id !== requestId.current) return;
      const data = res.data?.data || {};
      setReport({
        rows: Array.isArray(data.rows) ? data.rows : [],
        summary: data.summary || {},
        breakdown: data.breakdown || {},
        viewTotals: data.viewTotals,
        pagination: data.pagination || { page: 1, limit: pageSize, total: 0, totalPages: 1 },
      });
      setLoadedType(reportType);
    } catch (e: any) {
      if (id !== requestId.current) return;
      const msg = e?.response?.data?.message || e?.message || "Failed to load report";
      setLoadError(msg);
      toast.error(msg);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [buildParams, page, pageSize, reportType]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const switchReport = (next: ReportType) => {
    if (next === reportType) return;
    const cfg = REPORTS.find((r) => r.value === next)!;
    setReportType(next);
    setChip("all");
    setSort(cfg.sorts[0].value);
    setSearchInput("");
    setSearch("");
    setDetail(null);
  };

  const applyPreset = (next: DatePreset) => {
    setPreset(next);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const back = (n: number) => {
      const d = new Date(today);
      d.setDate(d.getDate() - n);
      return d;
    };
    if (next === "all") {
      setFilterStart(undefined);
      setFilterEnd(undefined);
    } else if (next === "today") {
      setFilterStart(today);
      setFilterEnd(today);
    } else if (next === "7d") {
      setFilterStart(back(6));
      setFilterEnd(today);
    } else if (next === "30d") {
      setFilterStart(back(29));
      setFilterEnd(today);
    } else if (next === "month") {
      setFilterStart(new Date(today.getFullYear(), today.getMonth(), 1));
      setFilterEnd(today);
    }
  };

  const activeFilterCount =
    (search ? 1 : 0) +
    (filterBranch !== "all" ? 1 : 0) +
    (filterCategory !== "all" ? 1 : 0) +
    (active.supplier && filterSupplier !== "all" ? 1 : 0) +
    (chip !== "all" ? 1 : 0) +
    (active.dates && preset !== "30d" ? 1 : 0);

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setFilterBranch("all");
    setFilterCategory("all");
    setFilterSupplier("all");
    setChip("all");
    applyPreset("30d");
  };

  const ready = loadedType === reportType && !!report;
  const isFirstLoad = !ready && !loadError;
  const isRefreshing = loading && ready;
  const s = ready ? report!.summary : {};
  const b = ready ? report!.breakdown : {};
  const rows = ready ? report!.rows : [];
  const pagination = ready ? report!.pagination : { page: 1, limit: pageSize, total: 0, totalPages: 1 };

  const periodLabel = active.dates
    ? filterStart
      ? `${format(filterStart, "dd MMM yyyy")}${filterEnd ? ` – ${format(filterEnd, "dd MMM yyyy")}` : " onwards"}`
      : "All time"
    : "Live stock today";
  const branchLabel = filterBranch !== "all" ? branches.find((x) => x.id === filterBranch)?.name || "Branch" : "All branches";

  // ---------------------------------------------------------------- KPI config
  type Hero = { label: string; value: string; hint: string; icon: Icon; tone: string; accent: string; valueClass?: string };
  type Tile = { id: string; label: string; count: number; hint: string; tone: string };

  const heroes: Hero[] = useMemo(() => {
    switch (reportType) {
      case "valuation":
        return [
          { label: "Stock at cost", value: compact(s.totalValue || 0), hint: `${formatQty(s.totalUnits || 0)} pieces on hand`, icon: Wallet, tone: "bg-blue-50 text-blue-600", accent: "bg-blue-500" },
          { label: "Stock at retail", value: compact(s.retailValue || 0), hint: "If everything sells at list price", icon: Receipt, tone: "bg-violet-50 text-violet-600", accent: "bg-violet-500" },
          { label: "Potential profit", value: compact(s.potentialProfit || 0), hint: `${pct(s.margin)} margin on stock`, icon: PiggyBank, tone: "bg-emerald-50 text-emerald-600", accent: "bg-emerald-500", valueClass: "text-emerald-700" },
          { label: "Products in stock", value: (s.skuCount || 0).toLocaleString(), hint: `${s.locationsCount || 0} location${s.locationsCount === 1 ? "" : "s"} · ${s.stockRows || 0} stock rows`, icon: Package, tone: "bg-slate-100 text-slate-600", accent: "bg-slate-400" },
        ];
      case "purchase":
        return [
          { label: "Total spend", value: compact(s.totalCost || 0), hint: `${(s.count || 0).toLocaleString()} purchase lines`, icon: Wallet, tone: "bg-blue-50 text-blue-600", accent: "bg-blue-500" },
          { label: "Bills", value: (s.bills || 0).toLocaleString(), hint: `Avg bill ${rs(s.avgBill || 0)}`, icon: Receipt, tone: "bg-violet-50 text-violet-600", accent: "bg-violet-500" },
          { label: "Pieces received", value: formatQty(s.units || 0), hint: `Avg cost ${rs(s.avgUnitCost || 0)} / piece`, icon: Package, tone: "bg-emerald-50 text-emerald-600", accent: "bg-emerald-500" },
          { label: "Suppliers", value: (s.suppliers || 0).toLocaleString(), hint: s.partialCount ? `${s.partialCount} partial deliveries` : "All deliveries complete", icon: Users, tone: "bg-amber-50 text-amber-600", accent: "bg-amber-500" },
        ];
      case "transfer":
        return [
          { label: "Transfers", value: (s.count || 0).toLocaleString(), hint: `${formatQty(s.units || 0)} pieces moved`, icon: ArrowRightLeft, tone: "bg-blue-50 text-blue-600", accent: "bg-blue-500" },
          { label: "Value moved", value: compact(s.value || 0), hint: "At cost, excluding cancelled", icon: Wallet, tone: "bg-violet-50 text-violet-600", accent: "bg-violet-500" },
          { label: "Still in transit", value: compact(s.inTransitValue || 0), hint: `${(s.statusCounts?.PENDING || 0) + (s.statusCounts?.DISPATCHED || 0)} not yet received`, icon: Truck, tone: "bg-amber-50 text-amber-600", accent: "bg-amber-500" },
          { label: "Avg delivery time", value: s.avgLeadDays != null ? `${s.avgLeadDays} days` : "—", hint: s.overdue ? `${s.overdue} open for more than 3 days` : "Nothing overdue", icon: Timer, tone: s.overdue ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600", accent: s.overdue ? "bg-rose-500" : "bg-emerald-500" },
        ];
      case "stockout":
        return [
          { label: "Pieces out", value: formatQty(s.totalQty || 0), hint: `${(s.count || 0).toLocaleString()} events`, icon: ArrowUpFromLine, tone: "bg-blue-50 text-blue-600", accent: "bg-blue-500" },
          { label: "Cost of outflow", value: compact(s.totalValue || 0), hint: "Sales + shrinkage at cost", icon: Wallet, tone: "bg-violet-50 text-violet-600", accent: "bg-violet-500" },
          { label: "Shrinkage cost", value: compact(s.shrinkValue || 0), hint: `${formatQty(s.shrinkUnits || 0)} pieces damaged, lost or expired`, icon: PackageX, tone: "bg-rose-50 text-rose-600", accent: "bg-rose-500", valueClass: (s.shrinkValue || 0) > 0 ? "text-rose-700" : undefined },
          { label: "Shrinkage rate", value: pct(s.shrinkRate), hint: "Share of outflow that wasn't a sale", icon: Gauge, tone: "bg-amber-50 text-amber-600", accent: "bg-amber-500" },
        ];
      case "lowstock":
        return [
          { label: "Items needing stock", value: (s.warningCount || 0).toLocaleString(), hint: "At or below their minimum", icon: AlertTriangle, tone: "bg-amber-50 text-amber-600", accent: "bg-amber-500" },
          { label: "Out of stock", value: (s.statusCounts?.out || 0).toLocaleString(), hint: "Nothing left to sell", icon: PackageX, tone: "bg-rose-50 text-rose-600", accent: "bg-rose-500", valueClass: (s.statusCounts?.out || 0) > 0 ? "text-rose-700" : undefined },
          { label: "Suggested reorder", value: compact(s.reorderCost || 0), hint: `${formatQty(s.reorderUnits || 0)} pieces at cost`, icon: ShoppingCart, tone: "bg-indigo-50 text-indigo-600", accent: "bg-indigo-500" },
          { label: "Runs out this week", value: (s.runningOutThisWeek || 0).toLocaleString(), hint: "Based on last 30 days of sales", icon: Hourglass, tone: "bg-violet-50 text-violet-600", accent: "bg-violet-500" },
        ];
      case "aging":
        return [
          { label: "Stock value", value: compact(s.totalValue || 0), hint: `${(s.items || 0).toLocaleString()} stock rows with pieces`, icon: Wallet, tone: "bg-blue-50 text-blue-600", accent: "bg-blue-500" },
          { label: "Average idle time", value: `${s.weightedAge || 0} days`, hint: `Value-weighted · simple avg ${s.avgAge || 0} days`, icon: Clock, tone: "bg-violet-50 text-violet-600", accent: "bg-violet-500" },
          { label: "Dead stock (90d+)", value: compact(s.deadStockValue || 0), hint: `${s.deadStockCount || 0} items · ${pct(s.deadShare)} of stock value`, icon: PackageX, tone: "bg-rose-50 text-rose-600", accent: "bg-rose-500", valueClass: (s.deadStockValue || 0) > 0 ? "text-rose-700" : undefined },
          { label: "Never sold", value: (s.neverSold || 0).toLocaleString(), hint: "Received but not one sale yet", icon: AlertTriangle, tone: "bg-amber-50 text-amber-600", accent: "bg-amber-500" },
        ];
      default:
        return [
          { label: "Movements", value: (s.totalMovements || 0).toLocaleString(), hint: `${s.types || 0} movement types`, icon: History, tone: "bg-blue-50 text-blue-600", accent: "bg-blue-500" },
          { label: "Pieces in", value: formatQty(s.unitsIn || 0), hint: "Purchases, transfers in, returns", icon: ArrowDownToLine, tone: "bg-emerald-50 text-emerald-600", accent: "bg-emerald-500", valueClass: "text-emerald-700" },
          { label: "Pieces out", value: formatQty(s.unitsOut || 0), hint: "Sales, transfers out, write-offs", icon: ArrowUpFromLine, tone: "bg-rose-50 text-rose-600", accent: "bg-rose-500", valueClass: "text-rose-700" },
          { label: "Net change", value: `${(s.net || 0) > 0 ? "+" : ""}${formatQty(s.net || 0)}`, hint: `${s.activeProducts || 0} products moved`, icon: TrendingUp, tone: "bg-violet-50 text-violet-600", accent: "bg-violet-500" },
        ];
    }
  }, [reportType, s]);

  const tiles: Tile[] = useMemo(() => {
    switch (reportType) {
      case "valuation":
        return [
          { id: "in_stock", label: "In stock", count: (s.statusCounts?.ok || 0) + (s.statusCounts?.low || 0), hint: "Has pieces", tone: "emerald" },
          { id: "low", label: "Low", count: s.statusCounts?.low || 0, hint: "At or below minimum", tone: "amber" },
          { id: "out", label: "Out of stock", count: s.statusCounts?.out || 0, hint: "Zero pieces", tone: "rose" },
          { id: "negative", label: "Negative", count: s.statusCounts?.negative || 0, hint: "Needs a stock count", tone: "violet" },
        ];
      case "transfer":
        return ["PENDING", "DISPATCHED", "RECEIVED", "CANCELLED"].map((k) => ({
          id: k,
          label: STATUS_META[k].label,
          count: s.statusCounts?.[k] || 0,
          hint: k === "PENDING" ? "Not dispatched yet" : k === "DISPATCHED" ? "On the way" : k === "RECEIVED" ? "Delivered" : "Stock returned",
          tone: STATUS_META[k].tone,
        }));
      case "stockout": {
        const byType: Group[] = b.byType || [];
        return ["SALE", "DAMAGE", "LOSS", "EXPIRED"].map((k) => {
          const g = byType.find((x) => x.id === k);
          return { id: k, label: STATUS_META[k].label, count: g?.count || 0, hint: `${formatQty(g?.units || 0)} pcs · ${rs(g?.value || 0)}`, tone: STATUS_META[k].tone };
        });
      }
      case "lowstock":
        return [
          { id: "out", label: "Out of stock", count: s.statusCounts?.out || 0, hint: "Reorder now", tone: "rose" },
          { id: "critical", label: "Critical", count: s.statusCounts?.critical || 0, hint: "Below half of minimum", tone: "rose" },
          { id: "low", label: "Low", count: s.statusCounts?.low || 0, hint: "At or below minimum", tone: "amber" },
        ];
      case "aging": {
        const buckets: Group[] = b.buckets || [];
        const tone = (id: string) => (id === "0-30" ? "emerald" : id === "31-60" || id === "61-90" ? "amber" : "rose");
        return buckets.map((g) => ({ id: g.id, label: g.name, count: g.count, hint: rs(g.value), tone: tone(g.id) }));
      }
      default:
        return [];
    }
  }, [reportType, s, b]);

  // ---------------------------------------------------------------- export
  const runExport = async (kind: "excel" | "pdf") => {
    if (!pagination.total) {
      toast.error("Nothing to export");
      return;
    }
    setExporting(true);
    await yieldForUi();
    try {
      const res = await apiClient.get("/inventory/reports", { params: buildParams({ all: "true" }) });
      const all: Row[] = res.data?.data?.rows || [];
      const stamp = format(new Date(), "yyyy-MM-dd");
      if (kind === "excel") {
        downloadExcel(
          `inventory-${reportType}-${stamp}.xlsx`,
          active.short,
          columns.map((c) => c.header),
          all.map((r) => columns.map((c) => c.exportValue(r))),
        );
        toast.success(`Excel downloaded · ${all.length.toLocaleString()} rows`);
      } else {
        const pdfCols = columns.filter((c) => c.pdf);
        await downloadBrandedPdf({
          filename: `inventory-${reportType}-${stamp}.pdf`,
          title: active.label,
          subtitle: `${periodLabel} · ${branchLabel}`,
          logoDataUri,
          summary: heroes.map((h) => ({ label: h.label, value: h.value })),
          columns: pdfCols.map((c) => ({ header: c.header, align: c.align, width: c.pdf })),
          rows: all.map((r) =>
            pdfCols.map((c) => {
              const v = c.exportValue(r);
              return typeof v === "number" ? formatMoney(v) : String(v ?? "");
            }),
          ),
        });
        toast.success(`PDF downloaded · ${all.length.toLocaleString()} rows`);
      }
    } catch {
      toast.error(`Failed to export ${kind === "excel" ? "Excel" : "PDF"}`);
    } finally {
      setExporting(false);
    }
  };

  const visibleColumns = columns.filter((c) => c.key !== "sku" && c.key !== "category" && c.key !== "min" && c.key !== "notes");
  const filterLabel = "text-xs font-semibold text-indigo-900/80";
  const filterControl = "h-10 border-indigo-200/80 bg-white text-sm shadow-sm";

  // ---------------------------------------------------------------- render
  return (
    <div className="mx-auto w-full min-w-0 max-w-[1600px] space-y-5 p-4 text-black md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
            <FileBarChart2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">Inventory Reports</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-slate-500">
              <span className="font-medium text-slate-700">{active.label}</span>
              <span className="text-slate-300">•</span>
              <span className="inline-flex items-center gap-1">
                <CalendarIcon className="h-3.5 w-3.5" />
                {periodLabel}
              </span>
              <span className="text-slate-300">•</span>
              <span>{branchLabel}</span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9 bg-white shadow-sm" onClick={fetchReport} disabled={loading} title="Refresh">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <StockOpsActions onExportExcel={() => runExport("excel")} onExportPdf={() => runExport("pdf")} disabled={!ready || !pagination.total} exporting={exporting} />
        </div>
      </div>

      {/* Report picker */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          const on = r.value === reportType;
          return (
            <button
              key={r.value}
              type="button"
              onClick={() => switchReport(r.value)}
              className={cn(
                "group flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all",
                on ? "border-slate-900 bg-slate-900 text-white shadow-md" : "border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50",
              )}
            >
              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", on ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600 group-hover:bg-white")}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="truncate text-sm font-semibold">{r.short}</span>
            </button>
          );
        })}
      </div>
      <p className="-mt-2 text-sm text-slate-500">{active.desc}</p>

      {/* Hero cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 md:gap-4">
        {isFirstLoad
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-32" />
                <Skeleton className="h-3 w-40" />
              </div>
            ))
          : heroes.map((h) => {
              const Icon = h.icon;
              return (
                <div key={h.label} className="relative min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <span className={cn("absolute inset-x-0 top-0 h-1", h.accent)} aria-hidden />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{h.label}</p>
                      <p className={cn("mt-2 truncate text-2xl font-semibold tracking-tight tabular-nums text-slate-900 transition-opacity", h.valueClass, isRefreshing && "opacity-40")}>{h.value}</p>
                      <p className="mt-1 truncate text-xs text-slate-500" title={h.hint}>
                        {h.hint}
                      </p>
                    </div>
                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", h.tone)}>
                      {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-5 w-5" />}
                    </div>
                  </div>
                </div>
              );
            })}
      </div>

      {/* Quick filter tiles */}
      {tiles.length > 0 && !isFirstLoad ? (
        <div className={cn("grid grid-cols-2 gap-3", tiles.length === 3 ? "sm:grid-cols-3" : tiles.length >= 5 ? "sm:grid-cols-3 xl:grid-cols-5" : "sm:grid-cols-4")}>
          {tiles.map((t) => {
            const on = chip === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setChip(on ? "all" : t.id)}
                className={cn(
                  "flex min-w-0 items-center gap-3 rounded-xl border bg-white p-3.5 text-left shadow-sm transition-all hover:shadow",
                  on ? "border-indigo-400 ring-2 ring-indigo-200" : "border-slate-200 hover:border-slate-300",
                )}
              >
                <span className={cn("h-9 w-1.5 shrink-0 rounded-full", DOTS[t.tone])} />
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-500">{t.label}</p>
                  <p className={cn("text-lg font-semibold tabular-nums text-slate-900", isRefreshing && "opacity-40")}>{t.count.toLocaleString()}</p>
                  <p className="truncate text-[11px] text-slate-400">{on ? "Showing only these · click to clear" : t.hint}</p>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Filters */}
      <Card className="overflow-hidden rounded-xl border-indigo-100 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
              <SlidersHorizontal className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                Filters
                {activeFilterCount > 0 ? <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">{activeFilterCount} active</span> : null}
              </p>
              <p className="truncate text-xs text-slate-500">Filters apply to the cards, insights and table</p>
            </div>
          </div>
          {isRefreshing ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700">
              <Loader2 className="h-3 w-3 animate-spin" />
              Updating…
            </span>
          ) : null}
          {activeFilterCount > 0 ? (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-8 border-rose-200 bg-rose-50 text-rose-700 shadow-sm hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800"
              onClick={clearFilters}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Clear filters
            </Button>
          ) : null}
        </div>
        <div className="space-y-4 border-t border-indigo-100 bg-gradient-to-b from-indigo-50/80 to-indigo-50/30 px-4 py-4 sm:px-5">
          {active.dates ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cn("mr-1", filterLabel)}>Period</span>
              {(
                [
                  { id: "today", label: "Today" },
                  { id: "7d", label: "Last 7 days" },
                  { id: "30d", label: "Last 30 days" },
                  { id: "month", label: "This month" },
                  { id: "all", label: "All time" },
                  { id: "custom", label: "Custom" },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    preset === p.id ? "border-indigo-600 bg-indigo-600 text-white shadow-sm" : "border-indigo-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          ) : null}
          <div className={cn("grid grid-cols-1 gap-x-3 gap-y-4 md:grid-cols-2 xl:grid-cols-4", active.dates && "border-t border-dashed border-indigo-200 pt-4")}>
            <div className="space-y-1.5 md:col-span-2 xl:col-span-1">
              <Label className={filterLabel}>Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={active.search} className={cn(filterControl, "pl-9")} />
                {searchInput ? (
                  <button type="button" onClick={() => setSearchInput("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700" aria-label="Clear search">
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className={filterLabel}>Branch</Label>
              <Select value={filterBranch} onValueChange={setFilterBranch}>
                <SelectTrigger className={filterControl}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {branches.map((x) => (
                    <SelectItem key={x.id} value={x.id}>
                      {x.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className={filterLabel}>Category</Label>
              <ReportItemCombobox
                value={filterCategory}
                onChange={setFilterCategory}
                items={categories.filter((c) => (c.name || "").toLowerCase() !== "unknown").map((c) => ({ id: c.id, name: c.name, sku: null }))}
                placeholder="All categories"
                allLabel="All categories"
                searchPlaceholder="Search categories…"
                emptyText="No categories found"
                className={filterControl}
              />
            </div>
            {active.supplier ? (
              <div className="space-y-1.5">
                <Label className={filterLabel}>Supplier</Label>
                <ReportItemCombobox
                  value={filterSupplier}
                  onChange={setFilterSupplier}
                  items={suppliers.map((x) => ({ id: x.id, name: x.name, sku: null }))}
                  placeholder="All suppliers"
                  allLabel="All suppliers"
                  searchPlaceholder="Search suppliers…"
                  emptyText="No suppliers found"
                  className={filterControl}
                />
              </div>
            ) : null}
            {active.dates
              ? (
                  [
                    { label: "From", value: filterStart, set: setFilterStart },
                    { label: "To", value: filterEnd, set: setFilterEnd },
                  ] as const
                ).map((f) => (
                  <div key={f.label} className="space-y-1.5">
                    <Label className={filterLabel}>{f.label}</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn(filterControl, "w-full justify-start text-left font-normal")}>
                          <CalendarIcon className="mr-2 h-4 w-4 text-slate-500" />
                          {f.value ? format(f.value, "dd MMM yyyy") : <span className="text-slate-400">Any date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={f.value}
                          onSelect={(d) => {
                            f.set(d);
                            setPreset("custom");
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                ))
              : null}
            {reportType === "stockout" ? (
              <div className="space-y-1.5">
                <Label className={filterLabel}>Reason</Label>
                <Select value={chip} onValueChange={setChip}>
                  <SelectTrigger className={filterControl}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All reasons</SelectItem>
                    <SelectItem value="shrinkage">Shrinkage only (no sales)</SelectItem>
                    <SelectItem value="SALE">Sales</SelectItem>
                    <SelectItem value="DAMAGE">Damage</SelectItem>
                    <SelectItem value="LOSS">Loss</SelectItem>
                    <SelectItem value="EXPIRED">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {reportType === "aging" ? (
              <div className="space-y-1.5">
                <Label className={filterLabel}>Age</Label>
                <Select value={chip} onValueChange={setChip}>
                  <SelectTrigger className={filterControl}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any age</SelectItem>
                    <SelectItem value="never">Never sold</SelectItem>
                    {["0-30", "31-60", "61-90", "91-180", "180+"].map((k) => (
                      <SelectItem key={k} value={k}>
                        {k} days
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      {loadError && !ready ? (
        <Card className="flex flex-col items-center gap-3 rounded-xl border-rose-200 bg-rose-50/50 p-8 text-center shadow-sm">
          <AlertTriangle className="h-6 w-6 text-rose-500" />
          <p className="text-sm font-medium text-rose-800">{loadError}</p>
          <Button variant="outline" size="sm" onClick={fetchReport}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Try again
          </Button>
        </Card>
      ) : null}

      {/* Insights */}
      {!isFirstLoad && ready ? <Insights type={reportType} breakdown={b} summary={s} /> : null}

      {/* Table */}
      <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <active.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-slate-900">{active.label}</h2>
              <p className="truncate text-xs text-slate-500">
                {pagination.total.toLocaleString()} {pagination.total === 1 ? "row" : "rows"}
                {report?.viewTotals && ready
                  ? ` · ${formatQty(report.viewTotals.qty || 0)} pieces · ${rs(report.viewTotals.value ?? report.viewTotals.cost ?? 0)}`
                  : ""}
                {reportType !== "movement_summary" ? " · click a row for details" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-slate-400" />
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="h-9 w-[180px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {active.sorts.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="relative">
          {isRefreshing ? <div className="absolute inset-0 z-10 bg-white/50" aria-hidden /> : null}
          {isFirstLoad ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <Package className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-slate-700">
                {reportType === "lowstock" && activeFilterCount === 0 ? "Everything is above its minimum level" : "No records for these filters"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {activeFilterCount > 0 ? "Try clearing filters or widening the period." : reportType === "lowstock" ? "Set a minimum quantity on products to get alerts here." : "Nothing has been recorded yet."}
              </p>
              {activeFilterCount > 0 ? (
                <Button variant="outline" size="sm" className="mt-4 border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" onClick={clearFilters}>
                  <X className="mr-1 h-3.5 w-3.5" />
                  Clear filters
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {visibleColumns.map((c, i) => (
                      <th
                        key={c.key}
                        className={cn(
                          "whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500",
                          c.align === "right" ? "text-right" : "text-left",
                          i === 0 && "pl-5",
                          i === visibleColumns.length - 1 && "pr-5",
                        )}
                      >
                        {c.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r, idx) => (
                    <tr
                      key={r.id || idx}
                      className={cn(reportType !== "movement_summary" && "cursor-pointer", "hover:bg-slate-50/70")}
                      onClick={() => reportType !== "movement_summary" && setDetail(r)}
                    >
                      {visibleColumns.map((c, i) => (
                        <td
                          key={c.key}
                          className={cn("px-4 py-3 align-middle", c.align === "right" && "text-right", i === 0 && "max-w-[280px] pl-5", i === visibleColumns.length - 1 && "pr-5")}
                        >
                          {c.render(r)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {ready && pagination.total > 0 ? (
          <Pager
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            pageSize={pageSize}
            onPage={setPage}
            onPageSize={setPageSize}
            disabled={loading}
          />
        ) : null}
      </Card>

      <DetailSheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)} size="lg">
        {detail ? <RowDetail type={reportType} row={detail} /> : null}
        <DetailSheetFooter>
          <Button variant="outline" onClick={() => setDetail(null)}>
            Close
          </Button>
        </DetailSheetFooter>
      </DetailSheet>
    </div>
  );
}

// ---------------------------------------------------------------- insights

function Panel({ icon, title, description, children, className }: { icon: ReactNode; title: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("overflow-hidden rounded-xl border-slate-200 shadow-sm", className)}>
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">{icon}</span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {description ? <p className="truncate text-xs text-slate-500">{description}</p> : null}
        </div>
      </div>
      {children}
    </Card>
  );
}

function BarList({
  items,
  metric = "value",
  bar = "bg-indigo-500",
  sub,
  empty = "Nothing to show",
}: {
  items: Group[];
  metric?: "value" | "units" | "count";
  bar?: string;
  sub?: (g: Group) => string;
  empty?: string;
}) {
  if (!items?.length) return <p className="px-5 py-10 text-center text-sm text-slate-400">{empty}</p>;
  const max = Math.max(1, ...items.map((g) => Math.abs(g[metric])));
  const total = items.reduce((a, g) => a + Math.abs(g[metric]), 0) || 1;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((g) => (
        <li key={g.id} className="px-5 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-medium text-slate-800">{g.name}</p>
            <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{metric === "value" ? rs(g.value) : formatQty(g[metric])}</p>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className={cn("h-full rounded-full", bar)} style={{ width: `${Math.max(2, (Math.abs(g[metric]) / max) * 100)}%` }} />
            </div>
            <span className="w-10 text-right text-[11px] tabular-nums text-slate-400">{Math.round((Math.abs(g[metric]) / total) * 100)}%</span>
          </div>
          {sub ? <p className="mt-0.5 truncate text-[11px] text-slate-500">{sub(g)}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function TrendChart({ data, bars }: { data: any[]; bars: { key: string; name: string; color: string }[] }) {
  if (!data?.length) return <p className="px-5 py-16 text-center text-sm text-slate-400">No activity in this period</p>;
  return (
    <div className="h-[240px] p-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={11} tick={{ fill: "#64748b" }} interval="preserveStartEnd" />
          <YAxis axisLine={false} tickLine={false} fontSize={11} tick={{ fill: "#64748b" }} width={44} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
          <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} formatter={(v: number, n: string) => [formatMoney(v), n]} />
          {bars.length > 1 ? <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} /> : null}
          {bars.map((x) => (
            <Bar key={x.key} dataKey={x.key} name={x.name} fill={x.color} radius={[4, 4, 0, 0]} maxBarSize={22} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const dayLabel = (ymd: string) => format(new Date(`${ymd}T00:00:00`), "dd MMM");

function Insights({ type, breakdown, summary }: { type: ReportType; breakdown: Record<string, any>; summary: Record<string, any> }) {
  const grid = "grid gap-4 md:gap-6 xl:grid-cols-2";
  switch (type) {
    case "valuation":
      return (
        <div className={grid}>
          <Panel icon={<MapPin className="h-4 w-4" />} title="Value by branch" description="Stock at cost · retail value below">
            <BarList items={breakdown.byBranch} bar="bg-blue-500" sub={(g) => `${formatQty(g.units)} pcs · retail ${rs(g.extra)}`} empty="No stock on hand" />
          </Panel>
          <Panel icon={<Layers className="h-4 w-4" />} title="Value by category" description="Where your money is sitting">
            <BarList items={(breakdown.byCategory || []).slice(0, 8)} bar="bg-violet-500" sub={(g) => `${formatQty(g.units)} pcs · ${g.count} stock rows`} empty="No stock on hand" />
          </Panel>
        </div>
      );
    case "purchase":
      return (
        <div className="space-y-4 md:space-y-6">
          <Panel icon={<TrendingUp className="h-4 w-4" />} title="Spend over time" description="Purchase value per day">
            <TrendChart data={(breakdown.trend || []).map((g: Group) => ({ label: dayLabel(g.id), value: g.value }))} bars={[{ key: "value", name: "Spend", color: "#3b82f6" }]} />
          </Panel>
          <div className="grid gap-4 md:gap-6 xl:grid-cols-3">
            <Panel icon={<Users className="h-4 w-4" />} title="Top suppliers" description="By amount bought">
              <BarList items={breakdown.bySupplier} bar="bg-blue-500" sub={(g) => `${g.count} lines · ${formatQty(g.units)} pcs`} />
            </Panel>
            <Panel icon={<Package className="h-4 w-4" />} title="Top products" description="By amount bought">
              <BarList items={breakdown.byProduct} bar="bg-emerald-500" sub={(g) => `${formatQty(g.units)} pcs`} />
            </Panel>
            <Panel icon={<Layers className="h-4 w-4" />} title="By category" description="Spend per category">
              <BarList items={breakdown.byCategory} bar="bg-violet-500" sub={(g) => `${formatQty(g.units)} pcs`} />
            </Panel>
          </div>
        </div>
      );
    case "transfer":
      return (
        <div className={grid}>
          <Panel icon={<ArrowRightLeft className="h-4 w-4" />} title="Busiest routes" description="Pieces moved per route">
            <BarList items={breakdown.byRoute} metric="units" bar="bg-blue-500" sub={(g) => `${g.count} transfers · ${rs(g.value)}`} empty="No transfers" />
          </Panel>
          <Panel icon={<Package className="h-4 w-4" />} title="Most transferred products" description="Pieces moved">
            <BarList items={breakdown.byProduct} metric="units" bar="bg-violet-500" sub={(g) => `${g.count} transfers · ${rs(g.value)}`} empty="No transfers" />
          </Panel>
        </div>
      );
    case "stockout":
      return (
        <div className="space-y-4 md:space-y-6">
          <Panel icon={<TrendingDown className="h-4 w-4" />} title="Outflow over time" description="Pieces out per day — sales vs shrinkage">
            <TrendChart
              data={(breakdown.trend || []).map((g: Group) => ({ label: dayLabel(g.id), sold: Math.max(0, g.units - (g.extra || 0)), shrink: g.extra || 0 }))}
              bars={[
                { key: "sold", name: "Sold", color: "#3b82f6" },
                { key: "shrink", name: "Damaged / lost / expired", color: "#f43f5e" },
              ]}
            />
          </Panel>
          <div className={grid}>
            <Panel icon={<PackageX className="h-4 w-4" />} title="Biggest shrinkage" description="Products losing the most value to damage, loss or expiry">
              <BarList items={breakdown.topShrinkage} bar="bg-rose-500" sub={(g) => `${formatQty(g.units)} pcs · ${g.count} events`} empty="No damage, loss or expiry — great" />
            </Panel>
            <Panel icon={<MapPin className="h-4 w-4" />} title="Outflow by branch" description="Pieces out per branch">
              <BarList items={breakdown.byBranch} metric="units" bar="bg-blue-500" sub={(g) => `${g.count} events · ${rs(g.value)} at cost`} />
            </Panel>
          </div>
        </div>
      );
    case "lowstock":
      return (
        <div className={grid}>
          <Panel icon={<ShoppingCart className="h-4 w-4" />} title="Reorder by supplier" description="Suggested purchase per supplier, at cost">
            <BarList items={breakdown.bySupplier} bar="bg-indigo-500" sub={(g) => `${g.count} items · ${formatQty(g.units)} pcs to order`} empty="Nothing to reorder" />
          </Panel>
          <Panel icon={<MapPin className="h-4 w-4" />} title="Alerts by branch" description="Items below minimum per branch">
            <BarList items={breakdown.byBranch} metric="count" bar="bg-amber-500" sub={(g) => `${formatQty(g.units)} pcs to order · ${rs(g.value)}`} empty="No alerts" />
          </Panel>
        </div>
      );
    case "aging":
      return (
        <Panel icon={<Clock className="h-4 w-4" />} title="Stock value by age" description="Days since each item last sold (or arrived, if never sold)">
          <div className="grid grid-cols-1 gap-0 sm:grid-cols-5 sm:divide-x sm:divide-slate-100">
            {(breakdown.buckets || []).map((g: Group) => {
              const share = summary.totalValue ? (g.value / summary.totalValue) * 100 : 0;
              const color = g.id === "0-30" ? "bg-emerald-500" : g.id === "31-60" || g.id === "61-90" ? "bg-amber-500" : "bg-rose-500";
              return (
                <div key={g.id} className="p-4">
                  <p className="text-xs font-medium text-slate-500">{g.name}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{rs(g.value)}</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.max(2, share)}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {g.count} items · {formatQty(g.units)} pcs · {share.toFixed(0)}%
                  </p>
                </div>
              );
            })}
          </div>
        </Panel>
      );
    default:
      return (
        <div className="space-y-4 md:space-y-6">
          <Panel icon={<History className="h-4 w-4" />} title="Stock in vs out" description="Pieces per day">
            <TrendChart
              data={(breakdown.trend || []).map((d: any) => ({ label: dayLabel(d.date), in: d.in, out: d.out }))}
              bars={[
                { key: "in", name: "In", color: "#10b981" },
                { key: "out", name: "Out", color: "#f43f5e" },
              ]}
            />
          </Panel>
          <div className={grid}>
            <Panel icon={<MapPin className="h-4 w-4" />} title="By branch" description="Pieces in and out per branch">
              {(breakdown.byBranch || []).length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-slate-400">No movements</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {(breakdown.byBranch || []).map((x: any) => (
                    <li key={x.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">{x.name}</p>
                        <p className="text-[11px] text-slate-500">{x.count.toLocaleString()} movements</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-sm tabular-nums">
                        <span className="text-emerald-700">+{formatQty(x.in)}</span>
                        <span className="text-rose-700">−{formatQty(x.out)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel icon={<Package className="h-4 w-4" />} title="Most active products" description="Pieces moved (in + out)">
              <BarList items={breakdown.topProducts} metric="units" bar="bg-indigo-500" sub={(g) => `${g.count} movements · ${rs(g.value)}`} empty="No movements" />
            </Panel>
          </div>
        </div>
      );
  }
}

// ---------------------------------------------------------------- row detail

function RowDetail({ type, row: r }: { type: ReportType; row: Row }) {
  let title: ReactNode = r.name;
  let subtitle: ReactNode = [r.sku, r.category].filter(Boolean).join(" · ");
  let badge: ReactNode = null;
  let kpis: { label: string; value: string; tone?: string }[] = [];
  let facts: [string, ReactNode][] = [];
  let note: ReactNode = null;

  switch (type) {
    case "valuation":
      badge = <Pill value={r.status} />;
      kpis = [
        { label: "Pieces", value: formatQty(r.qty) },
        { label: "Value at cost", value: rs(r.costValue) },
        { label: "Value at retail", value: rs(r.retailValue) },
        { label: "Unit cost", value: rs(r.unitCost) },
        { label: "Sale price", value: rs(r.unitPrice) },
        { label: "Potential profit", value: rs(r.potentialProfit), tone: r.potentialProfit < 0 ? "text-rose-700" : "text-emerald-700" },
      ];
      facts = [
        ["Branch", r.branch],
        ["Supplier", r.supplier || "—"],
        ["Minimum level", r.minQty ? formatQty(r.minQty) : "Not set"],
        ["Margin", pct(r.margin)],
        ["Last stock change", fmtDateTime(r.lastUpdated)],
      ];
      if (r.status === "negative") note = "Stock is below zero — usually a missed stock-in or a sale before receiving. Do a stock count to correct it.";
      else if (r.status === "low" || r.status === "out") note = "This item is at or below its minimum level. Check the Low stock tab for a suggested reorder.";
      break;
    case "purchase":
      badge = <Pill value={r.deliveryStatus} />;
      kpis = [
        { label: "Pieces", value: formatQty(r.qty) },
        { label: "Unit cost", value: rs(r.unitCost) },
        { label: "Line total", value: rs(r.lineTotal) },
        { label: "Sale price", value: rs(r.salePrice) },
        { label: "Expected margin", value: pct(r.expectedMargin), tone: r.expectedMargin < 10 ? "text-rose-700" : "text-emerald-700" },
        { label: "Expected profit", value: rs((r.salePrice - r.unitCost) * r.qty) },
      ];
      facts = [
        ["Date", fmtDateTime(r.date)],
        ["Supplier", r.supplier],
        ["Invoice / bill", r.invoiceRef || "—"],
        ["Received at", r.branch],
        ["Entered by", r.createdBy || "—"],
        ["Notes", r.notes || "—"],
      ];
      break;
    case "transfer":
      title = r.name;
      subtitle = r.reference ? `Ref ${r.reference}` : r.sku;
      badge = <Pill value={r.status} />;
      kpis = [
        { label: "Pieces", value: formatQty(r.qty) },
        { label: "Value at cost", value: rs(r.value) },
        { label: r.leadDays != null ? "Delivery time" : "Open for", value: r.leadDays != null ? `${r.leadDays} days` : `${r.ageDays} days`, tone: r.leadDays == null && r.ageDays > 3 && r.status !== "CANCELLED" && r.status !== "RECEIVED" ? "text-rose-700" : undefined },
      ];
      facts = [
        ["From", r.from],
        ["To", r.to],
        ["Sent on", fmtDateTime(r.date)],
        ["Received on", r.receivedAt ? fmtDateTime(r.receivedAt) : "—"],
        ["Reason", r.reason || "—"],
        ["Carrier", r.carrier || "—"],
        ["Receiver", r.receiver || "—"],
        ["Created by", r.createdBy || "—"],
        ["Notes", r.notes || "—"],
      ];
      break;
    case "stockout":
      badge = <Pill value={r.type} />;
      kpis = [
        { label: "Pieces out", value: formatQty(r.qty), tone: "text-rose-700" },
        { label: "Unit cost", value: rs(r.unitCost) },
        { label: "Cost value", value: rs(r.costValue) },
        { label: "Stock before", value: formatQty(r.before) },
        { label: "Stock after", value: formatQty(r.after) },
      ];
      facts = [
        ["Date", fmtDateTime(r.date)],
        ["Branch", r.branch],
        ["Reference", r.reference || "—"],
        ["Recorded by", r.createdBy || "—"],
        ["Notes", r.notes || "—"],
      ];
      break;
    case "lowstock":
      badge = <Pill value={r.status} />;
      kpis = [
        { label: "In stock", value: formatQty(r.qty), tone: r.qty <= 0 ? "text-rose-700" : undefined },
        { label: "Minimum", value: formatQty(r.minQty) },
        { label: "Shortfall", value: formatQty(r.shortfall) },
        { label: "Sold (30 days)", value: formatQty(r.sold30) },
        { label: "Per day", value: formatQty(r.perDay) },
        { label: "Lasts", value: r.qty <= 0 ? "Empty" : r.daysLeft != null ? `${r.daysLeft} days` : "No recent sales" },
      ];
      facts = [
        ["Branch", r.branch],
        ["Supplier", r.supplier],
        ["Unit cost", rs(r.unitCost)],
      ];
      note = (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-800">Suggested reorder</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-indigo-900">
            {formatQty(r.reorderQty)} pcs <span className="text-base font-medium text-indigo-700">· {rs(r.reorderCost)}</span>
          </p>
          <p className="mt-1 text-xs text-indigo-800/80">Tops up to the maximum level if set, otherwise to twice the minimum or one month of sales — whichever is more.</p>
        </div>
      );
      break;
    case "aging":
      badge = agePill(r.daysIdle);
      kpis = [
        { label: "Pieces", value: formatQty(r.qty) },
        { label: "Value at cost", value: rs(r.value) },
        { label: "Value at retail", value: rs(r.retailValue) },
        { label: "Idle for", value: `${r.daysIdle} days`, tone: r.daysIdle > 90 ? "text-rose-700" : undefined },
      ];
      facts = [
        ["Branch", r.branch],
        ["Last sold", r.neverSold ? "Never" : fmtDateTime(r.lastSale)],
        ["Last received", fmtDateTime(r.lastIn)],
        ["Last movement", fmtDateTime(r.lastMovement)],
      ];
      if (r.daysIdle > 90)
        note = "This stock hasn't sold in over 90 days. Consider a discount, moving it to a busier branch, or returning it to the supplier.";
      break;
    default:
      break;
  }

  return (
    <>
      <DetailSheetHeader title={title} subtitle={subtitle || undefined} />
      <DetailSheetBody>
        <div className="space-y-5">
          {badge ? <div>{badge}</div> : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{k.label}</p>
                <p className={cn("mt-0.5 text-base font-semibold tabular-nums text-slate-900", k.tone)}>{k.value}</p>
              </div>
            ))}
          </div>
          {note ? typeof note === "string" ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{note}</p> : note : null}
          <dl className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {facts.map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm">
                <dt className="shrink-0 text-slate-500">{label}</dt>
                <dd className="min-w-0 break-words text-right font-medium text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </DetailSheetBody>
    </>
  );
}

// ---------------------------------------------------------------- pager

function Pager({
  page,
  totalPages,
  total,
  pageSize,
  onPage,
  onPageSize,
  disabled,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
  disabled?: boolean;
}) {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const pages: number[] = [];
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  for (let p = start; p <= Math.min(totalPages, start + 4); p++) pages.push(p);
  const btn = "h-8 min-w-8 px-2 text-xs";
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 sm:flex-row">
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span>
          Showing <span className="font-semibold text-slate-700">{from.toLocaleString()}</span>–<span className="font-semibold text-slate-700">{to.toLocaleString()}</span> of{" "}
          <span className="font-semibold text-slate-700">{total.toLocaleString()}</span>
        </span>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
          <SelectTrigger className="h-8 w-[110px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" className={btn} onClick={() => onPage(1)} disabled={disabled || page <= 1} aria-label="First page">
          <ChevronsLeft className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="sm" className={btn} onClick={() => onPage(page - 1)} disabled={disabled || page <= 1} aria-label="Previous page">
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        {pages.map((p) => (
          <Button
            key={p}
            variant={p === page ? "default" : "outline"}
            size="sm"
            className={cn(btn, p === page && "bg-slate-900 text-white hover:bg-slate-800")}
            onClick={() => onPage(p)}
            disabled={disabled}
          >
            {p}
          </Button>
        ))}
        <Button variant="outline" size="sm" className={btn} onClick={() => onPage(page + 1)} disabled={disabled || page >= totalPages} aria-label="Next page">
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="sm" className={btn} onClick={() => onPage(totalPages)} disabled={disabled || page >= totalPages} aria-label="Last page">
          <ChevronsRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

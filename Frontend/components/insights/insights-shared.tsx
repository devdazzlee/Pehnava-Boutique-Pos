"use client";

import { useMemo, useState, type ReactNode } from "react";
import { endOfQuarter, format, startOfMonth, startOfQuarter, startOfYear, subDays, subMonths, subQuarters } from "date-fns";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Inbox, Search } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import apiClient from "@/lib/apiClient";
import { cn } from "@/lib/utils";

/* ------------------------------ data ------------------------------ */

export const insightsGet = <T,>(path: string, params: Record<string, unknown>) =>
  apiClient
    .get(`/analytics/${path}`, { params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== "" && v !== "all")) })
    .then((r) => r.data.data as T);

export const errorText = (e: unknown) => {
  const err = e as { response?: { data?: { message?: string } }; message?: string };
  return err?.response?.data?.message || err?.message || "Could not load report";
};

export const rs = (v: number | null | undefined) => (v == null ? "—" : `Rs ${Math.round(Number(v)).toLocaleString("en-PK")}`);
export const qty = (v: number | null | undefined) => (v == null ? "—" : Number(v).toLocaleString("en-PK", { maximumFractionDigits: 2 }));
export const pct = (v: number | null | undefined) => (v == null ? "—" : `${Number(v).toFixed(1)}%`);
export const day = (v: string | Date | null | undefined) => (v ? format(new Date(v), "dd MMM yyyy") : "—");

/* ------------------------------ periods ------------------------------ */

export type Period = { from: string; to: string; preset: string };
const ymd = (d: Date) => format(d, "yyyy-MM-dd");

/** Includes the fortnightly and quarterly periods asked for in the scope. */
export const PERIOD_PRESETS: { id: string; label: string; make: () => { from: string; to: string } }[] = [
  { id: "today", label: "Today", make: () => ({ from: ymd(new Date()), to: ymd(new Date()) }) },
  { id: "7d", label: "7 days", make: () => ({ from: ymd(subDays(new Date(), 6)), to: ymd(new Date()) }) },
  {
    id: "fortnight",
    label: "This fortnight",
    make: () => {
      const now = new Date();
      const first = now.getDate() <= 15;
      const start = new Date(now.getFullYear(), now.getMonth(), first ? 1 : 16);
      return { from: ymd(start), to: ymd(now) };
    },
  },
  {
    id: "lastFortnight",
    label: "Last fortnight",
    make: () => {
      const now = new Date();
      if (now.getDate() > 15) return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(new Date(now.getFullYear(), now.getMonth(), 15)) };
      const prev = subMonths(now, 1);
      return { from: ymd(new Date(prev.getFullYear(), prev.getMonth(), 16)), to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)) };
    },
  },
  { id: "month", label: "This month", make: () => ({ from: ymd(startOfMonth(new Date())), to: ymd(new Date()) }) },
  { id: "30d", label: "30 days", make: () => ({ from: ymd(subDays(new Date(), 29)), to: ymd(new Date()) }) },
  { id: "quarter", label: "This quarter", make: () => ({ from: ymd(startOfQuarter(new Date())), to: ymd(new Date()) }) },
  {
    id: "lastQuarter",
    label: "Last quarter",
    make: () => {
      const q = subQuarters(new Date(), 1);
      return { from: ymd(startOfQuarter(q)), to: ymd(endOfQuarter(q)) };
    },
  },
  { id: "year", label: "This year", make: () => ({ from: ymd(startOfYear(new Date())), to: ymd(new Date()) }) },
];

export const defaultPeriod = (id = "30d"): Period => ({ ...PERIOD_PRESETS.find((p) => p.id === id)!.make(), preset: id });

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={value.preset}
        onValueChange={(id) => {
          if (id === "custom") return onChange({ ...value, preset: "custom" });
          onChange({ ...PERIOD_PRESETS.find((p) => p.id === id)!.make(), preset: id });
        }}
      >
        <SelectTrigger className="h-9 w-40 bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIOD_PRESETS.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.label}
            </SelectItem>
          ))}
          <SelectItem value="custom">Custom dates</SelectItem>
        </SelectContent>
      </Select>
      <Input type="date" value={value.from} max={value.to} onChange={(e) => onChange({ ...value, from: e.target.value, preset: "custom" })} className="h-9 w-[150px] bg-white" />
      <span className="text-sm text-stone-400">to</span>
      <Input type="date" value={value.to} min={value.from} onChange={(e) => onChange({ ...value, to: e.target.value, preset: "custom" })} className="h-9 w-[150px] bg-white" />
    </div>
  );
}

/* ------------------------------ layout bits ------------------------------ */

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white p-3">{children}</div>;
}

export function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" | "dark" }) {
  return (
    <div className={cn("min-w-0 rounded-xl border p-3.5", tone === "dark" ? "border-[#2a2012] bg-[#2a2012] text-white" : "border-stone-200 bg-white")}>
      <div className={cn("truncate text-xs", tone === "dark" ? "text-stone-300" : "text-stone-500")}>{label}</div>
      <div className={cn("mt-1 text-xl font-semibold tabular-nums", tone === "good" && "text-emerald-700", tone === "bad" && "text-rose-700")}>{value}</div>
      {hint && <div className={cn("mt-0.5 truncate text-xs", tone === "dark" ? "text-stone-400" : "text-stone-500")}>{hint}</div>}
    </div>
  );
}

export function KpiRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{children}</div>;
}

export function Card({ title, subtitle, action, children, className }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-stone-200 bg-white", className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-4 py-3">
          <div>
            {title && <h3 className="text-sm font-semibold text-stone-800">{title}</h3>}
            {subtitle && <p className="text-xs text-stone-500">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Chips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string; count?: number }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            value === o.id ? "border-[#2a2012] bg-[#2a2012] text-white" : "border-stone-200 bg-white text-stone-600 hover:border-[#a67c2e] hover:text-[#a67c2e]",
          )}
        >
          {o.label}
          {o.count != null && <span className="ml-1 opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Loading() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[84px] animate-pulse rounded-xl bg-stone-200/60" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl bg-stone-200/50" />
    </div>
  );
}

export function Empty({ text = "No data for this period." }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center text-sm text-stone-500">
      <Inbox className="mb-2 h-8 w-8 text-stone-300" />
      {text}
    </div>
  );
}

/** Horizontal share bars — label, bar, value. */
export function ShareBars({ rows, max = 10 }: { rows: { label: string; value: number; hint?: string }[]; max?: number }) {
  const top = rows.slice(0, max);
  const peak = Math.max(1, ...top.map((r) => Math.abs(r.value)));
  if (!top.length) return <Empty />;
  return (
    <ul className="space-y-2.5">
      {top.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate text-stone-700" title={r.label}>
              {r.label}
            </span>
            <span className="shrink-0 tabular-nums text-stone-900">
              {rs(r.value)}
              {r.hint && <span className="ml-1.5 text-xs text-stone-500">{r.hint}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-stone-100">
            <div className="h-2 rounded-full bg-[#a67c2e]" style={{ width: `${Math.max(2, (Math.abs(r.value) / peak) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------ data table ------------------------------ */

export type Column<T> = {
  key: string;
  label: string;
  align?: "left" | "right";
  render?: (row: T) => ReactNode;
  value?: (row: T) => string | number | null | undefined;
  className?: string;
};

export function DataTable<T>({
  rows,
  columns,
  search,
  exportName,
  rowKey,
  pageSize = 25,
  footer,
  onRowClick,
}: {
  rows: T[];
  columns: Column<T>[];
  search?: (row: T) => string;
  exportName?: string;
  rowKey: (row: T) => string;
  pageSize?: number;
  footer?: ReactNode;
  onRowClick?: (row: T) => void;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [limit, setLimit] = useState(pageSize);

  const valueOf = (row: T, c: Column<T>) => (c.value ? c.value(row) : (row as Record<string, unknown>)[c.key]) as string | number | null | undefined;

  const view = useMemo(() => {
    let list = rows;
    if (q.trim() && search) {
      const needle = q.trim().toLowerCase();
      list = list.filter((r) => search(r).toLowerCase().includes(needle));
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        list = [...list].sort((a, b) => {
          const va = valueOf(a, col);
          const vb = valueOf(b, col);
          if (va == null) return 1;
          if (vb == null) return -1;
          return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))) * sort.dir;
        });
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, sort, columns]);

  const exportXlsx = () => {
    const data = view.map((r) => Object.fromEntries(columns.map((c) => [c.label, valueOf(r, c) ?? ""])));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `${exportName || "report"}-${format(new Date(), "yyyyMMdd")}.xlsx`);
  };

  return (
    <div>
      {(search || exportName) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {search ? (
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-9 pl-8" />
            </div>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2 text-xs text-stone-500">
            {view.length} rows
            {exportName && (
              <Button size="sm" variant="outline" onClick={exportXlsx} disabled={!view.length}>
                <Download className="mr-1.5 h-4 w-4" />
                Excel
              </Button>
            )}
          </div>
        </div>
      )}
      {view.length === 0 ? (
        <Empty text={q ? "No rows match your search." : undefined} />
      ) : (
        <div className="-mx-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-xs text-stone-500">
                {columns.map((c) => (
                  <th key={c.key} className={cn("whitespace-nowrap px-4 py-2 font-medium first:pl-4", c.align === "right" ? "text-right" : "text-left")}>
                    <button
                      className={cn("inline-flex items-center gap-1 hover:text-stone-900", c.align === "right" && "flex-row-reverse")}
                      onClick={() => setSort((s) => (s?.key === c.key ? (s.dir === -1 ? { key: c.key, dir: 1 } : null) : { key: c.key, dir: -1 }))}
                    >
                      {c.label}
                      {sort?.key === c.key ? sort.dir === -1 ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.slice(0, limit).map((r) => (
                <tr
                  key={rowKey(r)}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  className={cn("border-b border-stone-50 hover:bg-[#fcf8f2]", onRowClick && "cursor-pointer")}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-4 py-2.5 align-top", c.align === "right" && "text-right tabular-nums", c.className)}>
                      {c.render ? c.render(r) : String(valueOf(r, c) ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {footer && <tfoot className="border-t-2 border-stone-200 font-semibold">{footer}</tfoot>}
          </table>
        </div>
      )}
      {view.length > limit && (
        <div className="mt-3 text-center">
          <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + pageSize * 2)}>
            Show more ({view.length - limit} left)
          </Button>
        </div>
      )}
    </div>
  );
}

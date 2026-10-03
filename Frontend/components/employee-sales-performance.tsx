"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Banknote, Loader2, Package, Receipt, RotateCcw, TrendingUp, UserRound } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import apiClient from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { rangeForPreset, type DatePreset } from "@/lib/business-timezone";
import { YmdDatePicker } from "@/components/ui/date-picker";

type Preset = Extract<DatePreset, "today" | "thisWeek" | "thisMonth" | "lastMonth" | "thisYear" | "custom">;

interface PerformanceData {
  employee: { id: string; name: string; employee_code: string | null; user_id: string | null };
  period: { from: string; to: string };
  basis: { type: string; rate: number; fixed: number; label: string };
  summary: {
    bills: number;
    returns: number;
    pieces: number;
    grossSales: number;
    returnAmount: number;
    netSales: number;
    averageBill: number;
    commission: number;
  };
  daily: { date: string; sales: number; bills: number; pieces: number }[];
  topProducts: { product: string; sku: string | null; quantity: number; amount: number }[];
  sales: {
    id: string;
    date: string;
    voucher: string;
    isReturn: boolean;
    attribution: "SALESPERSON" | "ORIGINAL_SALE" | "CASHIER";
    customer: string;
    pieces: number;
    salesAmount: number;
  }[];
  records: { id: string; month: number; year: number; sales_amount: number; amount: number; is_paid: boolean; paid_date: string | null }[];
}

const PRESETS: { id: Exclude<Preset, "custom">; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "thisWeek", label: "This week" },
  { id: "thisMonth", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "thisYear", label: "This year" },
];

const rs = (v: number) => `Rs ${Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const compact = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)}k` : String(Math.round(v)));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const BAR = "#a67c2e";

/** Sales credited to one employee (as picked salesperson or via their POS login) and the commission earned. */
export function EmployeeSalesPerformance({ employeeId }: { employeeId: string }) {
  const initial = rangeForPreset("thisMonth");
  const [preset, setPreset] = useState<Preset>("thisMonth");
  const [range, setRange] = useState(initial);
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReturns, setShowReturns] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    apiClient
      .get(`/commissions/performance/${employeeId}`, { params: range })
      .then((res) => alive && setData(res.data.data))
      .catch((e) => alive && setError(e?.response?.data?.message || e?.message || "Could not load sales"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [employeeId, range]);

  const sales = useMemo(() => (data?.sales ?? []).filter((s) => showReturns || !s.isReturn), [data, showReturns]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex h-9 items-stretch rounded-lg bg-muted p-0.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setPreset(p.id);
                setRange(rangeForPreset(p.id));
              }}
              className={cn(
                "rounded-md px-2.5 text-xs font-medium transition-all",
                preset === p.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex h-9 items-center gap-1.5">
          <YmdDatePicker
            value={range.from}
            onChange={(v) => {
              setPreset("custom");
              setRange((r) => ({ ...r, from: v }));
            }}
            className="h-9 w-[140px] text-xs"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <YmdDatePicker
            value={range.to}
            onChange={(v) => {
              setPreset("custom");
              setRange((r) => ({ ...r, to: v }));
            }}
            className="h-9 w-[140px] text-xs"
          />
        </div>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : !data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#a67c2e]/25 bg-[#fcf8f2] px-3 py-2 text-xs">
            <Banknote className="h-4 w-4 text-[#a67c2e]" />
            <span className="text-muted-foreground">Commission basis</span>
            <span className="font-semibold text-foreground">{data.basis.label}</span>
            {!data.employee.user_id ? (
              <span className="text-muted-foreground">· credited only on bills where this employee is picked as salesperson</span>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi icon={TrendingUp} label="Net sales" value={rs(data.summary.netSales)} hint={data.summary.returnAmount ? `${rs(data.summary.grossSales)} − ${rs(data.summary.returnAmount)} returns` : "No returns"} />
            <Kpi icon={Receipt} label="Bills" value={String(data.summary.bills)} hint={`Avg bill ${rs(data.summary.averageBill)}`} />
            <Kpi icon={Package} label="Pieces sold" value={data.summary.pieces.toLocaleString()} hint={`${data.summary.returns} return(s)`} />
            <Kpi icon={Banknote} label="Commission earned" value={rs(data.summary.commission)} hint={data.basis.label} highlight />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="rounded-lg border border-border p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sales by day</p>
              {data.daily.length === 0 ? (
                <p className="py-10 text-center text-xs text-muted-foreground">No sales in this period.</p>
              ) : (
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.daily} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="#f0ede6" />
                      <XAxis dataKey="date" tickFormatter={(d) => format(parseISO(d), "dd MMM")} tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} minTickGap={12} />
                      <YAxis tickFormatter={compact} tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} width={40} allowDecimals={false} tickCount={4} />
                      <Tooltip
                        cursor={{ fill: "rgba(166,124,46,0.08)" }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload as PerformanceData["daily"][number];
                          return (
                            <div className="rounded-md border bg-white p-2 text-xs shadow-md">
                              <p className="font-semibold">{format(parseISO(d.date), "EEE, dd MMM")}</p>
                              <p>{rs(d.sales)} · {d.bills} bill(s) · {d.pieces} pcs</p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="sales" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top products</p>
              {data.topProducts.length === 0 ? (
                <p className="py-10 text-center text-xs text-muted-foreground">—</p>
              ) : (
                <ol className="space-y-2">
                  {data.topProducts.slice(0, 6).map((p, i) => (
                    <li key={p.product} className="flex items-center gap-2 text-sm">
                      <span className="w-4 text-[11px] text-muted-foreground">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{p.product}</span>
                      <span className="text-[11px] text-muted-foreground">{p.quantity} pcs</span>
                      <span className="w-24 text-right font-medium tabular-nums">{rs(p.amount)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bills credited · {sales.length}</p>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={showReturns} onChange={(e) => setShowReturns(e.target.checked)} className="accent-[#2a2012]" />
                Include returns
              </label>
            </div>
            {sales.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground">No bills credited to this employee in this period.</p>
            ) : (
              <div className="max-h-80 divide-y divide-border overflow-y-auto">
                {sales.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{format(new Date(s.date), "dd MMM, HH:mm")}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{s.voucher}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {s.customer} · {s.pieces} pcs
                      </span>
                    </span>
                    {s.isReturn ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-700">
                        <RotateCcw className="h-3 w-3" />Return
                      </span>
                    ) : s.attribution === "SALESPERSON" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#fcf8f2] px-2 py-0.5 text-[10px] font-medium text-[#8a6520] ring-1 ring-[#a67c2e]/20">
                        <UserRound className="h-3 w-3" />Salesperson
                      </span>
                    ) : (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">As cashier</span>
                    )}
                    <span className={cn("w-24 shrink-0 text-right font-semibold tabular-nums", s.salesAmount < 0 && "text-orange-700")}>{rs(s.salesAmount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {data.records.length ? (
            <div className="rounded-lg border border-border p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saved monthly commissions</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {data.records.slice(0, 8).map((r) => (
                  <div key={r.id} className="rounded-md border border-border px-2.5 py-2">
                    <p className="text-[11px] text-muted-foreground">{MONTHS[r.month - 1]} {r.year}</p>
                    <p className="text-sm font-semibold tabular-nums">{rs(r.amount)}</p>
                    <p className={cn("text-[10px] font-medium", r.is_paid ? "text-emerald-700" : "text-amber-700")}>{r.is_paid ? "Paid" : "Unpaid"}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn("rounded-lg border p-3", highlight ? "border-emerald-200 bg-emerald-50/60" : "border-border")}>
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className={cn("mt-1 text-base font-bold tabular-nums", highlight && "text-emerald-700")}>{value}</p>
      {hint ? <p className="truncate text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

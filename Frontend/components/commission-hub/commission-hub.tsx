"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BadgePercent,
  CalendarDays,
  CheckCircle2,
  Coins,
  Download,
  FileText,
  Loader2,
  MoreHorizontal,
  Package,
  Pencil,
  Printer,
  Receipt,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  TrendingUp,
  Trophy,
  Undo2,
  Users,
  Wallet,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { YmdDatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { businessTodayYmd, shiftBusinessYmd, startOfBusinessMonthYmd, startOfBusinessWeekYmd } from "@/lib/business-timezone";
import { escapeHtml, printDocument } from "@/components/accounts/coa-shared";
import { EmployeeSalesPerformance } from "@/components/employee-sales-performance";
import {
  apiError,
  basisText,
  commissionApi,
  commissionDue,
  commissionStatus,
  methodLabel,
  MONTHS,
  PAY_METHODS,
  rs,
  type CommissionRecord,
  type CommissionType,
  type EarnedReport,
  type PosUser,
  type RecordsMeta,
  type Salesperson,
} from "./commission-api";

type Tab = "earned" | "payouts" | "rules";
type RangeKey = "today" | "yesterday" | "week" | "month" | "lastMonth" | "custom";

const RANGES: { id: RangeKey; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "custom", label: "Custom" },
];

function rangeOf(k: RangeKey, custom: { from: string; to: string }) {
  const today = businessTodayYmd();
  if (k === "today") return { from: today, to: today };
  if (k === "yesterday") {
    const y = shiftBusinessYmd(today, -1);
    return { from: y, to: y };
  }
  if (k === "week") return { from: startOfBusinessWeekYmd(), to: today };
  if (k === "month") return { from: startOfBusinessMonthYmd(), to: today };
  if (k === "lastMonth") {
    const lastDayPrev = shiftBusinessYmd(startOfBusinessMonthYmd(), -1);
    return { from: `${lastDayPrev.slice(0, 7)}-01`, to: lastDayPrev };
  }
  return custom;
}

const day = (ymd: string) => format(new Date(`${ymd.slice(0, 10)}T12:00:00`), "dd MMM yyyy");
const dt = (iso?: string | null) => (iso ? format(new Date(iso), "dd MMM yyyy") : "—");
const pctChange = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : null);

function Kpi({ label, value, hint, icon: Icon, tone, trend }: { label: string; value: string; hint?: ReactNode; icon: typeof Wallet; tone?: "dark" | "good" | "bad"; trend?: number | null }) {
  return (
    <div className={cn("min-w-0 rounded-xl border p-3.5", tone === "dark" ? "border-[#2a2012] bg-[#2a2012] text-white" : tone === "good" ? "border-emerald-200 bg-emerald-50/60" : tone === "bad" ? "border-rose-200 bg-rose-50/60" : "border-gray-200 bg-white")}>
      <div className={cn("flex items-center gap-1.5 text-xs", tone === "dark" ? "text-stone-300" : "text-gray-500")}>
        <Icon className="h-3.5 w-3.5" />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={cn("truncate text-xl font-semibold tabular-nums", tone === "good" && "text-emerald-700", tone === "bad" && "text-rose-700")}>{value}</span>
        {trend != null && (
          <span className={cn("flex items-center text-[11px] font-medium", trend >= 0 ? (tone === "dark" ? "text-emerald-300" : "text-emerald-600") : tone === "dark" ? "text-rose-300" : "text-rose-600")}>
            {trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(trend).toFixed(0)}%
          </span>
        )}
      </div>
      {hint && <div className={cn("mt-0.5 truncate text-xs", tone === "dark" ? "text-stone-400" : "text-gray-500")}>{hint}</div>}
    </div>
  );
}

function Chips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string; count?: number }[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", value === o.id ? "bg-[#2a2012] text-white" : "bg-white text-gray-600 ring-1 ring-inset ring-gray-200 hover:ring-[#a67c2e]")}
        >
          {o.label}
          {o.count != null && <span className="ml-1 opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ====================================================================== */

export function CommissionHub() {
  const [tab, setTab] = useState<Tab>("earned");
  const [salespeople, setSalespeople] = useState<Salesperson[]>([]);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [payoutsKey, setPayoutsKey] = useState(0);

  const loadPeople = useCallback(() => {
    commissionApi.salespeople().then(setSalespeople).catch(() => setSalespeople([]));
  }, []);
  useEffect(() => loadPeople(), [loadPeople]);

  return (
    <div className="min-h-full bg-[#f8f6f2] p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#2a2012]">Commission</h1>
            <p className="text-sm text-gray-500">See what each salesperson earned today or any day, settle monthly payouts, and set everyone&apos;s commission rule.</p>
          </div>
          <Button className="bg-[#2a2012] hover:bg-[#3b2e1a]" onClick={() => setGenerateOpen(true)}>
            <Sparkles className="mr-1.5 h-4 w-4" />
            Create monthly payout
          </Button>
        </div>

        <div className="inline-flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1">
          {(
            [
              ["earned", "Earned (live)", TrendingUp],
              ["payouts", "Monthly payouts", Wallet],
              ["rules", "Commission rules", Settings2],
            ] as const
          ).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)} className={cn("flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium", tab === id ? "bg-[#2a2012] text-white" : "text-gray-600 hover:bg-gray-100")}>
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {tab === "earned" && <EarnedTab salespeople={salespeople} onRules={() => setTab("rules")} />}
        {tab === "payouts" && <PayoutsTab key={payoutsKey} salespeople={salespeople} onGenerate={() => setGenerateOpen(true)} />}
        {tab === "rules" && <RulesTab salespeople={salespeople} onSaved={loadPeople} />}
      </div>

      <GenerateDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        salespeople={salespeople}
        onDone={() => {
          setTab("payouts");
          setPayoutsKey((k) => k + 1);
        }}
      />
    </div>
  );
}

/* ====================================================================== */
/* Earned (live)                                                          */
/* ====================================================================== */

function EarnedTab({ salespeople, onRules }: { salespeople: Salesperson[]; onRules: () => void }) {
  const { toast } = useToast();
  const [range, setRange] = useState<RangeKey>("today");
  const [custom, setCustom] = useState({ from: startOfBusinessMonthYmd(), to: businessTodayYmd() });
  const [employee, setEmployee] = useState("all");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<EarnedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<{ id: string; name: string } | null>(null);
  const r = rangeOf(range, custom);

  useEffect(() => {
    if (range === "custom" && (!custom.from || !custom.to || custom.to < custom.from)) return;
    let live = true;
    setLoading(true);
    commissionApi
      .earned({ from: r.from, to: r.to, employee_id: employee === "all" ? undefined : employee })
      .then((d) => live && setData(d))
      .catch((e) => toast({ variant: "destructive", title: "Could not load commission", description: apiError(e) }))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [r.from, r.to, employee, range, custom, toast]);

  const rows = useMemo(() => (data?.rows ?? []).filter((x) => !search.trim() || `${x.employee} ${x.code ?? ""}`.toLowerCase().includes(search.trim().toLowerCase())), [data, search]);
  const label = r.from === r.to ? day(r.from) : `${day(r.from)} – ${day(r.to)}`;
  const prevLabel = data ? (data.previous.from === data.previous.to ? day(data.previous.from) : `${day(data.previous.from)} – ${day(data.previous.to)}`) : "";

  const exportXlsx = () => {
    if (!data) return;
    const ws = XLSX.utils.json_to_sheet(
      rows.map((x, i) => ({
        Rank: i + 1,
        Employee: x.employee,
        Code: x.code ?? "",
        Basis: x.basis,
        Bills: x.bills,
        Returns: x.returns,
        Pieces: x.pieces,
        "Net sales": x.salesAmount,
        "Avg bill": x.averageBill,
        Commission: x.commissionAmount,
        "Share %": x.share,
        "Previous period": x.previous,
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Commission");
    XLSX.writeFile(wb, `commission-${r.from}-to-${r.to}.xlsx`);
  };
  const print = () => {
    if (!data) return;
    const body = `<table><thead><tr><th>#</th><th>Employee</th><th>Basis</th><th class="r">Bills</th><th class="r">Pieces</th><th class="r">Net sales</th><th class="r">Commission</th></tr></thead><tbody>${rows
      .map(
        (x, i) =>
          `<tr><td>${i + 1}</td><td>${escapeHtml(x.employee)}</td><td>${escapeHtml(x.basis)}</td><td class="r">${x.bills}</td><td class="r">${x.pieces}</td><td class="r">${rs(x.salesAmount)}</td><td class="r"><b>${rs(x.commissionAmount)}</b></td></tr>`,
      )
      .join("")}<tr><td colspan="5"><b>Total</b></td><td class="r"><b>${rs(data.summary.sales)}</b></td><td class="r"><b>${rs(data.summary.commission)}</b></td></tr></tbody></table>`;
    printDocument("Commission earned", label, body);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
        <CalendarDays className="h-4 w-4 text-gray-400" />
        <Chips value={range} onChange={setRange} options={RANGES} />
        {range === "custom" && (
          <div className="flex items-center gap-2">
            <YmdDatePicker value={custom.from} onChange={(v) => setCustom((c) => ({ ...c, from: v }))} max={custom.to} />
            <span className="text-xs text-gray-400">to</span>
            <YmdDatePicker value={custom.to} onChange={(v) => setCustom((c) => ({ ...c, to: v }))} min={custom.from} max={businessTodayYmd()} />
          </div>
        )}
        <span className="text-xs font-medium text-gray-600">{label}</span>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={employee} onValueChange={setEmployee}>
            <SelectTrigger className="h-9 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All salespeople</SelectItem>
              {salespeople.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!data ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-200/60" />
          ))}
        </div>
      ) : (
        <div className={cn("space-y-4", loading && "opacity-60")}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi tone="dark" icon={Coins} label="Commission earned" value={rs(data.summary.commission)} trend={pctChange(data.summary.commission, data.previous.commission)} hint={`vs ${rs(data.previous.commission)} · ${prevLabel}`} />
            <Kpi icon={TrendingUp} label="Net sales by salespeople" value={rs(data.summary.sales)} trend={pctChange(data.summary.sales, data.previous.sales)} />
            <Kpi icon={Receipt} label="Bills" value={String(data.summary.bills)} hint={data.summary.returns ? `${data.summary.returns} returns` : "no returns"} />
            <Kpi icon={Package} label="Pieces sold (net)" value={data.summary.pieces.toLocaleString()} />
            <Kpi icon={BadgePercent} label="Commission on sales" value={`${data.summary.effectiveRate.toFixed(2)}%`} hint={`${data.summary.employees} earning`} />
          </div>

          {data.unattributed.bills > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <b>{rs(data.unattributed.amount)}</b> in {data.unattributed.bills} bill{data.unattributed.bills > 1 ? "s" : ""} earned no commission — no salesperson was picked and the cashier isn&apos;t linked to an employee.
                  <div className="text-xs text-amber-800">{data.unattributed.byUser.map((u) => `${u.user}: ${u.bills} bills (${rs(u.amount)})`).join(" · ")}</div>
                </div>
              </div>
              <Button size="sm" variant="outline" className="border-amber-300 bg-white" onClick={onRules}>
                Link cashiers
              </Button>
            </div>
          )}

          <section className="rounded-xl border border-gray-200 bg-white">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Trophy className="h-4 w-4 text-[#a67c2e]" />
                Salespeople — {label}
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or code…" className="h-8 w-52 pl-8 text-xs" />
                </div>
                <Button size="sm" variant="outline" className="h-8" onClick={exportXlsx} disabled={!rows.length}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Excel
                </Button>
                <Button size="sm" variant="outline" className="h-8" onClick={print} disabled={!rows.length}>
                  <Printer className="mr-1.5 h-3.5 w-3.5" />
                  Print
                </Button>
              </div>
            </header>
            {rows.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-14 text-center">
                <Users className="mb-2 h-8 w-8 text-gray-300" />
                <p className="text-sm font-medium text-gray-800">No commission in this period</p>
                <p className="mt-1 max-w-md text-xs text-gray-500">Pick a salesperson on each bill in New Sale, or link cashiers to employees in Commission rules.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">Salesperson</th>
                      <th className="px-2 py-2.5 text-left font-medium">Rule</th>
                      <th className="px-2 py-2.5 text-right font-medium">Bills</th>
                      <th className="px-2 py-2.5 text-right font-medium">Pieces</th>
                      <th className="px-2 py-2.5 text-right font-medium">Net sales</th>
                      <th className="px-2 py-2.5 text-right font-medium">Avg bill</th>
                      <th className="px-2 py-2.5 text-right font-medium">Commission</th>
                      <th className="w-36 px-4 py-2.5 text-left font-medium">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((x, i) => {
                      const change = pctChange(x.commissionAmount, x.previous);
                      return (
                        <tr key={x.employeeId} onClick={() => setDetail({ id: x.employeeId, name: x.employee })} className="cursor-pointer border-t border-gray-100 hover:bg-[#fcf8f2]/70">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold", i === 0 ? "bg-[#a67c2e] text-white" : i === 1 ? "bg-gray-300 text-gray-800" : i === 2 ? "bg-amber-700/80 text-white" : "bg-gray-100 text-gray-500")}>{i + 1}</span>
                              <div className="min-w-0">
                                <div className="truncate font-medium text-gray-900">{x.employee}</div>
                                <div className="truncate text-[11px] text-gray-500">{[x.code, x.designation, x.branch].filter(Boolean).join(" · ")}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-xs text-gray-600">{x.basis}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums">
                            {x.bills}
                            {x.returns > 0 && <span className="ml-1 text-[11px] text-rose-600">−{x.returns} ret</span>}
                          </td>
                          <td className="px-2 py-2.5 text-right tabular-nums">{x.pieces}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums">{rs(x.salesAmount)}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums text-gray-600">{rs(x.averageBill)}</td>
                          <td className="px-2 py-2.5 text-right">
                            <div className="font-semibold tabular-nums text-gray-900">{rs(x.commissionAmount)}</div>
                            {change != null ? (
                              <div className={cn("text-[11px]", change >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                {change >= 0 ? "+" : ""}
                                {change.toFixed(0)}% vs before
                              </div>
                            ) : x.previous === 0 && x.commissionAmount > 0 ? (
                              <div className="text-[11px] text-gray-400">new</div>
                            ) : null}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 flex-1 rounded-full bg-gray-100">
                                <div className="h-1.5 rounded-full bg-[#a67c2e]" style={{ width: `${x.share}%` }} />
                              </div>
                              <span className="w-9 text-right text-[11px] tabular-nums text-gray-500">{x.share.toFixed(0)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                    <tr>
                      <td className="px-4 py-2.5" colSpan={2}>
                        Total ({rows.length})
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{rows.reduce((t, x) => t + x.bills, 0)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{rows.reduce((t, x) => t + x.pieces, 0)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{rs(rows.reduce((t, x) => t + x.salesAmount, 0))}</td>
                      <td />
                      <td className="px-2 py-2.5 text-right tabular-nums">{rs(rows.reduce((t, x) => t + x.commissionAmount, 0))}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <p className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-500">Click a salesperson for their bills, products and daily trend. Returns reduce commission automatically.</p>
          </section>

          {data.daily.length > 1 && (
            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Commission by day</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.daily}>
                    <CartesianGrid vertical={false} stroke="#eee" />
                    <XAxis dataKey="date" tickFormatter={(v) => format(new Date(`${v}T12:00:00`), "dd MMM")} tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                    <Tooltip formatter={(v: number) => [rs(v), "Commission"]} labelFormatter={(l) => day(String(l))} cursor={{ fill: "#f5f5f4" }} />
                    <Bar dataKey="commission" fill="#a67c2e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
        </div>
      )}

      <Sheet open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[min(1000px,96vw)]">
          <SheetTitle>{detail?.name}</SheetTitle>
          <SheetDescription>Sales and commission performance</SheetDescription>
          <div className="mt-4">{detail && <EmployeeSalesPerformance employeeId={detail.id} />}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ====================================================================== */
/* Monthly payouts                                                        */
/* ====================================================================== */

function PayoutsTab({ salespeople, onGenerate }: { salespeople: Salesperson[]; onGenerate: () => void }) {
  const { toast } = useToast();
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [status, setStatus] = useState<"all" | "unpaid" | "paid">("all");
  const [employee, setEmployee] = useState("all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<CommissionRecord[] | null>(null);
  const [meta, setMeta] = useState<RecordsMeta | null>(null);
  const [live, setLive] = useState<Map<string, number>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pay, setPay] = useState<{ ids: string[]; total: number; label: string; single?: boolean } | null>(null);
  const [adjust, setAdjust] = useState<CommissionRecord | null>(null);
  const [bills, setBills] = useState<CommissionRecord | null>(null);
  const [recalcBusy, setRecalcBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const params: Record<string, unknown> = {};
      if (month !== "all") params.month = month;
      if (year !== "all") params.year = year;
      if (status !== "all") params.is_paid = status === "paid" ? "true" : "false";
      if (employee !== "all") params.employee_id = employee;
      if (search.trim()) params.search = search.trim();
      const r = await commissionApi.records(params);
      setRows(r.rows);
      setMeta(r.meta);
      setSelected(new Set());
      // Compare unpaid records with live sales for the chosen month.
      if (month !== "all" && year !== "all") {
        const m = Number(month);
        const y = Number(year);
        const from = `${y}-${String(m).padStart(2, "0")}-01`;
        const to = `${y}-${String(m).padStart(2, "0")}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
        const earned = await commissionApi.earned({ from, to: to > businessTodayYmd() ? businessTodayYmd() : to }).catch(() => null);
        setLive(new Map((earned?.rows ?? []).map((x) => [x.employeeId, x.commissionAmount])));
      } else setLive(new Map());
    } catch (e) {
      toast({ variant: "destructive", title: "Could not load payouts", description: apiError(e) });
      setRows([]);
    }
  }, [month, year, status, employee, search, toast]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const outdated = (rows ?? []).filter((r) => !r.is_paid && live.has(r.employee_id) && Math.abs((live.get(r.employee_id) ?? 0) - r.base_amount) > 0.5);
  const missing = month !== "all" ? [...live.entries()].filter(([id, v]) => v > 0 && !(rows ?? []).some((r) => r.employee_id === id)).length : 0;
  const unpaidSelected = (rows ?? []).filter((r) => selected.has(r.id) && commissionStatus(r) !== "PAID");
  const unpaidSelectedDue = unpaidSelected.reduce((t, r) => t + commissionDue(r), 0);

  const recalc = async () => {
    if (month === "all" || year === "all") return;
    setRecalcBusy(true);
    try {
      const res = await commissionApi.generate({ month: Number(month), year: Number(year), overwrite: true });
      toast({ title: "Payouts updated from sales", description: `${res.created} updated or added${res.skippedPaid ? ` · ${res.skippedPaid} already paid (left as is)` : ""}` });
      load();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not recalculate", description: apiError(e) });
    } finally {
      setRecalcBusy(false);
    }
  };

  const unpay = async (r: CommissionRecord) => {
    try {
      await commissionApi.unpay(r.id);
      toast({ title: "Marked unpaid" });
      load();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not update", description: apiError(e) });
    }
  };
  const remove = async (r: CommissionRecord) => {
    if (!window.confirm(`Delete ${r.employee.name}'s ${MONTHS[r.month - 1]} ${r.year} payout?`)) return;
    try {
      await commissionApi.remove(r.id);
      toast({ title: "Payout deleted" });
      load();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not delete", description: apiError(e) });
    }
  };
  const slip = (r: CommissionRecord) => {
    const body = `<table><tbody>
      <tr><td><b>Employee</b></td><td>${escapeHtml(r.employee.name)} ${r.employee.employee_code ? `(${escapeHtml(r.employee.employee_code)})` : ""}</td></tr>
      <tr><td><b>Period</b></td><td>${MONTHS[r.month - 1]} ${r.year}</td></tr>
      <tr><td><b>Bills / pieces</b></td><td>${r.bills} bills · ${r.pieces} pieces</td></tr>
      <tr><td><b>Net sales</b></td><td>${rs(r.sales_amount)}</td></tr>
      <tr><td><b>Rule</b></td><td>${escapeHtml(basisText(r.commission_type, r.rate, r.fixed_amount))}</td></tr>
      <tr><td><b>Commission from sales</b></td><td>${rs(r.base_amount)}</td></tr>
      ${r.adjustment ? `<tr><td><b>${r.adjustment > 0 ? "Bonus" : "Deduction"}</b></td><td>${rs(r.adjustment)}${r.adjustment_note ? ` — ${escapeHtml(r.adjustment_note)}` : ""}</td></tr>` : ""}
      <tr><td><b>Payable</b></td><td><b>${rs(r.amount)}</b></td></tr>
      <tr><td><b>Status</b></td><td>${r.is_paid ? `Paid ${dt(r.paid_date)} · ${escapeHtml(methodLabel(r.payment_method))}${r.payment_reference ? ` · ${escapeHtml(r.payment_reference)}` : ""}` : "Unpaid"}</td></tr>
    </tbody></table><div style="display:flex;justify-content:space-between;margin-top:60px;font-size:12px"><span>Paid by ____________</span><span>Received by ____________</span></div>`;
    printDocument("Commission slip", `${r.employee.name} · ${MONTHS[r.month - 1]} ${r.year}`, body);
  };
  const exportXlsx = () => {
    const ws = XLSX.utils.json_to_sheet(
      (rows ?? []).map((r) => ({
        Employee: r.employee.name,
        Code: r.employee.employee_code ?? "",
        Period: `${MONTHS[r.month - 1]} ${r.year}`,
        Bills: r.bills,
        Pieces: r.pieces,
        Sales: r.sales_amount,
        Rule: basisText(r.commission_type, r.rate, r.fixed_amount),
        "From sales": r.base_amount,
        Adjustment: r.adjustment,
        Payable: r.amount,
        Status: r.is_paid ? "Paid" : "Unpaid",
        "Paid date": r.paid_date ? dt(r.paid_date) : "",
        Method: r.is_paid ? methodLabel(r.payment_method) : "",
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payouts");
    XLSX.writeFile(wb, `commission-payouts-${month}-${year}.xlsx`);
  };

  const years = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i));
  const s = meta?.summary;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All months</SelectItem>
            {MONTHS.map((m, i) => (
              <SelectItem key={m} value={String(i + 1)}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="h-9 w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All years</SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={y}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={employee} onValueChange={setEmployee}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All employees</SelectItem>
            {salespeople.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="h-9 w-44 pl-8" />
        </div>
        <Chips
          value={status}
          onChange={setStatus}
          options={[
            { id: "all", label: "All" },
            { id: "unpaid", label: "Unpaid", count: s?.unpaidCount },
            { id: "paid", label: "Paid", count: s?.paidCount },
          ]}
        />
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" className="h-9" onClick={load}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" className="h-9" onClick={exportXlsx} disabled={!rows?.length}>
            <Download className="mr-1.5 h-4 w-4" />
            Excel
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi tone="dark" icon={Coins} label="Total payable" value={rs(s?.totalCommission)} hint={`${meta?.total ?? 0} payouts · ${s?.employeeCount ?? 0} people`} />
        <Kpi tone="good" icon={CheckCircle2} label="Paid" value={rs(s?.paidAmount)} hint={`${s?.paidCount ?? 0} paid`} />
        <Kpi tone={s?.unpaidAmount ? "bad" : undefined} icon={Wallet} label="Still to pay" value={rs(s?.unpaidAmount)} hint={`${s?.unpaidCount ?? 0} unpaid`} />
        <Kpi icon={TrendingUp} label="Sales covered" value={rs(s?.totalSales)} hint={`${(s?.totalPieces ?? 0).toLocaleString()} pieces`} />
      </div>

      {(outdated.length > 0 || missing > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <div className="flex items-start gap-2">
            <RefreshCw className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Sales changed since these payouts were created:
              {outdated.length > 0 && ` ${outdated.length} unpaid payout${outdated.length > 1 ? "s" : ""} no longer match the bills`}
              {outdated.length > 0 && missing > 0 && " ·"}
              {missing > 0 && ` ${missing} salesperson${missing > 1 ? "s have" : " has"} commission but no payout yet`}. Paid payouts are never changed.
            </span>
          </div>
          <Button size="sm" onClick={recalc} disabled={recalcBusy} className="bg-sky-700 hover:bg-sky-800">
            {recalcBusy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Update from sales
          </Button>
        </div>
      )}

      {unpaidSelected.length > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#a67c2e]/40 bg-[#fcf8f2] px-4 py-2.5 shadow-sm">
          <span className="text-sm text-gray-800">
            {unpaidSelected.length} selected · due <b>{rs(unpaidSelectedDue)}</b>
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button
              size="sm"
              className="bg-[#2a2012] hover:bg-[#3b2e1a]"
              onClick={() =>
                setPay({
                  ids: unpaidSelected.map((r) => r.id),
                  total: unpaidSelectedDue,
                  label: `${unpaidSelected.length} payouts`,
                  single: false,
                })
              }
            >
              Pay selected
            </Button>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {!rows ? (
          <div className="m-4 h-48 animate-pulse rounded bg-gray-100" />
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <Wallet className="mb-2 h-8 w-8 text-gray-300" />
            <p className="text-sm font-medium text-gray-800">No payouts for this filter</p>
            <p className="mt-1 text-xs text-gray-500">Create the month&apos;s payouts from sales — each salesperson gets one record to pay.</p>
            <Button size="sm" className="mt-3 bg-[#2a2012] hover:bg-[#3b2e1a]" onClick={onGenerate}>
              Create monthly payout
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="w-10 px-4 py-2.5">
                    <Checkbox
                      checked={rows.some((r) => commissionStatus(r) !== "PAID") && rows.filter((r) => commissionStatus(r) !== "PAID").every((r) => selected.has(r.id))}
                      onCheckedChange={(v) => setSelected(v ? new Set(rows.filter((r) => commissionStatus(r) !== "PAID").map((r) => r.id)) : new Set())}
                      aria-label="Select all unpaid"
                    />
                  </th>
                  <th className="px-2 py-2.5 text-left font-medium">Employee</th>
                  <th className="px-2 py-2.5 text-left font-medium">Period</th>
                  <th className="px-2 py-2.5 text-right font-medium">Bills · pcs</th>
                  <th className="px-2 py-2.5 text-right font-medium">Sales</th>
                  <th className="px-2 py-2.5 text-left font-medium">Rule</th>
                  <th className="px-2 py-2.5 text-right font-medium">From sales</th>
                  <th className="px-2 py-2.5 text-right font-medium">Bonus / ded.</th>
                  <th className="px-2 py-2.5 text-right font-medium">Payable</th>
                  <th className="px-2 py-2.5 text-right font-medium">Paid</th>
                  <th className="px-2 py-2.5 text-right font-medium">Due</th>
                  <th className="px-2 py-2.5 text-left font-medium">Status</th>
                  <th className="w-36 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const liveAmt = live.get(r.employee_id);
                  const stale = !r.is_paid && liveAmt != null && Math.abs(liveAmt - r.base_amount) > 0.5;
                  return (
                    <tr key={r.id} className={cn("border-t border-gray-100", selected.has(r.id) && "bg-[#fcf8f2]/70")}>
                      <td className="px-4 py-2.5">
                        {commissionStatus(r) !== "PAID" && (
                          <Checkbox
                            checked={selected.has(r.id)}
                            onCheckedChange={(v) =>
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (v) next.add(r.id);
                                else next.delete(r.id);
                                return next;
                              })
                            }
                          />
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="font-medium text-gray-900">{r.employee.name}</div>
                        <div className="text-[11px] text-gray-500">{[r.employee.employee_code, r.employee.user?.email].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td className="px-2 py-2.5 text-gray-700">
                        {MONTHS[r.month - 1].slice(0, 3)} {r.year}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        {r.bills} · {r.pieces}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{rs(r.sales_amount)}</td>
                      <td className="px-2 py-2.5 text-xs text-gray-600">{basisText(r.commission_type, r.rate, r.fixed_amount)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        {rs(r.base_amount)}
                        {stale && <div className="text-[10px] font-medium text-sky-700">now {rs(liveAmt)}</div>}
                      </td>
                      <td className={cn("px-2 py-2.5 text-right tabular-nums", r.adjustment > 0 ? "text-emerald-700" : r.adjustment < 0 ? "text-rose-700" : "text-gray-300")} title={r.adjustment_note ?? ""}>
                        {r.adjustment ? `${r.adjustment > 0 ? "+" : "−"}${rs(Math.abs(r.adjustment))}` : "—"}
                      </td>
                      <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{rs(r.amount)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-gray-600">{rs(Number(r.paid_amount || 0))}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums font-medium">{rs(commissionDue(r))}</td>
                      <td className="px-2 py-2.5">
                        {(() => {
                          const st = commissionStatus(r);
                          if (st === "PAID") {
                            return (
                              <div>
                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Paid</span>
                                <div className="mt-0.5 text-[11px] text-gray-500">
                                  {dt(r.paid_date)} · {methodLabel(r.payment_method)}
                                </div>
                              </div>
                            );
                          }
                          if (st === "PARTIAL") {
                            return (
                              <div>
                                <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800">Partial</span>
                                <div className="mt-0.5 text-[11px] text-gray-500">Due {rs(commissionDue(r))}</div>
                              </div>
                            );
                          }
                          return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">Unpaid</span>;
                        })()}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          {commissionStatus(r) !== "PAID" && (
                            <Button
                              size="sm"
                              className="h-8 bg-[#2a2012] hover:bg-[#3b2e1a]"
                              onClick={() =>
                                setPay({
                                  ids: [r.id],
                                  total: commissionDue(r),
                                  label: `${r.employee.name} · ${MONTHS[r.month - 1]} ${r.year}`,
                                  single: true,
                                  alreadyPaid: Number(r.paid_amount || 0),
                                  payable: Number(r.amount || 0),
                                })
                              }
                            >
                              Pay
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setBills(r)}>
                                <FileText className="mr-2 h-4 w-4" />
                                Bills in this payout
                              </DropdownMenuItem>
                              {commissionStatus(r) !== "PAID" && (
                                <DropdownMenuItem onSelect={() => setAdjust(r)}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Bonus / deduction
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onSelect={() => slip(r)}>
                                <Printer className="mr-2 h-4 w-4" />
                                Print slip
                              </DropdownMenuItem>
                              {commissionStatus(r) !== "UNPAID" && (
                                <DropdownMenuItem onSelect={() => unpay(r)}>
                                  <Undo2 className="mr-2 h-4 w-4" />
                                  Reset unpaid
                                </DropdownMenuItem>
                              )}
                              {commissionStatus(r) === "UNPAID" && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-rose-600" onSelect={() => remove(r)}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PayDialog pay={pay} onClose={() => setPay(null)} onDone={load} />
      <AdjustDialog record={adjust} onClose={() => setAdjust(null)} onDone={load} />
      <BillsDialog record={bills} onClose={() => setBills(null)} />
    </div>
  );
}

function PayDialog({
  pay,
  onClose,
  onDone,
}: {
  pay: { ids: string[]; total: number; label: string; single?: boolean; alreadyPaid?: number; payable?: number } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [date, setDate] = useState(businessTodayYmd());
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (pay) {
      setDate(businessTodayYmd());
      setMethod("CASH");
      setReference("");
      setAmount(String(pay.total || 0));
    }
  }, [pay]);

  const value = Number(amount) || 0;
  const due = Number(pay?.total || 0);
  const isSingle = !!pay?.single && pay.ids.length === 1;

  const submit = async () => {
    if (!pay) return;
    if (isSingle && !(value > 0)) {
      toast({ variant: "destructive", title: "Enter a payment amount" });
      return;
    }
    if (isSingle && value > due + 0.005) {
      toast({ variant: "destructive", title: `Only ${rs(due)} is left to pay` });
      return;
    }
    setBusy(true);
    try {
      if (isSingle) {
        const updated = await commissionApi.pay(pay.ids[0], {
          amount: value,
          paid_date: date,
          payment_method: method,
          payment_reference: reference || null,
        });
        const st = commissionStatus(updated);
        toast({
          title: st === "PAID" ? "Commission paid in full" : "Partial payment recorded",
          description: st === "PAID" ? pay.label : `${rs(value)} paid · due ${rs(commissionDue(updated))} · ${pay.label}`,
        });
      } else {
        await commissionApi.bulkPay({
          ids: pay.ids,
          paid_date: date,
          payment_method: method,
          payment_reference: reference || null,
        });
        toast({ title: "Commission paid", description: `${rs(pay.total)} · ${pay.label}` });
      }
      onClose();
      onDone();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not record payment", description: apiError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!pay} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay commission</DialogTitle>
          <DialogDescription>{pay?.label}</DialogDescription>
        </DialogHeader>

        {isSingle ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-[#2a2012] px-4 py-3 text-white">
              <div className="text-xs text-stone-300">Amount to pay now (Rs)</div>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 h-11 border-0 bg-white/10 text-2xl font-semibold tabular-nums text-white placeholder:text-stone-400 focus-visible:ring-white/30"
                autoFocus
              />
              <p className="mt-2 text-[11px] text-stone-300">
                Payable {rs(pay?.payable ?? due)}
                {Number(pay?.alreadyPaid || 0) > 0.005 ? ` · already paid ${rs(pay?.alreadyPaid || 0)}` : ""}
                {" · "}due {rs(due)} — enter less for partial pay
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-[#2a2012] px-4 py-3 text-white">
            <div className="text-xs text-stone-300">Total due (full remaining for each selected)</div>
            <div className="text-2xl font-semibold tabular-nums">{rs(pay?.total)}</div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Paid on</Label>
            <YmdDatePicker value={date} onChange={setDate} max={businessTodayYmd()} />
          </div>
          <div className="space-y-1.5">
            <Label>Paid by</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAY_METHODS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Reference (optional)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction ID / cheque no." />
          </div>
        </div>
        <p className="text-[11px] text-gray-500">
          {isSingle
            ? "You can pay part of the due amount. Remaining stays outstanding until fully paid."
            : "Pay selected pays the full remaining due on each payout."}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || (isSingle && !(value > 0))} className="bg-[#2a2012] hover:bg-[#3b2e1a]">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSingle ? `Pay ${rs(value)}` : "Mark paid"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjustDialog({ record, onClose, onDone }: { record: CommissionRecord | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [kind, setKind] = useState<"bonus" | "deduction">("bonus");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!record) return;
    setKind(record.adjustment < 0 ? "deduction" : "bonus");
    setValue(record.adjustment ? String(Math.abs(record.adjustment)) : "");
    setNote(record.adjustment_note ?? "");
  }, [record]);
  const adj = (kind === "bonus" ? 1 : -1) * (Number(value) || 0);
  const final = Math.max(0, (record?.base_amount ?? 0) + adj);
  const submit = async () => {
    if (!record) return;
    if (adj !== 0 && !note.trim()) return toast({ variant: "destructive", title: "Write a reason" });
    setBusy(true);
    try {
      await commissionApi.update(record.id, { adjustment: adj, adjustment_note: note.trim() || null });
      toast({ title: "Payout updated", description: `Payable ${rs(final)}` });
      onClose();
      onDone();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not save", description: apiError(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!record} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bonus or deduction</DialogTitle>
          <DialogDescription>
            {record?.employee.name} · {record ? `${MONTHS[record.month - 1]} ${record.year}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 text-sm">
          {(["bonus", "deduction"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={cn("rounded-md px-4 py-1.5 font-medium", kind === k ? (k === "bonus" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white") : "text-gray-600")}>
              {k === "bonus" ? "+ Bonus" : "− Deduction"}
            </button>
          ))}
        </div>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Amount (Rs)</Label>
            <Input type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "bonus" ? "e.g. Target achieved" : "e.g. Damaged item recovery"} />
          </div>
        </div>
        <div className="space-y-1 rounded-lg bg-gray-50 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">From sales</span>
            <span className="tabular-nums">{rs(record?.base_amount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{kind === "bonus" ? "Bonus" : "Deduction"}</span>
            <span className={cn("tabular-nums", adj > 0 ? "text-emerald-700" : adj < 0 ? "text-rose-700" : "")}>{adj ? `${adj > 0 ? "+" : "−"}${rs(Math.abs(adj))}` : "—"}</span>
          </div>
          <div className="flex justify-between border-t border-gray-200 pt-1 font-semibold">
            <span>Payable</span>
            <span className="tabular-nums">{rs(final)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy} className="bg-[#2a2012] hover:bg-[#3b2e1a]">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BillsDialog({ record, onClose }: { record: CommissionRecord | null; onClose: () => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof commissionApi.sales>> | null>(null);
  useEffect(() => {
    setData(null);
    if (record) commissionApi.sales(record.id).then(setData).catch(() => undefined);
  }, [record]);
  return (
    <Dialog open={!!record} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bills credited to {record?.employee.name}</DialogTitle>
          <DialogDescription>{record ? `${MONTHS[record.month - 1]} ${record.year}` : ""} · live from sales</DialogDescription>
        </DialogHeader>
        {!data ? (
          <div className="h-40 animate-pulse rounded bg-gray-100" />
        ) : data.sales.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">No bills in this month.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-lg bg-gray-50 p-2">
                <div className="font-semibold">{data.summary.bills}</div>
                <div className="text-[11px] text-gray-500">bills</div>
              </div>
              <div className="rounded-lg bg-gray-50 p-2">
                <div className="font-semibold">{data.summary.pieces}</div>
                <div className="text-[11px] text-gray-500">pieces</div>
              </div>
              <div className="rounded-lg bg-gray-50 p-2">
                <div className="font-semibold">{rs(data.summary.salesAmount)}</div>
                <div className="text-[11px] text-gray-500">net sales</div>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase text-gray-500">
                <tr className="border-b border-gray-100">
                  <th className="py-2 text-left font-medium">Date</th>
                  <th className="py-2 text-left font-medium">Bill</th>
                  <th className="py-2 text-left font-medium">Customer</th>
                  <th className="py-2 text-left font-medium">Credited as</th>
                  <th className="py-2 text-right font-medium">Pcs</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.sales.map((s) => (
                  <tr key={s.id} className="border-b border-gray-50">
                    <td className="py-2 text-gray-600">{dt(s.date)}</td>
                    <td className="py-2 font-medium">
                      {s.voucher}
                      {s.isReturn && <span className="ml-1 rounded bg-rose-50 px-1 text-[10px] text-rose-700">return</span>}
                    </td>
                    <td className="py-2 text-gray-600">{s.customer}</td>
                    <td className="py-2 text-[11px] text-gray-500">{s.attribution === "SALESPERSON" ? "Salesperson" : s.attribution === "CASHIER" ? "Cashier link" : "Original bill"}</td>
                    <td className="py-2 text-right tabular-nums">{s.pieces}</td>
                    <td className={cn("py-2 text-right tabular-nums", s.salesAmount < 0 && "text-rose-700")}>{rs(s.salesAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ====================================================================== */
/* Generate                                                               */
/* ====================================================================== */

function GenerateDialog({ open, onOpenChange, salespeople, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; salespeople: Salesperson[]; onDone: () => void }) {
  const { toast } = useToast();
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [employee, setEmployee] = useState("all");
  const [overwrite, setOverwrite] = useState(true);
  const [preview, setPreview] = useState<EarnedReport | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const m = Number(month);
    const y = Number(year);
    const from = `${y}-${String(m).padStart(2, "0")}-01`;
    let to = `${y}-${String(m).padStart(2, "0")}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
    if (from > businessTodayYmd()) {
      setPreview(null);
      setPreviewLoading(false);
      return;
    }
    if (to > businessTodayYmd()) to = businessTodayYmd();

    let cancelled = false;
    setPreviewLoading(true);
    setPreview(null);
    commissionApi
      .earned({ from, to, employee_id: employee === "all" ? undefined : employee })
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, month, year, employee]);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await commissionApi.generate({ month: Number(month), year: Number(year), employee_id: employee === "all" ? undefined : employee, overwrite });
      toast({
        title: `${MONTHS[Number(month) - 1]} ${year} payouts ready`,
        description: [`${res.created} created/updated`, res.skippedPaid ? `${res.skippedPaid} already paid` : null, res.skippedExisting ? `${res.skippedExisting} kept as they were` : null].filter(Boolean).join(" · "),
      });
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not create payouts", description: apiError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create monthly payout</DialogTitle>
          <DialogDescription>Totals each salesperson&apos;s bills for the month into one payout to pay.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Month</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Year</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 4 }, (_, i) => String(now.getFullYear() - i)).map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Who</Label>
            <Select value={employee} onValueChange={setEmployee}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                {salespeople.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200">
          {previewLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              <p className="text-xs">Loading sales for this month…</p>
            </div>
          ) : !preview ? (
            <p className="p-4 text-center text-xs text-gray-500">No sales yet for this month.</p>
          ) : preview.rows.length === 0 ? (
            <p className="p-4 text-center text-xs text-gray-500">Nobody earned commission in this month.</p>
          ) : (
            <ul className="max-h-56 divide-y divide-gray-100 overflow-y-auto text-sm">
              {preview.rows.map((x) => (
                <li key={x.employeeId} className="flex items-center justify-between px-3 py-2">
                  <span>
                    <span className="font-medium text-gray-900">{x.employee}</span>
                    <span className="ml-2 text-[11px] text-gray-500">
                      {x.bills} bills · {x.pieces} pcs · {x.basis}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">{rs(x.commissionAmount)}</span>
                </li>
              ))}
              <li className="flex items-center justify-between bg-gray-50 px-3 py-2 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{rs(preview.summary.commission)}</span>
              </li>
            </ul>
          )}
        </div>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={overwrite} onCheckedChange={(v) => setOverwrite(!!v)} className="mt-0.5" />
          <span>
            Update unpaid payouts that already exist for this month
            <span className="block text-[11px] text-gray-500">Paid payouts are never changed. Bonuses / deductions are kept.</span>
          </span>
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || previewLoading || !preview?.rows.length} className="bg-[#2a2012] hover:bg-[#3b2e1a]">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create payouts
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ====================================================================== */
/* Rules                                                                  */
/* ====================================================================== */

type RuleDraft = { type: CommissionType; value: string; userId: string };

function RulesTab({ salespeople, onSaved }: { salespeople: Salesperson[]; onSaved: () => void }) {
  const { toast } = useToast();
  const [users, setUsers] = useState<PosUser[]>([]);
  const [drafts, setDrafts] = useState<Record<string, RuleDraft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadUsers = useCallback(() => {
    commissionApi.posUsers().then(setUsers).catch(() => setUsers([]));
  }, []);
  useEffect(() => loadUsers(), [loadUsers]);
  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        salespeople.map((p) => [p.id, { type: p.commission_type, value: String(p.commission_type === "PERCENTAGE" ? p.commission_rate : p.commission_fixed), userId: p.user_id ?? "none" }]),
      ),
    );
  }, [salespeople]);

  const dirty = (p: Salesperson) => {
    const d = drafts[p.id];
    if (!d) return false;
    const val = p.commission_type === "PERCENTAGE" ? p.commission_rate : p.commission_fixed;
    return d.type !== p.commission_type || Number(d.value) !== val || (d.userId === "none" ? null : d.userId) !== p.user_id;
  };
  const save = async (p: Salesperson) => {
    const d = drafts[p.id];
    const v = Number(d.value) || 0;
    if (d.type === "PERCENTAGE" && v > 100) return toast({ variant: "destructive", title: "Percentage can't be above 100" });
    setSaving(p.id);
    try {
      await commissionApi.saveRule(p.id, {
        user_id: d.userId === "none" ? null : d.userId,
        commission_type: d.type,
        commission_rate: d.type === "PERCENTAGE" ? v : p.commission_rate,
        commission_fixed: d.type === "PERCENTAGE" ? p.commission_fixed : v,
      });
      toast({ title: "Rule saved", description: `${p.name}: ${basisText(d.type, d.type === "PERCENTAGE" ? v : 0, v)}` });
      onSaved();
      loadUsers();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not save", description: apiError(e) });
    } finally {
      setSaving(null);
    }
  };

  const unlinked = users.filter((u) => !u.employee && ["CASHIER", "BRANCH_MANAGER", "SUPERVISOR"].includes(u.role));
  const rows = salespeople.filter((p) => !search.trim() || `${p.name} ${p.employee_code ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const example = (d?: RuleDraft) => {
    if (!d) return "";
    const v = Number(d.value) || 0;
    if (d.type === "PERCENTAGE") return `Rs 10,000 sale → ${rs((10000 * v) / 100)}`;
    if (d.type === "FIXED_PER_SALE") return `3 bills → ${rs(3 * v)}`;
    return `5 pieces → ${rs(5 * v)}`;
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {[
          { t: "% of sales", d: "A share of every rupee sold (returns reduce it)." },
          { t: "Per bill", d: "A fixed amount for each bill they make." },
          { t: "Per piece", d: "A fixed amount for each piece sold (returns reduce it)." },
        ].map((x) => (
          <div key={x.t} className="rounded-xl border border-gray-200 bg-white p-3.5">
            <div className="text-sm font-semibold text-gray-900">{x.t}</div>
            <div className="text-xs text-gray-500">{x.d}</div>
          </div>
        ))}
      </div>

      {unlinked.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>{unlinked.length} POS login{unlinked.length > 1 ? "s are" : " is"} not linked to an employee:</b> {unlinked.map((u) => u.email).join(", ")}. Bills they make without picking a salesperson earn no commission. Link them below.
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Commission rule per employee</h3>
            <p className="text-[11px] text-gray-500">Bills go to the salesperson picked in New Sale; if none is picked, to the cashier&apos;s linked employee.</p>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee…" className="h-8 w-52 pl-8 text-xs" />
          </div>
        </header>
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-500">No active employees. Add employees in Staff → Employees.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Employee</th>
                  <th className="px-2 py-2.5 text-left font-medium">POS login (cashier link)</th>
                  <th className="px-2 py-2.5 text-left font-medium">Rule</th>
                  <th className="px-2 py-2.5 text-left font-medium">Value</th>
                  <th className="px-2 py-2.5 text-left font-medium">Example</th>
                  <th className="w-28 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const d = drafts[p.id];
                  if (!d) return null;
                  const set = (patch: Partial<RuleDraft>) => setDrafts((x) => ({ ...x, [p.id]: { ...x[p.id], ...patch } }));
                  return (
                    <tr key={p.id} className="border-t border-gray-100">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-gray-900">{p.name}</div>
                        <div className="text-[11px] text-gray-500">{[p.employee_code, p.employee_type?.name, p.branch?.name].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td className="px-2 py-2.5">
                        <Select value={d.userId} onValueChange={(v) => set({ userId: v })}>
                          <SelectTrigger className="h-8 w-56 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Not linked</SelectItem>
                            {users
                              .filter((u) => !u.employee || u.employee.id === p.id)
                              .map((u) => (
                                <SelectItem key={u.id} value={u.id}>
                                  {u.email} · {u.role.toLowerCase().replace("_", " ")}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 text-[11px]">
                          {(
                            [
                              ["PERCENTAGE", "%"],
                              ["FIXED_PER_SALE", "Per bill"],
                              ["FIXED_PER_PIECE", "Per piece"],
                            ] as const
                          ).map(([t, l]) => (
                            <button key={t} type="button" onClick={() => set({ type: t })} className={cn("rounded-md px-2.5 py-1 font-medium", d.type === t ? "bg-[#2a2012] text-white" : "text-gray-600 hover:bg-gray-100")}>
                              {l}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="relative w-32">
                          <Input type="number" min={0} max={d.type === "PERCENTAGE" ? 100 : undefined} step="0.01" value={d.value} onChange={(e) => set({ value: e.target.value })} className="h-8 pr-9 text-right" />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">{d.type === "PERCENTAGE" ? "%" : "Rs"}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-xs text-gray-500">{example(d)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Button size="sm" className="h-8 bg-[#2a2012] hover:bg-[#3b2e1a]" disabled={!dirty(p) || saving === p.id} onClick={() => save(p)}>
                          {saving === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
                          Save
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

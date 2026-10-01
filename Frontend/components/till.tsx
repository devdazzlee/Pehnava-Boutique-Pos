"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Lock,
  LockOpen,
  RefreshCw,
  Banknote,
  ArrowDownCircle,
  Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateField } from "@/components/ui/date-picker";
import { PageLoader } from "@/components/ui/page-loader";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { ymd, rangeForPreset } from "@/lib/business-timezone";

interface TillDay {
  date: string;
  period: { from: string; to: string };
  branch: { id: string; name: string; code: string };
  branches: { id: string; name: string; code: string }[];
  session: {
    id: string;
    status: string;
    opening: number;
    closing: number | null;
    expectedCash: number;
    variance: number | null;
    varianceLabel: string | null;
    openedAt: string;
    closedAt: string | null;
    openedBy: string;
    closedBy: string;
  } | null;
  sessions: {
    id: string;
    status: string;
    opening: number;
    closing: number | null;
    expectedCash: number;
    variance: number | null;
    varianceLabel: string | null;
    openedAt: string;
    closedAt: string | null;
    openedBy: string;
    closedBy: string;
  }[];
  summary: {
    opening: number;
    cashSales: number;
    cardSales: number;
    otherSales: number;
    cashRefunds: number;
    paidOut: number;
    expectedCash: number;
    closing: number | null;
    variance: number | null;
    billCount: number;
    grossSales: number;
    netSales: number;
    sessionCount: number;
  };
  paidOuts: { id: string; particular: string; amount: number; at: string }[];
  transactions: {
    id: string;
    date: string;
    number: string;
    type: string;
    customer?: string | null;
    paymentMethod: string;
    total: number;
    status: string;
  }[];
  canOpen: boolean;
  canClose: boolean;
  canPaidOut: boolean;
  canReopen: boolean;
}

type Preset = "all" | "today" | "yesterday" | "last7" | "last30" | "custom";

const PRESETS: { id: Preset; label: string }[] = [
  { id: "all", label: "All dates" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "Last 7 Days" },
  { id: "last30", label: "Last 30 Days" },
  { id: "custom", label: "Custom Range" },
];

const rangeFor = (preset: Exclude<Preset, "custom">) => rangeForPreset(preset);

const money = (value: number | null | undefined) =>
  `PKR ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const periodLabel = (from: string, to: string) =>
  from === "2000-01-01"
    ? "All dates"
    : from === to
    ? format(new Date(`${from}T00:00:00`), "dd MMM yyyy")
    : `${format(new Date(`${from}T00:00:00`), "dd MMM yyyy")} – ${format(new Date(`${to}T00:00:00`), "dd MMM yyyy")}`;

export function Till() {
  const { toast } = useToast();
  const today = ymd(new Date());
  const initial = rangeFor("today");
  const [preset, setPreset] = useState<Preset>("today");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [draftFrom, setDraftFrom] = useState(initial.from);
  const [draftTo, setDraftTo] = useState(initial.to);
  const [branchId, setBranchId] = useState("auto");
  const [report, setReport] = useState<TillDay | null>(null);
  const [loading, setLoading] = useState(true);

  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [paidOutDialog, setPaidOutDialog] = useState(false);
  const [openingAmount, setOpeningAmount] = useState("0");
  const [closingAmount, setClosingAmount] = useState("");
  const [paidOutAmount, setPaidOutAmount] = useState("");
  const [paidOutReason, setPaidOutReason] = useState("");
  const [saving, setSaving] = useState(false);

  const coversToday = from <= today && to >= today;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { from, to };
      if (branchId !== "auto") params.branchId = branchId;
      const response = await apiClient.get("/till/day", { params });
      const data = response.data.data as TillDay;
      setReport(data);
      if (branchId === "auto" && data.branch?.id) setBranchId(data.branch.id);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not load till",
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

  const expectedPreview = useMemo(() => {
    if (!report) return 0;
    return report.summary.expectedCash;
  }, [report]);

  const countedClosing = Number(closingAmount || 0);
  const variancePreview = closingAmount === "" ? null : countedClosing - expectedPreview;

  const openTill = async () => {
    const opening = Number(openingAmount);
    if (!Number.isFinite(opening) || opening < 0) {
      toast({ variant: "destructive", title: "Enter a valid opening amount" });
      return;
    }
    setSaving(true);
    try {
      await apiClient.post("/till/open", {
        opening,
        ...(branchId !== "auto" ? { branchId } : {}),
      });
      toast({ title: "Till opened for today" });
      setOpenDialog(false);
      setOpeningAmount("0");
      setPreset("today");
      setFrom(today);
      setTo(today);
      setDraftFrom(today);
      setDraftTo(today);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not open till",
        description: error?.response?.data?.message || error?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const recordPaidOut = async () => {
    const amount = Number(paidOutAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ variant: "destructive", title: "Enter a valid paid-out amount" });
      return;
    }
    if (!paidOutReason.trim()) {
      toast({ variant: "destructive", title: "Enter a reason for this paid-out" });
      return;
    }
    setSaving(true);
    try {
      await apiClient.post("/till/paid-out", {
        amount,
        particular: paidOutReason.trim(),
        ...(branchId !== "auto" ? { branchId } : {}),
      });
      toast({ title: "Paid-out recorded" });
      setPaidOutDialog(false);
      setPaidOutAmount("");
      setPaidOutReason("");
      await load();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not record paid-out",
        description: error?.response?.data?.message || error?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const closeTill = async () => {
    if (!report?.session?.id) return;
    if (!Number.isFinite(countedClosing) || countedClosing < 0) {
      toast({ variant: "destructive", title: "Enter the counted closing cash" });
      return;
    }
    setSaving(true);
    try {
      await apiClient.post("/till/close", {
        cashflow_id: report.session.id,
        closing: countedClosing,
      });
      toast({ title: "Till closed for the day" });
      setCloseDialog(false);
      setClosingAmount("");
      await load();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not close till",
        description: error?.response?.data?.message || error?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const reopenTill = async () => {
    if (!report?.session?.id) return;
    setSaving(true);
    try {
      await apiClient.post(`/till/sessions/${report.session.id}/reopen`);
      toast({ title: "Till reopened" });
      await load();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not reopen till",
        description: error?.response?.data?.message || error?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const printDay = () => {
    if (!report) return;
    const win = window.open("", "_blank");
    if (!win) return;
    const rows = report.transactions
      .map(
        (row) => `<tr>
          <td>${format(new Date(row.date), "dd-MMM-yy HH:mm")}</td>
          <td>${row.number}</td>
          <td>${row.type}</td>
          <td>${row.customer || "—"}</td>
          <td>${row.paymentMethod}</td>
          <td style="text-align:right">${money(row.total)}</td>
        </tr>`,
      )
      .join("");
    win.document.write(`<!DOCTYPE html><html><head><title>Daily Till</title>
      <style>
        body{font-family:Georgia,serif;color:#2a2012;padding:28px}
        .top{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #a67c2e;padding-bottom:12px}
        img{height:56px}
        table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}
        th{background:#2a2012;color:#fff;text-align:left;padding:6px}
        td{border-bottom:1px solid #e8dcc4;padding:6px}
        .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px}
        .card{border:1px solid #e8dcc4;padding:12px;background:#fcf8f2}
      </style></head><body>
      <div class="top"><img src="${window.location.origin}/logo.png" alt="Pehnawa" />
      <div style="text-align:right"><h1 style="margin:0">Daily Till</h1>
      <p style="margin:4px 0 0;color:#786448">${periodLabel(report.period.from, report.period.to)} · ${report.branch.name}</p></div></div>
      <div class="cards">
        <div class="card"><div>Opening</div><strong>${money(report.summary.opening)}</strong></div>
        <div class="card"><div>Cash sales</div><strong>${money(report.summary.cashSales)}</strong></div>
        <div class="card"><div>Paid out</div><strong>${money(report.summary.paidOut)}</strong></div>
        <div class="card"><div>Expected</div><strong>${money(report.summary.expectedCash)}</strong></div>
      </div>
      <table><thead><tr><th>Time</th><th>No.</th><th>Type</th><th>Customer</th><th>Pay</th><th>Amount</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="6">No transactions.</td></tr>`}</tbody></table>
      </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  const status = report?.session?.status || "CLOSED";
  const statusTone =
    status === "OPEN"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : report?.session
        ? "bg-slate-100 text-slate-700 border-slate-200"
        : "bg-amber-50 text-amber-800 border-amber-200";

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Daily Till</h1>
          <p className="max-w-2xl text-sm text-gray-500">
            Open the drawer for the day, track cash in and out, then close with counted cash. Filter by today, yesterday, last 7 or 30 days, or a custom range.
          </p>
        </div>
        <div className="flex shrink-0 flex-nowrap items-center gap-2 overflow-x-auto pb-1">
          <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={load}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
          <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={printDay} disabled={!report || loading}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          {coversToday && report?.canOpen && (
            <Button size="sm" className="h-9 shrink-0" onClick={() => setOpenDialog(true)}>
              <LockOpen className="mr-2 h-4 w-4" />
              Open till
            </Button>
          )}
          {report?.canPaidOut && (
            <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={() => setPaidOutDialog(true)}>
              <ArrowDownCircle className="mr-2 h-4 w-4" />
              Paid out
            </Button>
          )}
          {report?.canClose && (
            <Button
              size="sm"
              className="h-9 shrink-0"
              onClick={() => {
                setClosingAmount(String(expectedPreview || 0));
                setCloseDialog(true);
              }}
            >
              <Lock className="mr-2 h-4 w-4" />
              Close till
            </Button>
          )}
          {report?.canReopen && (
            <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={reopenTill} disabled={saving}>
              Reopen till
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
              <Label>Branch</Label>
              {loading && (report?.branches || []).length === 0 ? (
                <Skeleton className="h-10 w-full rounded-md" />
              ) : (
                <Select value={branchId === "auto" ? undefined : branchId} onValueChange={setBranchId} disabled={loading}>
                  <SelectTrigger>
                    <SelectValue placeholder={loading ? "Loading branches…" : "Select branch"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(report?.branches || []).map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name} ({branch.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex items-end">
              <div className={cn("flex h-10 w-full items-center rounded-lg border px-4", statusTone)}>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-wide opacity-70">Till status</div>
                  {loading ? (
                    <Skeleton className="mt-1 h-4 w-24" />
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">
                        {report?.session ? status : "Not opened"}
                      </span>
                      {report?.session?.varianceLabel ? (
                        <Badge variant="secondary">{report.session.varianceLabel}</Badge>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          {preset === "custom" ? (
            <div className="grid grid-cols-1 gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] lg:items-end">
              <DateField label="From date" value={draftFrom} onChange={setDraftFrom} />
              <DateField label="To date" value={draftTo} onChange={setDraftTo} />
              <Button className="h-10" onClick={applyCustom}>
                Apply
              </Button>
              <Button className="h-10" variant="outline" onClick={() => applyPreset("today")}>
                Clear
              </Button>
            </div>
          ) : null}
          <p className="text-sm text-gray-500">
            Showing {periodLabel(from, to)}
            {report?.summary.sessionCount != null ? ` · ${report.summary.sessionCount} till session(s)` : ""}
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="p-0">
            <PageLoader message="Loading till..." />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Opening cash" value={money(report?.summary.opening)} />
            <SummaryCard label="Cash sales" value={money(report?.summary.cashSales)} />
            <SummaryCard label="Paid out" value={money(report?.summary.paidOut)} />
            <SummaryCard label="Expected in drawer" value={money(report?.summary.expectedCash)} emphasis />
            <SummaryCard label="Card sales" value={money(report?.summary.cardSales)} />
            <SummaryCard label="Other payments" value={money(report?.summary.otherSales)} />
            <SummaryCard label="Cash refunds" value={money(report?.summary.cashRefunds)} />
            <SummaryCard
              label="Closing / variance"
              value={
                report?.summary.closing == null
                  ? "—"
                  : `${money(report.summary.closing)}${report.summary.variance != null ? ` · ${money(report.summary.variance)}` : ""}`
              }
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-1">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2">
                  <Banknote className="h-4 w-4 text-[#a67c2e]" />
                  <h2 className="font-semibold">Cash formula</h2>
                </div>
                <FormulaRow label="Opening" value={money(report?.summary.opening)} />
                <FormulaRow label="+ Cash sales" value={money(report?.summary.cashSales)} />
                <FormulaRow label="− Cash refunds" value={money(report?.summary.cashRefunds)} />
                <FormulaRow label="− Paid out" value={money(report?.summary.paidOut)} />
                <div className="border-t pt-3">
                  <FormulaRow label="Expected cash" value={money(report?.summary.expectedCash)} bold />
                </div>
                {report?.session && (
                  <p className="text-xs text-gray-500">
                    Opened by {report.session.openedBy} at{" "}
                    {format(new Date(report.session.openedAt), "dd MMM yyyy HH:mm")}
                    {report.session.closedAt
                      ? ` · Closed by ${report.session.closedBy || "—"} at ${format(new Date(report.session.closedAt), "dd MMM yyyy HH:mm")}`
                      : ""}
                  </p>
                )}
                {!report?.session && (
                  <p className="text-sm text-amber-700">
                    {coversToday && report?.canOpen
                      ? "Open the till with opening cash to start today’s drawer."
                      : "No till session in this date range."}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="xl:col-span-2">
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <h2 className="font-semibold">Paid outs</h2>
                  <span className="text-sm text-gray-500">{report?.paidOuts.length || 0} entries</span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(report?.paidOuts || []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="py-8 text-center text-gray-500">
                          No paid-outs for this day.
                        </TableCell>
                      </TableRow>
                    ) : (
                      report?.paidOuts.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{format(new Date(row.at), "HH:mm")}</TableCell>
                          <TableCell>{row.particular}</TableCell>
                          <TableCell className="text-right">{money(row.amount)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="font-semibold">Day transactions</h2>
                <span className="text-sm text-gray-500">
                  {report?.summary.billCount || 0} bills · Net {money(report?.summary.netSales)}
                </span>
              </div>
              <div className="max-h-[45vh] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>No.</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Pay</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(report?.transactions || []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-gray-500">
                          No transactions for this day.
                        </TableCell>
                      </TableRow>
                    ) : (
                      report?.transactions.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{format(new Date(row.date), "HH:mm")}</TableCell>
                          <TableCell>{row.number}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{row.type}</Badge>
                          </TableCell>
                          <TableCell>{row.customer || "—"}</TableCell>
                          <TableCell>{row.paymentMethod}</TableCell>
                          <TableCell className="text-right font-medium">{money(row.total)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open till for today</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Opening cash</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={openingAmount}
                onChange={(event) => setOpeningAmount(event.target.value)}
              />
            </div>
            <p className="text-sm text-gray-500">
              Count the cash in the drawer and enter that amount. Only one till can be opened per branch each day.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancel</Button>
            <Button onClick={openTill} disabled={saving}>Open till</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paidOutDialog} onOpenChange={setPaidOutDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record paid out</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={paidOutAmount}
                onChange={(event) => setPaidOutAmount(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Reason</Label>
              <Textarea
                value={paidOutReason}
                onChange={(event) => setPaidOutReason(event.target.value)}
                placeholder="Tea, delivery, petty cash…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaidOutDialog(false)}>Cancel</Button>
            <Button onClick={recordPaidOut} disabled={saving}>Save paid-out</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close till</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <FormulaRow label="Expected cash" value={money(expectedPreview)} bold />
            <div className="space-y-1">
              <Label>Counted closing cash</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={closingAmount}
                onChange={(event) => setClosingAmount(event.target.value)}
              />
            </div>
            {variancePreview != null && (
              <div
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm",
                  Math.abs(variancePreview) < 0.005
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : variancePreview > 0
                      ? "border-sky-200 bg-sky-50 text-sky-800"
                      : "border-rose-200 bg-rose-50 text-rose-800",
                )}
              >
                Variance: {money(variancePreview)}{" "}
                {Math.abs(variancePreview) < 0.005
                  ? "(Balanced)"
                  : variancePreview > 0
                    ? "(Over)"
                    : "(Short)"}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialog(false)}>Cancel</Button>
            <Button onClick={closeTill} disabled={saving}>Close till</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <Card className={emphasis ? "border-[#a67c2e]/40 bg-[#fcf8f2]" : undefined}>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
        <p className="mt-1 text-lg font-semibold text-gray-900">{value}</p>
      </CardContent>
    </Card>
  );
}

function FormulaRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between text-sm", bold && "font-semibold")}>
      <span className="text-gray-600">{label}</span>
      <span>{value}</span>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { format, subDays, startOfMonth } from "date-fns";
import { BookLock, CheckCircle2, History, Loader2, Lock, LockOpen, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";
import { usePermissions } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type Status = {
  lockedThrough: string | null;
  today: string;
  history: {
    id: string;
    lockUntil: string;
    note: string | null;
    isActive: boolean;
    lockedBy: string | null;
    lockedAt: string;
    reopenedBy: string | null;
    reopenedAt: string | null;
    reopenReason: string | null;
  }[];
};

const apiError = (e: unknown) => {
  const err = e as { response?: { data?: { message?: string } }; message?: string };
  return err?.response?.data?.message || err?.message || "Something went wrong";
};
const nice = (ymd: string) => format(new Date(`${ymd}T12:00:00`), "dd MMM yyyy");
const who = (email: string | null) => (email ? email.split("@")[0] : "—");

const BLOCKED = [
  "New, edited or voided bills and returns",
  "Expenses, approvals and receipt changes",
  "Customer payments, advances and adjustments",
  "Supplier payments",
  "Payslips and salary payments",
  "Journal vouchers",
];

export function CloseBooks() {
  const { toast } = useToast();
  const perms = usePermissions();
  const canManage = perms.can("period.manage");
  const [status, setStatus] = useState<Status | null>(null);
  const lastMonthEnd = format(subDays(startOfMonth(new Date()), 1), "yyyy-MM-dd");
  const [until, setUntil] = useState(lastMonthEnd);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [reopen, setReopen] = useState<Status["history"][number] | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiClient.get("/finance/periods");
      setStatus(r.data.data);
    } catch (e) {
      toast({ variant: "destructive", title: "Could not load", description: apiError(e) });
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const doLock = async () => {
    setBusy(true);
    try {
      const r = await apiClient.post("/finance/periods/lock", { until, note: note.trim() || null });
      setStatus(r.data.data);
      setNote("");
      setConfirm(false);
      toast({ title: "Books closed", description: `Nothing dated on or before ${nice(until)} can be changed now.` });
    } catch (e) {
      toast({ variant: "destructive", title: "Could not close the books", description: apiError(e) });
    } finally {
      setBusy(false);
    }
  };

  const doReopen = async () => {
    if (!reopen) return;
    setBusy(true);
    try {
      const r = await apiClient.post(`/finance/periods/${reopen.id}/reopen`, { reason });
      setStatus(r.data.data);
      setReopen(null);
      setReason("");
      toast({ title: "Period reopened" });
    } catch (e) {
      toast({ variant: "destructive", title: "Could not reopen", description: apiError(e) });
    } finally {
      setBusy(false);
    }
  };

  const active = status?.history.find((h) => h.isActive && h.lockUntil === status.lockedThrough);

  return (
    <div className="min-h-full bg-[#f8f6f2] p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#2a2012]">Close Books</h1>
          <p className="text-sm text-stone-500">Lock a finished period so its sales, expenses and payments can&apos;t be changed after you&apos;ve reconciled them.</p>
        </div>

        {/* status */}
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5",
            status?.lockedThrough ? "border-[#2a2012] bg-[#2a2012] text-white" : "border-stone-200 bg-white",
          )}
        >
          <div className="flex items-center gap-3">
            <div className={cn("rounded-full p-2.5", status?.lockedThrough ? "bg-white/10" : "bg-[#fcf8f2]")}>
              {status?.lockedThrough ? <Lock className="h-6 w-6 text-[#e6c98f]" /> : <LockOpen className="h-6 w-6 text-[#a67c2e]" />}
            </div>
            <div>
              {!status ? (
                <div className="h-6 w-48 animate-pulse rounded bg-stone-200" />
              ) : status.lockedThrough ? (
                <>
                  <div className="text-lg font-semibold">Books closed up to {nice(status.lockedThrough)}</div>
                  <div className="text-sm text-stone-300">
                    by {who(active?.lockedBy ?? null)}
                    {active?.note ? ` — ${active.note}` : ""}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-lg font-semibold text-stone-900">No period is closed</div>
                  <div className="text-sm text-stone-500">Every past entry can still be edited.</div>
                </>
              )}
            </div>
          </div>
          {canManage && active && (
            <Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white" onClick={() => setReopen(active)}>
              <LockOpen className="mr-1.5 h-4 w-4" />
              Reopen
            </Button>
          )}
        </div>

        <div className="grid gap-5 md:grid-cols-5">
          <section className="rounded-xl border border-stone-200 bg-white p-5 md:col-span-3">
            <h3 className="mb-1 flex items-center gap-2 font-semibold text-stone-900">
              <BookLock className="h-4 w-4 text-[#a67c2e]" />
              Close a period
            </h3>
            <p className="mb-4 text-sm text-stone-500">Usually done after the month&apos;s cash, bank and stock are reconciled.</p>
            {canManage ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Close everything up to and including</Label>
                  <Input type="date" value={until} max={status ? format(subDays(new Date(`${status.today}T12:00:00`), 1), "yyyy-MM-dd") : undefined} onChange={(e) => setUntil(e.target.value)} className="w-52" />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[
                      { label: "End of last month", v: lastMonthEnd },
                      { label: "Yesterday", v: format(subDays(new Date(), 1), "yyyy-MM-dd") },
                    ].map((o) => (
                      <button key={o.label} onClick={() => setUntil(o.v)} className="rounded-full border border-stone-200 px-2.5 py-0.5 text-xs text-stone-600 hover:border-[#a67c2e] hover:text-[#a67c2e]">
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Note (optional)</Label>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. September reconciled with bank statement" />
                </div>
                <Button
                  onClick={() => setConfirm(true)}
                  disabled={!until || (!!status?.lockedThrough && until <= status.lockedThrough)}
                  className="bg-[#2a2012] hover:bg-[#3a2e1c]"
                >
                  <Lock className="mr-1.5 h-4 w-4" />
                  Close books up to {until ? nice(until) : "…"}
                </Button>
                {status?.lockedThrough && until <= status.lockedThrough && <p className="text-xs text-stone-500">Choose a date after {nice(status.lockedThrough)}.</p>}
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg bg-stone-50 p-3 text-sm text-stone-600">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                Only users with the &quot;Lock / reopen periods&quot; permission can close or reopen books.
              </div>
            )}
          </section>
          <section className="rounded-xl border border-stone-200 bg-white p-5 md:col-span-2">
            <h3 className="mb-3 font-semibold text-stone-900">What gets locked</h3>
            <ul className="space-y-2 text-sm text-stone-600">
              {BLOCKED.map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#a67c2e]" />
                  {b}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-stone-500">Reports for closed periods stay available. Reopening is recorded in the audit trail.</p>
          </section>
        </div>

        <section className="rounded-xl border border-stone-200 bg-white">
          <h3 className="flex items-center gap-2 border-b border-stone-100 px-5 py-3 text-sm font-semibold text-stone-800">
            <History className="h-4 w-4" /> History
          </h3>
          {!status ? (
            <div className="m-5 h-20 animate-pulse rounded bg-stone-100" />
          ) : status.history.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-stone-500">No periods have been closed yet.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {status.history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-start justify-between gap-2 px-5 py-3 text-sm">
                  <div>
                    <div className="font-medium text-stone-900">
                      Closed up to {nice(h.lockUntil)}{" "}
                      <span className={cn("ml-1 rounded-full px-2 py-0.5 text-[11px] font-medium", h.isActive ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500")}>
                        {h.isActive ? "Active" : "Reopened"}
                      </span>
                    </div>
                    <div className="text-xs text-stone-500">
                      {format(new Date(h.lockedAt), "dd MMM yyyy, h:mm a")} by {who(h.lockedBy)}
                      {h.note ? ` — ${h.note}` : ""}
                    </div>
                    {!h.isActive && h.reopenedAt && (
                      <div className="text-xs text-amber-700">
                        Reopened {format(new Date(h.reopenedAt), "dd MMM yyyy")} by {who(h.reopenedBy)} — {h.reopenReason}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Close books up to {until ? nice(until) : ""}?</DialogTitle>
            <DialogDescription>Nobody will be able to add, edit, void or delete anything dated on or before this day until a manager reopens it.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={doLock} disabled={busy} className="bg-[#2a2012] hover:bg-[#3a2e1c]">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Close books
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reopen} onOpenChange={(v) => !v && setReopen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reopen period</DialogTitle>
            <DialogDescription>
              Entries up to {reopen ? nice(reopen.lockUntil) : ""} become editable again
              {status && status.history.filter((h) => h.isActive).length > 1 ? " (back to the previous closing date)" : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Missed supplier bill for 28 Sep" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopen(null)}>
              Cancel
            </Button>
            <Button onClick={doReopen} disabled={busy || reason.trim().length < 3} className="bg-[#2a2012] hover:bg-[#3a2e1c]">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Reopen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

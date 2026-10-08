"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  applyRegisterOpenedToCache,
  invalidateRegisterStatus,
} from "@/hooks/queries/use-register-status";
import { format, formatDistanceToNowStrict, subDays } from "date-fns";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  CheckCircle2,
  Clock,
  Coffee,
  CreditCard,
  FileSpreadsheet,
  Landmark,
  LayoutGrid,
  Loader2,
  Lock,
  LockOpen,
  Monitor,
  Receipt,
  RefreshCw,
  Repeat,
  RotateCcw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Undo2,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Till } from "@/components/till";
import {
  BoardRow,
  errorMessage,
  HandoverMode,
  METHOD_LABEL,
  ReconReport,
  registerApi,
  rs,
  SessionDetail,
  signedRs,
  userName,
} from "./register-api";
import { CashMoveDialog, CloseRegisterDialog, HandoverDialog, OpenRegisterDialog, ReasonDialog } from "./register-dialogs";

type Tab = "live" | "board" | "recon" | "day";
const TABS: { id: Tab; label: string; icon: typeof Monitor; managerOnly?: boolean }[] = [
  { id: "live", label: "Register", icon: Monitor },
  { id: "board", label: "All registers", icon: LayoutGrid },
  { id: "recon", label: "Reconciliation & review", icon: Scale, managerOnly: true },
  { id: "day", label: "Day sheet", icon: FileSpreadsheet },
];

const STATE_META: Record<string, { label: string; cls: string; dot: string }> = {
  OPEN: { label: "Open", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  LOCKED: { label: "Locked", cls: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  CLOSED: { label: "Closed", cls: "bg-stone-100 text-stone-700 ring-stone-200", dot: "bg-stone-400" },
  NOT_OPENED: { label: "Not opened", cls: "bg-white text-stone-500 ring-stone-200", dot: "bg-stone-300" },
};

const REVIEW_META: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Awaiting review", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  APPROVED: { label: "Reviewed", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  NONE: { label: "", cls: "" },
};

const KIND_LABEL: Record<string, string> = {
  OPENING: "Opened register",
  HANDOVER: "Took over (shift change)",
  BREAK_COVER: "Covered a break",
  RETURN: "Back from break",
  EMERGENCY: "Emergency replacement",
  REOPEN: "Reopened register",
};

const EXPENSE_METHOD: Record<string, string> = { CASH: "Cash", BANK: "Bank", CARD: "Card", MOBILE_MONEY: "Wallet", CHEQUE: "Cheque", OTHER: "Other" };

const Pill = ({ className, children }: { className: string; children: ReactNode }) => (
  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", className)}>{children}</span>
);

const varianceCls = (v: number | null | undefined) =>
  v == null ? "text-stone-400" : Math.abs(v) < 0.5 ? "text-emerald-700" : v > 0 ? "text-sky-700" : "text-rose-700";

function Tile({ label, value, sub, icon: Icon, dark }: { label: string; value: string; sub?: string; icon: typeof Monitor; dark?: boolean }) {
  return (
    <div className={cn("min-w-0 rounded-xl border p-3.5", dark ? "border-[#2a2012] bg-[#2a2012] text-white" : "border-stone-200 bg-white")}>
      <div className={cn("flex items-center gap-1.5 text-xs", dark ? "text-stone-300" : "text-stone-500")}>
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className={cn("mt-0.5 text-xs", dark ? "text-stone-400" : "text-stone-500")}>{sub}</div>}
    </div>
  );
}

function Panel({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-stone-200 bg-white", className)}>
      <header className="flex items-center justify-between gap-2 border-b border-stone-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-stone-800">{title}</h3>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function RegisterLiveSkeleton({ syncing }: { syncing?: boolean }) {
  return (
    <div className="space-y-4">
      {syncing && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
          <Loader2 className="h-4 w-4 animate-spin text-[#a67c2e]" />
          Updating register…
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-stone-200/60" />
        ))}
      </div>
    </div>
  );
}

function Empty({ icon: Icon, title, text, action }: { icon: typeof Monitor; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 bg-white px-6 py-14 text-center">
      <div className="mb-3 rounded-full bg-[#fcf8f2] p-3">
        <Icon className="h-6 w-6 text-[#a67c2e]" />
      </div>
      <div className="font-semibold text-stone-800">{title}</div>
      {text && <p className="mt-1 max-w-md text-sm text-stone-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ====================================================================== */

export function RegisterHub() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const perms = usePermissions();
  const isManager = perms.can("register.approve_variance");
  const [tab, setTab] = useState<Tab>("live");
  const [board, setBoard] = useState<BoardRow[] | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  /** Full-page sync after open/close/handover — avoids showing "not open" while status refetches. */
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [dlg, setDlg] = useState<null | "open" | "in" | "out" | "close" | "reopen" | "review">(null);
  const [handoverMode, setHandoverMode] = useState<HandoverMode | null>(null);
  const [voidTarget, setVoidTarget] = useState<string | null>(null);

  const row = useMemo(() => board?.find((b) => b.branch.id === branchId) ?? null, [board, branchId]);

  const loadBoard = useCallback(async () => {
    try {
      const r = await registerApi.status();
      setBoard(r.branches);
      setBranchId((cur) => cur ?? r.branches.find((b) => b.state === "OPEN" || b.state === "LOCKED")?.branch.id ?? r.branches[0]?.branch.id ?? null);
      return r.branches;
    } catch (e) {
      toast({ variant: "destructive", title: "Could not load registers", description: errorMessage(e) });
      setBoard([]);
      return [];
    }
  }, [toast]);

  const loadSession = useCallback(async (id: string | null | undefined) => {
    if (!id) {
      setSession(null);
      return;
    }
    try {
      setSession(await registerApi.session(id));
    } catch {
      setSession(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await invalidateRegisterStatus(queryClient);
      const rows = await loadBoard();
      const current = rows.find((b) => b.branch.id === (branchId ?? rows[0]?.branch.id));
      await loadSession(current?.session?.id);
    } finally {
      setRefreshing(false);
    }
  }, [loadBoard, loadSession, branchId, queryClient]);

  const syncAfterMutation = useCallback(
    async (openedSession?: SessionDetail | null) => {
      setSyncing(true);
      if (openedSession) {
        setSession(openedSession);
        const bid = openedSession.branch?.id ?? branchId;
        if (bid) {
          applyRegisterOpenedToCache(queryClient, bid, openedSession);
        }
      }
      try {
        await invalidateRegisterStatus(queryClient);
        await refresh();
      } finally {
        setSyncing(false);
      }
    },
    [refresh, queryClient, branchId],
  );

  useEffect(() => {
    setLoading(true);
    loadBoard().finally(() => setLoading(false));
  }, [loadBoard]);

  useEffect(() => {
    loadSession(row?.session?.id);
  }, [row?.session?.id, loadSession]);

  // Keep the live numbers fresh while the register is open.
  useEffect(() => {
    if (tab !== "live" || session?.status !== "OPEN") return;
    const t = setInterval(() => loadSession(session.id), 30000);
    return () => clearInterval(t);
  }, [tab, session?.status, session?.id, loadSession]);

  const visibleTabs = TABS.filter((t) => !t.managerOnly || isManager || perms.can("reports.financial"));
  const pendingTotal = board?.reduce((t, b) => t + b.pendingReviews, 0) ?? 0;

  return (
    <div className="min-h-full bg-[#f8f6f2] p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        {/* header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#2a2012]">Cash Register</h1>
            <p className="text-sm text-stone-500">Open with a count, track every rupee in and out, hand over between cashiers and reconcile at close.</p>
          </div>
          <div className="flex items-center gap-2">
            {board && board.length > 1 && (
              <Select value={branchId ?? undefined} onValueChange={setBranchId}>
                <SelectTrigger className="h-9 w-56 bg-white">
                  <SelectValue placeholder="Branch" />
                </SelectTrigger>
                <SelectContent>
                  {board.map((b) => (
                    <SelectItem key={b.branch.id} value={b.branch.id}>
                      {b.branch.name} · {STATE_META[b.state].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" size="sm" className="h-9 bg-white" onClick={() => void refresh()} disabled={refreshing || syncing}>
              {refreshing ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>
        </div>

        {/* tabs */}
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-stone-200 bg-white p-1">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
                tab === t.id ? "bg-[#2a2012] text-white" : "text-stone-600 hover:bg-stone-100",
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
              {t.id === "recon" && pendingTotal > 0 && (
                <span className={cn("rounded-full px-1.5 text-[11px]", tab === t.id ? "bg-white/20" : "bg-amber-100 text-amber-800")}>{pendingTotal}</span>
              )}
            </button>
          ))}
        </div>

        {tab === "live" &&
          (loading || syncing ? (
            <RegisterLiveSkeleton syncing={syncing && !loading} />
          ) : !row ? (
            <Empty icon={Monitor} title="No branch available" text="Your account isn't linked to an active branch. Ask an admin to assign one." />
          ) : (
            <LiveRegister
              row={row}
              session={session}
              isManager={isManager}
              canReopen={perms.can("register.reopen")}
              onOpen={() => setDlg("open")}
              onCashIn={() => setDlg("in")}
              onCashOut={() => setDlg("out")}
              onClose={() => setDlg("close")}
              onHandover={setHandoverMode}
              onReview={() => setDlg("review")}
              onReopen={() => setDlg("reopen")}
              onVoidCashOut={setVoidTarget}
              onAttach={async (expenseId) => {
                if (!session) return;
                try {
                  await registerApi.attachExpense(session.id, expenseId);
                  toast({ title: "Added to the register" });
                  await refresh();
                } catch (e) {
                  toast({ variant: "destructive", title: "Could not add", description: errorMessage(e) });
                }
              }}
            />
          ))}

        {tab === "board" && (
          <Board
            rows={board}
            onPick={(id) => {
              setBranchId(id);
              setTab("live");
            }}
          />
        )}

        {tab === "recon" && <Reconciliation branches={board?.map((b) => b.branch) ?? []} onOpenSession={(id) => setSessionFromReport(id)} />}

        {tab === "day" && (
          <div className="-m-4 sm:-m-6">
            <Till />
          </div>
        )}
      </div>

      <OpenRegisterDialog
        open={dlg === "open"}
        onOpenChange={(v) => setDlg(v ? "open" : null)}
        branchId={row?.branch.id}
        branchName={row?.branch.name}
        onDone={syncAfterMutation}
      />
      <CashMoveDialog open={dlg === "in"} onOpenChange={(v) => setDlg(v ? "in" : null)} direction="IN" session={session} onDone={refresh} />
      <CashMoveDialog open={dlg === "out"} onOpenChange={(v) => setDlg(v ? "out" : null)} direction="OUT" session={session} onDone={refresh} />
      <CloseRegisterDialog open={dlg === "close"} onOpenChange={(v) => setDlg(v ? "close" : null)} session={session} onDone={() => refresh()} />
      <HandoverDialog
        open={!!handoverMode}
        onOpenChange={(v) => !v && setHandoverMode(null)}
        mode={handoverMode ?? "HANDOVER"}
        session={session}
        onDone={refresh}
      />
      <ReasonDialog
        open={dlg === "reopen"}
        onOpenChange={(v) => setDlg(v ? "reopen" : null)}
        title="Reopen register"
        description="The closing count is cleared and the register goes back to open. This is recorded in the audit trail."
        label="Reason"
        confirmLabel="Reopen"
        onConfirm={async (reason) => {
          if (!session) return;
          try {
            await registerApi.reopen(session.id, reason);
            toast({ title: "Register reopened" });
            await refresh();
          } catch (e) {
            toast({ variant: "destructive", title: "Could not reopen", description: errorMessage(e) });
            throw e;
          }
        }}
      />
      <ReasonDialog
        open={dlg === "review"}
        onOpenChange={(v) => setDlg(v ? "review" : null)}
        title="Approve closing count"
        description="Confirms you've checked the cash difference and reconciliation for this register."
        label="Review note (optional)"
        confirmLabel="Approve"
        required={false}
        onConfirm={async (note) => {
          if (!session) return;
          try {
            await registerApi.review(session.id, note);
            toast({ title: "Register approved" });
            await refresh();
          } catch (e) {
            toast({ variant: "destructive", title: "Could not approve", description: errorMessage(e) });
            throw e;
          }
        }}
      />
      <ReasonDialog
        open={!!voidTarget}
        onOpenChange={(v) => !v && setVoidTarget(null)}
        title="Void this cash out?"
        description="The money is treated as back in the drawer and the expense is removed."
        label="Reason"
        confirmLabel="Void"
        onConfirm={async () => {
          if (!voidTarget) return;
          try {
            await registerApi.voidCashOut(voidTarget);
            toast({ title: "Cash out voided" });
            await refresh();
          } catch (e) {
            toast({ variant: "destructive", title: "Could not void", description: errorMessage(e) });
            throw e;
          }
        }}
      />
    </div>
  );

  function setSessionFromReport(id: string) {
    loadSession(id).then(() => setTab("live"));
  }
}

/* ====================================================================== */

function LiveRegister({
  row,
  session,
  isManager,
  canReopen,
  onOpen,
  onCashIn,
  onCashOut,
  onClose,
  onHandover,
  onReview,
  onReopen,
  onVoidCashOut,
  onAttach,
}: {
  row: BoardRow;
  session: SessionDetail | null;
  isManager: boolean;
  canReopen: boolean;
  onOpen: () => void;
  onCashIn: () => void;
  onCashOut: () => void;
  onClose: () => void;
  onHandover: (m: HandoverMode) => void;
  onReview: () => void;
  onReopen: () => void;
  onVoidCashOut: (id: string) => void;
  onAttach: (expenseId: string) => void;
}) {
  if (row.state === "NOT_OPENED" || !row.session) {
    return (
      <Empty
        icon={LockOpen}
        title={`${row.branch.name} register isn't open yet`}
        text="Count the cash in the drawer to start the day. The count is checked against last night's closing."
        action={
          <Button onClick={onOpen} className="bg-[#2a2012] hover:bg-[#3a2e1c]">
            <LockOpen className="mr-2 h-4 w-4" />
            Open register
          </Button>
        }
      />
    );
  }
  if (!session) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading register…
      </div>
    );
  }

  const open = session.status === "OPEN";
  const onBreak = session.activeShift?.status === "ON_BREAK";
  const state = open ? (session.locked ? "LOCKED" : "OPEN") : "CLOSED";
  const movements = [
    ...session.cashIns.map((m) => ({ id: m.id, dir: "IN" as const, amount: m.amount, reason: m.reason, at: m.at, by: m.by, status: "APPROVED", method: "CASH" })),
    ...session.paidOuts.map((m) => ({ id: m.id, dir: "OUT" as const, amount: m.amount, reason: m.reason, at: m.at, by: m.by, status: m.status, method: m.method ?? "CASH" })),
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at));

  return (
    <div className="space-y-5">
      {/* status bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
          <Pill className={STATE_META[state].cls}>
            <span className={cn("h-1.5 w-1.5 rounded-full", STATE_META[state].dot)} />
            {STATE_META[state].label}
          </Pill>
          <span className="text-stone-600">
            <b className="text-stone-900">{session.branch?.name}</b> · opened {format(new Date(session.openedAt), "dd MMM, h:mm a")} by {userName(session.openedBy)}
          </span>
          {open && session.activeShift && (
            <span className="flex items-center gap-1.5 text-stone-600">
              <UserCheck className="h-4 w-4 text-[#a67c2e]" />
              On duty: <b className="text-stone-900">{userName(session.activeShift.cashier)}</b>
              <span className="text-stone-400">since {format(new Date(session.activeShift.startedAt), "h:mm a")}</span>
            </span>
          )}
          {!open && session.reviewStatus !== "NONE" && <Pill className={REVIEW_META[session.reviewStatus].cls}>{REVIEW_META[session.reviewStatus].label}</Pill>}
          {row.session.stale && open && (
            <Pill className="bg-rose-50 text-rose-700 ring-rose-200">
              <AlertTriangle className="h-3 w-3" /> Left open from a previous day
            </Pill>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {open && !onBreak && (
            <>
              <Button size="sm" variant="outline" onClick={onCashIn}>
                <ArrowDownCircle className="mr-1.5 h-4 w-4 text-emerald-600" />
                Cash in
              </Button>
              <Button size="sm" variant="outline" onClick={onCashOut}>
                <ArrowUpCircle className="mr-1.5 h-4 w-4 text-rose-600" />
                Cash out
              </Button>
              <Button size="sm" variant="outline" onClick={() => onHandover("HANDOVER")}>
                <Repeat className="mr-1.5 h-4 w-4" />
                Hand over
              </Button>
              <Button size="sm" variant="outline" onClick={() => onHandover("BREAK")}>
                <Coffee className="mr-1.5 h-4 w-4" />
                Break
              </Button>
              {session.shifts.some((s) => s.kind === "BREAK_COVER" && s.status === "ACTIVE") && (
                <Button size="sm" variant="outline" onClick={() => onHandover("RETURN")}>
                  <UserCheck className="mr-1.5 h-4 w-4" />
                  Back from break
                </Button>
              )}
              {isManager && (
                <Button size="sm" variant="outline" onClick={() => onHandover("EMERGENCY")}>
                  <ShieldAlert className="mr-1.5 h-4 w-4 text-amber-600" />
                  Emergency
                </Button>
              )}
              <Button size="sm" onClick={onClose} className="bg-[#2a2012] hover:bg-[#3a2e1c]">
                <Lock className="mr-1.5 h-4 w-4" />
                Close register
              </Button>
            </>
          )}
          {open && onBreak && (
            <Button size="sm" onClick={() => onHandover("RETURN")} className="bg-[#a67c2e] hover:bg-[#8f6a26]">
              <LockOpen className="mr-1.5 h-4 w-4" />
              Unlock — back from break
            </Button>
          )}
          {!open && isManager && session.reviewStatus === "PENDING" && (
            <Button size="sm" onClick={onReview} className="bg-emerald-700 hover:bg-emerald-800">
              <ShieldCheck className="mr-1.5 h-4 w-4" />
              Approve count
            </Button>
          )}
          {!open && canReopen && (
            <Button size="sm" variant="outline" onClick={onReopen}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Reopen
            </Button>
          )}
        </div>
      </div>

      {open && session.locked && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Lock className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <div className="font-semibold">Register locked — {session.lockedReason}</div>
            <div>New sales are blocked until the cashier returns and unlocks it with their password.</div>
          </div>
        </div>
      )}

      {/* figures */}
      {open ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile dark icon={Banknote} label="Cash that should be in drawer" value={rs(session.live.expectedCash)} sub={`Opening ${rs(session.live.opening)}`} />
          <Tile icon={Receipt} label="Cash sales" value={rs(session.live.cashSales)} sub={`${session.live.bills} bills · net ${rs(session.live.netSales)}`} />
          <Tile icon={ArrowDownCircle} label="Cash in" value={rs(session.live.cashIn)} sub={`${session.cashIns.length} entries`} />
          <Tile
            icon={ArrowUpCircle}
            label="Cash expenses, cash out & refunds"
            value={rs(session.live.cashOut + session.live.cashRefunds)}
            sub={`Refunds ${rs(session.live.cashRefunds)}`}
          />
          {(
            [
              ["CARD", "Card", CreditCard],
              ["BANK_TRANSFER", "Bank / cheque", Landmark],
              ["MOBILE_MONEY", "Wallet", Smartphone],
            ] as const
          ).map(([key, label, icon]) => {
            const sales = session.live.byMethod[key] ?? 0;
            const spent = session.live.expensesByMethod?.[key] ?? 0;
            return (
              <Tile
                key={key}
                icon={icon}
                label={`${label} (net)`}
                value={rs(sales - spent)}
                sub={spent ? `Sales ${rs(sales)} − expenses ${rs(spent)}` : `Sales ${rs(sales)}`}
              />
            );
          })}
          <Tile
            icon={UserCheck}
            label="This shift should hold"
            value={rs(session.activeShift?.expectedNow)}
            sub={session.activeShift ? `${userName(session.activeShift.cashier)} · ${formatDistanceToNowStrict(new Date(session.activeShift.startedAt))}` : undefined}
          />
        </div>
      ) : (
        <ClosedSummary session={session} />
      )}

      {open && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-stone-200 bg-white px-4 py-3">
          <span className="text-sm font-semibold text-stone-800">Today after all expenses</span>
          <span className="text-sm text-stone-600">
            All sales <b className="tabular-nums text-stone-900">{rs(session.live.netSales)}</b>
          </span>
          <span className="text-sm text-stone-600">
            − All expenses (any method) <b className="tabular-nums text-rose-700">{rs(session.live.allExpenses ?? 0)}</b>
          </span>
          <span className="ml-auto text-sm text-stone-600">
            = <b className={cn("text-lg tabular-nums", (session.live.dayTotal ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700")}>{rs(session.live.dayTotal ?? 0)}</b>
          </span>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        <Panel title="Cashier shifts" className="lg:col-span-3">
          <ShiftTimeline session={session} />
        </Panel>
        <Panel title="Cash in & out · expenses" className="lg:col-span-2">
          {movements.length === 0 && !(session.unlinkedExpenses?.length) ? (
            <p className="py-6 text-center text-sm text-stone-500">No cash in, cash out or expenses yet.</p>
          ) : movements.length === 0 ? null : (
            <ul className="divide-y divide-stone-100">
              {movements.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  {m.dir === "IN" ? <ArrowDownCircle className="h-5 w-5 shrink-0 text-emerald-600" /> : <ArrowUpCircle className="h-5 w-5 shrink-0 text-rose-600" />}
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-sm font-medium text-stone-800", m.status !== "APPROVED" && "line-through opacity-60")}>{m.reason}</div>
                    <div className="text-xs text-stone-500">
                      {format(new Date(m.at), "h:mm a")} · {userName(m.by)}
                      {m.method !== "CASH" && ` · paid by ${EXPENSE_METHOD[m.method] ?? m.method} (not from drawer)`}
                      {m.status !== "APPROVED" && ` · ${m.status.toLowerCase()}`}
                    </div>
                  </div>
                  <div className={cn("text-sm font-semibold tabular-nums", m.dir === "IN" ? "text-emerald-700" : m.method !== "CASH" ? "text-stone-500" : "text-rose-700")}>
                    {m.dir === "IN" ? "+" : "−"}
                    {rs(m.amount)}
                  </div>
                  {open && m.dir === "OUT" && m.status === "APPROVED" && (
                    <button title="Void" onClick={() => onVoidCashOut(m.id)} className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-rose-600">
                      <Undo2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {session.unlinkedExpenses?.length > 0 && (
            <div className={cn(movements.length > 0 && "mt-3 border-t border-stone-100 pt-3")}>
              <div className="mb-1.5 text-xs font-medium text-stone-500">Entered today before the register opened</div>
              <ul className="divide-y divide-stone-100">
                {session.unlinkedExpenses.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 py-2">
                    <ArrowUpCircle className="h-5 w-5 shrink-0 text-stone-300" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-stone-800">{e.particular}</div>
                      <div className="text-xs text-stone-500">
                        {new Date(e.createdAt).toLocaleTimeString("en-US", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit" })} · {EXPENSE_METHOD[e.method ?? "CASH"] ?? e.method}
                        {e.by ? ` · ${userName(e.by)}` : ""}
                      </div>
                    </div>
                    <div className="text-sm font-semibold tabular-nums text-stone-500">−{rs(e.amount)}</div>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-stone-400">Not deducted again — your opening count already reflects this cash.</p>
            </div>
          )}
        </Panel>
      </div>

      {session.openingVariance != null && Math.abs(session.openingVariance) >= 0.5 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Opening cash differed from last closing ({rs(session.expectedOpening)}) by <b>{signedRs(session.openingVariance)}</b>
          {session.openingNote ? ` — ${session.openingNote}` : ""}.
        </div>
      )}
    </div>
  );
}

function ClosedSummary({ session }: { session: SessionDetail }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon={Banknote} label="Expected cash" value={rs(session.expectedCash)} />
        <Tile icon={Scale} label="Counted" value={rs(session.closing)} sub={session.closedAt ? `${format(new Date(session.closedAt), "dd MMM, h:mm a")} · ${userName(session.closedBy)}` : undefined} />
        <div className="rounded-xl border border-stone-200 bg-white p-3.5">
          <div className="flex items-center gap-1.5 text-xs text-stone-500">
            <AlertTriangle className="h-3.5 w-3.5" /> Difference
          </div>
          <div className={cn("mt-1 text-xl font-semibold tabular-nums", varianceCls(session.variance))}>{signedRs(session.variance)}</div>
          {session.varianceNote && <div className="mt-0.5 line-clamp-2 text-xs text-stone-500">{session.varianceNote}</div>}
        </div>
        <Tile
          icon={ShieldCheck}
          label="Review"
          value={session.reviewStatus === "APPROVED" ? "Approved" : session.reviewStatus === "PENDING" ? "Pending" : "—"}
          sub={session.reviewedBy ? `${userName(session.reviewedBy)}${session.reviewNote ? ` — ${session.reviewNote}` : ""}` : undefined}
        />
      </div>
      {session.reconciliations.length > 0 && (
        <Panel title="Reconciliation">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-stone-500">
                <tr>
                  <th className="pb-2 text-left font-medium">Method</th>
                  <th className="pb-2 text-right font-medium">POS total</th>
                  <th className="pb-2 text-right font-medium">Actual</th>
                  <th className="pb-2 text-right font-medium">Difference</th>
                  <th className="pb-2 pl-4 text-left font-medium">Reference / note</th>
                </tr>
              </thead>
              <tbody>
                {session.reconciliations.map((r) => (
                  <tr key={r.method} className="border-t border-stone-100">
                    <td className="py-2 font-medium">{METHOD_LABEL[r.method] ?? r.label}</td>
                    <td className="py-2 text-right tabular-nums">{rs(r.expected)}</td>
                    <td className="py-2 text-right tabular-nums">{rs(r.actual)}</td>
                    <td className={cn("py-2 text-right font-semibold tabular-nums", varianceCls(r.variance))}>{signedRs(r.variance)}</td>
                    <td className="py-2 pl-4 text-stone-500">{[r.reference, r.notes].filter(Boolean).join(" · ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

function ShiftTimeline({ session }: { session: SessionDetail }) {
  if (!session.shifts.length) return <p className="py-6 text-center text-sm text-stone-500">No shifts recorded.</p>;
  return (
    <ol className="relative space-y-4 border-l border-stone-200 pl-5">
      {session.shifts.map((s) => {
        const live = s.status !== "ENDED";
        return (
          <li key={s.id} className="relative">
            <span
              className={cn(
                "absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-white",
                s.status === "ON_BREAK" ? "bg-amber-500" : live ? "bg-emerald-500" : "bg-stone-300",
              )}
            />
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <div className="text-sm">
                <b className="text-stone-900">{userName(s.cashier)}</b> <span className="text-stone-500">· {KIND_LABEL[s.kind] ?? s.kind}</span>
                {s.status === "ON_BREAK" && <Pill className="ml-2 bg-amber-50 text-amber-800 ring-amber-200">On break</Pill>}
                {s.status === "ACTIVE" && <Pill className="ml-2 bg-emerald-50 text-emerald-700 ring-emerald-200">On duty</Pill>}
              </div>
              <div className="text-xs text-stone-500">
                <Clock className="mr-1 inline h-3 w-3" />
                {format(new Date(s.startedAt), "h:mm a")} – {s.endedAt ? format(new Date(s.endedAt), "h:mm a") : "now"}
              </div>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-stone-600 sm:grid-cols-4">
              <span>Started with {rs(s.startCount)}</span>
              {s.expectedEnd != null && <span>Should hand over {rs(s.expectedEnd)}</span>}
              {s.endCount != null && <span>Counted {rs(s.endCount)}</span>}
              {s.variance != null && <span className={cn("font-semibold", varianceCls(s.variance))}>Diff {signedRs(s.variance)}</span>}
            </div>
            {(s.endNote || s.startNote || s.approvedBy) && (
              <div className="mt-1 text-xs text-stone-500">
                {[s.endNote, s.kind !== "OPENING" ? s.startNote : null].filter(Boolean).join(" · ")}
                {s.approvedBy && <span className="ml-1 text-[#a67c2e]">· approved by {userName(s.approvedBy)}</span>}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ====================================================================== */

function Board({ rows, onPick }: { rows: BoardRow[] | null; onPick: (branchId: string) => void }) {
  if (!rows) return <div className="h-40 animate-pulse rounded-xl bg-stone-200/60" />;
  if (!rows.length) return <Empty icon={LayoutGrid} title="No branches" />;
  const counts = rows.reduce<Record<string, number>>((m, r) => ((m[r.state] = (m[r.state] || 0) + 1), m), {});
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-sm">
        {(["OPEN", "LOCKED", "CLOSED", "NOT_OPENED"] as const).map((s) => (
          <Pill key={s} className={STATE_META[s].cls}>
            <span className={cn("h-1.5 w-1.5 rounded-full", STATE_META[s].dot)} />
            {STATE_META[s].label}: {counts[s] || 0}
          </Pill>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <button
            key={r.branch.id}
            onClick={() => onPick(r.branch.id)}
            className="rounded-xl border border-stone-200 bg-white p-4 text-left transition-shadow hover:border-[#a67c2e]/50 hover:shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-semibold text-stone-900">{r.branch.name}</div>
                <div className="text-xs text-stone-500">{r.branch.code}</div>
              </div>
              <Pill className={STATE_META[r.state].cls}>
                <span className={cn("h-1.5 w-1.5 rounded-full", STATE_META[r.state].dot)} />
                {STATE_META[r.state].label}
              </Pill>
            </div>
            {r.session ? (
              <dl className="mt-3 grid grid-cols-2 gap-y-1.5 text-sm">
                <dt className="text-stone-500">{r.state === "CLOSED" ? "Counted" : "Expected cash"}</dt>
                <dd className="text-right font-semibold tabular-nums">{rs(r.state === "CLOSED" ? r.session.closing : r.session.expectedCash)}</dd>
                {r.state === "CLOSED" ? (
                  <>
                    <dt className="text-stone-500">Difference</dt>
                    <dd className={cn("text-right font-semibold tabular-nums", varianceCls(r.session.variance))}>{signedRs(r.session.variance)}</dd>
                  </>
                ) : (
                  <>
                    <dt className="text-stone-500">On duty</dt>
                    <dd className="truncate text-right">{r.session.onDuty ?? "—"}</dd>
                    <dt className="text-stone-500">Bills</dt>
                    <dd className="text-right tabular-nums">{r.session.bills ?? 0}</dd>
                  </>
                )}
                <dt className="text-stone-500">Handovers</dt>
                <dd className="text-right tabular-nums">{r.session.handovers}</dd>
              </dl>
            ) : (
              <p className="mt-3 text-sm text-stone-500">Not opened today.</p>
            )}
            {(r.session?.stale || r.pendingReviews > 0 || r.session?.lockedReason) && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {r.session?.stale && <Pill className="bg-rose-50 text-rose-700 ring-rose-200">Open since earlier day</Pill>}
                {r.session?.lockedReason && <Pill className="bg-amber-50 text-amber-800 ring-amber-200">{r.session.lockedReason}</Pill>}
                {r.pendingReviews > 0 && <Pill className="bg-amber-50 text-amber-800 ring-amber-200">{r.pendingReviews} awaiting review</Pill>}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ====================================================================== */

const PRESETS = [
  { id: "today", label: "Today", days: 0 },
  { id: "7", label: "7 days", days: 6 },
  { id: "30", label: "30 days", days: 29 },
] as const;

function Reconciliation({ branches, onOpenSession }: { branches: { id: string; name: string }[]; onOpenSession: (id: string) => void }) {
  const { toast } = useToast();
  const today = format(new Date(), "yyyy-MM-dd");
  const [from, setFrom] = useState(format(subDays(new Date(), 6), "yyyy-MM-dd"));
  const [to, setTo] = useState(today);
  const [branch, setBranch] = useState("all");
  const [status, setStatus] = useState("ALL");
  const [data, setData] = useState<ReconReport | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await registerApi.reconciliation({ from, to, branchId: branch === "all" ? undefined : branch, status }));
    } catch (e) {
      toast({ variant: "destructive", title: "Could not load report", description: errorMessage(e) });
    } finally {
      setLoading(false);
    }
  }, [from, to, branch, status, toast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-stone-200 bg-white p-3">
        <div className="flex gap-1">
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant="outline"
              className={cn(from === format(subDays(new Date(), p.days), "yyyy-MM-dd") && to === today && "border-[#a67c2e] text-[#a67c2e]")}
              onClick={() => {
                setFrom(format(subDays(new Date(), p.days), "yyyy-MM-dd"));
                setTo(today);
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
        <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
        {branches.length > 1 && (
          <Select value={branch} onValueChange={setBranch}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All sessions</SelectItem>
            <SelectItem value="PENDING">Awaiting review</SelectItem>
            <SelectItem value="OPEN">Still open</SelectItem>
          </SelectContent>
        </Select>
        {loading && <Loader2 className="mb-2 h-4 w-4 animate-spin text-stone-400" />}
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile icon={Monitor} label="Register sessions" value={String(data.totals.sessions)} />
            <Tile icon={ShieldAlert} label="Awaiting review" value={String(data.totals.pendingReview)} />
            <div className="rounded-xl border border-stone-200 bg-white p-3.5">
              <div className="flex items-center gap-1.5 text-xs text-stone-500">
                <Banknote className="h-3.5 w-3.5" /> Net cash difference
              </div>
              <div className={cn("mt-1 text-xl font-semibold tabular-nums", varianceCls(data.totals.cashVariance))}>{signedRs(data.totals.cashVariance)}</div>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-3.5">
              <div className="flex items-center gap-1.5 text-xs text-stone-500">
                <CreditCard className="h-3.5 w-3.5" /> Non-cash difference
              </div>
              <div className={cn("mt-1 text-xl font-semibold tabular-nums", varianceCls(data.totals.methods.filter((m) => m.method !== "CASH").reduce((t, m) => t + m.variance, 0)))}>
                {signedRs(data.totals.methods.filter((m) => m.method !== "CASH").reduce((t, m) => t + m.variance, 0))}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Sessions" className="lg:col-span-2">
              {data.sessions.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-500">No register sessions in this period.</p>
              ) : (
                <div className="-mx-4 overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="text-xs text-stone-500">
                      <tr className="border-b border-stone-100">
                        <th className="px-4 pb-2 text-left font-medium">Date</th>
                        <th className="pb-2 text-left font-medium">Branch</th>
                        <th className="pb-2 text-left font-medium">Closed by</th>
                        <th className="pb-2 text-right font-medium">Expected</th>
                        <th className="pb-2 text-right font-medium">Counted</th>
                        <th className="pb-2 text-right font-medium">Difference</th>
                        <th className="px-4 pb-2 text-right font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sessions.map((s) => (
                        <tr key={s.id} onClick={() => onOpenSession(s.id)} className="cursor-pointer border-b border-stone-50 hover:bg-[#fcf8f2]">
                          <td className="px-4 py-2.5">
                            <div className="font-medium">{format(new Date(s.openedAt), "dd MMM yyyy")}</div>
                            <div className="text-xs text-stone-500">{s.handovers ? `${s.handovers} handover${s.handovers > 1 ? "s" : ""}` : "single shift"}</div>
                          </td>
                          <td className="py-2.5">{s.branch?.name ?? "—"}</td>
                          <td className="py-2.5">{userName(s.closedBy)}</td>
                          <td className="py-2.5 text-right tabular-nums">{rs(s.expectedCash)}</td>
                          <td className="py-2.5 text-right tabular-nums">{rs(s.closing)}</td>
                          <td className={cn("py-2.5 text-right font-semibold tabular-nums", varianceCls(s.variance))}>
                            {signedRs(s.variance)}
                            {s.varianceNote && <div className="max-w-[180px] truncate text-right text-xs font-normal text-stone-500">{s.varianceNote}</div>}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {s.status === "OPEN" ? (
                              <Pill className={STATE_META.OPEN.cls}>Open</Pill>
                            ) : s.reviewStatus === "PENDING" ? (
                              <Pill className={REVIEW_META.PENDING.cls}>Review</Pill>
                            ) : (
                              <Pill className={REVIEW_META.APPROVED.cls}>
                                <CheckCircle2 className="h-3 w-3" /> OK
                              </Pill>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <div className="space-y-4">
              <Panel title="By payment method">
                {data.totals.methods.length === 0 ? (
                  <p className="text-sm text-stone-500">Nothing reconciled yet.</p>
                ) : (
                  <ul className="space-y-2.5 text-sm">
                    {data.totals.methods.map((m) => (
                      <li key={m.method} className="flex items-center justify-between gap-2">
                        <span className="text-stone-700">{METHOD_LABEL[m.method] ?? m.label}</span>
                        <span className="text-right">
                          <span className="tabular-nums text-stone-500">{rs(m.actual)}</span>
                          <span className={cn("ml-2 font-semibold tabular-nums", varianceCls(m.variance))}>{signedRs(m.variance)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="By cashier (shift differences)">
                {data.byCashier.length === 0 ? (
                  <p className="text-sm text-stone-500">No completed shifts.</p>
                ) : (
                  <ul className="space-y-2.5 text-sm">
                    {data.byCashier.map((c) => (
                      <li key={c.cashier} className="flex items-center justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-stone-800">{userName(c.cashier)}</span>
                          <span className="text-xs text-stone-500">
                            {c.shifts} shifts · short {rs(Math.abs(c.short))} · over {rs(c.over)}
                          </span>
                        </span>
                        <span className={cn("font-semibold tabular-nums", varianceCls(c.net))}>{signedRs(c.net)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

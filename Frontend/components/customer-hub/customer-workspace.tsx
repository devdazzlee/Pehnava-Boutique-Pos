"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  BookOpenText,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Download,
  FileText,
  HandCoins,
  LayoutDashboard,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Phone,
  Printer,
  Receipt,
  SearchX,
  ShoppingBag,
  Trash2,
  Wallet,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { YmdDatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { startOfBusinessMonthYmd, businessTodayYmd } from "@/lib/business-timezone";
import { Bone, Chips, EmptyState, FilterBar, MultiChips, SearchBox, StatTile } from "@/components/accounts/coa-ui";
import { ConfirmDialog } from "@/components/accounts/coa-dialogs";
import { escapeHtml, printDocument } from "@/components/accounts/coa-shared";
import { CustomerFormDialog, TransactionDialog } from "./customer-dialogs";
import {
  AGING_META,
  LEDGER_META,
  METHOD_LABEL,
  TXN_META,
  apiError,
  customerApi,
  displayEmail,
  initials,
  num,
  rs,
  rs2,
  whatsappReminder,
  type AgingBucket,
  type CustomerRow,
  type LedgerData,
  type LedgerEntry,
  type PurchasesData,
  type StatementData,
  type Txn,
  type TxnType,
} from "./customer-api";

type Tab = "overview" | "ledger" | "bills" | "transactions" | "purchases" | "statement";

const TABS: { id: Tab; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "ledger", label: "Ledger", icon: BookOpenText },
  { id: "bills", label: "Open bills", icon: Receipt },
  { id: "transactions", label: "Transactions", icon: HandCoins },
  { id: "purchases", label: "Purchases", icon: ShoppingBag },
  { id: "statement", label: "Statement", icon: FileText },
];

const day = (v: string | Date | null | undefined) => (v ? format(new Date(v), "dd MMM yyyy") : "—");
const balanceText = (balance: number) => (balance > 0.005 ? `${rs(balance)} owed` : balance < -0.005 ? `${rs(-balance)} advance` : "Settled");

export function CustomerWorkspace({
  customer,
  open,
  onOpenChange,
  onChanged,
  canDelete,
  initialTab = "overview",
}: {
  customer: CustomerRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
  canDelete: boolean;
  initialTab?: Tab;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [ledger, setLedger] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [txnDialog, setTxnDialog] = useState<{ open: boolean; type: TxnType; saleId?: string | null; editing?: Txn | null }>({
    open: false,
    type: "PAYMENT",
  });
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTxn, setDeleteTxn] = useState<Txn | null>(null);
  const [deleteCustomer, setDeleteCustomer] = useState(false);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab, customer?.id]);

  const loadLedger = useCallback(async () => {
    if (!customer) return;
    setLoading(true);
    try {
      setLedger(await customerApi.ledger(customer.id));
    } catch (error) {
      toast({ variant: "destructive", title: "Could not load customer account", description: apiError(error) });
    } finally {
      setLoading(false);
    }
  }, [customer, toast]);

  useEffect(() => {
    if (open && customer) {
      setLedger(null);
      loadLedger();
    }
  }, [open, customer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => {
    loadLedger();
    onChanged();
  };

  if (!customer) return null;
  const s = ledger?.summary;
  const balance = s?.balance ?? customer.balance;
  const due = s?.balanceDue ?? customer.balance_due;
  const advance = s?.advanceBalance ?? customer.advance_balance;
  const overdue = s?.overdue ?? customer.overdue_amount;
  const limit = s?.creditLimit ?? (customer.credit_limit != null && customer.credit_limit !== "" ? num(customer.credit_limit) : null);
  const usage = limit && limit > 0 ? Math.min(100, (due / limit) * 100) : 0;

  const openTxn = (type: TxnType, saleId?: string | null) => setTxnDialog({ open: true, type, saleId, editing: null });

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1100px,96vw)]">
          {/* ---------- header ---------- */}
          <div className="border-b border-gray-200 bg-gradient-to-br from-[#2a2012] to-[#463619] px-5 pb-4 pt-5 text-white sm:px-6">
            <div className="flex flex-wrap items-start gap-4 pr-8">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#e9d3a4] text-lg font-bold text-[#2a2012] shadow-sm">
                {initials(customer.name)}
              </span>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-xl font-bold text-white">{customer.name || "Unnamed customer"}</SheetTitle>
                <SheetDescription asChild>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/70">
                    {customer.phone_number ? (
                      <a href={`tel:${customer.phone_number}`} className="inline-flex items-center gap-1 hover:text-white">
                        <Phone className="h-3.5 w-3.5" />
                        {customer.phone_number}
                      </a>
                    ) : null}
                    {displayEmail(customer.email) ? (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5" />
                        {displayEmail(customer.email)}
                      </span>
                    ) : null}
                    {customer.address ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {customer.address}
                      </span>
                    ) : null}
                    <span>Customer since {day(customer.created_at)}</span>
                  </div>
                </SheetDescription>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", customer.is_active ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 text-white/60")}>
                    {customer.is_active ? "Active" : "Inactive"}
                  </span>
                  {s?.overLimit || customer.over_limit ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-400/20 px-2 py-0.5 text-[11px] font-medium text-rose-200">
                      <AlertTriangle className="h-3 w-3" />Over credit limit
                    </span>
                  ) : null}
                  {overdue > 0.005 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] font-medium text-amber-200">
                      <CalendarClock className="h-3 w-3" />{rs(overdue)} overdue
                    </span>
                  ) : null}
                  {s?.creditDays ? (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/70">{s.creditDays}-day terms</span>
                  ) : null}
                </div>
              </div>
              <div className="rounded-xl bg-white/10 px-4 py-3 text-right ring-1 ring-white/15">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-white/60">
                  {balance > 0.005 ? "Customer owes" : balance < -0.005 ? "Advance held" : "Balance"}
                </p>
                <p className={cn("text-2xl font-bold tabular-nums", balance > 0.005 ? "text-rose-200" : balance < -0.005 ? "text-emerald-200" : "text-white")}>
                  {balance > 0.005 ? rs(due) : balance < -0.005 ? rs(advance) : "Settled"}
                </p>
                {limit ? (
                  <div className="mt-1.5 w-40">
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                      <div className={cn("h-1.5 rounded-full", usage >= 100 ? "bg-rose-400" : usage >= 80 ? "bg-amber-300" : "bg-emerald-300")} style={{ width: `${usage}%` }} />
                    </div>
                    <p className="mt-0.5 text-[10px] text-white/60">
                      {rs(due)} of {rs(limit)} limit
                    </p>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button size="sm" className="h-9 bg-[#e9d3a4] text-[#2a2012] hover:bg-[#f3e2bd]" onClick={() => openTxn("PAYMENT")}>
                <ArrowDownLeft className="mr-1.5 h-4 w-4" />Receive payment
              </Button>
              <Button size="sm" variant="outline" className="h-9 border-white/20 bg-white/5 text-white hover:bg-white/15 hover:text-white" onClick={() => openTxn("ADVANCE")}>
                <Wallet className="mr-1.5 h-4 w-4" />Take advance
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-9 border-white/20 bg-white/5 text-white hover:bg-white/15 hover:text-white">
                    More entries <ChevronDown className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-gray-400">Account adjustments</DropdownMenuLabel>
                  {(["REFUND", "CREDIT_NOTE", "DEBIT_NOTE", "WRITE_OFF"] as TxnType[]).map((t) => (
                    <DropdownMenuItem key={t} onClick={() => openTxn(t)}>
                      {TXN_META[t].side === "credit" ? <ArrowDownLeft className="mr-2 h-4 w-4 text-emerald-600" /> : <ArrowUpRight className="mr-2 h-4 w-4 text-rose-600" />}
                      <div>
                        <p className="text-sm">{TXN_META[t].verb}</p>
                        <p className="text-[11px] text-gray-500">{TXN_META[t].side === "credit" ? "Reduces balance" : "Increases balance"}</p>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="ml-auto flex flex-wrap gap-2">
                {customer.phone_number && due > 0.005 ? (
                  <Button size="sm" variant="outline" className="h-9 border-white/20 bg-white/5 text-white hover:bg-white/15 hover:text-white" onClick={() => whatsappReminder(customer, due)}>
                    <MessageCircle className="mr-1.5 h-4 w-4" />Reminder
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" className="h-9 border-white/20 bg-white/5 text-white hover:bg-white/15 hover:text-white" onClick={() => setTab("statement")}>
                  <Printer className="mr-1.5 h-4 w-4" />Statement
                </Button>
                <Button size="sm" variant="outline" className="h-9 border-white/20 bg-white/5 text-white hover:bg-white/15 hover:text-white" onClick={() => setEditOpen(true)}>
                  <Pencil className="mr-1.5 h-4 w-4" />Edit
                </Button>
                {canDelete ? (
                  <Button size="icon" variant="outline" className="h-9 w-9 border-white/20 bg-white/5 text-rose-200 hover:bg-rose-500/20 hover:text-white" onClick={() => setDeleteCustomer(true)} aria-label="Delete customer">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          {/* ---------- tabs ---------- */}
          <div className="border-b border-gray-200 bg-white px-3 sm:px-5">
            <div className="-mb-px flex gap-1 overflow-x-auto">
              {TABS.map((t) => {
                const count =
                  t.id === "bills" ? ledger?.openItems.length : t.id === "transactions" ? ledger?.payments.length : t.id === "ledger" ? ledger?.entries.length : undefined;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition-colors",
                      tab === t.id ? "border-[#a67c2e] text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800",
                    )}
                  >
                    <t.icon className="h-4 w-4" />
                    {t.label}
                    {count ? <span className="rounded-full bg-gray-100 px-1.5 text-[10px] tabular-nums text-gray-500">{count}</span> : null}
                  </button>
                );
              })}
              {loading && ledger ? <Loader2 className="ml-auto mt-3.5 h-4 w-4 animate-spin text-gray-400" /> : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8f6f2] p-4 sm:p-5">
            {!ledger ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, i) => <Bone key={i} className="h-20 rounded-xl" />)}
                </div>
                <Bone className="h-64 rounded-xl" />
              </div>
            ) : tab === "overview" ? (
              <OverviewTab customer={customer} ledger={ledger} onTab={setTab} onReceive={(saleId) => openTxn("PAYMENT", saleId)} />
            ) : tab === "ledger" ? (
              <LedgerTab customer={customer} ledger={ledger} />
            ) : tab === "bills" ? (
              <BillsTab ledger={ledger} onReceive={(saleId) => openTxn("PAYMENT", saleId)} />
            ) : tab === "transactions" ? (
              <TransactionsTab
                ledger={ledger}
                onNew={(type) => openTxn(type)}
                onEdit={(t) => setTxnDialog({ open: true, type: t.type, editing: t })}
                onDelete={setDeleteTxn}
              />
            ) : tab === "purchases" ? (
              <PurchasesTab customerId={customer.id} />
            ) : (
              <StatementTab customer={customer} />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <TransactionDialog
        open={txnDialog.open}
        onOpenChange={(o) => setTxnDialog((d) => ({ ...d, open: o }))}
        customer={customer}
        initialType={txnDialog.type}
        initialSaleId={txnDialog.saleId}
        editing={txnDialog.editing}
        openItems={ledger?.openItems ?? []}
        balanceDue={due}
        advanceBalance={advance}
        onSaved={refresh}
      />
      <CustomerFormDialog open={editOpen} onOpenChange={setEditOpen} editing={customer} onSaved={refresh} />
      <ConfirmDialog
        open={!!deleteTxn}
        onOpenChange={(o) => !o && setDeleteTxn(null)}
        title="Delete this transaction?"
        description={deleteTxn ? `${TXN_META[deleteTxn.type].label} of ${rs(deleteTxn.amount)} on ${day(deleteTxn.payment_date)} will be removed and the balance recalculated.` : ""}
        onConfirm={async () => {
          if (!deleteTxn) return;
          try {
            await customerApi.deleteTxn(customer.id, deleteTxn.id);
            toast({ title: "Transaction deleted" });
            refresh();
          } catch (error) {
            toast({ variant: "destructive", title: "Could not delete", description: apiError(error) });
            throw error;
          }
        }}
      />
      <ConfirmDialog
        open={deleteCustomer}
        onOpenChange={setDeleteCustomer}
        title={`Delete ${customer.name || "customer"}?`}
        description="This permanently removes the customer together with their sales, payments and history. Consider marking them inactive instead."
        onConfirm={async () => {
          try {
            await customerApi.remove(customer.id);
            toast({ title: "Customer deleted" });
            onOpenChange(false);
            onChanged();
          } catch (error) {
            toast({ variant: "destructive", title: "Could not delete customer", description: apiError(error) });
            throw error;
          }
        }}
      />
    </>
  );
}

/* ============================ overview ============================ */

function AgingBar({ aging }: { aging: Record<AgingBucket, number> }) {
  const total = AGING_META.reduce((s, b) => s + (aging[b.key] || 0), 0);
  if (total <= 0.005) return <p className="py-4 text-center text-xs text-gray-400">Nothing outstanding.</p>;
  return (
    <div className="space-y-3">
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-gray-100">
        {AGING_META.filter((b) => aging[b.key] > 0.005).map((b) => (
          <div key={b.key} style={{ width: `${(aging[b.key] / total) * 100}%`, background: b.color }} title={`${b.label}: ${rs(aging[b.key])}`} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {AGING_META.map((b) => (
          <div key={b.key} className="rounded-lg border border-gray-100 bg-white px-2.5 py-2">
            <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
              <span className="h-2 w-2 rounded-full" style={{ background: b.color }} />
              {b.short}
            </p>
            <p className="text-sm font-semibold tabular-nums text-gray-900">{aging[b.key] > 0.005 ? rs(aging[b.key]) : "—"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Card({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-gray-200/80 bg-white shadow-sm", className)}>
      <header className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function OverviewTab({
  customer,
  ledger,
  onTab,
  onReceive,
}: {
  customer: CustomerRow;
  ledger: LedgerData;
  onTab: (t: Tab) => void;
  onReceive: (saleId?: string | null) => void;
}) {
  const s = ledger.summary;
  const t = s.totals;
  const overdueItems = ledger.openItems.filter((i) => i.daysOverdue > 0).slice(0, 4);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total purchases" value={rs(t?.sales ?? customer.total_sale_amount)} hint={`${s.saleCount} bill(s) · last ${day(customer.last_sale_date)}`} />
        <StatTile label="Total received" value={rs((t?.paidAtSale ?? 0) + (t?.payments ?? 0) + (t?.advances ?? 0))} hint={`Last payment ${day(s.lastPaymentDate)}`} />
        <StatTile label="Returns" value={rs(t?.returns ?? 0)} hint={`${s.returnCount} return / exchange`} />
        <StatTile
          label="Credit available"
          value={s.creditLimit ? rs(s.creditAvailable ?? 0) : "No limit"}
          hint={s.creditLimit ? `Limit ${rs(s.creditLimit)}${s.creditDays ? ` · ${s.creditDays} days` : ""}` : s.creditDays ? `${s.creditDays}-day terms` : "Set in Edit"}
          tone={s.overLimit ? "bad" : "default"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Receivable aging" action={<button className="text-xs font-medium text-[#8a6520] hover:underline" onClick={() => onTab("bills")}>Open bills →</button>}>
          <AgingBar aging={s.aging} />
          {overdueItems.length ? (
            <div className="mt-4 divide-y divide-gray-50 rounded-lg border border-rose-100">
              {overdueItems.map((i) => (
                <div key={i.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">{i.daysOverdue}d late</span>
                  <span className="min-w-0 flex-1 truncate text-gray-700">{i.description}</span>
                  <span className="font-semibold tabular-nums text-gray-900">{rs(i.outstanding)}</span>
                  {i.saleId ? (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onReceive(i.saleId)}>Receive</Button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </Card>

        <Card title="Account summary">
          <dl className="space-y-2 text-sm">
            {[
              ["Opening balance", t?.opening ?? 0, "+"],
              ["Sales", t?.sales ?? 0, "+"],
              ["Exchanges", t?.exchanges ?? 0, "+"],
              ["Refunds paid", t?.refunds ?? 0, "+"],
              ["Debit notes", t?.debitNotes ?? 0, "+"],
              ["Paid at sale", t?.paidAtSale ?? 0, "−"],
              ["Payments", t?.payments ?? 0, "−"],
              ["Advances", t?.advances ?? 0, "−"],
              ["Returns", t?.returns ?? 0, "−"],
              ["Credit notes", t?.creditNotes ?? 0, "−"],
              ["Write-offs", t?.writeOffs ?? 0, "−"],
            ]
              .filter(([, v]) => Number(v) > 0.005)
              .map(([label, v, sign]) => (
                <div key={String(label)} className="flex justify-between gap-3">
                  <dt className="text-gray-500">{label}</dt>
                  <dd className={cn("tabular-nums", sign === "+" ? "text-gray-900" : "text-emerald-700")}>
                    {sign} {rs(Number(v))}
                  </dd>
                </div>
              ))}
            <div className="flex justify-between gap-3 border-t border-dashed pt-2 font-semibold">
              <dt>Balance</dt>
              <dd className={cn("tabular-nums", s.balance > 0.005 ? "text-rose-700" : s.balance < -0.005 ? "text-emerald-700" : "text-gray-900")}>{balanceText(s.balance)}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Recent activity" action={<button className="text-xs font-medium text-[#8a6520] hover:underline" onClick={() => onTab("ledger")}>Full ledger →</button>}>
          {ledger.entries.length === 0 ? (
            <p className="py-6 text-center text-xs text-gray-400">No activity yet.</p>
          ) : (
            <ol className="space-y-3">
              {ledger.entries.slice(0, 7).map((e) => (
                <li key={e.id} className="flex items-start gap-3">
                  <span className={cn("mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset", LEDGER_META[e.type]?.tone)}>
                    {LEDGER_META[e.type]?.label || e.type}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm text-gray-800">{e.description}</p>
                    <p className="text-[11px] text-gray-400">{day(e.date)}</p>
                  </div>
                  <span className={cn("shrink-0 text-sm font-semibold tabular-nums", e.debit ? "text-gray-900" : "text-emerald-700")}>
                    {e.debit ? `+${rs(e.debit)}` : `−${rs(e.credit)}`}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card title="Notes">
          {customer.notes ? (
            <p className="whitespace-pre-wrap text-sm text-gray-700">{customer.notes}</p>
          ) : (
            <p className="text-xs text-gray-400">No notes. Add measurements or preferences from Edit.</p>
          )}
          {customer.billing_address ? (
            <p className="mt-3 text-xs text-gray-500">
              <span className="font-medium text-gray-700">Billing:</span> {customer.billing_address}
            </p>
          ) : null}
          {num(customer.default_discount_percent) > 0 ? (
            <p className="mt-1 text-xs text-gray-500">
              <span className="font-medium text-gray-700">Default discount:</span> {num(customer.default_discount_percent)}%
            </p>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

/* ============================ ledger ============================ */

type LedgerGroup = "sales" | "payments" | "returns" | "adjustments";
const GROUP_TYPES: Record<LedgerGroup, LedgerEntry["type"][]> = {
  sales: ["OPENING", "SALE", "EXCHANGE"],
  payments: ["SALE_PAYMENT", "PAYMENT", "ADVANCE"],
  returns: ["RETURN", "RETURN_REFUND", "REFUND"],
  adjustments: ["CREDIT_NOTE", "DEBIT_NOTE", "WRITE_OFF"],
};

function LedgerTab({ customer, ledger }: { customer: CustomerRow; ledger: LedgerData }) {
  const [groups, setGroups] = useState<LedgerGroup[]>([]);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const chronological = useMemo(() => [...ledger.entries].reverse(), [ledger.entries]);
  const rows = useMemo(
    () =>
      chronological.filter((e) => {
        if (groups.length && !groups.some((g) => GROUP_TYPES[g].includes(e.type))) return false;
        const d = format(new Date(e.date), "yyyy-MM-dd");
        if (from && d < from) return false;
        if (to && d > to) return false;
        const q = search.trim().toLowerCase();
        return !q || e.description.toLowerCase().includes(q) || (e.reference || "").toLowerCase().includes(q);
      }),
    [chronological, groups, search, from, to],
  );
  const debit = rows.reduce((s, e) => s + e.debit, 0);
  const credit = rows.reduce((s, e) => s + e.credit, 0);
  const filtered = rows.length !== chronological.length;
  const counts = (g: LedgerGroup) => chronological.filter((e) => GROUP_TYPES[g].includes(e.type)).length;

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(
      rows.map((e) => ({
        Date: format(new Date(e.date), "yyyy-MM-dd"),
        Type: LEDGER_META[e.type]?.label || e.type,
        Reference: e.reference || "",
        Description: e.description,
        Debit: e.debit,
        Credit: e.credit,
        Balance: e.balance,
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ledger");
    XLSX.writeFile(wb, `ledger-${(customer.name || "customer").replace(/\s+/g, "-")}.xlsx`);
  };

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-sm">
      <FilterBar>
        <SearchBox value={search} onChange={setSearch} placeholder="Search description or invoice…" className="max-w-xs" />
        <div className="flex items-center gap-1.5">
          <YmdDatePicker value={from} onChange={setFrom} className="h-9 w-[140px]" />
          <span className="text-xs text-gray-400">to</span>
          <YmdDatePicker value={to} onChange={setTo} className="h-9 w-[140px]" />
        </div>
        <Button size="sm" variant="outline" className="ml-auto h-9" onClick={exportExcel}>
          <Download className="mr-1 h-4 w-4" />Excel
        </Button>
      </FilterBar>
      <FilterBar className="bg-white">
        <MultiChips<LedgerGroup>
          value={groups}
          onChange={setGroups}
          allLabel="All entries"
          options={[
            { value: "sales", label: "Sales & charges", count: counts("sales") },
            { value: "payments", label: "Payments & advances", count: counts("payments") },
            { value: "returns", label: "Returns & refunds", count: counts("returns") },
            { value: "adjustments", label: "Notes & write-offs", count: counts("adjustments") },
          ]}
        />
        {filtered ? (
          <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={() => { setGroups([]); setSearch(""); setFrom(""); setTo(""); }}>
            Clear filters
          </Button>
        ) : null}
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState icon={SearchX} title={chronological.length ? "No entries match these filters" : "No ledger entries yet"} />
      ) : (
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <th className="w-28 px-4 py-2.5">Date</th>
                <th className="w-32 px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Description</th>
                <th className="w-28 px-3 py-2.5 text-right">Debit</th>
                <th className="w-28 px-3 py-2.5 text-right">Credit</th>
                <th className="w-36 px-4 py-2.5 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50/70">
                  <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">{day(e.date)}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", LEDGER_META[e.type]?.tone)}>
                      {LEDGER_META[e.type]?.label || e.type}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-800">{e.description}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{e.debit ? rs2(e.debit) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">{e.credit ? rs2(e.credit) : "—"}</td>
                  <td className={cn("px-4 py-2.5 text-right font-semibold tabular-nums", e.balance > 0.005 ? "text-gray-900" : e.balance < -0.005 ? "text-emerald-700" : "text-gray-400")}>
                    {e.balance < -0.005 ? `${rs2(-e.balance)} Cr` : rs2(e.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0">
              <tr className="bg-[#2a2012] text-sm font-semibold text-white">
                <td className="px-4 py-2.5" colSpan={3}>{filtered ? "Totals (filtered)" : "Totals"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{rs2(debit)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{rs2(credit)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{balanceText(ledger.summary.balance)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

/* ============================ open bills ============================ */

function BillsTab({ ledger, onReceive }: { ledger: LedgerData; onReceive: (saleId?: string | null) => void }) {
  const [bucket, setBucket] = useState<"all" | AgingBucket>("all");
  const items = ledger.openItems.filter((i) => bucket === "all" || i.bucket === bucket);
  const total = items.reduce((s, i) => s + i.outstanding, 0);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200/80 bg-white p-4 shadow-sm">
        <AgingBar aging={ledger.summary.aging} />
        {ledger.summary.advanceBalance > 0.005 ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 ring-1 ring-emerald-200">
            {rs(ledger.summary.advanceBalance)} advance is held on this account and will settle future bills automatically.
          </p>
        ) : null}
      </div>
      <section className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-sm">
        <FilterBar>
          <Chips
            value={bucket}
            onChange={setBucket}
            options={[
              { value: "all", label: "All open", count: ledger.openItems.length },
              ...AGING_META.map((b) => ({ value: b.key, label: b.short, count: ledger.openItems.filter((i) => i.bucket === b.key).length })),
            ]}
          />
          <span className="ml-auto text-xs text-gray-500">
            Outstanding <span className="font-semibold text-gray-900">{rs(total)}</span>
          </span>
        </FilterBar>
        {items.length === 0 ? (
          <EmptyState icon={Receipt} title={ledger.openItems.length ? "No bills in this bucket" : "No open bills"} description="Everything this customer bought is paid for." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2.5">Bill</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Due</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                  <th className="px-3 py-2.5 text-right">Paid</th>
                  <th className="px-3 py-2.5 text-right">Outstanding</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const pct = i.amount > 0 ? (i.paid / i.amount) * 100 : 0;
                  return (
                    <tr key={i.key} className="border-b border-gray-50 hover:bg-gray-50/70">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{i.reference || i.description}</p>
                        <p className="text-[11px] text-gray-400">{i.description}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-gray-600">{day(i.date)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-gray-600">{day(i.dueDate)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{rs(i.amount)}</td>
                      <td className="px-3 py-3 text-right">
                        <span className="tabular-nums text-emerald-700">{i.paid ? rs(i.paid) : "—"}</span>
                        <div className="ml-auto mt-1 h-1 w-20 rounded-full bg-gray-100">
                          <div className="h-1 rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-gray-900">{rs(i.outstanding)}</td>
                      <td className="px-3 py-3">
                        {i.daysOverdue > 0 ? (
                          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: AGING_META.find((b) => b.key === i.bucket)?.color }}>
                            {i.daysOverdue} days late
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">Not due</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Button size="sm" variant="outline" className="h-8" onClick={() => onReceive(i.saleId)}>
                          Receive
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

/* ============================ transactions ============================ */

function TransactionsTab({
  ledger,
  onNew,
  onEdit,
  onDelete,
}: {
  ledger: LedgerData;
  onNew: (type: TxnType) => void;
  onEdit: (t: Txn) => void;
  onDelete: (t: Txn) => void;
}) {
  const [types, setTypes] = useState<TxnType[]>([]);
  const [search, setSearch] = useState("");
  const rows = ledger.payments.filter(
    (t) =>
      (!types.length || types.includes(t.type)) &&
      (!search.trim() ||
        [t.reference, t.notes, t.sale?.invoice_number, t.sale?.sale_number, t.method].some((v) => (v || "").toLowerCase().includes(search.trim().toLowerCase()))),
  );
  const totalsByType = (Object.keys(TXN_META) as TxnType[]).map((type) => ({
    type,
    count: ledger.payments.filter((p) => p.type === type).length,
    amount: ledger.payments.filter((p) => p.type === type).reduce((s, p) => s + p.amount, 0),
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {totalsByType.map((t) => (
          <button
            key={t.type}
            type="button"
            onClick={() => onNew(t.type)}
            className="group rounded-xl border border-gray-200/80 bg-white p-3 text-left shadow-sm transition-all hover:border-[#a67c2e]/40 hover:shadow-md"
          >
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset", TXN_META[t.type].tone)}>{TXN_META[t.type].label}</span>
            <p className="mt-2 text-base font-bold tabular-nums text-gray-900">{t.amount ? rs(t.amount) : "—"}</p>
            <p className="text-[11px] text-gray-400 group-hover:text-[#8a6520]">{t.count} entries · + new</p>
          </button>
        ))}
      </div>
      <section className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-sm">
        <FilterBar>
          <SearchBox value={search} onChange={setSearch} placeholder="Reference, note, invoice…" className="max-w-xs" />
          <MultiChips<TxnType>
            value={types}
            onChange={setTypes}
            allLabel="All types"
            options={totalsByType.filter((t) => t.count).map((t) => ({ value: t.type, label: TXN_META[t.type].label, count: t.count }))}
          />
        </FilterBar>
        {rows.length === 0 ? (
          <EmptyState
            icon={HandCoins}
            title={ledger.payments.length ? "No transactions match" : "No account transactions yet"}
            description="Payments, advances, refunds and credit/debit notes recorded for this customer appear here."
            action={<Button size="sm" className="bg-[#2a2012] hover:bg-[#3b2e1a]" onClick={() => onNew("PAYMENT")}>Receive payment</Button>}
          />
        ) : (
          <div className="divide-y divide-gray-50">
            {rows.map((t) => {
              const m = TXN_META[t.type];
              return (
                <div key={t.id} className="group flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-gray-50/70">
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset", m.tone)}>
                    {m.side === "credit" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {m.label}
                      {m.cash ? <span className="ml-1.5 text-xs font-normal text-gray-500">· {METHOD_LABEL[t.method] || t.method}</span> : null}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {day(t.payment_date)}
                      {t.sale ? ` · against ${t.sale.invoice_number || t.sale.sale_number}` : ""}
                      {t.reference ? ` · ref ${t.reference}` : ""}
                      {t.user?.email ? ` · by ${t.user.email.split("@")[0]}` : ""}
                    </p>
                    {t.notes ? <p className="mt-0.5 text-xs text-gray-600">{t.notes}</p> : null}
                  </div>
                  <span className={cn("text-base font-bold tabular-nums", m.side === "credit" ? "text-emerald-700" : "text-rose-700")}>
                    {m.side === "credit" ? "−" : "+"}{rs(t.amount)}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400" aria-label="Actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(t)}>
                        <Pencil className="mr-2 h-4 w-4" />Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-rose-600 focus:text-rose-700" onClick={() => onDelete(t)}>
                        <Trash2 className="mr-2 h-4 w-4" />Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/* ============================ purchases ============================ */

function PurchasesTab({ customerId }: { customerId: string }) {
  const { toast } = useToast();
  const [data, setData] = useState<PurchasesData | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"bills" | "products">("bills");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    customerApi
      .purchases(customerId)
      .then((d) => alive && setData(d))
      .catch((error) => toast({ variant: "destructive", title: "Could not load purchases", description: apiError(error) }));
    return () => {
      alive = false;
    };
  }, [customerId, toast]);

  if (!data) return <Bone className="h-64 rounded-xl" />;
  const q = search.trim().toLowerCase();
  const orders = data.orders.filter(
    (o) => !q || [o.invoice_number, o.sale_number, ...o.items.map((i) => i.product?.name)].some((v) => (v || "").toLowerCase().includes(q)),
  );
  const products = data.productSummary.filter((p) => !q || p.productName.toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Bills" value={data.summary.orderCount} icon={Receipt} />
        <StatTile label="Products bought" value={data.summary.productCount} icon={ShoppingBag} />
        <StatTile label="Pieces" value={num(data.summary.totalQuantity).toLocaleString()} />
        <StatTile label="Purchase value" value={rs(data.summary.totalValue)} tone="brand" icon={CreditCard} />
      </div>
      <section className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-sm">
        <FilterBar>
          <SearchBox value={search} onChange={setSearch} placeholder="Invoice or product…" className="max-w-xs" />
          <Chips
            value={view}
            onChange={setView}
            options={[
              { value: "bills", label: "By bill", count: data.orders.length },
              { value: "products", label: "By product", count: data.productSummary.length },
            ]}
          />
        </FilterBar>
        {view === "bills" ? (
          orders.length === 0 ? (
            <EmptyState icon={ShoppingBag} title="No purchases found" />
          ) : (
            <div className="divide-y divide-gray-50">
              {orders.map((o) => {
                const isOpen = expanded.has(o.id);
                const due = Math.max(0, o.total_amount - o.payment_received);
                return (
                  <Fragment key={o.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(o.id)) next.delete(o.id);
                          else next.add(o.id);
                          return next;
                        })
                      }
                      className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-gray-50/70"
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">{o.invoice_number || o.sale_number}</p>
                        <p className="text-[11px] text-gray-500">
                          {day(o.sale_date)} · {o.items.length} item(s) · {METHOD_LABEL[o.payment_method] || o.payment_method}
                          {o.branch ? ` · ${o.branch.name}` : ""}
                        </p>
                      </div>
                      {o.status !== "COMPLETED" ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">{o.status}</span> : null}
                      {due > 0.005 ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">{rs(due)} on credit</span> : null}
                      <span className="font-semibold tabular-nums text-gray-900">{rs(o.total_amount)}</span>
                    </button>
                    {isOpen ? (
                      <div className="bg-gray-50/60 px-4 pb-3 pl-11">
                        <table className="w-full text-xs">
                          <tbody>
                            {o.items.map((it) => (
                              <tr key={it.id} className="border-b border-gray-100 last:border-0">
                                <td className="py-1.5 text-gray-800">
                                  {it.product?.name || "Item"}
                                  {it.product?.sku ? <span className="ml-1.5 font-mono text-[10px] text-gray-400">{it.product.sku}</span> : null}
                                  {it.item_type !== "ORIGINAL" ? <span className="ml-1.5 text-[10px] text-amber-700">{it.item_type}</span> : null}
                                </td>
                                <td className="py-1.5 text-right text-gray-500">{num(it.quantity)} × {rs(it.unit_price)}</td>
                                <td className="w-28 py-1.5 text-right font-medium tabular-nums">{rs(it.line_total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </Fragment>
                );
              })}
            </div>
          )
        ) : products.length === 0 ? (
          <EmptyState icon={ShoppingBag} title="No products found" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2.5">Product</th>
                <th className="px-3 py-2.5 text-right">Bills</th>
                <th className="px-3 py-2.5 text-right">Qty</th>
                <th className="px-4 py-2.5 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.productId} className="border-b border-gray-50">
                  <td className="px-4 py-2.5">
                    <p className="text-gray-900">{p.productName}</p>
                    {p.sku ? <p className="font-mono text-[10px] text-gray-400">{p.sku}</p> : null}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{p.orderCount}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{num(p.totalQty)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{rs(p.totalValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

/* ============================ statement ============================ */

function StatementTab({ customer }: { customer: CustomerRow }) {
  const { toast } = useToast();
  const [from, setFrom] = useState(startOfBusinessMonthYmd());
  const [to, setTo] = useState(businessTodayYmd());
  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await customerApi.statement(customer.id, from, to));
    } catch (error) {
      toast({ variant: "destructive", title: "Could not build statement", description: apiError(error) });
    } finally {
      setLoading(false);
    }
  }, [customer.id, from, to, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const print = () => {
    if (!data) return;
    const rows = data.entries
      .map(
        (e) => `<tr><td>${day(e.date)}</td><td>${escapeHtml(LEDGER_META[e.type]?.label || e.type)}</td><td>${escapeHtml(e.description)}</td>
        <td class="r">${e.debit ? rs2(e.debit) : ""}</td><td class="r">${e.credit ? rs2(e.credit) : ""}</td><td class="r">${rs2(e.balance)}</td></tr>`,
      )
      .join("");
    printDocument(
      "Customer Account Statement",
      `${data.customer.name || "Customer"} · ${data.customer.phone_number || ""} · ${day(from)} – ${day(to)}`,
      `<table><tbody>
        <tr class="l3"><td colspan="5">Opening balance</td><td class="r">${rs2(data.summary.openingBalance)}</td></tr>${rows}</tbody>
        <tfoot><tr><td colspan="3">Totals</td><td class="r">${rs2(data.summary.totalDebit)}</td><td class="r">${rs2(data.summary.totalCredit)}</td><td class="r">${rs2(data.summary.closingBalance)}</td></tr></tfoot>
      </table>
      <p style="margin-top:24px;font-size:12px" class="muted">Closing balance ${data.summary.closingBalance >= 0 ? "payable by customer" : "held as advance"}: <strong>${rs2(Math.abs(data.summary.closingBalance))}</strong></p>`,
    );
  };

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-sm">
      <FilterBar>
        <div className="flex items-center gap-1.5">
          <YmdDatePicker value={from} onChange={setFrom} className="h-9 w-[150px]" />
          <span className="text-xs text-gray-400">to</span>
          <YmdDatePicker value={to} onChange={setTo} className="h-9 w-[150px]" />
        </div>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : null}
        <div className="ml-auto flex gap-2">
          {customer.phone_number && data && data.summary.closingBalance > 0.005 ? (
            <Button size="sm" variant="outline" className="h-9" onClick={() => whatsappReminder(customer, data.summary.closingBalance)}>
              <MessageCircle className="mr-1 h-4 w-4" />Send reminder
            </Button>
          ) : null}
          <Button size="sm" className="h-9 bg-[#2a2012] hover:bg-[#3b2e1a]" onClick={print} disabled={!data}>
            <Printer className="mr-1 h-4 w-4" />Print statement
          </Button>
        </div>
      </FilterBar>
      {!data ? (
        <div className="p-4"><Bone className="h-48 rounded-xl" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
            <StatTile label="Opening" value={rs(data.summary.openingBalance)} />
            <StatTile label="Charges (debit)" value={rs(data.summary.totalDebit)} />
            <StatTile label="Received (credit)" value={rs(data.summary.totalCredit)} />
            <StatTile label="Closing" value={balanceText(data.summary.closingBalance)} tone={data.summary.closingBalance > 0.005 ? "bad" : "good"} />
          </div>
          {data.entries.length === 0 ? (
            <EmptyState icon={FileText} title="No entries in this period" description="Pick a wider date range." />
          ) : (
            <div className="overflow-x-auto border-t border-gray-100">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-3 py-2.5">Description</th>
                    <th className="px-3 py-2.5 text-right">Debit</th>
                    <th className="px-3 py-2.5 text-right">Credit</th>
                    <th className="px-4 py-2.5 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((e) => (
                    <tr key={e.id} className="border-b border-gray-50">
                      <td className="whitespace-nowrap px-4 py-2 text-gray-600">{day(e.date)}</td>
                      <td className="px-3 py-2 text-gray-800">{e.description}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{e.debit ? rs2(e.debit) : ""}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{e.credit ? rs2(e.credit) : ""}</td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">{rs2(e.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  Boxes,
  Building2,
  CalendarClock,
  Copy,
  Download,
  FileText,
  Landmark,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Package,
  Pencil,
  Phone,
  Printer,
  Receipt,
  ScrollText,
  Star,
  Trash2,
  Truck,
  Wallet,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Bone, Chips, EmptyState, FilterBar, MultiChips, SearchBox, StatTile } from "@/components/accounts/coa-ui";
import { ConfirmDialog } from "@/components/accounts/coa-dialogs";
import { escapeHtml, printDocument } from "@/components/accounts/coa-shared";
import { SupplierFormDialog, TransactionDialog } from "./supplier-dialogs";
import { SupplierLegacyExportCard } from "./supplier-legacy-export-card";
import {
  AGING_META,
  apiError,
  balanceLabel,
  initials,
  LEDGER_META,
  METHOD_LABEL,
  rs,
  supplierApi,
  supplierPhone,
  TXN_META,
  whatsappLink,
  type AgingKey,
  type DocumentsData,
  type LedgerData,
  type LedgerType,
  type PurchasesData,
  type StatementData,
  type SupplierAccount,
  type SupplierProduct,
  type SupplierRow,
  type TxnRow,
  type TxnType,
} from "./supplier-api";
import {
  DateRangeControls,
  inDateRange,
  ListPaginationBar,
  rangeFor,
  useDateRangeState,
  usePaginatedList,
} from "./supplier-list-controls";

export type WorkspaceTab = "overview" | "ledger" | "transactions" | "bills" | "purchases" | "products" | "statement";
const TABS: { id: WorkspaceTab; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: "overview", label: "Overview", icon: Building2 },
  { id: "ledger", label: "Ledger", icon: BookOpen },
  { id: "transactions", label: "Payments & notes", icon: Wallet },
  { id: "bills", label: "Bills & documents", icon: Receipt },
  { id: "purchases", label: "Purchases", icon: Truck },
  { id: "products", label: "Products", icon: Package },
  { id: "statement", label: "Statement", icon: ScrollText },
];

const day = (v?: string | null) => (v ? format(new Date(v), "dd MMM yyyy") : "—");
const signedBalance = (v: number) => (v < -0.5 ? `${rs(-v)} adv` : rs(v));

export function SupplierWorkspace({
  supplier,
  open,
  onOpenChange,
  initialTab = "overview",
  facets,
  onChanged,
}: {
  supplier: SupplierRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialTab?: WorkspaceTab;
  facets?: { cities: string[]; categories: string[] };
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
  const [account, setAccount] = useState<SupplierAccount | null>(null);
  const [ledger, setLedger] = useState<LedgerData | null>(null);
  const [docs, setDocs] = useState<DocumentsData | null>(null);
  const [purchases, setPurchases] = useState<PurchasesData | null>(null);
  const [products, setProducts] = useState<SupplierProduct[] | null>(null);
  const [txn, setTxn] = useState<{ type: TxnType; editing: TxnRow | null } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deletingTxn, setDeletingTxn] = useState<TxnRow | null>(null);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  const load = useCallback(async () => {
    if (!supplier) return;
    try {
      const [a, l] = await Promise.all([supplierApi.account(supplier.id), supplierApi.ledger(supplier.id)]);
      setAccount(a);
      setLedger(l);
    } catch (e) {
      toast({ variant: "destructive", title: "Could not load supplier", description: apiError(e) });
    }
  }, [supplier, toast]);

  useEffect(() => {
    if (!open || !supplier) return;
    setAccount(null);
    setLedger(null);
    setDocs(null);
    setPurchases(null);
    setProducts(null);
    load();
  }, [open, supplier?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Heavier tabs load on first visit.
  useEffect(() => {
    if (!open || !supplier) return;
    if ((tab === "bills" || tab === "overview") && !docs) supplierApi.documents(supplier.id).then(setDocs).catch(() => setDocs({ orders: [], invoices: [], returns: [] }));
    if ((tab === "purchases" || tab === "overview") && !purchases) supplierApi.purchases(supplier.id).then(setPurchases).catch(() => undefined);
    if (tab === "products" && !products) supplierApi.products(supplier.id).then(setProducts).catch(() => setProducts([]));
  }, [tab, open, supplier, docs, purchases, products]);

  const refresh = async () => {
    await load();
    if (supplier) supplierApi.documents(supplier.id).then(setDocs).catch(() => undefined);
    onChanged();
  };

  if (!supplier) return null;
  const phone = supplierPhone(supplier);
  const wa = supplier.whatsapp_number || supplier.mobile_number;
  const due = account?.balance.balanceDue ?? supplier.balance_due;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1180px,96vw)]">
          {/* header */}
          <div className="shrink-0 border-b border-gray-200 bg-white px-5 pb-0 pt-5">
            <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#2a2012] text-base font-semibold text-[#e6c98f]">{initials(supplier.name)}</span>
                <div className="min-w-0">
                  <SheetTitle className="flex flex-wrap items-center gap-2 text-lg">
                    <span className="truncate">{supplier.name}</span>
                    {!supplier.is_active && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">Inactive</span>}
                    {supplier.over_limit && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">Over credit limit</span>}
                    {supplier.rating ? (
                      <span className="flex items-center gap-0.5 text-[#a67c2e]">
                        {Array.from({ length: supplier.rating }).map((_, i) => (
                          <Star key={i} className="h-3.5 w-3.5 fill-current" />
                        ))}
                      </span>
                    ) : null}
                  </SheetTitle>
                  <SheetDescription className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                    <span className="font-mono">{supplier.code}</span>
                    {supplier.category && <span>{supplier.category}</span>}
                    {supplier.contact_person && <span>Contact: {supplier.contact_person}</span>}
                    {supplier.city && <span>{supplier.city}</span>}
                    {supplier.credit_days != null && <span>{supplier.credit_days ? `${supplier.credit_days}-day credit` : "Pay on delivery"}</span>}
                  </SheetDescription>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {phone && (
                  <Button asChild size="sm" variant="outline">
                    <a href={`tel:${phone}`}>
                      <Phone className="mr-1.5 h-4 w-4" />
                      Call
                    </a>
                  </Button>
                )}
                {wa && (
                  <Button asChild size="sm" variant="outline">
                    <a href={whatsappLink(wa, `Assalam o Alaikum ${supplier.contact_person || supplier.name},`)} target="_blank" rel="noreferrer">
                      <MessageCircle className="mr-1.5 h-4 w-4 text-emerald-600" />
                      WhatsApp
                    </a>
                  </Button>
                )}
                <Button size="sm" onClick={() => setTxn({ type: "PAYMENT", editing: null })} className="bg-[#2a2012] hover:bg-[#3a2e1c]">
                  <ArrowUpRight className="mr-1.5 h-4 w-4" />
                  Pay supplier
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {(["ADVANCE", "DEBIT_NOTE", "DISCOUNT", "CREDIT_NOTE", "REFUND"] as TxnType[]).map((t) => (
                      <DropdownMenuItem key={t} onSelect={() => setTxn({ type: t, editing: null })}>
                        {TXN_META[t].effect === "reduce" ? <ArrowUpRight className="mr-2 h-4 w-4 text-emerald-600" /> : <ArrowDownLeft className="mr-2 h-4 w-4 text-rose-600" />}
                        {TXN_META[t].label}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setTab("statement")}>
                      <ScrollText className="mr-2 h-4 w-4" />
                      Statement
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit supplier
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* figures */}
            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
              <Figure label={balanceLabel(due)} value={due < -0.5 ? rs(-due) : rs(due)} tone={due > 0.5 ? "dark" : due < -0.5 ? "good" : undefined} />
              <Figure label="Overdue" value={rs(account?.overdue ?? supplier.overdue_amount)} tone={(account?.overdue ?? supplier.overdue_amount) > 0.5 ? "bad" : undefined} hint={account?.oldestDays ? `oldest ${account.oldestDays} days` : undefined} />
              <Figure label="Next due" value={account?.nextDue ? day(account.nextDue) : "—"} />
              <Figure label="Total purchased" value={rs(account?.balance.totalPurchased ?? supplier.total_purchased)} hint={`${supplier.purchase_count} stock-in lines`} />
              <Figure
                label="Credit limit"
                value={account?.creditLimit ? rs(account.creditLimit) : "No limit"}
                hint={account?.limitUsedPct != null ? `${Math.round(account.limitUsedPct)}% used` : undefined}
                tone={account?.limitUsedPct != null && account.limitUsedPct > 100 ? "bad" : undefined}
              />
            </div>

            <div className="-mb-px mt-4 flex gap-1 overflow-x-auto">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                    tab === t.id ? "border-[#a67c2e] text-[#2a2012]" : "border-transparent text-gray-500 hover:text-gray-800",
                  )}
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8f6f2] p-5">
            {tab === "overview" && <OverviewTab supplier={supplier} account={account} ledger={ledger} purchases={purchases} docs={docs} onTab={setTab} />}
            {tab === "ledger" && <LedgerTab supplier={supplier} ledger={ledger} />}
            {tab === "transactions" && (
              <TransactionsTab
                supplier={supplier}
                ledger={ledger}
                onNew={(type) => setTxn({ type, editing: null })}
                onEdit={(t) => setTxn({ type: t.type, editing: t })}
                onDelete={setDeletingTxn}
              />
            )}
            {tab === "bills" && <BillsTab account={account} docs={docs} onPay={() => setTxn({ type: "PAYMENT", editing: null })} />}
            {tab === "purchases" && <PurchasesTab data={purchases} />}
            {tab === "products" && <ProductsTab products={products} />}
            {tab === "statement" && <StatementTab supplier={supplier} />}
          </div>
        </SheetContent>
      </Sheet>

      <TransactionDialog
        open={!!txn}
        onOpenChange={(v) => !v && setTxn(null)}
        supplier={supplier}
        initialType={txn?.type}
        editing={txn?.editing}
        balanceDue={due}
        openBills={account?.openBills}
        onSaved={refresh}
      />
      <SupplierFormDialog open={editOpen} onOpenChange={setEditOpen} editing={supplier} facets={facets} onSaved={() => refresh()} />
      <ConfirmDialog
        open={!!deletingTxn}
        onOpenChange={(v) => !v && setDeletingTxn(null)}
        title="Delete this transaction?"
        description={deletingTxn ? `${TXN_META[deletingTxn.type]?.label ?? "Transaction"} of ${rs(deletingTxn.amount)} on ${day(deletingTxn.payment_date)} will be removed from the ledger.` : ""}
        onConfirm={async () => {
          if (!deletingTxn) return;
          try {
            await supplierApi.deleteTxn(supplier.id, deletingTxn.id);
            toast({ title: "Transaction deleted" });
            setDeletingTxn(null);
            refresh();
          } catch (e) {
            toast({ variant: "destructive", title: "Could not delete", description: apiError(e) });
          }
        }}
      />
    </>
  );
}

function Figure({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "dark" | "bad" | "good" }) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border px-3 py-2.5",
        tone === "dark" ? "border-[#2a2012] bg-[#2a2012] text-white" : tone === "bad" ? "border-rose-200 bg-rose-50" : tone === "good" ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-white",
      )}
    >
      <div className={cn("truncate text-[11px]", tone === "dark" ? "text-stone-300" : "text-gray-500")}>{label}</div>
      <div className={cn("truncate text-base font-semibold tabular-nums", tone === "bad" && "text-rose-700", tone === "good" && "text-emerald-700")}>{value}</div>
      {hint && <div className={cn("truncate text-[11px]", tone === "dark" ? "text-stone-400" : "text-gray-500")}>{hint}</div>}
    </div>
  );
}

function Card({ title, action, children, className, icon: Icon }: { title: string; action?: ReactNode; children: ReactNode; className?: string; icon?: ComponentType<{ className?: string }> }) {
  return (
    <section className={cn("rounded-xl border border-gray-200 bg-white", className)}>
      <header className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          {Icon && <Icon className="h-4 w-4 text-[#a67c2e]" />}
          {title}
        </h3>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function TypePill({ type }: { type: LedgerType }) {
  const m = LEDGER_META[type] ?? { label: type, tone: "bg-gray-100 text-gray-700 ring-gray-500/20" };
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", m.tone)}>{m.label}</span>;
}

function AgingBar({ aging }: { aging: Record<AgingKey, number> }) {
  const total = Object.values(aging).reduce((t, v) => t + v, 0);
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-gray-100">
        {(Object.keys(AGING_META) as AgingKey[]).map((k) =>
          aging[k] > 0 ? <div key={k} title={`${AGING_META[k].label}: ${rs(aging[k])}`} style={{ width: `${(aging[k] / total) * 100}%`, backgroundColor: AGING_META[k].color }} /> : null,
        )}
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1 text-center">
        {(Object.keys(AGING_META) as AgingKey[]).map((k) => (
          <div key={k}>
            <div className="flex items-center justify-center gap-1 text-[10px] text-gray-500">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: AGING_META[k].color }} />
              {AGING_META[k].label}
            </div>
            <div className={cn("text-xs font-semibold tabular-nums", aging[k] > 0 && k !== "current" ? "text-rose-700" : "text-gray-800")}>{aging[k] ? rs(aging[k]) : "—"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ====================================================================== */

function OverviewTab({
  supplier,
  account,
  ledger,
  purchases,
  docs,
  onTab,
}: {
  supplier: SupplierRow;
  account: SupplierAccount | null;
  ledger: LedgerData | null;
  purchases: PurchasesData | null;
  docs: DocumentsData | null;
  onTab: (t: WorkspaceTab) => void;
}) {
  const { toast } = useToast();
  const copy = (v: string) => {
    navigator.clipboard?.writeText(v).then(() => toast({ title: "Copied" }));
  };
  if (!account || !ledger) {
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        <Bone className="h-48 lg:col-span-2" />
        <Bone className="h-48" />
        <Bone className="h-64 lg:col-span-3" />
      </div>
    );
  }
  const b = account.balance;
  return (
    <div className="space-y-4">
      <SupplierLegacyExportCard supplier={supplier} />
      {account.limitUsedPct != null && account.limitUsedPct > 100 && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-800">
          <AlertTriangle className="h-4 w-4" />
          You owe {rs(b.balanceDue)} — {rs(b.balanceDue - (account.creditLimit ?? 0))} over the credit limit of {rs(account.creditLimit)}.
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Account position" icon={Wallet} className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Opening balance" value={signedBalance(b.opening)} />
            <StatTile label="Purchased (bills)" value={rs(b.totalPurchased)} />
            <StatTile label="Returned" value={rs(b.totalReturned)} />
            <StatTile label="Paid (net)" value={rs(b.totalPaid)} tone="good" />
            <StatTile label="Notes & discounts" value={rs(b.totalAdjusted)} hint="debit notes − credit notes" />
            <StatTile label={balanceLabel(b.balanceDue)} value={b.balanceDue < -0.5 ? rs(-b.balanceDue) : rs(b.balanceDue)} tone={b.balanceDue > 0.5 ? "brand" : "good"} />
          </div>
          <div className="mt-4">
            <div className="mb-2 text-xs font-medium text-gray-600">What we owe, by age</div>
            <AgingBar aging={account.aging} />
          </div>
        </Card>

        <Card title="Terms & bank" icon={Landmark}>
          <dl className="space-y-2 text-sm">
            <Row label="Credit period">{account.creditDays != null ? (account.creditDays ? `${account.creditDays} days` : "Pay on delivery") : "Not set"}</Row>
            <Row label="Credit limit">{account.creditLimit ? rs(account.creditLimit) : "No limit"}</Row>
            {account.availableCredit != null && <Row label="Available">{rs(account.availableCredit)}</Row>}
            {supplier.payment_terms && <Row label="Terms">{supplier.payment_terms}</Row>}
            <Row label="Last payment">{account.lastPayment ? `${rs(account.lastPayment.amount)} · ${day(account.lastPayment.date)}` : "None yet"}</Row>
            <Row label="Last delivery">{day(b.lastPurchase)}</Row>
          </dl>
          {supplier.bank_account_number || supplier.bank_iban ? (
            <div className="mt-3 rounded-lg bg-[#fcf8f2] p-3 text-xs text-gray-700">
              <div className="font-semibold text-gray-900">{supplier.bank_name || "Bank"}</div>
              {supplier.bank_account_title && <div>{supplier.bank_account_title}</div>}
              {supplier.bank_account_number && (
                <button className="mt-1 flex items-center gap-1 font-mono hover:text-[#a67c2e]" onClick={() => copy(supplier.bank_account_number!)}>
                  {supplier.bank_account_number} <Copy className="h-3 w-3" />
                </button>
              )}
              {supplier.bank_iban && (
                <button className="mt-0.5 flex items-center gap-1 font-mono hover:text-[#a67c2e]" onClick={() => copy(supplier.bank_iban!)}>
                  {supplier.bank_iban} <Copy className="h-3 w-3" />
                </button>
              )}
            </div>
          ) : (
            <p className="mt-3 text-xs text-gray-500">No bank details saved.</p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title={`Open bills (${account.openBills.length})`}
          icon={Receipt}
          className="lg:col-span-2"
          action={
            <button className="text-xs font-medium text-[#a67c2e]" onClick={() => onTab("bills")}>
              All bills →
            </button>
          }
        >
          {account.openBills.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">{account.advance > 0 ? `Nothing due — ${rs(account.advance)} advance with this supplier.` : "Nothing due. All bills are settled."}</p>
          ) : (
            <BillsTable bills={account.openBills.slice(0, 8)} />
          )}
        </Card>

        <Card title="Contact" icon={Phone}>
          <dl className="space-y-2 text-sm">
            {supplier.contact_person && <Row label="Person">{supplier.contact_person}</Row>}
            {supplier.mobile_number && <Row label="Mobile">{supplier.mobile_number}</Row>}
            {supplier.whatsapp_number && <Row label="WhatsApp">{supplier.whatsapp_number}</Row>}
            {supplier.phone_number && <Row label="Office">{supplier.phone_number}</Row>}
            {supplier.email && (
              <Row label="Email">
                <a className="text-[#a67c2e] hover:underline" href={`mailto:${supplier.email}`}>
                  <Mail className="mr-1 inline h-3 w-3" />
                  {supplier.email}
                </a>
              </Row>
            )}
            {(supplier.address || supplier.city) && <Row label="Address">{[supplier.address, supplier.city, supplier.country].filter(Boolean).join(", ")}</Row>}
            {(supplier.ntn || supplier.strn) && <Row label="Tax no.">{[supplier.ntn && `NTN ${supplier.ntn}`, supplier.strn && `STRN ${supplier.strn}`].filter(Boolean).join(" · ")}</Row>}
          </dl>
          {supplier.notes && <p className="mt-3 rounded-lg bg-gray-50 p-2.5 text-xs text-gray-600">{supplier.notes}</p>}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Recent activity"
          icon={BookOpen}
          action={
            <button className="text-xs font-medium text-[#a67c2e]" onClick={() => onTab("ledger")}>
              Full ledger →
            </button>
          }
        >
          {ledger.entries.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500">No transactions yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {ledger.entries.slice(0, 6).map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
                  <TypePill type={e.type} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-gray-800" title={e.description}>
                      {e.description}
                    </div>
                    <div className="text-[11px] text-gray-500">{day(e.date)}</div>
                  </div>
                  <div className={cn("shrink-0 text-right text-sm font-semibold tabular-nums", e.credit ? "text-gray-900" : "text-emerald-700")}>{e.credit ? `+${rs(e.credit)}` : `−${rs(e.debit)}`}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card
          title="Top products bought"
          icon={Boxes}
          action={
            <button className="text-xs font-medium text-[#a67c2e]" onClick={() => onTab("purchases")}>
              Purchases →
            </button>
          }
        >
          {!purchases ? (
            <Bone className="h-32" />
          ) : purchases.productSummary.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500">Nothing bought yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {purchases.productSummary.slice(0, 6).map((p) => {
                const peak = purchases.productSummary[0].totalValue || 1;
                return (
                  <li key={p.productId}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate text-gray-800">{p.productName}</span>
                      <span className="shrink-0 tabular-nums">
                        {rs(p.totalValue)} <span className="text-[11px] text-gray-500">· {p.totalQty} pcs</span>
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-gray-100">
                      <div className="h-1.5 rounded-full bg-[#a67c2e]" style={{ width: `${(p.totalValue / peak) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {docs && (docs.invoices.length > 0 || docs.returns.length > 0 || docs.orders.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-3 border-t border-gray-100 pt-3 text-xs text-gray-600">
              <span>{docs.orders.length} purchase orders</span>
              <span>{docs.invoices.length} invoices</span>
              <span>{docs.returns.length} returns</span>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-gray-500">{label}</dt>
      <dd className="min-w-0 text-right text-gray-900">{children}</dd>
    </div>
  );
}

function BillsTable({ bills }: { bills: SupplierAccount["openBills"] }) {
  const KIND: Record<string, string> = { OPENING: "Opening", INVOICE: "Invoice", GOODS: "Goods in", CHARGE: "Charge" };
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="text-[11px] uppercase tracking-wide text-gray-500">
          <tr className="border-b border-gray-100">
            <th className="px-4 py-2 text-left font-medium">Bill</th>
            <th className="px-2 py-2 text-left font-medium">Date</th>
            <th className="px-2 py-2 text-left font-medium">Due</th>
            <th className="px-2 py-2 text-right font-medium">Amount</th>
            <th className="px-2 py-2 text-right font-medium">Outstanding</th>
            <th className="px-4 py-2 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {bills.map((b, i) => (
            <tr key={`${b.ref}-${i}`} className="border-b border-gray-50">
              <td className="px-4 py-2">
                <div className="font-medium text-gray-900">{b.ref}</div>
                <div className="text-[11px] text-gray-500">{KIND[b.kind]}</div>
              </td>
              <td className="px-2 py-2 text-gray-600">{day(b.date)}</td>
              <td className="px-2 py-2 text-gray-600">{day(b.due)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{rs(b.amount)}</td>
              <td className="px-2 py-2 text-right font-semibold tabular-nums">{rs(b.outstanding)}</td>
              <td className="px-4 py-2 text-right">
                {b.daysOverdue > 0 ? (
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", b.daysOverdue > 60 ? "bg-rose-100 text-rose-800" : "bg-amber-50 text-amber-800")}>{b.daysOverdue}d overdue</span>
                ) : (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">{b.daysOverdue === 0 ? "Due today" : `in ${-b.daysOverdue}d`}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ====================================================================== */

function LedgerTab({ supplier, ledger }: { supplier: SupplierRow; ledger: LedgerData | null }) {
  const [types, setTypes] = useState<LedgerType[]>([]);
  const { range, setRange, custom, setCustom } = useDateRangeState("all");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    if (!ledger) return [];
    const q = search.trim().toLowerCase();
    return ledger.entries.filter((e) => {
      if (types.length && !types.includes(e.type)) return false;
      if (!inDateRange(e.date, range, custom)) return false;
      if (q && !`${e.description} ${e.reference ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [ledger, types, range, custom, search]);

  const pag = usePaginatedList(rows);

  if (!ledger) return <Bone className="h-96" />;
  const present = [...new Set(ledger.entries.map((e) => e.type))];
  const totals = rows.reduce((t, e) => ({ debit: t.debit + e.debit, credit: t.credit + e.credit }), { debit: 0, credit: 0 });
  const closingFiltered = useMemo(() => {
    if (!rows.length) return ledger.summary.balanceDue;
    let latest = rows[0];
    for (const e of rows) {
      if (new Date(e.date).getTime() > new Date(latest.date).getTime()) latest = e;
    }
    return latest.balance;
  }, [rows, ledger.summary.balanceDue]);

  const exportXlsx = () => {
    const ws = XLSX.utils.json_to_sheet(
      [...rows].reverse().map((e) => ({
        Date: day(e.date),
        Type: LEDGER_META[e.type]?.label ?? e.type,
        Details: e.description,
        Reference: e.reference ?? "",
        "Debit (paid / reduced)": e.debit || "",
        "Credit (bills / added)": e.credit || "",
        Balance: e.balance,
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ledger");
    XLSX.writeFile(wb, `supplier-ledger-${supplier.name.replace(/\s+/g, "-")}.xlsx`);
  };
  const print = () => {
    const body = `<table><thead><tr><th>Date</th><th>Type</th><th>Details</th><th>Ref</th><th class="r">Debit</th><th class="r">Credit</th><th class="r">Balance</th></tr></thead><tbody>${[...rows]
      .reverse()
      .map(
        (e) =>
          `<tr><td>${day(e.date)}</td><td>${escapeHtml(LEDGER_META[e.type]?.label ?? e.type)}</td><td>${escapeHtml(e.description)}</td><td>${escapeHtml(e.reference ?? "")}</td><td class="r">${e.debit ? rs(e.debit) : ""}</td><td class="r">${e.credit ? rs(e.credit) : ""}</td><td class="r">${signedBalance(e.balance)}</td></tr>`,
      )
      .join("")}</tbody></table>`;
    printDocument(`Supplier ledger — ${supplier.name}`, `${supplier.code} · printed ${day(new Date().toISOString())}`, body);
  };

  return (
    <div className="space-y-3">
      <FilterBar>
        <SearchBox value={search} onChange={setSearch} placeholder="Search details or reference…" />
        <DateRangeControls range={range} setRange={setRange} custom={custom} setCustom={setCustom} />
      </FilterBar>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MultiChips options={present.map((t) => ({ value: t, label: LEDGER_META[t]?.label ?? t }))} value={types} onChange={setTypes} allLabel="All types" />
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={exportXlsx} disabled={!rows.length}>
            <Download className="mr-1.5 h-4 w-4" />
            Excel
          </Button>
          <Button size="sm" variant="outline" onClick={print} disabled={!rows.length}>
            <Printer className="mr-1.5 h-4 w-4" />
            Print
          </Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {rows.length === 0 ? (
          <EmptyState icon={BookOpen} title="No entries" description={ledger.entries.length ? "Nothing matches these filters." : "Stock-in, invoices, returns and payments for this supplier appear here."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Date</th>
                  <th className="px-2 py-2.5 text-left font-medium">Type</th>
                  <th className="px-2 py-2.5 text-left font-medium">Details</th>
                  <th className="px-2 py-2.5 text-right font-medium">Debit</th>
                  <th className="px-2 py-2.5 text-right font-medium">Credit</th>
                  <th className="px-4 py-2.5 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {pag.pageItems.map((e) => (
                  <tr key={e.id} className="border-t border-gray-100 hover:bg-[#fcf8f2]/60">
                    <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">{day(e.date)}</td>
                    <td className="px-2 py-2.5">
                      <TypePill type={e.type} />
                    </td>
                    <td className="max-w-[360px] px-2 py-2.5">
                      <div className="text-gray-900" title={e.description}>
                        {e.description}
                      </div>
                      {e.reference && <div className="text-[11px] text-gray-500">Ref {e.reference}</div>}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-emerald-700">{e.debit ? rs(e.debit) : ""}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-gray-900">{e.credit ? rs(e.credit) : ""}</td>
                    <td className={cn("px-4 py-2.5 text-right font-semibold tabular-nums", e.balance < -0.5 ? "text-emerald-700" : "text-gray-900")}>{signedBalance(e.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-50 text-sm font-semibold">
                <tr>
                  <td className="px-4 py-2.5" colSpan={3}>
                    {rows.length} entries · debit {rs(totals.debit)} · credit {rs(totals.credit)}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-emerald-700">{rs(totals.debit)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{rs(totals.credit)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{signedBalance(closingFiltered)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <ListPaginationBar pag={pag} />
      </div>
      <p className="text-[11px] text-gray-500">Credit = bills and charges that increase what you owe. Debit = payments, returns, debit notes and discounts that reduce it. Footer balance is the running balance on the latest dated row in your filter (not today&apos;s total unless the filter includes it).</p>
    </div>
  );
}

/* ====================================================================== */

function TransactionsTab({
  supplier,
  ledger,
  onNew,
  onEdit,
  onDelete,
}: {
  supplier: SupplierRow;
  ledger: LedgerData | null;
  onNew: (t: TxnType) => void;
  onEdit: (t: TxnRow) => void;
  onDelete: (t: TxnRow) => void;
}) {
  const [filter, setFilter] = useState<"all" | "cash" | "notes">("all");
  const { range, setRange, custom, setCustom } = useDateRangeState("all");
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const rows = (ledger?.payments ?? []).filter((p) => {
    if (filter === "cash" && !TXN_META[p.type]?.cash) return false;
    if (filter === "notes" && TXN_META[p.type]?.cash) return false;
    if (!inDateRange(p.payment_date, range, custom)) return false;
    if (q && !`${p.reference ?? ""} ${p.notes ?? ""} ${p.invoice_number ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const pag = usePaginatedList(rows);
  const sumFiltered = (types: TxnType[]) => rows.filter((p) => types.includes(p.type)).reduce((t, p) => t + p.amount, 0);
  const sumAll = (types: TxnType[]) => (ledger?.payments ?? []).filter((p) => types.includes(p.type)).reduce((t, p) => t + p.amount, 0);
  const filteredTotal = rows.reduce((t, p) => t + p.amount, 0);

  if (!ledger) return <Bone className="h-80" />;

  const voucher = (p: TxnRow) => {
    const meta = TXN_META[p.type];
    const body = `<table><tbody>
      <tr><td><b>Voucher</b></td><td>${escapeHtml(meta?.label ?? p.type)}</td></tr>
      <tr><td><b>Supplier</b></td><td>${escapeHtml(supplier.name)} (${escapeHtml(supplier.code)})</td></tr>
      <tr><td><b>Date</b></td><td>${day(p.payment_date)}</td></tr>
      <tr><td><b>Amount</b></td><td><b>${rs(p.amount)}</b></td></tr>
      ${meta?.cash ? `<tr><td><b>Method</b></td><td>${escapeHtml(METHOD_LABEL[p.method] ?? p.method)}</td></tr>` : ""}
      ${p.reference ? `<tr><td><b>Reference</b></td><td>${escapeHtml(p.reference)}</td></tr>` : ""}
      ${p.invoice_number ? `<tr><td><b>Against invoice</b></td><td>${escapeHtml(p.invoice_number)}</td></tr>` : ""}
      ${p.notes ? `<tr><td><b>Notes</b></td><td>${escapeHtml(p.notes)}</td></tr>` : ""}
      <tr><td><b>Recorded by</b></td><td>${escapeHtml(p.user?.email ?? "—")}</td></tr>
    </tbody></table>
    <div style="display:flex;justify-content:space-between;margin-top:60px;font-size:12px"><span>Prepared by ____________</span><span>Received by ____________</span></div>`;
    printDocument(`${meta?.label ?? "Payment"} voucher`, `${supplier.name} · ${day(p.payment_date)}`, body);
  };
  const waText = (p: TxnRow) =>
    `Assalam o Alaikum ${supplier.contact_person || supplier.name}, we have ${p.type === "REFUND" ? "received" : "sent"} ${rs(p.amount)} on ${day(p.payment_date)}${
      TXN_META[p.type]?.cash ? ` via ${METHOD_LABEL[p.method] ?? p.method}` : ` as a ${TXN_META[p.type]?.label.toLowerCase()}`
    }${p.reference ? ` (ref ${p.reference})` : ""}. Balance now: ${rs(Math.max(0, ledger.summary.balanceDue))}. Thank you.`;
  const wa = supplier.whatsapp_number || supplier.mobile_number;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Paid (filtered)" value={rs(sumFiltered(["PAYMENT"]))} tone="good" hint={range !== "all" ? `All time ${rs(sumAll(["PAYMENT"]))}` : undefined} />
        <StatTile label="Advances (filtered)" value={rs(sumFiltered(["ADVANCE"]))} hint={range !== "all" ? `All time ${rs(sumAll(["ADVANCE"]))}` : undefined} />
        <StatTile label="Debit notes & discounts" value={rs(sumFiltered(["DEBIT_NOTE", "DISCOUNT"]))} />
        <StatTile label="Credit notes & refunds" value={rs(sumFiltered(["CREDIT_NOTE", "REFUND"]))} />
      </div>
      <FilterBar>
        <SearchBox value={search} onChange={setSearch} placeholder="Search reference or notes…" />
        <DateRangeControls range={range} setRange={setRange} custom={custom} setCustom={setCustom} />
      </FilterBar>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Chips
          options={[
            { value: "all", label: "All", count: rows.length },
            { value: "cash", label: "Money", count: rows.filter((p) => TXN_META[p.type]?.cash).length },
            { value: "notes", label: "Notes & discounts", count: rows.filter((p) => !TXN_META[p.type]?.cash).length },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onNew("DEBIT_NOTE")}>
            Debit note
          </Button>
          <Button size="sm" onClick={() => onNew("PAYMENT")} className="bg-[#2a2012] hover:bg-[#3a2e1c]">
            Pay supplier
          </Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {rows.length === 0 ? (
          <EmptyState icon={Wallet} title="No payments or notes yet" description="Record payments, advances, debit notes (claims) and discounts here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Date</th>
                  <th className="px-2 py-2.5 text-left font-medium">Type</th>
                  <th className="px-2 py-2.5 text-left font-medium">How / reference</th>
                  <th className="px-2 py-2.5 text-left font-medium">Notes</th>
                  <th className="px-2 py-2.5 text-right font-medium">Amount</th>
                  <th className="w-12 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {pag.pageItems.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">{day(p.payment_date)}</td>
                    <td className="px-2 py-2.5">
                      <TypePill type={p.type} />
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="text-gray-800">{TXN_META[p.type]?.cash ? METHOD_LABEL[p.method] ?? p.method : "Adjustment"}</div>
                      <div className="text-[11px] text-gray-500">
                        {[p.reference && `Ref ${p.reference}`, p.invoice_number && `Inv ${p.invoice_number}`].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </td>
                    <td className="max-w-[240px] px-2 py-2.5 text-gray-600">
                      <div className="truncate" title={p.notes ?? ""}>
                        {p.notes || "—"}
                      </div>
                      <div className="text-[11px] text-gray-400">{p.user?.email?.split("@")[0]}</div>
                    </td>
                    <td className={cn("px-2 py-2.5 text-right font-semibold tabular-nums", TXN_META[p.type]?.effect === "reduce" ? "text-emerald-700" : "text-rose-700")}>
                      {TXN_META[p.type]?.effect === "reduce" ? "−" : "+"}
                      {rs(p.amount)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => voucher(p)}>
                            <Printer className="mr-2 h-4 w-4" />
                            Print voucher
                          </DropdownMenuItem>
                          {wa && (
                            <DropdownMenuItem onSelect={() => window.open(whatsappLink(wa, waText(p)), "_blank")}>
                              <MessageCircle className="mr-2 h-4 w-4" />
                              Send on WhatsApp
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onSelect={() => onEdit(p)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-rose-600" onSelect={() => onDelete(p)}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="border-t-2 border-gray-200 bg-gray-50 text-sm font-semibold">
                  <tr>
                    <td className="px-4 py-2.5" colSpan={4}>
                      {rows.length} payment(s) in filter
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-emerald-700">−{rs(filteredTotal)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        <ListPaginationBar pag={pag} />
      </div>
    </div>
  );
}

/* ====================================================================== */

function BillsTab({ account, docs, onPay }: { account: SupplierAccount | null; docs: DocumentsData | null; onPay: () => void }) {
  const [view, setView] = useState<"open" | "invoices" | "returns" | "orders">("open");
  const { range, setRange, custom, setCustom } = useDateRangeState("all");
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const openBills = useMemo(
    () =>
      (account?.openBills ?? []).filter(
        (b) => inDateRange(b.date, range, custom) && (!q || `${b.ref} ${b.kind}`.toLowerCase().includes(q)),
      ),
    [account, range, custom, q],
  );
  const invoices = useMemo(
    () =>
      (docs?.invoices ?? []).filter(
        (i) => inDateRange(i.date, range, custom) && (!q || i.number.toLowerCase().includes(q)),
      ),
    [docs, range, custom, q],
  );
  const returns = useMemo(
    () =>
      (docs?.returns ?? []).filter(
        (r) => inDateRange(r.date, range, custom) && (!q || `${r.number} ${r.reason ?? ""}`.toLowerCase().includes(q)),
      ),
    [docs, range, custom, q],
  );
  const orders = useMemo(
    () =>
      (docs?.orders ?? []).filter(
        (o) => inDateRange(o.date, range, custom) && (!q || o.number.toLowerCase().includes(q)),
      ),
    [docs, range, custom, q],
  );
  const openPag = usePaginatedList(openBills);
  const invPag = usePaginatedList(invoices);
  const retPag = usePaginatedList(returns);
  const ordPag = usePaginatedList(orders);
  const openTotal = openBills.reduce((t, b) => t + b.outstanding, 0);
  const invTotal = invoices.reduce((t, i) => t + i.outstanding, 0);
  if (!account || !docs) return <Bone className="h-80" />;
  const statusTone = (s: string) =>
    /PAID|COMPLETED|RECEIVED|DELIVERED/i.test(s) ? "bg-emerald-50 text-emerald-700" : /PARTIAL/i.test(s) ? "bg-amber-50 text-amber-800" : /CANCEL/i.test(s) ? "bg-gray-100 text-gray-500" : "bg-sky-50 text-sky-700";
  return (
    <div className="space-y-3">
      <FilterBar>
        <SearchBox value={search} onChange={setSearch} placeholder="Search bill or invoice…" />
        <DateRangeControls range={range} setRange={setRange} custom={custom} setCustom={setCustom} />
      </FilterBar>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Chips
          options={[
            { value: "open", label: "Open bills", count: openBills.length },
            { value: "invoices", label: "Invoices", count: invoices.length },
            { value: "returns", label: "Returns", count: returns.length },
            { value: "orders", label: "Purchase orders", count: orders.length },
          ]}
          value={view}
          onChange={setView}
        />
        {view === "open" && account.due > 0 && (
          <Button size="sm" onClick={onPay} className="bg-[#2a2012] hover:bg-[#3a2e1c]">
            Pay {account.overdue > 0 ? `overdue ${rs(account.overdue)}` : rs(account.due)}
          </Button>
        )}
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        {view === "open" &&
          (openBills.length ? (
            <>
              <AgingBar aging={account.aging} />
              <p className="mt-3 text-xs text-gray-600">
                Outstanding in filter: <span className="font-semibold tabular-nums">{rs(openTotal)}</span>
              </p>
              <div className="mt-4 overflow-hidden rounded-lg border border-gray-100">
                <BillsTable bills={openPag.pageItems} />
                <ListPaginationBar pag={openPag} />
              </div>
              <p className="mt-3 text-[11px] text-gray-500">Payments, returns, debit notes and discounts settle the oldest bills first unless set against a specific invoice.</p>
            </>
          ) : (
            <EmptyState icon={Receipt} title="No open bills" description={account.openBills.length ? "Nothing matches these filters." : "Everything bought from this supplier is paid."} />
          ))}
        {view === "invoices" &&
          (invoices.length ? (
            <>
              <p className="mb-3 text-xs text-gray-600">
                Outstanding in filter: <span className="font-semibold tabular-nums">{rs(invTotal)}</span>
              </p>
              <div className="overflow-hidden rounded-lg border border-gray-100">
            <DocTable
              head={["Invoice", "Date", "Due", "Total", "Paid", "Outstanding", "Status"]}
              rows={invPag.pageItems.map((i) => [
                <span key="n" className="font-medium">
                  {i.number}
                  <span className="block text-[11px] font-normal text-gray-500">{i.items} items</span>
                </span>,
                day(i.date),
                <span key="d" className={cn(i.overdue && "font-medium text-rose-700")}>{day(i.due)}</span>,
                rs(i.total),
                rs(i.paid),
                <b key="o">{rs(i.outstanding)}</b>,
                <span key="s" className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", i.overdue ? "bg-rose-50 text-rose-700" : statusTone(i.status))}>{i.overdue ? "Overdue" : i.status.toLowerCase()}</span>,
              ])}
            />
                <ListPaginationBar pag={invPag} />
              </div>
            </>
          ) : (
            <EmptyState icon={FileText} title="No purchase invoices" description={docs.invoices.length ? "Nothing matches these filters." : "Invoices created from Purchases → Purchase invoices show here."} />
          ))}
        {view === "returns" &&
          (returns.length ? (
            <div className="overflow-hidden rounded-lg border border-gray-100">
            <DocTable
              head={["Return", "Date", "Reason", "Items", "Value", "Status"]}
              rows={retPag.pageItems.map((r) => [
                <span key="n" className="font-medium">{r.number}</span>,
                day(r.date),
                r.reason || "—",
                String(r.items),
                rs(r.total),
                <span key="s" className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", statusTone(r.status))}>{r.status.toLowerCase()}</span>,
              ])}
            />
            <ListPaginationBar pag={retPag} />
            </div>
          ) : (
            <EmptyState icon={Truck} title="No returns to this supplier" description={docs.returns.length ? "Nothing matches these filters." : undefined} />
          ))}
        {view === "orders" &&
          (orders.length ? (
            <div className="overflow-hidden rounded-lg border border-gray-100">
            <DocTable
              head={["PO", "Ordered", "Expected", "Total", "Status"]}
              rows={ordPag.pageItems.map((o) => [
                <span key="n" className="font-medium">{o.number}</span>,
                day(o.date),
                day(o.expected),
                rs(o.total),
                <span key="s" className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", statusTone(o.status))}>{o.status.toLowerCase().replace(/_/g, " ")}</span>,
              ])}
            />
            <ListPaginationBar pag={ordPag} />
            </div>
          ) : (
            <EmptyState icon={CalendarClock} title="No purchase orders" description={docs.orders.length ? "Nothing matches these filters." : undefined} />
          ))}
      </div>
    </div>
  );
}

function DocTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[620px] text-sm">
        <thead className="text-[11px] uppercase tracking-wide text-gray-500">
          <tr className="border-b border-gray-100">
            {head.map((h, i) => (
              <th key={h} className={cn("px-3 py-2 font-medium first:pl-4 last:pr-4", i === 0 || i === 1 || i === 2 ? "text-left" : "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-gray-50">
              {r.map((c, ci) => (
                <td key={ci} className={cn("px-3 py-2.5 first:pl-4 last:pr-4", ci === 0 || ci === 1 || ci === 2 ? "text-left" : "text-right tabular-nums")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ====================================================================== */

function PurchasesTab({ data }: { data: PurchasesData | null }) {
  const [view, setView] = useState<"products" | "lines">("products");
  const [search, setSearch] = useState("");
  const { range, setRange, custom, setCustom } = useDateRangeState("all");
  const q = search.trim().toLowerCase();
  const lines = useMemo(
    () =>
      (data?.purchases ?? []).filter((p) => {
        if (!inDateRange(p.purchase_date, range, custom)) return false;
        if (!q) return true;
        return `${p.product?.name ?? ""} ${p.product?.sku ?? ""} ${p.invoice_ref ?? ""}`.toLowerCase().includes(q);
      }),
    [data, range, custom, q],
  );
  const products = useMemo(
    () =>
      (data?.productSummary ?? []).filter((p) => {
        if (!inDateRange(p.lastDate, range, custom)) return false;
        if (!q) return true;
        return `${p.productName} ${p.sku ?? ""}`.toLowerCase().includes(q);
      }),
    [data, range, custom, q],
  );
  const linePag = usePaginatedList(lines);
  const productPag = usePaginatedList(products);
  const filteredLineValue = lines.reduce((t, p) => t + p.line_total, 0);
  const filteredQty = lines.reduce((t, p) => t + Number(p.quantity), 0);
  if (!data) return <Bone className="h-80" />;
  const exportXlsx = () => {
    const ws = XLSX.utils.json_to_sheet(
      lines.map((p) => ({ Date: day(p.purchase_date), Product: p.product?.name ?? "", SKU: p.product?.sku ?? "", Qty: p.quantity, Cost: p.cost_price, Total: p.line_total, Bill: p.invoice_ref ?? "", Branch: p.warehouse_branch?.name ?? "" })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Purchases");
    XLSX.writeFile(wb, "supplier-purchases.xlsx");
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Lines (filtered)" value={String(lines.length)} hint={range !== "all" ? `All time ${data.summary.purchaseCount}` : undefined} />
        <StatTile label="Products (filtered)" value={String(products.length)} hint={range !== "all" ? `All time ${data.summary.productCount}` : undefined} />
        <StatTile label="Pieces (filtered)" value={filteredQty.toLocaleString()} hint={range !== "all" ? `All time ${data.summary.totalQuantity.toLocaleString()}` : undefined} />
        <StatTile label="Value (filtered)" value={rs(filteredLineValue)} tone="brand" hint={range !== "all" ? `All time ${rs(data.summary.totalValue)}` : undefined} />
      </div>
      <FilterBar>
        <SearchBox value={search} onChange={setSearch} placeholder="Search product, SKU or bill…" />
        <DateRangeControls range={range} setRange={setRange} custom={custom} setCustom={setCustom} />
        <Chips
          options={[
            { value: "products", label: "By product" },
            { value: "lines", label: "Every delivery line" },
          ]}
          value={view}
          onChange={setView}
        />
        <Button size="sm" variant="outline" onClick={exportXlsx} disabled={!lines.length}>
          <Download className="mr-1.5 h-4 w-4" />
          Excel
        </Button>
      </FilterBar>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {view === "products" ? (
          products.length === 0 ? (
            <EmptyState icon={Boxes} title="No purchases" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Product</th>
                    <th className="px-2 py-2.5 text-right font-medium">Times</th>
                    <th className="px-2 py-2.5 text-right font-medium">Qty</th>
                    <th className="px-2 py-2.5 text-right font-medium">Avg cost</th>
                    <th className="px-2 py-2.5 text-right font-medium">Latest cost</th>
                    <th className="px-2 py-2.5 text-right font-medium">Cost change</th>
                    <th className="px-4 py-2.5 text-right font-medium">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {productPag.pageItems.map((p) => (
                    <tr key={p.productId} className="border-t border-gray-100">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-gray-900">{p.productName}</div>
                        <div className="text-[11px] text-gray-500">
                          {p.sku ?? "—"} · last {day(p.lastDate)}
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{p.purchaseCount}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{p.totalQty}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{rs(p.avgCost)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{rs(p.lastCost)}</td>
                      <td className={cn("px-2 py-2.5 text-right tabular-nums", p.costChangePct > 0 ? "text-rose-700" : p.costChangePct < 0 ? "text-emerald-700" : "text-gray-400")}>
                        {p.costChangePct ? `${p.costChangePct > 0 ? "+" : ""}${p.costChangePct.toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{rs(p.totalValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : lines.length === 0 ? (
          <EmptyState icon={Truck} title="No delivery lines" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Date</th>
                  <th className="px-2 py-2.5 text-left font-medium">Product</th>
                  <th className="px-2 py-2.5 text-left font-medium">Bill</th>
                  <th className="px-2 py-2.5 text-right font-medium">Qty</th>
                  <th className="px-2 py-2.5 text-right font-medium">Cost</th>
                  <th className="px-2 py-2.5 text-right font-medium">Total</th>
                  <th className="px-4 py-2.5 text-left font-medium">Branch</th>
                </tr>
              </thead>
              <tbody>
                {linePag.pageItems.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">{day(p.purchase_date)}</td>
                    <td className="px-2 py-2.5">
                      <div className="font-medium text-gray-900">{p.product?.name ?? "—"}</div>
                      <div className="text-[11px] text-gray-500">{p.product?.sku}</div>
                    </td>
                    <td className="px-2 py-2.5 text-gray-600">{p.invoice?.invoice_number ?? p.invoice_ref ?? "—"}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{p.quantity}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{rs(p.cost_price)}</td>
                    <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{rs(p.line_total)}</td>
                    <td className="px-4 py-2.5 text-gray-600">{p.warehouse_branch?.name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ListPaginationBar pag={view === "products" ? productPag : linePag} />
      </div>
    </div>
  );
}

/* ====================================================================== */

function ProductsTab({ products }: { products: SupplierProduct[] | null }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "low">("all");
  const q = search.trim().toLowerCase();
  const rows = useMemo(
    () =>
      (products ?? []).filter(
        (p) => (!q || `${p.name} ${p.sku ?? ""} ${p.category ?? ""}`.toLowerCase().includes(q)) && (status === "all" || (status === "active" ? p.is_active : p.stock <= 2)),
      ),
    [products, q, status],
  );
  const pag = usePaginatedList(rows);
  if (!products) return <Bone className="h-80" />;
  const stockValue = rows.reduce((t, p) => t + p.stock * p.purchase_rate, 0);
  const filteredStock = rows.reduce((t, p) => t + p.stock, 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Products (filtered)" value={String(rows.length)} hint={`All ${products.length}`} />
        <StatTile label="In stock (filtered)" value={filteredStock.toLocaleString()} />
        <StatTile label="Stock value (filtered)" value={rs(stockValue)} tone="brand" />
        <StatTile label="Pieces sold (filtered)" value={rows.reduce((t, p) => t + p.sold, 0).toLocaleString()} />
      </div>
      <FilterBar>
        <SearchBox value={search} onChange={setSearch} placeholder="Search products…" />
        <Chips
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "low", label: "Low stock (≤2)" },
          ]}
          value={status}
          onChange={setStatus}
        />
      </FilterBar>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {rows.length === 0 ? (
          <EmptyState icon={Package} title="No products" description="Products whose supplier is set to this supplier appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Product</th>
                  <th className="px-2 py-2.5 text-left font-medium">Category</th>
                  <th className="px-2 py-2.5 text-right font-medium">Cost</th>
                  <th className="px-2 py-2.5 text-right font-medium">Price</th>
                  <th className="px-2 py-2.5 text-right font-medium">Margin</th>
                  <th className="px-2 py-2.5 text-right font-medium">Stock</th>
                  <th className="px-4 py-2.5 text-right font-medium">Sold</th>
                </tr>
              </thead>
              <tbody>
                {pag.pageItems.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-900">
                        {p.name} {!p.is_active && <span className="ml-1 rounded bg-gray-100 px-1.5 text-[10px] text-gray-500">inactive</span>}
                      </div>
                      <div className="text-[11px] text-gray-500">{p.sku ?? p.code ?? "—"}</div>
                    </td>
                    <td className="px-2 py-2.5 text-gray-600">{p.category ?? "—"}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{rs(p.purchase_rate)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{rs(p.sales_rate)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{p.margin != null ? `${p.margin.toFixed(0)}%` : "—"}</td>
                    <td className={cn("px-2 py-2.5 text-right tabular-nums", p.stock <= 2 && "font-semibold text-rose-700")}>{p.stock}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{p.sold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ListPaginationBar pag={pag} />
      </div>
    </div>
  );
}

/* ====================================================================== */

function StatementTab({ supplier }: { supplier: SupplierRow }) {
  const { toast } = useToast();
  const { range, setRange, custom, setCustom } = useDateRangeState("month");
  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(false);
  const r = rangeFor(range, custom);

  useEffect(() => {
    let live = true;
    setLoading(true);
    supplierApi
      .statement(supplier.id, { from: r.from || undefined, to: r.to || undefined })
      .then((d) => live && setData(d))
      .catch((e) => toast({ variant: "destructive", title: "Could not load statement", description: apiError(e) }))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [supplier.id, r.from, r.to, toast]);

  const periodText = r.from ? `${day(`${r.from}T12:00:00`)} – ${day(`${r.to}T12:00:00`)}` : "All time";
  const print = () => {
    if (!data) return;
    const s = data.supplier;
    const head = `<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:8px"><div><b>${escapeHtml(s.name)}</b> (${escapeHtml(s.code)})<br/>${escapeHtml(
      [s.address, s.city].filter(Boolean).join(", "),
    )}<br/>${escapeHtml([s.mobile_number || s.phone_number, s.email].filter(Boolean).join(" · "))}${s.ntn ? `<br/>NTN ${escapeHtml(s.ntn)}` : ""}</div><div style="text-align:right">Period: ${escapeHtml(periodText)}<br/>Opening: <b>${signedBalance(
      data.summary.openingBalance,
    )}</b><br/>Closing: <b>${signedBalance(data.summary.closingBalance)}</b></div></div>`;
    const body = `${head}<table><thead><tr><th>Date</th><th>Type</th><th>Details</th><th>Ref</th><th class="r">Debit</th><th class="r">Credit</th><th class="r">Balance</th></tr></thead><tbody><tr><td colspan="6"><i>Opening balance</i></td><td class="r">${signedBalance(
      data.summary.openingBalance,
    )}</td></tr>${data.entries
      .map(
        (e) =>
          `<tr><td>${day(e.date)}</td><td>${escapeHtml(LEDGER_META[e.type]?.label ?? e.type)}</td><td>${escapeHtml(e.description)}</td><td>${escapeHtml(e.reference ?? "")}</td><td class="r">${e.debit ? rs(e.debit) : ""}</td><td class="r">${
            e.credit ? rs(e.credit) : ""
          }</td><td class="r">${signedBalance(e.balance)}</td></tr>`,
      )
      .join("")}<tr><td colspan="4"><b>Totals</b></td><td class="r"><b>${rs(data.summary.totalDebit)}</b></td><td class="r"><b>${rs(data.summary.totalCredit)}</b></td><td class="r"><b>${signedBalance(
      data.summary.closingBalance,
    )}</b></td></tr></tbody></table>`;
    printDocument(`Supplier statement — ${s.name}`, periodText, body);
  };
  const exportXlsx = () => {
    if (!data) return;
    const ws = XLSX.utils.json_to_sheet([
      { Date: "", Type: "Opening balance", Details: "", Reference: "", Debit: "", Credit: "", Balance: data.summary.openingBalance },
      ...data.entries.map((e) => ({ Date: day(e.date), Type: LEDGER_META[e.type]?.label ?? e.type, Details: e.description, Reference: e.reference ?? "", Debit: e.debit || "", Credit: e.credit || "", Balance: e.balance })),
      { Date: "", Type: "Closing balance", Details: "", Reference: "", Debit: data.summary.totalDebit, Credit: data.summary.totalCredit, Balance: data.summary.closingBalance },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Statement");
    XLSX.writeFile(wb, `statement-${supplier.name.replace(/\s+/g, "-")}.xlsx`);
  };
  const wa = supplier.whatsapp_number || supplier.mobile_number;
  const waText = data
    ? `Assalam o Alaikum ${supplier.contact_person || supplier.name}, account summary (${periodText}): opening ${signedBalance(data.summary.openingBalance)}, bills ${rs(data.summary.totalCredit)}, paid/adjusted ${rs(
        data.summary.totalDebit,
      )}, balance ${signedBalance(data.summary.closingBalance)}. Please confirm.`
    : "";

  const entryPag = usePaginatedList(data?.entries ?? []);

  return (
    <div className="space-y-3">
      <FilterBar>
        <DateRangeControls range={range} setRange={setRange} custom={custom} setCustom={setCustom} />
        <div className="ml-auto flex gap-2">
          {wa && data && (
            <Button size="sm" variant="outline" asChild>
              <a href={whatsappLink(wa, waText)} target="_blank" rel="noreferrer">
                <MessageCircle className="mr-1.5 h-4 w-4 text-emerald-600" />
                WhatsApp
              </a>
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={exportXlsx} disabled={!data}>
            <Download className="mr-1.5 h-4 w-4" />
            Excel
          </Button>
          <Button size="sm" onClick={print} disabled={!data} className="bg-[#2a2012] hover:bg-[#3a2e1c]">
            <Printer className="mr-1.5 h-4 w-4" />
            Print / PDF
          </Button>
        </div>
      </FilterBar>
      {!data ? (
        <Bone className="h-80" />
      ) : (
        <div className={cn("space-y-3", loading && "opacity-60")}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Opening balance" value={signedBalance(data.summary.openingBalance)} />
            <StatTile label="Bills & charges (credit)" value={rs(data.summary.totalCredit)} />
            <StatTile label="Paid & adjusted (debit)" value={rs(data.summary.totalDebit)} tone="good" />
            <StatTile label="Closing balance" value={signedBalance(data.summary.closingBalance)} tone="brand" />
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Date</th>
                    <th className="px-2 py-2.5 text-left font-medium">Type</th>
                    <th className="px-2 py-2.5 text-left font-medium">Details</th>
                    <th className="px-2 py-2.5 text-right font-medium">Debit</th>
                    <th className="px-2 py-2.5 text-right font-medium">Credit</th>
                    <th className="px-4 py-2.5 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-gray-100 bg-[#fcf8f2]/60">
                    <td className="px-4 py-2.5 text-gray-500" colSpan={5}>
                      Opening balance {r.from ? `on ${day(`${r.from}T12:00:00`)}` : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{signedBalance(data.summary.openingBalance)}</td>
                  </tr>
                  {entryPag.pageItems.map((e) => (
                    <tr key={e.id} className="border-t border-gray-100">
                      <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">{day(e.date)}</td>
                      <td className="px-2 py-2.5">
                        <TypePill type={e.type} />
                      </td>
                      <td className="max-w-[360px] px-2 py-2.5 text-gray-900">
                        {e.description}
                        {e.reference && <span className="ml-1 text-[11px] text-gray-500">· {e.reference}</span>}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-emerald-700">{e.debit ? rs(e.debit) : ""}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{e.credit ? rs(e.credit) : ""}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{signedBalance(e.balance)}</td>
                    </tr>
                  ))}
                  {data.entries.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                        No transactions in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <ListPaginationBar pag={entryPag} />
          </div>
        </div>
      )}
    </div>
  );
}

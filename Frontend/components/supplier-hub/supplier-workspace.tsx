"use client";

import { useCallback, useEffect, useState, type ComponentType } from "react";
import { format } from "date-fns";
import {
  BookOpenText,
  FileText,
  LayoutDashboard,
  Loader2,
  Mail,
  MapPin,
  Package,
  Pencil,
  Phone,
  Printer,
  SearchX,
  ShoppingBag,
  Trash2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { YmdDatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { businessTodayYmd, startOfBusinessMonthYmd } from "@/lib/business-timezone";
import { Bone, EmptyState, StatTile } from "@/components/accounts/coa-ui";
import { ConfirmDialog } from "@/components/accounts/coa-dialogs";
import { escapeHtml, printDocument } from "@/components/accounts/coa-shared";
import { PaymentDialog, SupplierFormDialog } from "./supplier-dialogs";
import {
  LEDGER_META,
  METHOD_LABEL,
  apiError,
  initials,
  rs,
  rs2,
  supplierApi,
  type LedgerData,
  type LedgerEntry,
  type PurchasesData,
  type StatementData,
  type SupplierProduct,
  type SupplierRow,
} from "./supplier-api";

type Tab = "overview" | "ledger" | "purchases" | "payments" | "products" | "statement";

const TABS: { id: Tab; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "ledger", label: "Ledger", icon: BookOpenText },
  { id: "purchases", label: "Purchases", icon: ShoppingBag },
  { id: "payments", label: "Payments", icon: Wallet },
  { id: "products", label: "Products", icon: Package },
  { id: "statement", label: "Statement", icon: FileText },
];

const day = (v?: string | Date | null) => (v ? format(new Date(v), "dd MMM yyyy") : "—");

export function SupplierWorkspace({
  supplier,
  open,
  onOpenChange,
  onChanged,
  canDelete,
  initialTab = "overview",
}: {
  supplier: SupplierRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
  canDelete: boolean;
  initialTab?: Tab;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [ledger, setLedger] = useState<LedgerData | null>(null);
  const [purchases, setPurchases] = useState<PurchasesData | null>(null);
  const [products, setProducts] = useState<SupplierProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePayId, setDeletePayId] = useState<string | null>(null);
  const [stmtFrom, setStmtFrom] = useState(startOfBusinessMonthYmd());
  const [stmtTo, setStmtTo] = useState(businessTodayYmd());
  const [statement, setStatement] = useState<StatementData | null>(null);
  const [stmtLoading, setStmtLoading] = useState(false);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab, supplier?.id]);

  const load = useCallback(async () => {
    if (!supplier) return;
    setLoading(true);
    try {
      const [l, p, prod] = await Promise.all([
        supplierApi.ledger(supplier.id),
        supplierApi.purchases(supplier.id),
        supplierApi.products(supplier.id),
      ]);
      setLedger(l);
      setPurchases(p);
      setProducts(prod);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not load supplier account",
        description: apiError(error),
      });
    } finally {
      setLoading(false);
    }
  }, [supplier, toast]);

  useEffect(() => {
    if (open && supplier) {
      setLedger(null);
      setPurchases(null);
      setProducts([]);
      setStatement(null);
      load();
    }
  }, [open, supplier?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadStatement = useCallback(async () => {
    if (!supplier) return;
    setStmtLoading(true);
    try {
      setStatement(await supplierApi.statement(supplier.id, { from: stmtFrom, to: stmtTo }));
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not load statement",
        description: apiError(error),
      });
    } finally {
      setStmtLoading(false);
    }
  }, [supplier, stmtFrom, stmtTo, toast]);

  useEffect(() => {
    if (open && tab === "statement" && supplier) loadStatement();
  }, [open, tab, supplier?.id, stmtFrom, stmtTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => {
    load();
    onChanged();
    if (tab === "statement") loadStatement();
  };

  const removePayment = async () => {
    if (!supplier || !deletePayId) return;
    try {
      await supplierApi.deletePayment(supplier.id, deletePayId);
      toast({ title: "Payment deleted" });
      setDeletePayId(null);
      refresh();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not delete payment",
        description: apiError(error),
      });
    }
  };

  const removeSupplier = async () => {
    if (!supplier) return;
    try {
      await supplierApi.remove(supplier.id);
      toast({ title: "Supplier deleted" });
      setDeleteOpen(false);
      onOpenChange(false);
      onChanged();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not delete supplier",
        description: apiError(error),
      });
    }
  };

  const printStatement = () => {
    if (!statement || !supplier) return;
    const rows = statement.entries
      .map(
        (e) =>
          `<tr><td>${day(e.date)}</td><td>${escapeHtml(LEDGER_META[e.type]?.label || e.type)}</td><td>${escapeHtml(e.description)}</td>
          <td class="r">${e.debit ? rs2(e.debit) : ""}</td><td class="r">${e.credit ? rs2(e.credit) : ""}</td><td class="r">${rs2(e.balance)}</td></tr>`,
      )
      .join("");
    printDocument(
      "Supplier Account Statement",
      `${supplier.name} · ${supplier.code} · ${day(stmtFrom)} – ${day(stmtTo)}`,
      `<table><tbody>
        <tr class="l3"><td colspan="5">Opening balance</td><td class="r">${rs2(statement.summary.openingBalance)}</td></tr>${rows}</tbody>
        <tfoot><tr><td colspan="3">Totals</td><td class="r">${rs2(statement.summary.totalDebit)}</td><td class="r">${rs2(statement.summary.totalCredit)}</td><td class="r">${rs2(statement.summary.closingBalance)}</td></tr></tfoot>
      </table>
      <p style="margin-top:24px;font-size:12px" class="muted">Closing balance ${statement.summary.closingBalance >= 0 ? "payable to supplier" : "held as advance"}: <strong>${rs2(Math.abs(statement.summary.closingBalance))}</strong></p>`,
    );
  };

  if (!supplier) return null;

  const s = ledger?.summary;
  const due = s?.balanceDue ?? supplier.balance_due ?? 0;
  const purchased = s?.totalPurchased ?? supplier.total_purchased ?? 0;
  const paid = s?.totalPaid ?? supplier.total_paid ?? 0;
  const returned = s?.totalReturned ?? supplier.total_returned ?? 0;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1100px,96vw)]">
          <div className="border-b border-gray-200 bg-gradient-to-br from-[#1f2a24] to-[#2f4638] px-5 pb-4 pt-5 text-white sm:px-6">
            <div className="flex flex-wrap items-start gap-4 pr-8">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#c8e6d0] text-lg font-bold text-[#1f2a24] shadow-sm">
                {initials(supplier.name)}
              </span>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-xl font-bold text-white">{supplier.name}</SheetTitle>
                <SheetDescription asChild>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/70">
                    <span className="font-mono">{supplier.code}</span>
                    {supplier.mobile_number || supplier.phone_number ? (
                      <a
                        href={`tel:${supplier.mobile_number || supplier.phone_number}`}
                        className="inline-flex items-center gap-1 hover:text-white"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        {supplier.mobile_number || supplier.phone_number}
                      </a>
                    ) : null}
                    {supplier.email ? (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5" />
                        {supplier.email}
                      </span>
                    ) : null}
                    {supplier.city || supplier.address ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {supplier.city || supplier.address}
                      </span>
                    ) : null}
                    <span>Since {day(supplier.created_at)}</span>
                  </div>
                </SheetDescription>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
                      supplier.is_active ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 text-white/60",
                    )}
                  >
                    {supplier.is_active ? "Active" : "Inactive"}
                  </span>
                  {supplier.display_on_pos ? (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/70">On POS</span>
                  ) : null}
                </div>
              </div>
              <div className="rounded-xl bg-white/10 px-4 py-3 text-right ring-1 ring-white/15">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-white/60">
                  {due > 0.005 ? "We owe" : due < -0.005 ? "Advance with supplier" : "Balance"}
                </p>
                <p
                  className={cn(
                    "text-2xl font-bold tabular-nums",
                    due > 0.005 ? "text-rose-200" : due < -0.005 ? "text-emerald-200" : "text-white",
                  )}
                >
                  {due > 0.005 ? rs(due) : due < -0.005 ? rs(Math.abs(due)) : "Settled"}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="h-9 bg-[#c8e6d0] text-[#1f2a24] hover:bg-[#d8f0de]"
                onClick={() => setPayOpen(true)}
              >
                <Wallet className="mr-1.5 h-4 w-4" />
                Record payment
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 border-white/20 bg-white/5 text-white hover:bg-white/15 hover:text-white"
                onClick={() => setTab("statement")}
              >
                <Printer className="mr-1.5 h-4 w-4" />
                Statement
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 border-white/20 bg-white/5 text-white hover:bg-white/15 hover:text-white"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="mr-1.5 h-4 w-4" />
                Edit
              </Button>
              {canDelete ? (
                <Button
                  size="icon"
                  variant="outline"
                  className="ml-auto h-9 w-9 border-white/20 bg-white/5 text-rose-200 hover:bg-rose-500/20 hover:text-white"
                  onClick={() => setDeleteOpen(true)}
                  aria-label="Delete supplier"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>

          <div className="border-b border-gray-200 bg-white px-3 sm:px-5">
            <div className="-mb-px flex gap-1 overflow-x-auto">
              {TABS.map((t) => {
                const Icon = t.icon;
                const count =
                  t.id === "ledger"
                    ? ledger?.entries.length
                    : t.id === "purchases"
                      ? purchases?.summary.purchaseCount
                      : t.id === "payments"
                        ? ledger?.payments.length
                        : t.id === "products"
                          ? products.length
                          : undefined;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap",
                      tab === t.id
                        ? "border-emerald-700 text-emerald-800"
                        : "border-transparent text-gray-500 hover:text-gray-800",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                    {count != null ? (
                      <span className="rounded-full bg-gray-100 px-1.5 text-[10px] tabular-nums text-gray-600">
                        {count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 p-4 sm:p-5">
            {loading && !ledger ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Bone key={i} className="h-24 rounded-xl" />
                ))}
              </div>
            ) : tab === "overview" ? (
              <OverviewTab
                supplier={supplier}
                purchased={purchased}
                paid={paid}
                returned={returned}
                due={due}
                purchaseCount={s?.purchaseCount ?? supplier.purchase_count}
                paymentCount={s?.paymentCount ?? supplier.payment_count ?? 0}
                productCount={products.length || supplier.product_count}
                recent={ledger?.entries.slice(0, 8) || []}
                onLedger={() => setTab("ledger")}
                onPay={() => setPayOpen(true)}
              />
            ) : tab === "ledger" ? (
              <LedgerTab entries={ledger?.entries || []} />
            ) : tab === "purchases" ? (
              <PurchasesTab data={purchases} />
            ) : tab === "payments" ? (
              <PaymentsTab
                payments={ledger?.payments || []}
                onDelete={(id) => setDeletePayId(id)}
                onPay={() => setPayOpen(true)}
              />
            ) : tab === "products" ? (
              <ProductsTab products={products} />
            ) : (
              <StatementTab
                from={stmtFrom}
                to={stmtTo}
                setFrom={setStmtFrom}
                setTo={setStmtTo}
                loading={stmtLoading}
                statement={statement}
                onReload={loadStatement}
                onPrint={printStatement}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <PaymentDialog
        open={payOpen}
        supplier={supplier}
        balanceDue={due}
        onOpenChange={setPayOpen}
        onSaved={refresh}
      />
      <SupplierFormDialog
        open={editOpen}
        editing={supplier}
        onOpenChange={setEditOpen}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={!!deletePayId}
        onOpenChange={(o) => !o && setDeletePayId(null)}
        title="Delete this payment?"
        description="The payable balance will increase again."
        confirmLabel="Delete payment"
        onConfirm={removePayment}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${supplier.name}?`}
        description="Purchases stay in history but will be reassigned to the default supplier."
        confirmLabel="Delete supplier"
        onConfirm={removeSupplier}
      />
    </>
  );
}

function OverviewTab({
  supplier,
  purchased,
  paid,
  returned,
  due,
  purchaseCount,
  paymentCount,
  productCount,
  recent,
  onLedger,
  onPay,
}: {
  supplier: SupplierRow;
  purchased: number;
  paid: number;
  returned: number;
  due: number;
  purchaseCount: number;
  paymentCount: number;
  productCount: number;
  recent: LedgerEntry[];
  onLedger: () => void;
  onPay: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Purchased" value={rs(purchased)} hint={`${purchaseCount} lines / invoices`} />
        <StatTile label="Paid" value={rs(paid)} hint={`${paymentCount} payments`} tone="good" />
        <StatTile label="Returned" value={rs(returned)} hint="Completed returns" />
        <StatTile
          label={due > 0 ? "Payable" : due < 0 ? "Advance" : "Balance"}
          value={rs(Math.abs(due))}
          hint={due > 0 ? "Outstanding to supplier" : due < 0 ? "Credit with supplier" : "Settled"}
          tone={due > 0 ? "bad" : due < 0 ? "good" : "default"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Contact & tax</h3>
          <dl className="mt-3 space-y-2 text-sm">
            {(
              [
                ["Mobile", supplier.mobile_number],
                ["Phone", supplier.phone_number],
                ["Email", supplier.email],
                ["City", supplier.city],
                ["NTN", supplier.ntn],
                ["STRN", supplier.strn],
                ["Address", supplier.address],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3">
                <dt className="text-slate-500">{label}</dt>
                <dd className="text-right font-medium text-slate-900">{value || "—"}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-slate-500">{productCount} catalogue products linked</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Recent ledger</h3>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-8" onClick={onLedger}>
                Full ledger
              </Button>
              <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700" onClick={onPay}>
                Pay
              </Button>
            </div>
          </div>
          {recent.length === 0 ? (
            <EmptyState
              icon={BookOpenText}
              title="No ledger activity yet"
              description="Stock In purchases and payments will appear here."
            />
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {recent.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{e.description}</p>
                    <p className="text-[11px] text-slate-500">
                      {day(e.date)} · {LEDGER_META[e.type]?.label}
                    </p>
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    {e.debit > 0 ? (
                      <p className="font-semibold text-rose-700">+{rs2(e.debit)}</p>
                    ) : (
                      <p className="font-semibold text-emerald-700">−{rs2(e.credit)}</p>
                    )}
                    <p className="text-[11px] text-slate-400">bal {rs2(e.balance)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function LedgerTab({ entries }: { entries: LedgerEntry[] }) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={BookOpenText}
        title="Ledger is empty"
        description="Purchases, invoices, returns and payments build this running balance."
      />
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Date</th>
              <th className="px-3 py-3 text-left font-semibold">Type</th>
              <th className="px-3 py-3 text-left font-semibold">Description</th>
              <th className="px-3 py-3 text-left font-semibold">Ref</th>
              <th className="px-3 py-3 text-right font-semibold">Debit</th>
              <th className="px-3 py-3 text-right font-semibold">Credit</th>
              <th className="px-4 py-3 text-right font-semibold">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50/70">
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-700">{day(e.date)}</td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
                      LEDGER_META[e.type]?.tone,
                    )}
                  >
                    {LEDGER_META[e.type]?.label || e.type}
                  </span>
                </td>
                <td className="max-w-[280px] truncate px-3 py-2.5 font-medium text-slate-900">
                  {e.description}
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{e.reference || "—"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-rose-700">
                  {e.debit > 0 ? rs2(e.debit) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">
                  {e.credit > 0 ? rs2(e.credit) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                  {rs2(e.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PurchasesTab({ data }: { data: PurchasesData | null }) {
  if (!data || data.purchases.length === 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="No purchases yet"
        description="Stock In receipts for this supplier will show here."
      />
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Lines" value={String(data.summary.purchaseCount)} />
        <StatTile label="Units" value={String(data.summary.totalQuantity)} />
        <StatTile label="Value" value={rs(data.summary.totalValue)} tone="brand" />
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Date</th>
                <th className="px-3 py-3 text-left font-semibold">Product</th>
                <th className="px-3 py-3 text-right font-semibold">Qty</th>
                <th className="px-3 py-3 text-right font-semibold">Cost</th>
                <th className="px-3 py-3 text-right font-semibold">Value</th>
                <th className="px-4 py-3 text-left font-semibold">Branch / Ref</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.purchases.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-4 py-2.5">{day(p.purchase_date)}</td>
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-slate-900">{p.product?.name || "—"}</p>
                    <p className="font-mono text-[11px] text-slate-400">{p.product?.sku || ""}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{p.quantity}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{rs2(p.cost_price)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{rs2(p.line_total)}</td>
                  <td className="px-4 py-2.5 text-slate-600">
                    <p>{p.warehouse_branch?.name || "—"}</p>
                    <p className="font-mono text-[11px] text-slate-400">{p.invoice_ref || ""}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PaymentsTab({
  payments,
  onDelete,
  onPay,
}: {
  payments: LedgerData["payments"];
  onDelete: (id: string) => void;
  onPay: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" className="h-9 bg-emerald-600 hover:bg-emerald-700" onClick={onPay}>
          <Wallet className="mr-1.5 h-4 w-4" />
          Record payment
        </Button>
      </div>
      {payments.length === 0 ? (
        <EmptyState icon={Wallet} title="No payments recorded" description="Pay this supplier to clear the payable balance." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Date</th>
                  <th className="px-3 py-3 text-left font-semibold">Method</th>
                  <th className="px-3 py-3 text-right font-semibold">Amount</th>
                  <th className="px-3 py-3 text-left font-semibold">Reference</th>
                  <th className="px-3 py-3 text-left font-semibold">Notes</th>
                  <th className="px-4 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap px-4 py-2.5">{day(p.payment_date)}</td>
                    <td className="px-3 py-2.5">{METHOD_LABEL[p.method] || p.method}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-emerald-700">
                      {rs2(p.amount)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{p.reference || "—"}</td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-slate-600">{p.notes || "—"}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-rose-600 hover:text-rose-700"
                        onClick={() => onDelete(p.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductsTab({ products }: { products: SupplierProduct[] }) {
  if (products.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="No linked products"
        description="Assign this supplier on product master to build their catalogue."
      />
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Product</th>
              <th className="px-3 py-3 text-left font-semibold">Category</th>
              <th className="px-3 py-3 text-right font-semibold">Cost</th>
              <th className="px-3 py-3 text-right font-semibold">Sale</th>
              <th className="px-4 py-3 text-right font-semibold">Purchases</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2.5">
                  <p className="font-medium text-slate-900">{p.name}</p>
                  <p className="font-mono text-[11px] text-slate-400">{p.sku || p.code}</p>
                </td>
                <td className="px-3 py-2.5 text-slate-600">{p.category || "—"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{rs2(p.purchase_rate)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{rs2(p.sales_rate)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{p.purchase_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatementTab({
  from,
  to,
  setFrom,
  setTo,
  loading,
  statement,
  onReload,
  onPrint,
}: {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  loading: boolean;
  statement: StatementData | null;
  onReload: () => void;
  onPrint: () => void;
}) {
  const entries: LedgerEntry[] = statement
    ? [
        {
          id: "opening",
          date: from,
          type: "INVOICE",
          description: "Opening balance",
          reference: null,
          debit: 0,
          credit: 0,
          balance: statement.summary.openingBalance,
        },
        ...statement.entries,
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">From</p>
          <YmdDatePicker value={from} onChange={setFrom} className="h-9 w-[150px]" />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">To</p>
          <YmdDatePicker value={to} onChange={setTo} className="h-9 w-[150px]" />
        </div>
        <Button size="sm" variant="outline" className="h-9" onClick={onReload} disabled={loading}>
          {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          Refresh
        </Button>
        <Button size="sm" className="h-9" onClick={onPrint} disabled={!statement}>
          <Printer className="mr-1.5 h-4 w-4" />
          Print
        </Button>
      </div>

      {loading && !statement ? (
        <Bone className="h-64 rounded-xl" />
      ) : !statement ? (
        <EmptyState icon={FileText} title="No statement" description="Pick a date range and refresh." />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <StatTile label="Opening" value={rs2(statement.summary.openingBalance)} />
            <StatTile label="Debits" value={rs2(statement.summary.totalDebit)} />
            <StatTile label="Credits" value={rs2(statement.summary.totalCredit)} tone="good" />
            <StatTile
              label="Closing"
              value={rs2(statement.summary.closingBalance)}
              tone={statement.summary.closingBalance > 0.005 ? "bad" : "good"}
            />
          </div>
          {statement.entries.length === 0 ? (
            <EmptyState icon={SearchX} title="No entries in this period" description="Pick a wider date range." />
          ) : (
            <LedgerTab entries={entries} />
          )}
        </div>
      )}
    </div>
  );
}

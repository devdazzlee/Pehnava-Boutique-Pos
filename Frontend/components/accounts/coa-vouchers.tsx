"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CheckCircle2, Loader2, NotebookPen, Pencil, Plus, Printer, Scale, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { YmdDatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import { businessTodayYmd } from "@/lib/business-timezone";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "./coa-dialogs";
import { AccountCombobox, Chips, EmptyState, FilterBar, FilterLabel, Panel, SearchBox, StatTile } from "./coa-ui";
import {
  apiError,
  coaApi,
  escapeHtml,
  flattenAccounts,
  money,
  moneyOrDash,
  printDocument,
  type CoaFilters,
  type CoaTree,
} from "./coa-shared";

type Voucher = {
  id: string;
  voucher_no: string;
  voucher_date: string;
  narration: string | null;
  reference: string | null;
  branch_id: string | null;
  total: number;
  lines: {
    id: string;
    account_id: string;
    account: { id: string; code: string; name: string };
    description: string | null;
    debit: number;
    credit: number;
  }[];
};

type DraftLine = { key: number; account_id: string; description: string; debit: string; credit: string };
type Sort = "newest" | "oldest" | "amount";

let lineKey = 0;
const blankLine = (): DraftLine => ({ key: ++lineKey, account_id: "", description: "", debit: "", credit: "" });
const fmtDate = (v: string) => format(new Date(`${v}T00:00:00`), "dd MMM yyyy");

/** Common entries so users don't have to know double-entry by heart. */
const TEMPLATES: { label: string; narration: string; debit: string; credit: string }[] = [
  { label: "Owner capital → bank", narration: "Owner invested capital", debit: "Bank Account", credit: "Owner's Capital" },
  { label: "Cash deposited in bank", narration: "Cash deposited into bank", debit: "Bank Account", credit: "Cash in Hand" },
  { label: "Owner drawings", narration: "Owner withdrew cash for personal use", debit: "Owner's Drawings", credit: "Cash in Hand" },
  { label: "Staff advance", narration: "Advance paid to staff", debit: "Staff Loans & Advances", credit: "Cash in Hand" },
];

export function CoaVouchers({
  tree,
  filters,
  canManage,
  onPosted,
  onOpenLedger,
  newRequest,
}: {
  tree: CoaTree;
  filters: CoaFilters;
  canManage: boolean;
  onPosted: () => void;
  onOpenLedger: (accountId: string) => void;
  newRequest?: number;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Voucher[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("newest");
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<{ open: boolean; editing: Voucher | null }>({ open: false, editing: null });
  const [deleteTarget, setDeleteTarget] = useState<Voucher | null>(null);
  const accounts = useMemo(() => flattenAccounts(tree), [tree]);

  useEffect(() => {
    if (newRequest && canManage) setEditor({ open: true, editing: null });
  }, [newRequest, canManage]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await coaApi.vouchers({
        from: filters.from,
        to: filters.to,
        search: search || undefined,
        account_id: accountFilter || undefined,
        page,
        limit: 25,
      });
      setRows(res.data);
      setMeta(res.meta);
    } catch (error) {
      toast({ variant: "destructive", title: "Could not load journal vouchers", description: apiError(error) });
    } finally {
      setLoading(false);
    }
  }, [filters.from, filters.to, search, accountFilter, page, toast]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const sorted = useMemo(() => {
    const list = [...rows];
    if (sort === "oldest") list.sort((a, b) => a.voucher_date.localeCompare(b.voucher_date) || a.voucher_no.localeCompare(b.voucher_no));
    if (sort === "amount") list.sort((a, b) => b.total - a.total);
    return list;
  }, [rows, sort]);

  const pageTotal = rows.reduce((s, v) => s + v.total, 0);
  const isFiltered = !!search || !!accountFilter;

  const printVoucher = (v: Voucher) => {
    const lines = v.lines
      .map(
        (l) => `<tr><td>${l.account.code}</td><td>${escapeHtml(l.account.name)}</td><td>${escapeHtml(l.description || "")}</td>
        <td class="r">${moneyOrDash(l.debit)}</td><td class="r">${moneyOrDash(l.credit)}</td></tr>`,
      )
      .join("");
    printDocument(
      `Journal Voucher ${v.voucher_no}`,
      `${fmtDate(v.voucher_date)}${v.reference ? ` · Ref ${v.reference}` : ""}`,
      `${v.narration ? `<p><strong>Narration:</strong> ${escapeHtml(v.narration)}</p>` : ""}
      <table><thead><tr><th>Code</th><th>Account</th><th>Description</th><th class="r">Debit</th><th class="r">Credit</th></tr></thead>
      <tbody>${lines}</tbody><tfoot><tr><td colspan="3">Total</td><td class="r">${moneyOrDash(v.total)}</td><td class="r">${moneyOrDash(v.total)}</td></tr></tfoot></table>
      <div style="display:flex;justify-content:space-between;margin-top:60px;font-size:12px">
        <span>Prepared by ____________</span><span>Checked by ____________</span><span>Approved by ____________</span>
      </div>`,
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Vouchers" value={meta.total} hint={isFiltered ? "Matching your filters" : "In selected dates"} icon={NotebookPen} />
        <StatTile label="Value on this page" value={money(pageTotal)} hint={`${rows.length} voucher(s)`} icon={Scale} />
        <StatTile label="Largest" value={rows.length ? money(Math.max(...rows.map((r) => r.total))) : "—"} />
        <StatTile
          label="Accounts touched"
          value={new Set(rows.flatMap((r) => r.lines.map((l) => l.account_id))).size}
          hint="Across vouchers on this page"
        />
      </div>

      <Panel
        icon={NotebookPen}
        title="Journal vouchers"
        subtitle="Manual double-entry postings — capital, bank, fixed assets, loans, accruals and corrections"
        actions={
          <>
            {loading ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : null}
            {canManage ? (
              <Button size="sm" className="h-9 bg-[#2a2012] hover:bg-[#3b2e1a]" onClick={() => setEditor({ open: true, editing: null })}>
                <Plus className="mr-1 h-4 w-4" />New voucher
              </Button>
            ) : null}
          </>
        }
      >
        <FilterBar>
          <SearchBox
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Voucher no, narration or reference…"
            className="max-w-xs"
          />
          <div className="w-full sm:w-72">
            <AccountCombobox
              accounts={accounts}
              value={accountFilter}
              onChange={(id) => {
                setAccountFilter(id);
                setPage(1);
              }}
              allowClear
              clearLabel="Any account"
              showBalance={false}
            />
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <FilterLabel>Sort</FilterLabel>
            <Chips<Sort>
              size="xs"
              value={sort}
              onChange={setSort}
              options={[
                { value: "newest", label: "Newest" },
                { value: "oldest", label: "Oldest" },
                { value: "amount", label: "Largest" },
              ]}
            />
          </div>
        </FilterBar>

        {sorted.length === 0 && !loading ? (
          <EmptyState
            icon={NotebookPen}
            title={isFiltered ? "No vouchers match these filters" : "No journal vouchers in this period"}
            description={
              isFiltered
                ? "Clear the search or account filter."
                : "Use vouchers for owner capital, bank deposits, fixed-asset purchases, loans, accruals and corrections."
            }
            action={
              isFiltered ? (
                <Button size="sm" variant="outline" onClick={() => { setSearch(""); setAccountFilter(null); }}>
                  Clear filters
                </Button>
              ) : canManage ? (
                <Button size="sm" className="bg-[#2a2012] hover:bg-[#3b2e1a]" onClick={() => setEditor({ open: true, editing: null })}>
                  <Plus className="mr-1 h-4 w-4" />Post your first voucher
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="divide-y divide-gray-100">
            {sorted.map((v) => (
              <article key={v.id} className="group px-5 py-4 transition-colors hover:bg-gray-50/60">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="rounded-md bg-violet-50 px-2 py-0.5 font-mono text-xs font-semibold text-violet-700 ring-1 ring-inset ring-violet-200">
                    {v.voucher_no}
                  </span>
                  <span className="text-sm text-gray-600">{fmtDate(v.voucher_date)}</span>
                  {v.reference ? <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">Ref {v.reference}</span> : null}
                  <span className="ml-auto text-base font-bold tabular-nums text-gray-900">{money(v.total)}</span>
                  <div className="flex gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => printVoucher(v)} title="Print voucher">
                      <Printer className="h-4 w-4" />
                    </Button>
                    {canManage ? (
                      <>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditor({ open: true, editing: v })} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600 hover:text-rose-700" onClick={() => setDeleteTarget(v)} title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
                {v.narration ? <p className="mt-1 text-sm text-gray-700">{v.narration}</p> : null}
                <div className="mt-3 overflow-hidden rounded-lg border border-gray-100">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-400">
                        <th className="w-20 px-3 py-1.5">Code</th>
                        <th className="px-3 py-1.5">Account</th>
                        <th className="w-28 px-3 py-1.5 text-right">Debit</th>
                        <th className="w-28 px-3 py-1.5 text-right">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {v.lines.map((l) => (
                        <tr key={l.id} className={cn("border-t border-gray-50", accountFilter === l.account_id && "bg-amber-50/70")}>
                          <td className="px-3 py-1.5 font-mono text-gray-400">{l.account.code}</td>
                          <td className={cn("px-3 py-1.5", l.credit > 0 && "pl-8")}>
                            <button type="button" className="text-gray-800 hover:text-sky-700 hover:underline" onClick={() => onOpenLedger(l.account_id)}>
                              {l.account.name}
                            </button>
                            {l.description ? <span className="ml-2 text-gray-400">· {l.description}</span> : null}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{l.debit ? moneyOrDash(l.debit) : ""}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">{l.credit ? moneyOrDash(l.credit) : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </div>
        )}
        {meta.totalPages > 1 ? (
          <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-5 py-2.5 text-sm">
            <span className="text-xs text-gray-500">Page {meta.page} of {meta.totalPages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button size="sm" variant="outline" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        ) : null}
      </Panel>

      <VoucherEditor
        open={editor.open}
        onOpenChange={(open) => setEditor((s) => ({ ...s, open }))}
        editing={editor.editing}
        tree={tree}
        onSaved={() => {
          load();
          onPosted();
        }}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.voucher_no}?`}
        description="The voucher and all its lines will be removed and account balances recalculated."
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await coaApi.deleteVoucher(deleteTarget.id);
            toast({ title: "Voucher deleted", description: deleteTarget.voucher_no });
            load();
            onPosted();
          } catch (error) {
            toast({ variant: "destructive", title: "Could not delete voucher", description: apiError(error) });
            throw error;
          }
        }}
      />
    </div>
  );
}

function VoucherEditor({
  open,
  onOpenChange,
  editing,
  tree,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Voucher | null;
  tree: CoaTree;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [date, setDate] = useState(businessTodayYmd());
  const [narration, setNarration] = useState("");
  const [reference, setReference] = useState("");
  const [branchId, setBranchId] = useState("none");
  const [lines, setLines] = useState<DraftLine[]>([blankLine(), blankLine()]);
  const [saving, setSaving] = useState(false);

  const accounts = useMemo(() => flattenAccounts(tree).filter((a) => a.is_active && !a.computed), [tree]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDate(editing.voucher_date);
      setNarration(editing.narration ?? "");
      setReference(editing.reference ?? "");
      setBranchId(editing.branch_id ?? "none");
      setLines(
        editing.lines.map((l) => ({
          key: ++lineKey,
          account_id: l.account_id,
          description: l.description ?? "",
          debit: l.debit ? String(l.debit) : "",
          credit: l.credit ? String(l.credit) : "",
        })),
      );
    } else {
      setDate(businessTodayYmd());
      setNarration("");
      setReference("");
      setBranchId("none");
      setLines([blankLine(), blankLine()]);
    }
  }, [open, editing]);

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const diff = Math.round((totalDebit - totalCredit) * 100) / 100;
  const filled = lines.filter((l) => l.account_id && ((Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0));
  const balanced = Math.abs(diff) < 0.005 && totalDebit > 0;
  const valid = filled.length >= 2 && balanced;

  const update = (key: number, patch: Partial<DraftLine>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const balanceLast = () => {
    if (Math.abs(diff) < 0.005) return;
    const target = [...lines].reverse().find((l) => !l.debit && !l.credit) ?? null;
    const amount = String(Math.abs(diff));
    if (target) update(target.key, diff > 0 ? { credit: amount } : { debit: amount });
    else setLines((prev) => [...prev, { ...blankLine(), ...(diff > 0 ? { credit: amount } : { debit: amount }) }]);
  };

  const applyTemplate = (t: (typeof TEMPLATES)[number]) => {
    const find = (name: string) => accounts.find((a) => a.name.toLowerCase() === name.toLowerCase())?.id ?? "";
    setNarration(t.narration);
    setLines([
      { ...blankLine(), account_id: find(t.debit) },
      { ...blankLine(), account_id: find(t.credit) },
    ]);
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        voucher_date: date,
        narration: narration || null,
        reference: reference || null,
        branch_id: branchId === "none" ? null : branchId,
        lines: filled.map((l) => ({
          account_id: l.account_id,
          description: l.description || null,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
        })),
      };
      const saved = editing ? await coaApi.updateVoucher(editing.id, body) : await coaApi.createVoucher(body);
      toast({ title: editing ? "Voucher updated" : "Voucher posted", description: `${saved.voucher_no} · ${money(saved.total)}` });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast({ variant: "destructive", title: "Could not save voucher", description: apiError(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <NotebookPen className="h-5 w-5 text-violet-600" />
            {editing ? `Edit ${editing.voucher_no}` : "New journal voucher"}
          </DialogTitle>
          <DialogDescription>Each line takes either a debit or a credit. The voucher saves only when total debit equals total credit.</DialogDescription>
        </DialogHeader>

        {!editing ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Quick start</span>
            {TEMPLATES.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => applyTemplate(t)}
                className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Voucher date</Label>
              <YmdDatePicker value={date} onChange={setDate} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} className="h-9" placeholder="Bill / cheque no." />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Branch</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Company-wide</SelectItem>
                  {tree.branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-500">Narration</Label>
            <Textarea
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              className="min-h-[52px] text-sm"
              placeholder="e.g. Owner invested capital into bank account"
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <th className="w-8 px-2 py-2 text-center">#</th>
                  <th className="px-2 py-2">Account</th>
                  <th className="px-2 py-2">Line note</th>
                  <th className="w-32 px-2 py-2 text-right">Debit</th>
                  <th className="w-32 px-2 py-2 text-right">Credit</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={line.key} className="border-t border-gray-100">
                    <td className="px-2 py-1.5 text-center text-xs text-gray-400">{index + 1}</td>
                    <td className="w-[38%] px-2 py-1.5">
                      <AccountCombobox
                        accounts={accounts}
                        value={line.account_id || null}
                        onChange={(id) => update(line.key, { account_id: id ?? "" })}
                        placeholder="Select account"
                        showBalance={false}
                        modal
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input value={line.description} onChange={(e) => update(line.key, { description: e.target.value })} className="h-9" placeholder="Optional" />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.debit}
                        className="h-9 text-right tabular-nums"
                        onChange={(e) => update(line.key, { debit: e.target.value, credit: e.target.value ? "" : line.credit })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.credit}
                        className="h-9 text-right tabular-nums"
                        onChange={(e) => update(line.key, { credit: e.target.value, debit: e.target.value ? "" : line.debit })}
                      />
                    </td>
                    <td className="px-1 py-1.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-gray-400 hover:text-rose-600"
                        disabled={lines.length <= 2}
                        onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                        aria-label="Remove line"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50/80 font-semibold">
                  <td colSpan={3} className="px-2 py-2.5">
                    <Button size="sm" variant="outline" className="h-8" onClick={() => setLines((prev) => [...prev, blankLine()])}>
                      <Plus className="mr-1 h-3.5 w-3.5" />Add line
                    </Button>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{money(totalDebit)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{money(totalCredit)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <div
            className={cn(
              "flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm",
              balanced ? "bg-emerald-50 text-emerald-800" : totalDebit || totalCredit ? "bg-rose-50 text-rose-800" : "bg-gray-50 text-gray-500",
            )}
          >
            {balanced ? (
              <>
                <CheckCircle2 className="h-4 w-4" />Balanced — {money(totalDebit)} on each side
              </>
            ) : totalDebit || totalCredit ? (
              <>
                <Scale className="h-4 w-4" />
                Out of balance by <strong className="tabular-nums">{money(Math.abs(diff))}</strong> ({diff > 0 ? "more debit" : "more credit"})
                <Button size="sm" variant="outline" className="ml-auto h-7 border-rose-200 bg-white text-xs" onClick={balanceLast}>
                  Auto-balance
                </Button>
              </>
            ) : (
              <>Enter amounts to see the balance check.</>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !valid} className="bg-[#2a2012] hover:bg-[#3b2e1a]">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? "Save voucher" : "Post voucher"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, CreditCard, Gift, Loader2, Plus, Printer, RefreshCw, Search, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DetailSheet, DetailSheetBody, DetailSheetHeader } from "@/components/ui/detail-sheet";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { apiError, Chips, day, EmptyCard, Kpi, PageShell, Pill, rs } from "./marketing-shared";

type Card = {
  id: string;
  code: string;
  initialValue: number;
  balance: number;
  status: "ACTIVE" | "USED" | "EXPIRED" | "VOID";
  customer: { id: string; name: string | null; phone: string | null } | null;
  holderName: string | null;
  holderPhone: string | null;
  expiresAt: string | null;
  notes: string | null;
  createdAt: string;
};
type CardDetail = Card & { transactions: { id: string; type: string; amount: number; method: string | null; note: string | null; at: string; by: string | null; sale: { sale_number: string; invoice_number: string | null } | null }[] };

const STATUS: Record<Card["status"], string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700",
  USED: "bg-stone-100 text-stone-600",
  EXPIRED: "bg-amber-50 text-amber-800",
  VOID: "bg-rose-50 text-rose-700",
};
const METHODS = [
  { id: "CASH", label: "Cash" },
  { id: "CARD", label: "Card" },
  { id: "BANK_TRANSFER", label: "Bank transfer" },
  { id: "MOBILE_MONEY", label: "Wallet" },
  { id: "COMPLIMENTARY", label: "Complimentary (free)" },
];
const TXN_LABEL: Record<string, string> = { ISSUE: "Issued", RELOAD: "Reloaded", REDEEM: "Spent", REFUND: "Refunded to card", VOID: "Voided", ADJUST: "Adjusted" };

export function GiftCardsHub() {
  const { toast } = useToast();
  const [data, setData] = useState<{ cards: Card[]; summary: { total: number; active: number; outstanding: number; issuedValue: number; redeemed: number } } | null>(null);
  const [status, setStatus] = useState<"all" | Card["status"]>("all");
  const [search, setSearch] = useState("");
  const [issueOpen, setIssueOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiClient.get("/gift-cards", { params: { status: status === "all" ? undefined : status, search: search.trim() || undefined } });
      setData(r.data.data);
    } catch (e) {
      toast({ variant: "destructive", title: "Could not load gift cards", description: apiError(e) });
    }
  }, [status, search, toast]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  return (
    <PageShell
      title="Gift Cards"
      subtitle="Sell gift cards, check balances and let customers pay with them at the till."
      actions={
        <Button onClick={() => setIssueOpen(true)} className="bg-[#2a2012] hover:bg-[#3a2e1c]">
          <Plus className="mr-1.5 h-4 w-4" />
          Issue gift card
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi tone="dark" label="Unspent balance (owed to customers)" value={rs(data?.summary.outstanding)} hint={`${data?.summary.active ?? 0} active cards`} />
        <Kpi label="Cards issued" value={String(data?.summary.total ?? 0)} />
        <Kpi label="Total value sold" value={rs(data?.summary.issuedValue)} />
        <Kpi label="Spent at the till" value={rs(data?.summary.redeemed)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white p-3">
        <Chips
          value={status}
          onChange={setStatus}
          options={[
            { id: "all", label: "All" },
            { id: "ACTIVE", label: "Active" },
            { id: "USED", label: "Used up" },
            { id: "EXPIRED", label: "Expired" },
            { id: "VOID", label: "Void" },
          ]}
        />
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Code, name or phone…" className="h-9 pl-8" />
        </div>
      </div>

      {!data ? (
        <div className="h-64 animate-pulse rounded-xl bg-stone-200/60" />
      ) : data.cards.length === 0 ? (
        <EmptyCard
          icon={<Gift className="h-6 w-6" />}
          title={search || status !== "all" ? "No cards match" : "No gift cards yet"}
          text={search || status !== "all" ? undefined : "Issue a card when a customer buys one. Cash received goes straight into the open register."}
          action={!search && status === "all" ? <Button onClick={() => setIssueOpen(true)}>Issue the first card</Button> : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-xs text-stone-500">
              <tr className="border-b border-stone-100">
                <th className="px-4 py-2.5 text-left font-medium">Card</th>
                <th className="px-3 py-2.5 text-left font-medium">Holder</th>
                <th className="px-3 py-2.5 text-right font-medium">Value</th>
                <th className="px-3 py-2.5 text-right font-medium">Balance</th>
                <th className="w-40 px-3 py-2.5 text-left font-medium">Used</th>
                <th className="px-3 py-2.5 text-left font-medium">Expires</th>
                <th className="px-4 py-2.5 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.cards.map((c) => {
                const usedPct = c.initialValue ? Math.min(100, ((c.initialValue - c.balance) / c.initialValue) * 100) : 0;
                return (
                  <tr key={c.id} onClick={() => setSelected(c.id)} className="cursor-pointer border-b border-stone-50 hover:bg-[#fcf8f2]">
                    <td className="px-4 py-2.5">
                      <div className="font-mono font-semibold tracking-wide text-stone-900">{c.code}</div>
                      <div className="text-xs text-stone-500">{day(c.createdAt)}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-stone-800">{c.holderName || c.customer?.name || "—"}</div>
                      <div className="text-xs text-stone-500">{c.holderPhone || c.customer?.phone || ""}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rs(c.initialValue)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{rs(c.balance)}</td>
                    <td className="px-3 py-2.5">
                      <div className="h-1.5 rounded-full bg-stone-100">
                        <div className="h-1.5 rounded-full bg-[#a67c2e]" style={{ width: `${usedPct}%` }} />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-stone-600">{c.expiresAt ? day(c.expiresAt) : "Never"}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Pill className={STATUS[c.status]}>{c.status === "USED" ? "Used up" : c.status.charAt(0) + c.status.slice(1).toLowerCase()}</Pill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <IssueDialog open={issueOpen} onOpenChange={setIssueOpen} onDone={(id) => { load(); setSelected(id); }} />
      <CardSheet id={selected} onClose={() => setSelected(null)} onChanged={load} />
    </PageShell>
  );
}

/* ====================================================================== */

function IssueDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; onDone: (id: string) => void }) {
  const { toast } = useToast();
  const blank = { amount: "", method: "CASH", code: "", holderName: "", holderPhone: "", expiresAt: "", notes: "" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setF(blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await apiClient.post("/gift-cards", {
        amount: Number(f.amount),
        paymentMethod: f.method,
        code: f.code.trim() || null,
        holderName: f.holderName.trim() || null,
        holderPhone: f.holderPhone.trim() || null,
        expiresAt: f.expiresAt || null,
        notes: f.notes.trim() || null,
      });
      toast({ title: "Gift card issued", description: `${r.data.data.code} · ${rs(Number(f.amount))}` });
      onOpenChange(false);
      onDone(r.data.data.id);
    } catch (e) {
      toast({ variant: "destructive", title: "Could not issue card", description: apiError(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Issue gift card</DialogTitle>
          <DialogDescription>Cash payments are added to the open cash register automatically.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Card value</Label>
            <Input type="number" min={1} autoFocus value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className="h-11 text-lg font-semibold" />
            <div className="flex flex-wrap gap-1.5">
              {[1000, 2500, 5000, 10000].map((v) => (
                <button key={v} type="button" onClick={() => setF({ ...f, amount: String(v) })} className="rounded-full border border-stone-200 px-2.5 py-0.5 text-xs hover:border-[#a67c2e]">
                  {rs(v)}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Paid by</Label>
            <Select value={f.method} onValueChange={(v) => setF({ ...f, method: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {f.method === "COMPLIMENTARY" && <p className="text-xs text-amber-700">Free cards need discount permission or a manager&apos;s approval.</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Holder name</Label>
              <Input value={f.holderName} onChange={(e) => setF({ ...f, holderName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={f.holderPhone} onChange={(e) => setF({ ...f, holderPhone: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Card code (optional)</Label>
              <Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="Auto" className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Expires (optional)</Label>
              <Input type="date" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !(Number(f.amount) > 0)} className="bg-[#2a2012] hover:bg-[#3a2e1c]">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Issue card
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CardSheet({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { toast } = useToast();
  const [card, setCard] = useState<CardDetail | null>(null);
  const [reload, setReload] = useState({ open: false, amount: "", method: "CASH" });
  const [voidOpen, setVoidOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await apiClient.get(`/gift-cards/${id}`);
      setCard(r.data.data);
    } catch (e) {
      toast({ variant: "destructive", title: "Could not load card", description: apiError(e) });
    }
  }, [id, toast]);
  useEffect(() => {
    setCard(null);
    load();
  }, [load]);

  const doReload = async () => {
    if (!card) return;
    setBusy(true);
    try {
      await apiClient.post(`/gift-cards/${card.id}/reload`, { amount: Number(reload.amount), paymentMethod: reload.method });
      toast({ title: "Card reloaded" });
      setReload({ open: false, amount: "", method: "CASH" });
      await load();
      onChanged();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not reload", description: apiError(e) });
    } finally {
      setBusy(false);
    }
  };
  const doVoid = async () => {
    if (!card) return;
    setBusy(true);
    try {
      await apiClient.post(`/gift-cards/${card.id}/void`, { reason });
      toast({ title: "Card voided" });
      setVoidOpen(false);
      setReason("");
      await load();
      onChanged();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not void", description: apiError(e) });
    } finally {
      setBusy(false);
    }
  };

  const esc = (v: string) => v.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string);
  const print = () => {
    if (!card) return;
    const w = window.open("", "_blank", "width=420,height=320");
    if (!w) return;
    w.document.write(`<html><head><title>${esc(card.code)}</title><style>body{font-family:Georgia,serif;margin:0;padding:24px}.c{border:2px solid #a67c2e;border-radius:14px;padding:22px;background:#fcf8f2;color:#2a2012}.t{font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#a67c2e}.v{font-size:34px;font-weight:bold;margin:10px 0}.code{font-family:monospace;font-size:20px;letter-spacing:2px}.s{font-size:12px;color:#6b5a3e;margin-top:10px}</style></head><body><div class="c"><div class="t">Gift Card</div><div class="v">Rs ${Math.round(card.balance).toLocaleString("en-PK")}</div><div class="code">${esc(card.code)}</div>${card.holderName ? `<div class="s">For ${esc(card.holderName)}</div>` : ""}${card.expiresAt ? `<div class="s">Valid until ${day(card.expiresAt)}</div>` : ""}</div><script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <DetailSheet open={!!id} onOpenChange={(v) => !v && onClose()} size="lg">
      <DetailSheetHeader title={card ? card.code : "Gift card"} subtitle={card ? `Issued ${day(card.createdAt)}` : ""} />
      <DetailSheetBody className="space-y-5">
        {!card ? (
          <div className="h-48 animate-pulse rounded-xl bg-stone-100" />
        ) : (
          <>
            <div className="rounded-2xl border-2 border-[#a67c2e] bg-gradient-to-br from-[#fcf8f2] to-[#f3e9d6] p-5 text-[#2a2012]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a67c2e]">Gift card</span>
                <Pill className={STATUS[card.status]}>{card.status}</Pill>
              </div>
              <div className="mt-3 text-3xl font-bold tabular-nums">{rs(card.balance)}</div>
              <div className="text-xs text-stone-600">of {rs(card.initialValue)} loaded</div>
              <div className="mt-3 font-mono text-lg tracking-widest">{card.code}</div>
              <div className="mt-1 text-xs text-stone-600">
                {card.holderName || card.customer?.name || "No holder"} {card.expiresAt ? `· valid until ${day(card.expiresAt)}` : "· no expiry"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={print}>
                <Printer className="mr-1.5 h-4 w-4" />
                Print
              </Button>
              {card.status !== "VOID" && (
                <Button size="sm" variant="outline" onClick={() => setReload({ ...reload, open: true })}>
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                  Reload
                </Button>
              )}
              {card.status !== "VOID" && (
                <Button size="sm" variant="outline" className="text-rose-600 hover:text-rose-700" onClick={() => setVoidOpen(true)}>
                  <Ban className="mr-1.5 h-4 w-4" />
                  Void
                </Button>
              )}
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold text-stone-800">History</h4>
              <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
                {card.transactions.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    {t.amount >= 0 ? <Wallet className="h-4 w-4 shrink-0 text-emerald-600" /> : <CreditCard className="h-4 w-4 shrink-0 text-rose-600" />}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-stone-800">
                        {TXN_LABEL[t.type] ?? t.type}
                        {t.method ? ` · ${t.method.replace("_", " ").toLowerCase()}` : ""}
                        {t.sale ? ` · ${t.sale.invoice_number || t.sale.sale_number}` : ""}
                      </div>
                      <div className="text-xs text-stone-500">
                        {new Date(t.at).toLocaleString()} {t.by ? `· ${t.by.split("@")[0]}` : ""} {t.note ? `· ${t.note}` : ""}
                      </div>
                    </div>
                    <div className={cn("font-semibold tabular-nums", t.amount >= 0 ? "text-emerald-700" : "text-rose-700")}>
                      {t.amount >= 0 ? "+" : "−"}
                      {rs(Math.abs(t.amount))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </DetailSheetBody>

      <Dialog open={reload.open} onOpenChange={(v) => setReload({ ...reload, open: v })}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reload {card?.code}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input type="number" min={1} autoFocus value={reload.amount} onChange={(e) => setReload({ ...reload, amount: e.target.value })} placeholder="Amount" />
            <Select value={reload.method} onValueChange={(v) => setReload({ ...reload, method: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReload({ ...reload, open: false })}>
              Cancel
            </Button>
            <Button onClick={doReload} disabled={busy || !(Number(reload.amount) > 0)} className="bg-[#2a2012] hover:bg-[#3a2e1c]">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Reload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Void {card?.code}?</DialogTitle>
            <DialogDescription>The remaining {rs(card?.balance)} can no longer be spent.</DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Reason (e.g. card lost, refunded in cash)" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidOpen(false)}>
              Cancel
            </Button>
            <Button onClick={doVoid} disabled={busy || reason.trim().length < 3} className="bg-rose-600 hover:bg-rose-700">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Void card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DetailSheet>
  );
}

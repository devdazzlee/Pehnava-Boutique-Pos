"use client";

import { useCallback, useEffect, useState } from "react";
import { Award, Crown, Loader2, Minus, Plus, Search, Settings2, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DetailSheet, DetailSheetBody, DetailSheetHeader } from "@/components/ui/detail-sheet";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { apiError, Chips, day, EmptyCard, Kpi, PageShell, Pill, rs } from "./marketing-shared";

type Tier = { name: string; minSpend: number; multiplier: number };
type Settings = { enabled: boolean; pointsPer100: number; pointValue: number; minRedeem: number; maxRedeemPct: number; expiryMonths: number; tiers: Tier[] };
type Member = {
  id: string;
  name: string;
  phone: string | null;
  points: number;
  value: number;
  lifetimeSpend: number;
  bills: number;
  lastVisit: string | null;
  tier: string;
  nextTier: string | null;
  toNextTier: number;
};
type Overview = {
  settings: Settings;
  summary: { members: number; withPoints: number; pointsOutstanding: number; liability: number; earned: number; redeemed: number; redeemedValue: number };
  tiers: (Tier & { members: number })[];
  members: Member[];
};

const TIER_STYLE = ["bg-stone-100 text-stone-700", "bg-slate-200 text-slate-800", "bg-amber-100 text-amber-800", "bg-[#2a2012] text-[#e6c98f]", "bg-violet-100 text-violet-800"];

export function LoyaltyHub() {
  const { toast } = useToast();
  const [data, setData] = useState<Overview | null>(null);
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [member, setMember] = useState<Member | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiClient.get("/loyalty/overview", { params: { search: search.trim() || undefined } });
      setData(r.data.data);
    } catch (e) {
      toast({ variant: "destructive", title: "Could not load loyalty", description: apiError(e) });
    }
  }, [search, toast]);
  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const tierIndex = (name: string) => Math.max(0, data?.tiers.findIndex((t) => t.name === name) ?? 0);
  const members = (data?.members ?? []).filter((m) => tier === "all" || m.tier === tier);

  return (
    <PageShell
      title="Loyalty"
      subtitle="Customers earn points on every bill, climb tiers with their spending and redeem points at the till."
      actions={
        <Button variant="outline" onClick={() => setSettingsOpen(true)} className="bg-white">
          <Settings2 className="mr-1.5 h-4 w-4" />
          Programme settings
        </Button>
      }
    >
      {data && !data.settings.enabled && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#a67c2e]/40 bg-[#fcf8f2] px-4 py-3 text-sm text-stone-700">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#a67c2e]" />
            The loyalty programme is off. Turn it on to start giving points on every bill with a customer.
          </span>
          <Button size="sm" onClick={() => setSettingsOpen(true)} className="bg-[#2a2012] hover:bg-[#3a2e1c]">
            Set up & turn on
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi tone="dark" label="Points owed to customers" value={(data?.summary.pointsOutstanding ?? 0).toLocaleString()} hint={`Worth ${rs(data?.summary.liability)}`} />
        <Kpi label="Members" value={String(data?.summary.members ?? 0)} hint={`${data?.summary.withPoints ?? 0} with points`} />
        <Kpi label="Points earned (all time)" value={(data?.summary.earned ?? 0).toLocaleString()} />
        <Kpi label="Points redeemed" value={(data?.summary.redeemed ?? 0).toLocaleString()} hint={`${rs(data?.summary.redeemedValue)} discount given`} />
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {data.tiers.map((t, i) => (
            <button
              key={t.name}
              onClick={() => setTier(tier === t.name ? "all" : t.name)}
              className={cn("rounded-xl border bg-white p-3.5 text-left transition-colors", tier === t.name ? "border-[#a67c2e] ring-1 ring-[#a67c2e]" : "border-stone-200 hover:border-[#a67c2e]/50")}
            >
              <div className="flex items-center justify-between">
                <Pill className={TIER_STYLE[i % TIER_STYLE.length]}>
                  {i === data.tiers.length - 1 ? <Crown className="h-3 w-3" /> : <Award className="h-3 w-3" />}
                  {t.name}
                </Pill>
                <span className="text-lg font-semibold tabular-nums">{t.members}</span>
              </div>
              <div className="mt-2 text-xs text-stone-500">
                {t.minSpend ? `Spent ${rs(t.minSpend)}+` : "Everyone"} · {t.multiplier}× points
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-stone-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 p-3">
          <Chips value={tier} onChange={setTier} options={[{ id: "all", label: "All tiers" }, ...(data?.tiers ?? []).map((t) => ({ id: t.name, label: t.name, count: t.members }))]} />
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or phone…" className="h-9 pl-8" />
          </div>
        </div>
        {!data ? (
          <div className="m-4 h-48 animate-pulse rounded bg-stone-100" />
        ) : members.length === 0 ? (
          <div className="p-4">
            <EmptyCard icon={<Award className="h-6 w-6" />} title="No members yet" text="Customers become members automatically the first time a bill is made in their name." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-xs text-stone-500">
                <tr className="border-b border-stone-100">
                  <th className="px-4 py-2.5 text-left font-medium">Customer</th>
                  <th className="px-3 py-2.5 text-left font-medium">Tier</th>
                  <th className="px-3 py-2.5 text-right font-medium">Points</th>
                  <th className="px-3 py-2.5 text-right font-medium">Lifetime spend</th>
                  <th className="px-3 py-2.5 text-right font-medium">Visits</th>
                  <th className="px-3 py-2.5 text-left font-medium">Next tier</th>
                  <th className="px-4 py-2.5 text-right font-medium">Last visit</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} onClick={() => setMember(m)} className="cursor-pointer border-b border-stone-50 hover:bg-[#fcf8f2]">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-stone-900">{m.name}</div>
                      <div className="text-xs text-stone-500">{m.phone ?? "—"}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Pill className={TIER_STYLE[tierIndex(m.tier) % TIER_STYLE.length]}>{m.tier}</Pill>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="font-semibold tabular-nums">{m.points.toLocaleString()}</div>
                      <div className="text-xs text-stone-500">{rs(m.value)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rs(m.lifetimeSpend)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{m.bills}</td>
                    <td className="px-3 py-2.5 text-xs text-stone-600">{m.nextTier ? `${rs(m.toNextTier)} to ${m.nextTier}` : "Top tier"}</td>
                    <td className="px-4 py-2.5 text-right text-stone-600">{day(m.lastVisit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data && <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} settings={data.settings} onSaved={load} />}
      <MemberSheet member={member} onClose={() => setMember(null)} onChanged={load} />
    </PageShell>
  );
}

/* ====================================================================== */

function SettingsDialog({ open, onOpenChange, settings, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; settings: Settings; onSaved: () => void }) {
  const { toast } = useToast();
  const [s, setS] = useState(settings);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setS(settings);
  }, [open, settings]);

  const save = async () => {
    setBusy(true);
    try {
      await apiClient.put("/loyalty/settings", s);
      toast({ title: "Loyalty settings saved" });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not save", description: apiError(e) });
    } finally {
      setBusy(false);
    }
  };
  const num = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: Number(e.target.value) });
  const exampleBill = 10000;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Loyalty programme</DialogTitle>
          <DialogDescription>Points are earned on the amount paid and redeemed as a discount.</DialogDescription>
        </DialogHeader>
        <label className="flex items-center justify-between rounded-lg border border-stone-200 px-3 py-2.5 text-sm">
          <span className="font-medium">Programme on</span>
          <Switch checked={s.enabled} onCheckedChange={(v) => setS({ ...s, enabled: v })} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Points per Rs 100 spent</Label>
            <Input type="number" min={0} step="0.1" value={s.pointsPer100} onChange={num("pointsPer100")} />
          </div>
          <div className="space-y-1.5">
            <Label>Value of 1 point (Rs)</Label>
            <Input type="number" min={0} step="0.1" value={s.pointValue} onChange={num("pointValue")} />
          </div>
          <div className="space-y-1.5">
            <Label>Minimum points to redeem</Label>
            <Input type="number" min={0} value={s.minRedeem} onChange={num("minRedeem")} />
          </div>
          <div className="space-y-1.5">
            <Label>Max % of a bill paid with points</Label>
            <Input type="number" min={0} max={100} value={s.maxRedeemPct} onChange={num("maxRedeemPct")} />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Tiers (by lifetime spend)</Label>
            <Button size="sm" variant="ghost" onClick={() => setS({ ...s, tiers: [...s.tiers, { name: "", minSpend: 0, multiplier: 1 }] })} disabled={s.tiers.length >= 8}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add tier
            </Button>
          </div>
          <div className="space-y-1.5">
            {s.tiers.map((t, i) => (
              <div key={i} className="grid grid-cols-[1fr_120px_90px_32px] items-center gap-2">
                <Input value={t.name} placeholder="Name" onChange={(e) => setS({ ...s, tiers: s.tiers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <Input type="number" min={0} value={t.minSpend} title="Spend from (Rs)" onChange={(e) => setS({ ...s, tiers: s.tiers.map((x, j) => (j === i ? { ...x, minSpend: Number(e.target.value) } : x)) })} />
                <Input type="number" min={0} step="0.05" value={t.multiplier} title="Points multiplier" onChange={(e) => setS({ ...s, tiers: s.tiers.map((x, j) => (j === i ? { ...x, multiplier: Number(e.target.value) } : x)) })} />
                <Button size="icon" variant="ghost" className="h-8 w-8" disabled={s.tiers.length <= 1} onClick={() => setS({ ...s, tiers: s.tiers.filter((_, j) => j !== i) })}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <p className="text-[11px] text-stone-500">Name · spend from (Rs) · points multiplier</p>
          </div>
        </div>
        <div className="rounded-lg bg-[#fcf8f2] px-3 py-2 text-sm text-stone-700">
          Example: a {rs(exampleBill)} bill earns <b>{Math.floor((exampleBill / 100) * s.pointsPer100)}</b> points (×tier). {s.minRedeem} points = {rs(s.minRedeem * s.pointValue)} off.
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy} className="bg-[#2a2012] hover:bg-[#3a2e1c]">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type CustomerLoyalty = {
  balance: number;
  value: number;
  lifetimeSpend: number;
  tier: Tier;
  nextTier: Tier | null;
  toNextTier: number;
  transactions: { id: string; type: string; points: number; value: number; note: string | null; at: string; sale: { sale_number: string; invoice_number: string | null } | null }[];
};
const TYPE_LABEL: Record<string, string> = { EARN: "Earned", REDEEM: "Redeemed", ADJUST: "Adjusted", REVERSE: "Reversed (bill voided)", EXPIRE: "Expired" };

function MemberSheet({ member, onClose, onChanged }: { member: Member | null; onClose: () => void; onChanged: () => void }) {
  const { toast } = useToast();
  const [d, setD] = useState<CustomerLoyalty | null>(null);
  const [adj, setAdj] = useState({ points: "", note: "", sign: 1 });
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!member) return;
    try {
      const r = await apiClient.get(`/loyalty/customers/${member.id}`);
      setD(r.data.data);
    } catch (e) {
      toast({ variant: "destructive", title: "Could not load", description: apiError(e) });
    }
  }, [member, toast]);
  useEffect(() => {
    setD(null);
    setAdj({ points: "", note: "", sign: 1 });
    load();
  }, [load]);

  const adjust = async () => {
    if (!member) return;
    setBusy(true);
    try {
      const r = await apiClient.post(`/loyalty/customers/${member.id}/adjust`, { points: adj.sign * Math.abs(parseInt(adj.points, 10) || 0), note: adj.note });
      setD(r.data.data);
      setAdj({ points: "", note: "", sign: 1 });
      toast({ title: "Points updated" });
      onChanged();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not adjust", description: apiError(e) });
    } finally {
      setBusy(false);
    }
  };

  const progress = d?.nextTier ? Math.min(100, ((d.lifetimeSpend - d.tier.minSpend) / Math.max(1, d.nextTier.minSpend - d.tier.minSpend)) * 100) : 100;

  return (
    <DetailSheet open={!!member} onOpenChange={(v) => !v && onClose()} size="lg">
      <DetailSheetHeader title={member?.name ?? "Member"} subtitle={member?.phone ?? ""} />
      <DetailSheetBody className="space-y-5">
        {!d ? (
          <div className="h-40 animate-pulse rounded-xl bg-stone-100" />
        ) : (
          <>
            <div className="rounded-2xl bg-[#2a2012] p-5 text-white">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm text-[#e6c98f]">
                  <Crown className="h-4 w-4" />
                  {d.tier.name} member
                </span>
                <span className="text-xs text-stone-400">{d.tier.multiplier}× points</span>
              </div>
              <div className="mt-3 text-3xl font-bold tabular-nums">{d.balance.toLocaleString()} pts</div>
              <div className="text-sm text-stone-300">worth {rs(d.value)}</div>
              <div className="mt-4">
                <div className="h-1.5 rounded-full bg-white/15">
                  <div className="h-1.5 rounded-full bg-[#e6c98f]" style={{ width: `${progress}%` }} />
                </div>
                <div className="mt-1 text-xs text-stone-400">
                  {d.nextTier ? `${rs(d.toNextTier)} more to reach ${d.nextTier.name}` : "Highest tier"} · lifetime {rs(d.lifetimeSpend)}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-stone-200 p-3">
              <div className="mb-2 text-sm font-semibold text-stone-800">Adjust points</div>
              <div className="flex flex-wrap gap-2">
                <div className="inline-flex rounded-md border border-stone-200 p-0.5">
                  <button onClick={() => setAdj({ ...adj, sign: 1 })} className={cn("rounded px-2 py-1", adj.sign === 1 ? "bg-emerald-600 text-white" : "text-stone-600")}>
                    <Plus className="h-4 w-4" />
                  </button>
                  <button onClick={() => setAdj({ ...adj, sign: -1 })} className={cn("rounded px-2 py-1", adj.sign === -1 ? "bg-rose-600 text-white" : "text-stone-600")}>
                    <Minus className="h-4 w-4" />
                  </button>
                </div>
                <Input type="number" min={1} value={adj.points} onChange={(e) => setAdj({ ...adj, points: e.target.value })} placeholder="Points" className="w-28" />
                <Input value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} placeholder="Reason (e.g. birthday bonus)" className="min-w-[180px] flex-1" />
                <Button onClick={adjust} disabled={busy || !(parseInt(adj.points, 10) > 0) || adj.note.trim().length < 3}>
                  {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save
                </Button>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold text-stone-800">Points history</h4>
              {d.transactions.length === 0 ? (
                <p className="text-sm text-stone-500">No points activity yet.</p>
              ) : (
                <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
                  {d.transactions.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-stone-800">
                          {TYPE_LABEL[t.type] ?? t.type}
                          {t.sale ? ` · ${t.sale.invoice_number || t.sale.sale_number}` : ""}
                        </div>
                        <div className="text-xs text-stone-500">
                          {new Date(t.at).toLocaleString()} {t.note ? `· ${t.note}` : ""}
                        </div>
                      </div>
                      <div className={cn("font-semibold tabular-nums", t.points >= 0 ? "text-emerald-700" : "text-rose-700")}>
                        {t.points >= 0 ? "+" : ""}
                        {t.points.toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </DetailSheetBody>
    </DetailSheet>
  );
}

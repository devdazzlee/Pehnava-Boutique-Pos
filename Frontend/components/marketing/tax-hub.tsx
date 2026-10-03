"use client";

import { useCallback, useEffect, useState } from "react";
import { Info, Loader2, Pencil, Percent, Plus, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";
import { TaxReport } from "@/components/insights/insights-reports";
import { defaultPeriod, Period, PeriodPicker } from "@/components/insights/insights-shared";
import { apiError, EmptyCard, Kpi, PageShell, Pill } from "./marketing-shared";

type Tax = { id: string; code: string; name: string; percentage: number; isActive: boolean; displayOnPos: boolean; products: number };
type Summary = { taxes: Tax[]; untaxedProducts: number; categories: { id: string; name: string }[] };

export function TaxHub() {
  const { toast } = useToast();
  const [data, setData] = useState<Summary | null>(null);
  const [editing, setEditing] = useState<Tax | "new" | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [period, setPeriod] = useState<Period>(defaultPeriod("month"));

  const load = useCallback(async () => {
    try {
      const r = await apiClient.get("/tax-tools/summary");
      setData(r.data.data);
    } catch (e) {
      toast({ variant: "destructive", title: "Could not load taxes", description: apiError(e) });
    }
  }, [toast]);
  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (t: Tax) => {
    try {
      await apiClient.patch(`/tax/${t.id}/toggle-status`);
      load();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not update", description: apiError(e) });
    }
  };

  const taxed = (data?.taxes ?? []).reduce((s, t) => s + t.products, 0);

  return (
    <PageShell
      title="Tax Setup"
      subtitle="Sales tax rates, which products carry them, and output vs input tax for filing."
      actions={
        <>
          <Button variant="outline" className="bg-white" onClick={() => setAssignOpen(true)} disabled={!data?.taxes.length}>
            Apply to products
          </Button>
          <Button onClick={() => setEditing("new")} className="bg-[#2a2012] hover:bg-[#3a2e1c]">
            <Plus className="mr-1.5 h-4 w-4" />
            New tax rate
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-2 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#a67c2e]" />
        Prices on the till already include tax. Each bill records the tax portion of every item from its product&apos;s tax rate, which feeds the tax report below.
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi tone="dark" label="Tax rates" value={String(data?.taxes.length ?? 0)} hint={`${(data?.taxes ?? []).filter((t) => t.isActive).length} active`} />
        <Kpi label="Products with tax" value={taxed.toLocaleString()} />
        <Kpi label="Products without tax" value={(data?.untaxedProducts ?? 0).toLocaleString()} tone={data?.untaxedProducts ? "bad" : undefined} />
        <Kpi label="Highest rate" value={data?.taxes.length ? `${Math.max(...data.taxes.map((t) => t.percentage))}%` : "—"} />
      </div>

      {!data ? (
        <div className="h-40 animate-pulse rounded-xl bg-stone-200/60" />
      ) : data.taxes.length === 0 ? (
        <EmptyCard icon={<Percent className="h-6 w-6" />} title="No tax rates yet" text="Add the sales tax rates you charge (e.g. GST 18%), then apply them to products." action={<Button onClick={() => setEditing("new")}>Add a tax rate</Button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.taxes.map((t) => (
            <div key={t.id} className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-2xl font-semibold tabular-nums text-[#2a2012]">{t.percentage}%</div>
                  <div className="font-medium text-stone-800">{t.name}</div>
                  <div className="text-xs text-stone-500">{t.code}</div>
                </div>
                <Pill className={t.isActive ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}>{t.isActive ? "Active" : "Off"}</Pill>
              </div>
              <div className="mt-3 text-sm text-stone-600">{t.products.toLocaleString()} products</div>
              <div className="mt-3 flex gap-2 border-t border-stone-100 pt-3">
                <Button size="sm" variant="outline" onClick={() => setEditing(t)}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggle(t)}>
                  <Power className="mr-1.5 h-3.5 w-3.5" />
                  {t.isActive ? "Turn off" : "Turn on"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[#2a2012]">Tax report</h2>
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>
        <TaxReport period={period} />
      </section>

      <TaxDialog editing={editing} onClose={() => setEditing(null)} onSaved={load} />
      {data && <AssignDialog open={assignOpen} onOpenChange={setAssignOpen} data={data} onDone={load} />}
    </PageShell>
  );
}

function TaxDialog({ editing, onClose, onSaved }: { editing: Tax | "new" | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [pct, setPct] = useState("");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!editing) return;
    setName(editing === "new" ? "" : editing.name);
    setPct(editing === "new" ? "" : String(editing.percentage));
    setActive(editing === "new" ? true : editing.isActive);
  }, [editing]);
  const save = async () => {
    setBusy(true);
    try {
      const body = { name: name.trim(), percentage: Number(pct), is_active: active };
      if (editing === "new") await apiClient.post("/tax", body);
      else if (editing) await apiClient.patch(`/tax/${editing.id}`, body);
      toast({ title: "Tax rate saved" });
      onClose();
      onSaved();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not save", description: apiError(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!editing} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{editing === "new" ? "New tax rate" : "Edit tax rate"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. GST" />
          </div>
          <div className="space-y-1.5">
            <Label>Rate %</Label>
            <Input type="number" min={0} max={100} step="0.01" value={pct} onChange={(e) => setPct(e.target.value)} />
          </div>
          <label className="flex items-center justify-between text-sm">
            Active
            <Switch checked={active} onCheckedChange={setActive} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !name.trim() || pct === "" || Number(pct) < 0 || Number(pct) > 100} className="bg-[#2a2012] hover:bg-[#3a2e1c]">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({ open, onOpenChange, data, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; data: Summary; onDone: () => void }) {
  const { toast } = useToast();
  const [taxId, setTaxId] = useState<string>("");
  const [categoryId, setCategoryId] = useState("all");
  const [onlyUntaxed, setOnlyUntaxed] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setTaxId(data.taxes.find((t) => t.isActive)?.id ?? data.taxes[0]?.id ?? "");
      setCategoryId("all");
      setOnlyUntaxed(true);
    }
  }, [open, data]);
  const apply = async () => {
    setBusy(true);
    try {
      const r = await apiClient.post("/tax-tools/assign", { taxId: taxId === "none" ? null : taxId, categoryId: categoryId === "all" ? undefined : categoryId, onlyUntaxed });
      toast({ title: "Tax applied", description: `${r.data.data.updated} products updated` });
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not apply", description: apiError(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apply tax to products</DialogTitle>
          <DialogDescription>Sets the tax rate on many products at once. Prices don&apos;t change.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tax rate</Label>
            <Select value={taxId} onValueChange={setTaxId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.taxes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} — {t.percentage}%
                  </SelectItem>
                ))}
                <SelectItem value="none">No tax (remove)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Products in</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {data.categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center justify-between rounded-lg border border-stone-200 px-3 py-2 text-sm">
            <span>
              Only products without a tax
              <span className="block text-xs text-stone-500">Off = replace the tax on every matching product</span>
            </span>
            <Switch checked={onlyUntaxed} onCheckedChange={setOnlyUntaxed} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={busy || !taxId} className="bg-[#2a2012] hover:bg-[#3a2e1c]">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

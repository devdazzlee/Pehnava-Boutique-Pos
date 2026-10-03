"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgePercent, Copy, Gift, Loader2, MoreHorizontal, Pause, Pencil, Play, Plus, Search, Tag, Ticket, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DetailSheet, DetailSheetBody, DetailSheetFooter, DetailSheetHeader } from "@/components/ui/detail-sheet";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { apiError, Chips, day, EmptyCard, Kpi, listOf, PageShell, Pill, rs } from "./marketing-shared";

type PromoType = "ITEM_PERCENT" | "ITEM_FIXED" | "BUY_X_GET_Y" | "BILL_PERCENT" | "BILL_FIXED";
type Scope = "ALL" | "CATEGORY" | "BRAND" | "PRODUCT" | "COLLECTION";
type Promo = {
  id: string;
  name: string;
  description: string | null;
  type: PromoType;
  value: number;
  buyQty: number | null;
  getQty: number | null;
  scope: Scope;
  scopeIds: string[];
  minBill: number | null;
  maxDiscount: number | null;
  code: string | null;
  startsAt: string;
  endsAt: string | null;
  daysOfWeek: number[];
  usageLimit: number | null;
  usedCount: number;
  priority: number;
  stackable: boolean;
  isActive: boolean;
  status: "LIVE" | "SCHEDULED" | "ENDED" | "PAUSED" | "LIMIT_REACHED";
  bills: number;
  discountGiven: number;
  revenue: number;
};

const TYPES: { id: PromoType; label: string; help: string; icon: typeof Tag }[] = [
  { id: "ITEM_PERCENT", label: "% off items", help: "e.g. 20% off all lawn suits", icon: BadgePercent },
  { id: "ITEM_FIXED", label: "Rs off each item", help: "e.g. Rs 500 off every kurti", icon: Tag },
  { id: "BUY_X_GET_Y", label: "Buy X get Y", help: "e.g. buy 2 get 1 free (cheapest free)", icon: Gift },
  { id: "BILL_PERCENT", label: "% off bill", help: "e.g. 10% off bills over Rs 10,000", icon: BadgePercent },
  { id: "BILL_FIXED", label: "Rs off bill", help: "e.g. Rs 1,000 off bills over Rs 15,000", icon: Ticket },
];
const SCOPES: { id: Scope; label: string }[] = [
  { id: "ALL", label: "Everything" },
  { id: "CATEGORY", label: "Categories" },
  { id: "BRAND", label: "Brands" },
  { id: "COLLECTION", label: "Collections" },
  { id: "PRODUCT", label: "Specific products" },
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STATUS: Record<Promo["status"], { label: string; cls: string }> = {
  LIVE: { label: "Live", cls: "bg-emerald-50 text-emerald-700" },
  SCHEDULED: { label: "Scheduled", cls: "bg-sky-50 text-sky-700" },
  ENDED: { label: "Ended", cls: "bg-stone-100 text-stone-500" },
  PAUSED: { label: "Paused", cls: "bg-amber-50 text-amber-800" },
  LIMIT_REACHED: { label: "Limit reached", cls: "bg-stone-100 text-stone-600" },
};

const describe = (p: Pick<Promo, "type" | "value" | "buyQty" | "getQty" | "minBill" | "maxDiscount">) => {
  const v = p.value;
  const base =
    p.type === "ITEM_PERCENT"
      ? `${v}% off`
      : p.type === "ITEM_FIXED"
        ? `${rs(v)} off each`
        : p.type === "BUY_X_GET_Y"
          ? `Buy ${p.buyQty} get ${p.getQty} ${v >= 100 ? "free" : `at ${v}% off`}`
          : p.type === "BILL_PERCENT"
            ? `${v}% off the bill`
            : `${rs(v)} off the bill`;
  return [base, p.minBill ? `min bill ${rs(p.minBill)}` : null, p.maxDiscount ? `up to ${rs(p.maxDiscount)}` : null].filter(Boolean).join(" · ");
};

export function PromotionsHub() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Promo[] | null>(null);
  const [filter, setFilter] = useState<"all" | "LIVE" | "SCHEDULED" | "PAUSED" | "ENDED" | "COUPON">("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Promo | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiClient.get("/promotions");
      setRows(r.data.data);
    } catch (e) {
      toast({ variant: "destructive", title: "Could not load promotions", description: apiError(e) });
      setRows([]);
    }
  }, [toast]);
  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(
    () =>
      (rows ?? [])
        .filter((p) => (filter === "all" ? true : filter === "COUPON" ? !!p.code : p.status === filter || (filter === "ENDED" && p.status === "LIMIT_REACHED")))
        .filter((p) => !search.trim() || `${p.name} ${p.code ?? ""}`.toLowerCase().includes(search.trim().toLowerCase())),
    [rows, filter, search],
  );
  const count = (f: Promo["status"]) => (rows ?? []).filter((p) => p.status === f).length;
  const totals = (rows ?? []).reduce((t, p) => ({ discount: t.discount + p.discountGiven, bills: t.bills + p.bills, revenue: t.revenue + p.revenue }), { discount: 0, bills: 0, revenue: 0 });

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast({ title: ok });
      load();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not update", description: apiError(e) });
    }
  };

  return (
    <PageShell
      title="Promotions"
      subtitle="Automatic offers and coupon codes. The till applies them by itself — cashiers can't mistype a discount."
      actions={
        <Button onClick={() => setEditing("new")} className="bg-[#2a2012] hover:bg-[#3a2e1c]">
          <Plus className="mr-1.5 h-4 w-4" />
          New promotion
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi tone="dark" label="Live now" value={String(count("LIVE"))} hint={`${count("SCHEDULED")} scheduled`} />
        <Kpi label="Bills with an offer" value={totals.bills.toLocaleString()} />
        <Kpi label="Discount given" value={rs(totals.discount)} />
        <Kpi label="Sales on offer bills" value={rs(totals.revenue)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white p-3">
        <Chips
          value={filter}
          onChange={setFilter}
          options={[
            { id: "all", label: "All", count: rows?.length },
            { id: "LIVE", label: "Live", count: count("LIVE") },
            { id: "SCHEDULED", label: "Scheduled", count: count("SCHEDULED") },
            { id: "PAUSED", label: "Paused", count: count("PAUSED") },
            { id: "ENDED", label: "Ended", count: count("ENDED") + count("LIMIT_REACHED") },
            { id: "COUPON", label: "Coupon codes", count: (rows ?? []).filter((p) => p.code).length },
          ]}
        />
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or code…" className="h-9 pl-8" />
        </div>
      </div>

      {rows === null ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-stone-200/60" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyCard
          icon={<BadgePercent className="h-6 w-6" />}
          title={rows.length ? "No promotions match" : "No promotions yet"}
          text={rows.length ? undefined : "Create a sale, a buy-2-get-1 deal or a coupon code. Live offers show up and apply automatically on the New Sale screen."}
          action={!rows.length ? <Button onClick={() => setEditing("new")}>Create the first one</Button> : undefined}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => {
            const T = TYPES.find((t) => t.id === p.type)!;
            return (
              <div key={p.id} className="flex flex-col rounded-xl border border-stone-200 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <div className="rounded-lg bg-[#fcf8f2] p-2 text-[#a67c2e]">
                      <T.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-stone-900" title={p.name}>
                        {p.name}
                      </div>
                      <div className="text-xs text-stone-600">{describe(p)}</div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(p)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setEditing({ ...p, id: "", name: `${p.name} (copy)`, code: null })}>
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => act(() => apiClient.post(`/promotions/${p.id}/active`, { isActive: !p.isActive }), p.isActive ? "Promotion paused" : "Promotion resumed")}>
                        {p.isActive ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
                        {p.isActive ? "Pause" : "Resume"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-rose-600"
                        onSelect={() => window.confirm(`Delete "${p.name}"? Past bills keep their discount.`) && act(() => apiClient.delete(`/promotions/${p.id}`), "Promotion deleted")}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Pill className={STATUS[p.status].cls}>{STATUS[p.status].label}</Pill>
                  {p.code ? (
                    <Pill className="bg-[#2a2012] font-mono text-white">
                      <Ticket className="h-3 w-3" />
                      {p.code}
                    </Pill>
                  ) : (
                    <Pill className="bg-stone-100 text-stone-600">Automatic</Pill>
                  )}
                  {p.scope !== "ALL" && <Pill className="bg-stone-100 text-stone-600">{p.scopeIds.length} {SCOPES.find((s) => s.id === p.scope)?.label.toLowerCase()}</Pill>}
                  {p.daysOfWeek.length > 0 && <Pill className="bg-stone-100 text-stone-600">{p.daysOfWeek.map((d) => DAYS[d]).join(", ")}</Pill>}
                  {p.stackable && <Pill className="bg-violet-50 text-violet-700">Stacks</Pill>}
                </div>
                <div className="mt-3 text-xs text-stone-500">
                  {day(p.startsAt)} → {p.endsAt ? day(p.endsAt) : "no end date"}
                  {p.usageLimit ? ` · used ${p.usedCount}/${p.usageLimit}` : p.usedCount ? ` · used ${p.usedCount}×` : ""}
                </div>
                <div className="mt-auto grid grid-cols-3 gap-2 border-t border-stone-100 pt-3 text-center">
                  <div>
                    <div className="text-sm font-semibold tabular-nums">{p.bills}</div>
                    <div className="text-[11px] text-stone-500">bills</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold tabular-nums">{rs(p.discountGiven)}</div>
                    <div className="text-[11px] text-stone-500">discount</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold tabular-nums">{rs(p.revenue)}</div>
                    <div className="text-[11px] text-stone-500">sales</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PromotionSheet editing={editing} onClose={() => setEditing(null)} onSaved={load} />
    </PageShell>
  );
}

/* ====================================================================== */

type Option = { id: string; name: string };

function PromotionSheet({ editing, onClose, onSaved }: { editing: Promo | "new" | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const isNew = editing === "new" || (editing && !editing.id);
  const blank = {
    name: "",
    description: "",
    type: "ITEM_PERCENT" as PromoType,
    value: "",
    buyQty: "2",
    getQty: "1",
    scope: "ALL" as Scope,
    scopeIds: [] as string[],
    minBill: "",
    maxDiscount: "",
    useCode: false,
    code: "",
    startsAt: new Date().toISOString().slice(0, 10),
    endsAt: "",
    daysOfWeek: [] as number[],
    usageLimit: "",
    priority: "0",
    stackable: false,
    isActive: true,
  };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<Record<string, Option[]>>({});
  const [productQuery, setProductQuery] = useState("");
  const [productHits, setProductHits] = useState<Option[]>([]);
  const [productNames, setProductNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!editing) return;
    if (editing === "new") setF(blank);
    else
      setF({
        name: editing.name,
        description: editing.description ?? "",
        type: editing.type,
        value: String(editing.value || ""),
        buyQty: String(editing.buyQty ?? 2),
        getQty: String(editing.getQty ?? 1),
        scope: editing.scope,
        scopeIds: editing.scopeIds,
        minBill: editing.minBill ? String(editing.minBill) : "",
        maxDiscount: editing.maxDiscount ? String(editing.maxDiscount) : "",
        useCode: !!editing.code,
        code: editing.code ?? "",
        startsAt: editing.startsAt.slice(0, 10),
        endsAt: editing.endsAt ? editing.endsAt.slice(0, 10) : "",
        daysOfWeek: editing.daysOfWeek,
        usageLimit: editing.usageLimit ? String(editing.usageLimit) : "",
        priority: String(editing.priority ?? 0),
        stackable: editing.stackable,
        isActive: editing.isActive,
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    Promise.all([apiClient.get("/categories").catch(() => null), apiClient.get("/brands", { params: { limit: 200 } }).catch(() => null), apiClient.get("/products", { params: { limit: 500 } }).catch(() => null)]).then(
      ([c, b, p]) => {
        const products = p ? listOf<{ id: string; name: string; collection?: string | null; sku?: string }>(p) : [];
        const collections = [...new Set(products.map((x) => x.collection?.trim()).filter((x): x is string => !!x))].sort().map((x) => ({ id: x, name: x }));
        setOptions({
          CATEGORY: c ? listOf<Option>(c).map((x) => ({ id: x.id, name: x.name })) : [],
          BRAND: b ? listOf<Option>(b).map((x) => ({ id: x.id, name: x.name })) : [],
          COLLECTION: collections,
        });
        setProductNames((m) => ({ ...m, ...Object.fromEntries(products.map((x) => [x.id, `${x.name}${x.sku ? ` (${x.sku})` : ""}`])) }));
      },
    );
  }, [editing]);

  useEffect(() => {
    if (f.scope !== "PRODUCT" || productQuery.trim().length < 2) {
      setProductHits([]);
      return;
    }
    const t = setTimeout(() => {
      apiClient
        .get("/products", { params: { search: productQuery.trim(), limit: 15 } })
        .then((r) => {
          const hits = listOf<{ id: string; name: string; sku?: string }>(r).map((x) => ({ id: x.id, name: `${x.name}${x.sku ? ` (${x.sku})` : ""}` }));
          setProductHits(hits);
          setProductNames((m) => ({ ...m, ...Object.fromEntries(hits.map((h) => [h.id, h.name])) }));
        })
        .catch(() => setProductHits([]));
    }, 300);
    return () => clearTimeout(t);
  }, [productQuery, f.scope]);

  const isBill = f.type.startsWith("BILL_");
  const toggleId = (id: string) => setF((x) => ({ ...x, scopeIds: x.scopeIds.includes(id) ? x.scopeIds.filter((i) => i !== id) : [...x.scopeIds, id] }));

  const save = async () => {
    setBusy(true);
    const body = {
      name: f.name.trim(),
      description: f.description.trim() || null,
      type: f.type,
      value: Number(f.value) || 0,
      buyQty: f.type === "BUY_X_GET_Y" ? Number(f.buyQty) : null,
      getQty: f.type === "BUY_X_GET_Y" ? Number(f.getQty) : null,
      scope: isBill ? "ALL" : f.scope,
      scopeIds: isBill || f.scope === "ALL" ? [] : f.scopeIds,
      minBill: f.minBill ? Number(f.minBill) : null,
      maxDiscount: f.maxDiscount ? Number(f.maxDiscount) : null,
      code: f.useCode ? f.code.trim().toUpperCase() : null,
      startsAt: f.startsAt || null,
      endsAt: f.endsAt || null,
      daysOfWeek: f.daysOfWeek,
      usageLimit: f.usageLimit ? Number(f.usageLimit) : null,
      priority: Number(f.priority) || 0,
      stackable: f.stackable,
      isActive: f.isActive,
    };
    try {
      if (isNew) await apiClient.post("/promotions", body);
      else await apiClient.patch(`/promotions/${(editing as Promo).id}`, body);
      toast({ title: isNew ? "Promotion created" : "Promotion saved" });
      onClose();
      onSaved();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not save", description: apiError(e) });
    } finally {
      setBusy(false);
    }
  };

  const valueLabel = f.type === "ITEM_PERCENT" || f.type === "BILL_PERCENT" ? "Discount %" : f.type === "BUY_X_GET_Y" ? "Discount on the free items %" : "Discount (Rs)";

  return (
    <DetailSheet open={!!editing} onOpenChange={(v) => !v && onClose()} size="lg">
      <DetailSheetHeader title={isNew ? "New promotion" : "Edit promotion"} subtitle="Offers apply automatically at the till while they're live" />
      <DetailSheetBody className="space-y-5">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Eid Lawn Sale" />
        </div>

        <div className="space-y-2">
          <Label>Type of offer</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setF({ ...f, type: t.id })}
                className={cn("flex items-start gap-2.5 rounded-lg border p-3 text-left", f.type === t.id ? "border-[#a67c2e] bg-[#fcf8f2]" : "border-stone-200 hover:bg-stone-50")}
              >
                <t.icon className="mt-0.5 h-4 w-4 shrink-0 text-[#a67c2e]" />
                <span>
                  <span className="block text-sm font-semibold">{t.label}</span>
                  <span className="block text-xs text-stone-500">{t.help}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {f.type === "BUY_X_GET_Y" && (
            <>
              <div className="space-y-1.5">
                <Label>Buy</Label>
                <Input type="number" min={1} value={f.buyQty} onChange={(e) => setF({ ...f, buyQty: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Get</Label>
                <Input type="number" min={1} value={f.getQty} onChange={(e) => setF({ ...f, getQty: e.target.value })} />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label>{valueLabel}</Label>
            <Input type="number" min={0} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder={f.type === "BUY_X_GET_Y" ? "100 = free" : "0"} />
          </div>
          <div className="space-y-1.5">
            <Label>Minimum bill (optional)</Label>
            <Input type="number" min={0} value={f.minBill} onChange={(e) => setF({ ...f, minBill: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Max discount (optional)</Label>
            <Input type="number" min={0} value={f.maxDiscount} onChange={(e) => setF({ ...f, maxDiscount: e.target.value })} />
          </div>
        </div>

        {!isBill && (
          <div className="space-y-2">
            <Label>Applies to</Label>
            <Select value={f.scope} onValueChange={(v) => setF({ ...f, scope: v as Scope, scopeIds: [] })}>
              <SelectTrigger className="w-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCOPES.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {f.scope !== "ALL" && f.scope !== "PRODUCT" && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-stone-200 p-2">
                {(options[f.scope] ?? []).length === 0 ? (
                  <p className="p-2 text-xs text-stone-500">Nothing to choose from yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {(options[f.scope] ?? []).map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => toggleId(o.id)}
                        className={cn("rounded-full border px-2.5 py-1 text-xs", f.scopeIds.includes(o.id) ? "border-[#2a2012] bg-[#2a2012] text-white" : "border-stone-200 hover:border-[#a67c2e]")}
                      >
                        {o.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {f.scope === "PRODUCT" && (
              <div className="space-y-2">
                <Input value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Search products by name or SKU…" />
                {productHits.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-stone-200">
                    {productHits.map((h) => (
                      <button key={h.id} type="button" onClick={() => toggleId(h.id)} className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-stone-50">
                        <span className="truncate">{h.name}</span>
                        {f.scopeIds.includes(h.id) && <span className="text-xs text-emerald-700">added</span>}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {f.scopeIds.map((id) => (
                    <button key={id} type="button" onClick={() => toggleId(id)} className="rounded-full bg-[#2a2012] px-2.5 py-1 text-xs text-white" title="Remove">
                      {productNames[id] ?? "Product"} ×
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Starts</Label>
            <Input type="date" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Ends (optional)</Label>
            <Input type="date" value={f.endsAt} min={f.startsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Only on these days (optional)</Label>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() => setF({ ...f, daysOfWeek: f.daysOfWeek.includes(i) ? f.daysOfWeek.filter((x) => x !== i) : [...f.daysOfWeek, i].sort() })}
                className={cn("h-8 w-11 rounded-md border text-xs font-medium", f.daysOfWeek.includes(i) ? "border-[#2a2012] bg-[#2a2012] text-white" : "border-stone-200 hover:border-[#a67c2e]")}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-stone-200 p-3">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              Needs a coupon code
              <span className="block text-xs text-stone-500">Otherwise it applies to every eligible bill automatically</span>
            </span>
            <Switch checked={f.useCode} onCheckedChange={(v) => setF({ ...f, useCode: v })} />
          </label>
          {f.useCode && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} placeholder="EID20" className="font-mono uppercase" />
              <Input type="number" min={1} value={f.usageLimit} onChange={(e) => setF({ ...f, usageLimit: e.target.value })} placeholder="Max uses (optional)" />
            </div>
          )}
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              Can combine with other offers
              <span className="block text-xs text-stone-500">Off = only the best single offer is used</span>
            </span>
            <Switch checked={f.stackable} onCheckedChange={(v) => setF({ ...f, stackable: v })} />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Active</span>
            <Switch checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} />
          </label>
        </div>

        <div className="space-y-1.5">
          <Label>Notes (optional)</Label>
          <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={2} />
        </div>

        <div className="rounded-lg bg-[#fcf8f2] px-3 py-2 text-sm text-stone-700">
          <b>Preview:</b> {f.name || "This offer"} — {describe({ type: f.type, value: Number(f.value) || (f.type === "BUY_X_GET_Y" ? 100 : 0), buyQty: Number(f.buyQty), getQty: Number(f.getQty), minBill: Number(f.minBill) || null, maxDiscount: Number(f.maxDiscount) || null })}
        </div>
      </DetailSheetBody>
      <DetailSheetFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || !f.name.trim()} className="bg-[#2a2012] hover:bg-[#3a2e1c]">
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isNew ? "Create promotion" : "Save changes"}
        </Button>
      </DetailSheetFooter>
    </DetailSheet>
  );
}

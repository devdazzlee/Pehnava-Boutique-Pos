"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { History, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import apiClient from "@/lib/apiClient";
import { cn } from "@/lib/utils";

type PriceChange = {
  id: string;
  field: string;
  old_value: number;
  new_value: number;
  source: string;
  changed_by: string | null;
  changed_by_email: string | null;
  created_at: string;
};

type CostRow = { date: string; unit_cost: number; quantity: number; supplier: string | null; reference: string | null };

const FIELD_LABEL: Record<string, string> = {
  purchase_rate: "Cost price",
  sales_rate_exc_dis_and_tax: "Sale price",
  sales_rate_inc_dis_and_tax: "Sale price (incl. tax)",
  discount_amount: "Discount",
};

const rs = (v: number) => `Rs ${Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** Price-change history (manual edits) and purchase cost history for one product. */
export function ProductPriceHistory({ productId }: { productId: string }) {
  const [changes, setChanges] = useState<PriceChange[] | null>(null);
  const [costs, setCosts] = useState<CostRow[]>([]);
  const [tab, setTab] = useState<"price" | "cost">("price");

  useEffect(() => {
    let alive = true;
    apiClient
      .get(`/products/${productId}/price-history`)
      .then((r) => {
        if (!alive) return;
        setChanges(r.data.data.changes ?? []);
        setCosts(r.data.data.purchases ?? []);
      })
      .catch(() => alive && setChanges([]));
    return () => {
      alive = false;
    };
  }, [productId]);

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Price history</span>
        <div className="ml-auto flex rounded-md bg-muted p-0.5 text-xs">
          {(["price", "cost"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn("rounded px-2 py-1", tab === t ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
            >
              {t === "price" ? `Price changes${changes ? ` (${changes.length})` : ""}` : `Purchase costs (${costs.length})`}
            </button>
          ))}
        </div>
      </div>
      {!changes ? (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…
        </div>
      ) : tab === "price" ? (
        changes.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">No price changes recorded yet. Edits from now on are tracked here.</p>
        ) : (
          <div className="max-h-56 divide-y divide-border overflow-y-auto">
            {changes.map((c) => {
              const up = c.new_value > c.old_value;
              return (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                  {up ? <TrendingUp className="h-3.5 w-3.5 text-rose-600" /> : <TrendingDown className="h-3.5 w-3.5 text-emerald-600" />}
                  <span className="w-32 shrink-0 font-medium">{FIELD_LABEL[c.field] || c.field}</span>
                  <span className="tabular-nums text-muted-foreground line-through">{rs(c.old_value)}</span>
                  <span className="tabular-nums font-semibold">{rs(c.new_value)}</span>
                  <span className="ml-auto truncate text-right text-muted-foreground">
                    {format(new Date(c.created_at), "dd MMM yyyy, HH:mm")}
                    {c.changed_by_email ? ` · ${c.changed_by_email.split("@")[0]}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )
      ) : costs.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">No purchases recorded for this product.</p>
      ) : (
        <div className="max-h-56 divide-y divide-border overflow-y-auto">
          {costs.map((c, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2 text-xs">
              <span className="w-24 shrink-0 text-muted-foreground">{format(new Date(c.date), "dd MMM yyyy")}</span>
              <span className="min-w-0 flex-1 truncate">{c.supplier || "—"}{c.reference ? ` · ${c.reference}` : ""}</span>
              <span className="text-muted-foreground">{c.quantity} pcs</span>
              <span className="w-24 text-right font-semibold tabular-nums">{rs(c.unit_cost)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

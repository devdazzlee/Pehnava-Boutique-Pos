"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";
import { Input } from "@/components/ui/input";

/** Pakistani notes and coins, largest first, for the drawer counter. */
const DENOMINATIONS = [5000, 1000, 500, 100, 50, 20, 10, 5, 2, 1];

const formatPkr = (value: number) =>
  `PKR ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Optional note/coin counter that fills an amount field with the counted total. */
export function CashCounter({ onTotal }: { onTotal: (total: number) => void }) {
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<Record<number, string>>({});

  const total = DENOMINATIONS.reduce((sum, d) => sum + d * (Number(counts[d]) || 0), 0);

  const update = (denomination: number, raw: string) => {
    const clean = raw.replace(/[^\d]/g, "");
    const next = { ...counts, [denomination]: clean };
    setCounts(next);
    onTotal(DENOMINATIONS.reduce((sum, d) => sum + d * (Number(next[d]) || 0), 0));
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800"
      >
        <Calculator className="h-4 w-4" />
        Count by notes &amp; coins
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-900/80">Cash counter</p>
        <button
          type="button"
          onClick={() => {
            setCounts({});
            setOpen(false);
          }}
          className="text-xs text-slate-500 hover:text-slate-800"
        >
          Hide
        </button>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {DENOMINATIONS.map((d) => (
          <div key={d} className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700">
              {d.toLocaleString("en-US")}
            </span>
            <span className="text-xs text-slate-400">×</span>
            <Input
              inputMode="numeric"
              className="h-8 w-16 bg-white px-2 text-center text-sm tabular-nums"
              placeholder="0"
              value={counts[d] || ""}
              onChange={(event) => update(d, event.target.value)}
            />
            <span className="min-w-0 flex-1 truncate text-right text-xs tabular-nums text-slate-500">
              {(d * (Number(counts[d]) || 0)).toLocaleString("en-US")}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-indigo-100 pt-2 text-sm">
        <span className="font-medium text-slate-600">Counted total</span>
        <span className="font-semibold tabular-nums text-slate-900">{formatPkr(total)}</span>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { YmdDatePicker } from "@/components/ui/date-picker";
import { Chips } from "@/components/accounts/coa-ui";
import { businessTodayYmd, shiftBusinessYmd, startOfBusinessMonthYmd, startOfBusinessYearYmd } from "@/lib/business-timezone";

export type RangeKey = "all" | "month" | "30d" | "90d" | "year" | "custom";

export const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "month", label: "This month" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom" },
];

export function rangeFor(k: RangeKey, custom: { from: string; to: string }) {
  const today = businessTodayYmd();
  if (k === "month") return { from: startOfBusinessMonthYmd(), to: today };
  if (k === "30d") return { from: shiftBusinessYmd(today, -29), to: today };
  if (k === "90d") return { from: shiftBusinessYmd(today, -89), to: today };
  if (k === "year") return { from: startOfBusinessYearYmd(), to: today };
  if (k === "custom") return custom;
  return { from: "", to: "" };
}

export const ymdOf = (iso: string) => format(new Date(iso), "yyyy-MM-dd");

export function inDateRange(iso: string | null | undefined, range: RangeKey, custom: { from: string; to: string }) {
  if (!iso) return range === "all";
  const r = rangeFor(range, custom);
  const d = ymdOf(iso);
  if (r.from && d < r.from) return false;
  if (r.to && d > r.to) return false;
  return true;
}

export function useDateRangeState(initial: RangeKey = "all") {
  const [range, setRange] = useState<RangeKey>(initial);
  const [custom, setCustom] = useState({ from: startOfBusinessMonthYmd(), to: businessTodayYmd() });
  return { range, setRange, custom, setCustom, bounds: rangeFor(range, custom) };
}

export function DateRangeControls({
  range,
  setRange,
  custom,
  setCustom,
}: {
  range: RangeKey;
  setRange: (v: RangeKey) => void;
  custom: { from: string; to: string };
  setCustom: (v: { from: string; to: string } | ((c: { from: string; to: string }) => { from: string; to: string })) => void;
}) {
  return (
    <>
      <Chips options={RANGE_OPTIONS} value={range} onChange={setRange} />
      {range === "custom" && (
        <div className="flex items-center gap-2">
          <YmdDatePicker value={custom.from} onChange={(v) => setCustom((c) => ({ ...c, from: v }))} />
          <span className="text-xs text-gray-400">to</span>
          <YmdDatePicker value={custom.to} onChange={(v) => setCustom((c) => ({ ...c, to: v }))} />
        </div>
      )}
    </>
  );
}

export type PageSizeOption = number | "all";

export function usePaginatedList<T>(items: T[]) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);

  useEffect(() => {
    setPage(1);
  }, [items.length, pageSize]);

  const limit = pageSize === "all" ? Math.max(items.length, 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(items.length / limit));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const start = (safePage - 1) * limit;
  const pageItems = pageSize === "all" ? items : items.slice(start, start + limit);

  return {
    pageItems,
    page: safePage,
    setPage,
    pageSize,
    setPageSize,
    total: items.length,
    totalPages,
    from: items.length ? start + 1 : 0,
    to: Math.min(start + limit, items.length),
  };
}

export function ListPaginationBar({ pag }: { pag: ReturnType<typeof usePaginatedList<unknown>> }) {
  if (pag.total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 bg-gray-50/80 px-4 py-2.5 text-xs text-gray-600">
      <div className="flex flex-wrap items-center gap-2">
        <span>
          {pag.from.toLocaleString()}–{pag.to.toLocaleString()} of {pag.total.toLocaleString()}
        </span>
        <Select
          value={String(pag.pageSize)}
          onValueChange={(v) => pag.setPageSize(v === "all" ? "all" : Number(v))}
        >
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="25">25 / page</SelectItem>
            <SelectItem value="50">50 / page</SelectItem>
            <SelectItem value="100">100 / page</SelectItem>
            <SelectItem value="all">Show all</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {pag.pageSize !== "all" && pag.totalPages > 1 ? (
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="sm" className="h-8" disabled={pag.page <= 1} onClick={() => pag.setPage((p) => Math.max(1, p - 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[88px] text-center tabular-nums">
            Page {pag.page} / {pag.totalPages}
          </span>
          <Button type="button" variant="outline" size="sm" className="h-8" disabled={pag.page >= pag.totalPages} onClick={() => pag.setPage((p) => Math.min(pag.totalPages, p + 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

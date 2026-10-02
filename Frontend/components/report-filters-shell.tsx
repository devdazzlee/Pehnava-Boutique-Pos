"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Loader2, SlidersHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const FIELD_GRID =
  "grid gap-x-3 gap-y-4 sm:grid-cols-2 xl:grid-cols-4 [&_label]:text-xs [&_label]:font-semibold [&_label]:text-indigo-900/80 [&_button]:h-9 [&_button]:border-indigo-200/80 [&_button]:bg-white [&_button]:shadow-sm [&_input]:border-indigo-200/80 [&_input]:bg-white [&_input]:shadow-sm";

export function CompactReportFilters({
  summary,
  primary,
  advanced,
  actions,
  defaultOpen = false,
  loading = false,
}: {
  summary?: string;
  primary: ReactNode;
  advanced?: ReactNode;
  actions?: ReactNode;
  defaultOpen?: boolean;
  /** Shows a small "Updating…" indicator while results reload. */
  loading?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className="overflow-hidden rounded-xl border-indigo-100 shadow-sm">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="group -ml-1 flex min-w-0 max-w-full items-center gap-3 rounded-lg p-1 pr-2 text-left transition-colors hover:bg-indigo-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 transition-colors group-hover:bg-indigo-200 group-hover:text-indigo-700">
            <SlidersHorizontal className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-900">Filters</span>
            {summary ? <span className="block truncate text-xs text-slate-500">{summary}</span> : null}
          </span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200", open && "rotate-180")}
          />
        </button>
        {loading ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700">
            <Loader2 className="h-3 w-3 animate-spin" />
            Updating…
          </span>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>
      </div>

      {open ? (
        <div className="space-y-4 border-t border-indigo-100 bg-gradient-to-b from-indigo-50/80 to-indigo-50/30 px-4 py-4 sm:px-5">
          <div className={FIELD_GRID}>{primary}</div>
          {advanced ? (
            <div className={cn(FIELD_GRID, "border-t border-dashed border-indigo-200 pt-4")}>{advanced}</div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

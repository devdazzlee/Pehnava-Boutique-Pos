"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const rs = (v: number | null | undefined) => (v == null ? "—" : `Rs ${Math.round(Number(v)).toLocaleString("en-PK")}`);
export const day = (v: string | Date | null | undefined) =>
  v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
export const apiError = (e: unknown) => {
  const err = e as { response?: { data?: { message?: string } }; message?: string };
  return err?.response?.data?.message || err?.message || "Something went wrong";
};
export const listOf = <T,>(r: { data?: { data?: unknown } }): T[] => {
  const d = r?.data?.data as unknown;
  if (Array.isArray(d)) return d as T[];
  const inner = (d as { data?: unknown; items?: unknown } | undefined)?.data ?? (d as { items?: unknown } | undefined)?.items;
  return Array.isArray(inner) ? (inner as T[]) : [];
};

export function PageShell({ title, subtitle, actions, children }: { title: string; subtitle: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-full bg-[#f8f6f2] p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#2a2012]">{title}</h1>
            <p className="text-sm text-stone-500">{subtitle}</p>
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" | "dark" }) {
  return (
    <div className={cn("min-w-0 rounded-xl border p-3.5", tone === "dark" ? "border-[#2a2012] bg-[#2a2012] text-white" : "border-stone-200 bg-white")}>
      <div className={cn("truncate text-xs", tone === "dark" ? "text-stone-300" : "text-stone-500")}>{label}</div>
      <div className={cn("mt-1 truncate text-xl font-semibold tabular-nums", tone === "good" && "text-emerald-700", tone === "bad" && "text-rose-700")}>{value}</div>
      {hint && <div className={cn("mt-0.5 truncate text-xs", tone === "dark" ? "text-stone-400" : "text-stone-500")}>{hint}</div>}
    </div>
  );
}

export function Pill({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", className)}>{children}</span>;
}

export function Chips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string; count?: number }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            value === o.id ? "border-[#2a2012] bg-[#2a2012] text-white" : "border-stone-200 bg-white text-stone-600 hover:border-[#a67c2e] hover:text-[#a67c2e]",
          )}
        >
          {o.label}
          {o.count != null && <span className="ml-1 opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function EmptyCard({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 bg-white px-6 py-14 text-center">
      <div className="mb-3 rounded-full bg-[#fcf8f2] p-3 text-[#a67c2e]">{icon}</div>
      <div className="font-semibold text-stone-800">{title}</div>
      {text && <p className="mt-1 max-w-md text-sm text-stone-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

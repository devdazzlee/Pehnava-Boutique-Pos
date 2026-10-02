"use client";

import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { TYPE_STYLE, balanceLabel, type CoaAccount } from "./coa-shared";

/* ------------------------------ layout ------------------------------ */

/** Card wrapper with a consistent header (title, subtitle, right-side actions). */
export function Panel({
  title,
  subtitle,
  icon: Icon,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-sm", className)}>
      {title || actions ? (
        <header className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-3 sm:px-5">
          {Icon ? (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#fcf8f2] text-[#a67c2e]">
              <Icon className="h-4 w-4" />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            {title ? <h2 className="truncate text-[15px] font-semibold text-gray-900">{title}</h2> : null}
            {subtitle ? <p className="truncate text-xs text-gray-500">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** One row of per-tab filters. Children wrap on small screens. */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50/60 px-4 py-2.5 sm:px-5", className)}>
      {children}
    </div>
  );
}

export function FilterLabel({ children }: { children: ReactNode }) {
  return <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{children}</span>;
}

/* ------------------------------ inputs ------------------------------ */

export function SearchBox({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-[200px] flex-1", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 rounded-lg border-gray-200 bg-white pl-9 pr-8 text-sm"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export type ChipOption<T extends string> = {
  value: T;
  label: string;
  count?: number;
  dot?: string;
};

/** Pill toggle group. Single-select by default; pass `multiple` for multi-select. */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  size = "sm",
}: {
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "xs";
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors",
              size === "sm" ? "h-8 px-3 text-xs" : "h-7 px-2.5 text-[11px]",
              active
                ? "border-[#2a2012] bg-[#2a2012] text-white shadow-sm"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50",
            )}
          >
            {option.dot ? <span className={cn("h-1.5 w-1.5 rounded-full", option.dot)} /> : null}
            {option.label}
            {option.count !== undefined ? (
              <span className={cn("tabular-nums", active ? "text-white/70" : "text-gray-400")}>{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function MultiChips<T extends string>({
  options,
  value,
  onChange,
  allLabel = "All",
}: {
  options: ChipOption<T>[];
  value: T[];
  onChange: (value: T[]) => void;
  allLabel?: string;
}) {
  const toggle = (v: T) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const chip = (active: boolean) =>
    cn(
      "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
      active
        ? "border-[#2a2012] bg-[#2a2012] text-white shadow-sm"
        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50",
    );
  return (
    <div className="flex flex-wrap gap-1">
      <button type="button" className={chip(value.length === 0)} onClick={() => onChange([])}>
        {allLabel}
      </button>
      {options.map((option) => (
        <button key={option.value} type="button" className={chip(value.includes(option.value))} onClick={() => toggle(option.value)}>
          {option.dot ? <span className={cn("h-1.5 w-1.5 rounded-full", option.dot)} /> : null}
          {option.label}
          {option.count !== undefined ? (
            <span className={cn("tabular-nums", value.includes(option.value) ? "text-white/70" : "text-gray-400")}>{option.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/** Searchable account picker (code, name, control) grouped by control account. */
export function AccountCombobox({
  accounts,
  value,
  onChange,
  placeholder = "Select account",
  allowClear,
  clearLabel = "All accounts",
  className,
  showBalance = true,
  modal,
}: {
  accounts: CoaAccount[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  allowClear?: boolean;
  clearLabel?: string;
  className?: string;
  showBalance?: boolean;
  /** Set inside dialogs so the list can scroll. */
  modal?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = accounts.find((a) => a.id === value) ?? null;
  const groups = useMemo(() => {
    const map = new Map<string, CoaAccount[]>();
    for (const account of accounts) {
      const key = `${account.control.code} · ${account.control.name}`;
      map.set(key, [...(map.get(key) || []), account]);
    }
    return [...map.entries()];
  }, [accounts]);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={modal}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-9 w-full justify-between rounded-lg border-gray-200 bg-white px-3 font-normal", className)}
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", TYPE_STYLE[selected.type_code].dot)} />
              <span className="font-mono text-xs text-gray-500">{selected.code}</span>
              <span className="truncate text-gray-900">{selected.name}</span>
            </span>
          ) : (
            <span className="truncate text-gray-500">{allowClear ? clearLabel : placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-gray-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,460px)] p-0" align="start">
        <Command
          filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.toLowerCase().trim()) ? 1 : 0)}
        >
          <CommandInput placeholder="Search code, account or control…" />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>No account found.</CommandEmpty>
            {allowClear ? (
              <CommandGroup>
                <CommandItem
                  value={`__all ${clearLabel}`}
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value ? "opacity-0" : "opacity-100")} />
                  {clearLabel}
                </CommandItem>
              </CommandGroup>
            ) : null}
            {groups.map(([label, items]) => (
              <CommandGroup key={label} heading={label}>
                {items.map((account) => (
                  <CommandItem
                    key={account.id}
                    value={`${account.code} ${account.name} ${label}`}
                    onSelect={() => {
                      onChange(account.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4 shrink-0", value === account.id ? "opacity-100" : "opacity-0")} />
                    <span className="mr-2 font-mono text-xs text-gray-500">{account.code}</span>
                    <span className="flex-1 truncate">{account.name}</span>
                    {showBalance && account.balance ? (
                      <span className="ml-2 text-xs tabular-nums text-gray-500">
                        {balanceLabel(account.balance.closing, account.type_code)}
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------ display ------------------------------ */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fcf8f2] text-[#a67c2e] ring-1 ring-[#a67c2e]/15">
        <Icon className="h-6 w-6" />
      </span>
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      {description ? <p className="mt-1 max-w-md text-xs text-gray-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "brand" | "good" | "bad";
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3.5",
        tone === "brand" && "border-[#a67c2e]/30 bg-[#fcf8f2]",
        tone === "good" && "border-emerald-200 bg-emerald-50/60",
        tone === "bad" && "border-rose-200 bg-rose-50/60",
        tone === "default" && "border-gray-200 bg-white",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
        {Icon ? <Icon className="h-4 w-4 text-gray-400" /> : null}
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900">{value}</p>
      {hint ? <p className="mt-0.5 truncate text-[11px] text-gray-500">{hint}</p> : null}
    </div>
  );
}

export function ResultCount({ shown, total, noun }: { shown: number; total: number; noun: string }) {
  return (
    <span className="text-xs text-gray-500">
      {shown === total ? `${total} ${noun}` : `${shown} of ${total} ${noun}`}
    </span>
  );
}

/* ------------------------------ loading ------------------------------ */

/** Skeleton block with enough contrast to read on the warm page background. */
export function Bone({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-[#e9e2d4]", className)} />;
}

/** Placeholder shaped like the Accounts tab, shown on first load. */
export function AccountsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading chart of accounts">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-gray-200/80 bg-white p-4 shadow-sm">
            <Bone className="h-9 w-9 rounded-lg" />
            <Bone className="h-3.5 w-20" />
            <Bone className="h-5 w-28" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-3 rounded-xl border border-gray-200/80 bg-white p-4 shadow-sm">
          <Bone className="h-4 w-32" />
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className={cn("flex items-center gap-2", i % 3 !== 0 && "pl-6")}>
              <Bone className="h-3.5 flex-1" />
              <Bone className="h-3.5 w-14" />
            </div>
          ))}
        </div>
        <div className="space-y-3 rounded-xl border border-gray-200/80 bg-white p-5 shadow-sm">
          <Bone className="h-5 w-48" />
          <Bone className="h-9 w-full rounded-lg" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Bone className="h-3.5 w-16" />
              <Bone className="h-3.5 flex-1" />
              <Bone className="h-3.5 w-20" />
              <Bone className="h-3.5 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

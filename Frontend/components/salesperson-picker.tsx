"use client";

import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import apiClient from "@/lib/apiClient";
import { cn } from "@/lib/utils";

export interface Salesperson {
  id: string;
  name: string;
  employee_code: string | null;
  user_id: string | null;
  commission_type: "PERCENTAGE" | "FIXED_PER_SALE" | "FIXED_PER_PIECE";
  commission_rate: number;
  commission_fixed: number;
  commission_label: string;
  branch: { id: string; name: string } | null;
  employee_type: { name: string } | null;
}

const STORAGE_KEY = "pos_salesperson_id";
let cache: Salesperson[] | null = null;

/** Loads selectable salespeople once per session (refreshes in the background). */
export function useSalespeople() {
  const [people, setPeople] = useState<Salesperson[]>(cache ?? []);
  const [loading, setLoading] = useState(!cache);
  useEffect(() => {
    let alive = true;
    apiClient
      .get("/commissions/salespeople")
      .then((res) => {
        cache = res.data.data as Salesperson[];
        if (alive) setPeople(cache);
      })
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);
  return { people, loading };
}

/** Last salesperson picked on this device, so staff don't re-select on every bill. */
export function useStickySalesperson() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    try {
      setId(localStorage.getItem(STORAGE_KEY));
    } catch {
      // storage unavailable
    }
  }, []);
  const update = (next: string | null) => {
    setId(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, next);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // storage unavailable
    }
  };
  return [id, update] as const;
}

export function SalespersonPicker({
  value,
  onChange,
  people,
  loading,
  disabled,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  people: Salesperson[];
  loading?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = people.find((p) => p.id === value) ?? null;

  // Drop a remembered salesperson who no longer exists / is inactive.
  useEffect(() => {
    if (value && !loading && people.length && !selected) onChange(null);
  }, [value, loading, people.length, selected, onChange]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative">
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "h-10 w-full justify-between px-3 font-normal",
              selected ? "border-[#a67c2e]/50 bg-[#fcf8f2] pr-16" : "text-gray-500",
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <UserRound className={cn("h-4 w-4 shrink-0", selected ? "text-[#a67c2e]" : "text-gray-400")} />
              {selected ? (
                <span className="min-w-0 truncate text-left">
                  <span className="font-medium text-gray-900">{selected.name}</span>
                  <span className="ml-1.5 text-xs text-gray-500">· {selected.commission_label}</span>
                </span>
              ) : (
                <span className="truncate">{loading ? "Loading staff…" : "Select salesperson (for commission)"}</span>
              )}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-gray-400" />
          </Button>
        </PopoverTrigger>
        {selected && !disabled ? (
          <button
            type="button"
            aria-label="Clear salesperson"
            onClick={() => onChange(null)}
            className="absolute right-8 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <PopoverContent className="w-[min(92vw,380px)] p-0" align="start">
        <Command filter={(v, search) => (v.toLowerCase().includes(search.toLowerCase().trim()) ? 1 : 0)}>
          <CommandInput placeholder="Search staff by name or code…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No staff found. Add employees in Staff &amp; HR.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none cashier"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", value ? "opacity-0" : "opacity-100")} />
                <span className="text-gray-600">No salesperson (credit cashier)</span>
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="Staff">
              {people.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.name} ${p.employee_code || ""} ${p.employee_type?.name || ""}`}
                  onSelect={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4 shrink-0", value === p.id ? "opacity-100" : "opacity-0")} />
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f3ead8] text-[11px] font-semibold text-[#8a6520]">
                    {p.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")}
                  </span>
                  <span className="ml-2 min-w-0 flex-1">
                    <span className="block truncate text-sm">{p.name}</span>
                    <span className="block truncate text-[11px] text-gray-500">
                      {[p.employee_code, p.employee_type?.name, p.branch?.name].filter(Boolean).join(" · ") || "Staff"}
                    </span>
                  </span>
                  <span className="ml-2 shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">{p.commission_label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

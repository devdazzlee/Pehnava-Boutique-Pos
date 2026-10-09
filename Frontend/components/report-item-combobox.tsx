"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  formatProductSearchLabel,
  productSearchHaystack,
  type ProductSearchFields,
} from "@/lib/labelBarcode";

export type ReportItemOption = ProductSearchFields & {
  id: string;
  name: string;
  sku?: string | null;
};

export function ReportItemCombobox({
  value,
  onChange,
  items,
  loading = false,
  placeholder = "All items",
  emptyText = "No items found",
  searchPlaceholder = "Search items…",
  allLabel = "All items",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  items: ReportItemOption[];
  loading?: boolean;
  placeholder?: string;
  emptyText?: string;
  searchPlaceholder?: string;
  allLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => (value === "all" ? null : items.find((item) => item.id === value) || null),
    [items, value],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => productSearchHaystack(item).includes(needle));
  }, [items, query]);

  const label = selected ? formatProductSearchLabel(selected) : placeholder;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-10 w-full justify-between font-normal", className)}
        >
          <span className="truncate">{label}</span>
          {loading ? (
            <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-70" />
          ) : (
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading items…
              </div>
            ) : (
              <>
                <CommandEmpty>{emptyText}</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="all"
                    onSelect={() => {
                      onChange("all");
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === "all" ? "opacity-100" : "opacity-0")} />
                    {allLabel}
                  </CommandItem>
                  {filtered.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={item.id}
                      onSelect={() => {
                        onChange(item.id);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      <Check
                        className={cn("mr-2 h-4 w-4", value === item.id ? "opacity-100" : "opacity-0")}
                      />
                      <span className="truncate">{formatProductSearchLabel(item)}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

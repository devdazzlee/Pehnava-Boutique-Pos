"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { createExpenseCategory } from "@/lib/api/expenses";
import { loadExpenseAccounts } from "@/components/expense-account-select";
import { cn } from "@/lib/utils";

type CategoryOption = { id: string; name: string };

export function ExpenseCategorySelect({
  value,
  categories,
  onChange,
  onCategoriesChange,
  triggerClassName,
}: {
  value: string;
  categories: CategoryOption[];
  onChange: (categoryId: string) => void;
  onCategoriesChange: (categories: CategoryOption[]) => void;
  triggerClassName?: string;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"pick" | "custom">(value === "__custom__" ? "custom" : "pick");
  const [customName, setCustomName] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => (value ? categories.find((c) => c.id === value) ?? null : null),
    [categories, value],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(needle));
  }, [categories, query]);

  const label = selected?.name ?? "Uncategorised";

  const saveCustom = async () => {
    const name = customName.trim();
    if (name.length < 2) {
      toast({ variant: "destructive", title: "Enter a category name (at least 2 characters)" });
      return;
    }
    setSaving(true);
    try {
      const created = await createExpenseCategory({ name, is_active: true });
      const next = [...categories.filter((c) => c.id !== created.id), { id: created.id, name: created.name }].sort(
        (a, b) => a.name.localeCompare(b.name),
      );
      onCategoriesChange(next);
      onChange(created.id);
      void loadExpenseAccounts(true);
      setMode("pick");
      setCustomName("");
      setOpen(false);
      setQuery("");
      toast({
        title: "Category added",
        description: `${created.name} — a matching account is created under Chart of Accounts → 521 Expenses Control.`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not add category",
        description: error?.response?.data?.message || error?.message || "Try again",
      });
    } finally {
      setSaving(false);
    }
  };

  if (mode === "custom") {
    return (
      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          className={cn("h-10 w-full justify-between font-normal", triggerClassName)}
          onClick={() => {
            setMode("pick");
            setCustomName("");
          }}
        >
          <span className="truncate text-muted-foreground">Adding new category…</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
        <div className="space-y-2 rounded-md border border-dashed border-border bg-muted/20 p-3">
          <Label className="text-xs text-muted-foreground">New category name</Label>
          <Input
            value={customName}
            onChange={(event) => setCustomName(event.target.value)}
            placeholder="e.g. Packaging"
            className="h-10 w-full"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void saveCustom();
              }
            }}
          />
          <Button type="button" size="sm" className="h-10 w-full" onClick={saveCustom} disabled={saving}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
            Add category
          </Button>
        </div>
      </div>
    );
  }

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
          className={cn("h-10 w-full justify-between font-normal", triggerClassName)}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search categories…" value={query} onValueChange={setQuery} />
          <CommandList className="max-h-64">
            <CommandEmpty>No category found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="none"
                onSelect={() => {
                  onChange("");
                  setOpen(false);
                  setQuery("");
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                Uncategorised
              </CommandItem>
              {filtered.map((category) => (
                <CommandItem
                  key={category.id}
                  value={category.id}
                  onSelect={() => {
                    onChange(category.id);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === category.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{category.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                value="__custom__"
                onSelect={() => {
                  setOpen(false);
                  setQuery("");
                  setMode("custom");
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add custom category…
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

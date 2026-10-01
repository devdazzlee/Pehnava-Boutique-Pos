"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { createExpenseCategory } from "@/lib/api/expenses";

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
  const [mode, setMode] = useState<"pick" | "custom">(value === "__custom__" ? "custom" : "pick");
  const [customName, setCustomName] = useState("");
  const [saving, setSaving] = useState(false);

  const selectValue = mode === "custom" ? "__custom__" : value || "none";

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
      setMode("pick");
      setCustomName("");
      toast({ title: "Category added", description: created.name });
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

  return (
    <div className="space-y-2">
      <Select
        value={selectValue}
        onValueChange={(next) => {
          if (next === "__custom__") {
            setMode("custom");
            return;
          }
          setMode("pick");
          setCustomName("");
          onChange(next === "none" ? "" : next);
        }}
      >
        <SelectTrigger className={triggerClassName}>
          <SelectValue placeholder="Uncategorised" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Uncategorised</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.name}
            </SelectItem>
          ))}
          <SelectItem value="__custom__">+ Add custom category…</SelectItem>
        </SelectContent>
      </Select>

      {mode === "custom" ? (
        <div className="space-y-2 rounded-md border border-dashed border-border bg-muted/20 p-3">
          <Label className="text-xs text-muted-foreground">
            New category name
          </Label>
          <Input
            value={customName}
            onChange={(event) => setCustomName(event.target.value)}
            placeholder="e.g. Packaging"
            className="h-10 w-full"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void saveCustom();
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            className="h-10 w-full"
            onClick={saveCustom}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-1.5 h-4 w-4" />
            )}
            Add category
          </Button>
        </div>
      ) : null}
    </div>
  );
}

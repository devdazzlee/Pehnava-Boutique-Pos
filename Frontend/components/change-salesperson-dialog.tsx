"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";
import { SalespersonPicker, type Salesperson } from "@/components/salesperson-picker";

/** Re-assigns which employee gets commission for an existing bill (its returns follow). */
export function ChangeSalespersonDialog({
  sale,
  people,
  onOpenChange,
  onSaved,
}: {
  sale: { id: string; sale_number: string; invoice_number?: string | null; salesperson?: { id: string; name: string } | null } | null;
  people: Salesperson[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [value, setValue] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sale) setValue(sale.salesperson?.id ?? null);
  }, [sale]);

  const unchanged = (sale?.salesperson?.id ?? null) === value;

  const save = async () => {
    if (!sale) return;
    setSaving(true);
    try {
      await apiClient.patch(`/sale/${sale.id}`, { salespersonId: value });
      const name = people.find((p) => p.id === value)?.name;
      toast({
        title: "Salesperson updated",
        description: `${sale.invoice_number || sale.sale_number} → ${name || "no salesperson (cashier)"}`,
      });
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not update salesperson",
        description: error?.response?.data?.message || error?.message || "Try again",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!sale} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{sale?.salesperson ? "Change salesperson" : "Set salesperson"}</DialogTitle>
          <DialogDescription>
            Bill {sale?.invoice_number || sale?.sale_number}. Commission for this bill (and any return on it) moves to the selected employee.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <SalespersonPicker value={value} onChange={setValue} people={people} disabled={saving} />
          {sale?.salesperson ? (
            <p className="text-xs text-muted-foreground">
              Currently credited to <span className="font-medium text-foreground">{sale.salesperson.name}</span>.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">No salesperson yet — commission currently goes to the cashier&apos;s linked employee.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || unchanged}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

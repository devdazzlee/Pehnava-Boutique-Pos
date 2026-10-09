"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export type StockInDeleteConfirmState =
  | {
      kind: "line";
      id: string;
      title: string;
      description: ReactNode;
    }
  | {
      kind: "bill";
      anchorId: string;
      title: string;
      description: ReactNode;
    };

type StockInDeleteConfirmDialogProps = {
  target: StockInDeleteConfirmState | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (target: StockInDeleteConfirmState) => Promise<void>;
  confirmLabel?: string;
};

export function StockInDeleteConfirmDialog({
  target,
  onOpenChange,
  onConfirm,
  confirmLabel = "Delete",
}: StockInDeleteConfirmDialogProps) {
  const [busy, setBusy] = useState(false);

  return (
    <AlertDialog
      open={!!target}
      onOpenChange={(open) => {
        if (busy) return;
        onOpenChange(open);
      }}
    >
      <AlertDialogContent className="max-w-md rounded-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{target?.title ?? "Confirm delete"}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              {target?.description}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || !target}
            onClick={async () => {
              if (!target) return;
              setBusy(true);
              try {
                await onConfirm(target);
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {busy ? "Deleting…" : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

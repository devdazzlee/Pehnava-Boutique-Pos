"use client";

import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const STOCK_DLG = {
  content:
    "w-full max-w-6xl mx-auto flex flex-col min-h-0 flex-1 overflow-hidden",
  header: "px-6 py-4 border-b shrink-0 bg-background",
  title: "text-lg font-semibold",
  desc: "text-sm text-muted-foreground font-normal mt-0.5",
  body: "px-6 py-5 space-y-5 overflow-y-auto flex-1 min-h-0",
  footer:
    "flex justify-between items-center gap-3 px-6 py-4 border-t shrink-0 bg-muted/40",
  label: "text-sm font-medium",
  field: "h-9 text-sm",
} as const;

/** Skeleton stand-in for Select while branch/supplier/etc. options load. */
export function StockSelectSkeleton({
  className,
  label = "Loading…",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn(
        "h-9 w-full rounded-md border bg-muted/40 px-3 flex items-center gap-2",
        className,
      )}
      aria-busy="true"
      aria-label={label}
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
      <div className="h-2.5 flex-1 max-w-[55%] rounded bg-muted animate-pulse" />
    </div>
  );
}

interface StockOperationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  onCancel?: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  submitting?: boolean;
  submitDisabled?: boolean;
  footerHint?: React.ReactNode;
  size?: "md" | "lg" | "xl";
  /** Optional header icon (e.g. <Plus />) and its tile colour classes. */
  icon?: React.ReactNode;
  iconTone?: string;
}

/** Full-page in-tab form for multi-line stock operations (not a centered modal). */
export function StockOperationDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  onCancel,
  onSubmit,
  submitLabel = "Save",
  submitting = false,
  submitDisabled = false,
  footerHint,
  icon,
  iconTone,
}: StockOperationDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) {
        onCancel?.();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onCancel, onOpenChange]);

  if (!open) return null;

  const close = () => {
    if (submitting) return;
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-50">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {icon ? (
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm", iconTone || "bg-slate-900 text-white")}>
              {icon}
            </div>
          ) : null}
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
            {description ? <p className="truncate text-sm text-slate-500">{description}</p> : null}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-slate-500" onClick={close} title="Close (Esc)">
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1500px] space-y-5 px-4 py-5 sm:px-6">{children}</div>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-4px_12px_-8px_rgba(15,23,42,0.15)] sm:px-6">
        <div className="min-w-0 text-sm text-slate-600">{footerHint}</div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" type="button" className="h-10" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={submitting || submitDisabled}
            className="h-10 min-w-[140px] shadow-sm"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              submitLabel
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

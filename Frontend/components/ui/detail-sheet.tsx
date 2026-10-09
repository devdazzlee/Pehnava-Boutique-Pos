"use client";

/**
 * DetailSheet — the standard surface for *viewing a record* (customer, supplier,
 * sale, product, order…).
 *
 * Why this instead of <Dialog>:
 *  - A centred modal with a black scrim hides the list the user came from, forces
 *    a re-orient every time it opens, and can't hold tabs + tables without
 *    becoming a scroll-trap. Every serious POS (Square, Shopify, Lightspeed)
 *    uses a right-docked detail panel instead.
 *  - Light scrim (`bg-black/20`) — the list stays readable behind it, so the
 *    cashier keeps their place.
 *  - Full height, fixed width, sticky header + footer, single scroll region for
 *    the body. Tabs live in the header and never scroll away.
 *
 * Keep <Dialog>/<AlertDialog> ONLY for: destructive confirms, and short
 * single-purpose forms (≤ ~6 fields, no tabs, no tables).
 */

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

type Size = "md" | "lg" | "xl";

const SIZE: Record<Size, string> = {
  md: "sm:max-w-[440px]",
  lg: "sm:max-w-[560px]",
  xl: "sm:max-w-[720px]",
};

interface DetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  size?: Size;
  children: React.ReactNode;
}

export function DetailSheet({ open, onOpenChange, size = "lg", children }: DetailSheetProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/20 backdrop-blur-[1px]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden bg-background shadow-2xl",
            "border-l outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
            "data-[state=open]:duration-300 data-[state=closed]:duration-200",
            SIZE[size],
          )}
        >
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Sticky header. Put the title row + optional tab strip here. */
export function DetailSheetHeader({
  title,
  subtitle,
  icon,
  actions,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  /** Tab strip or filter row, rendered under the title and still sticky. */
  children?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 shrink-0 border-b bg-background">
      <div className="flex items-start gap-3 px-5 pb-3 pt-4">
        {icon ? (
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <DialogPrimitive.Title className="truncate text-base font-semibold leading-tight">
            {title}
          </DialogPrimitive.Title>
          {subtitle ? (
            <DialogPrimitive.Description className="mt-0.5 truncate text-sm text-muted-foreground">
              {subtitle}
            </DialogPrimitive.Description>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {actions}
          <DialogPrimitive.Close
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        </div>
      </div>
      {children ? <div className="px-5">{children}</div> : null}
    </div>
  );
}

/** The single scrollable region. Everything dense goes here. */
export function DetailSheetBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", className)}>{children}</div>
  );
}

/** Sticky footer for the primary actions (Edit, Record payment, …). */
export function DetailSheetFooter({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "z-10 shrink-0 border-t bg-background px-5 py-3",
        "flex w-full min-w-0 max-w-full flex-wrap items-center justify-end gap-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

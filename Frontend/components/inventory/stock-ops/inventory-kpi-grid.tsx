"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface KpiItem {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  tone?: "default" | "warning" | "danger" | "success";
  hint?: string;
  onClick?: () => void;
}

function toneClass(tone: KpiItem["tone"]) {
  switch (tone) {
    case "warning":
      return "border-amber-200 bg-amber-50/40";
    case "danger":
      return "border-red-200 bg-red-50/40";
    case "success":
      return "border-green-200 bg-green-50/40";
    default:
      return "border-gray-200 bg-white";
  }
}

export function InventoryKpiGrid({
  items,
  loading,
  columns = 3,
}: {
  items: KpiItem[];
  loading?: boolean;
  columns?: 2 | 3 | 4 | 5 | 6;
}) {
  const gridClass =
    columns === 6
      ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
      : columns === 5
        ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5"
        : columns === 4
          ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
          : columns === 2
            ? "grid-cols-1 sm:grid-cols-2"
            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className={cn("grid gap-3", gridClass)}>
      {items.map((item) => {
        const Icon = item.icon;
        const className = cn(
          "p-3.5 border shadow-sm text-left transition-colors",
          toneClass(item.tone),
          item.onClick && "hover:border-blue-300 cursor-pointer",
        );

        const body = (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium text-gray-600">{item.label}</p>
              {Icon ? <Icon className="h-3.5 w-3.5 text-gray-400 shrink-0" /> : null}
            </div>
            {loading ? (
              <div className="h-7 w-20 bg-gray-100 animate-pulse rounded mt-1.5" />
            ) : (
              <p className="text-xl font-semibold text-gray-900 mt-1 tabular-nums leading-tight">
                {item.value}
              </p>
            )}
            {item.hint ? (
              <p className="text-[10px] text-gray-500 mt-1 truncate">{item.hint}</p>
            ) : null}
          </>
        );

        if (item.onClick) {
          return (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              className={cn(className, "rounded-xl")}
            >
              {body}
            </button>
          );
        }

        return (
          <Card key={item.label} className={cn(className, "rounded-xl")}>
            {body}
          </Card>
        );
      })}
    </div>
  );
}

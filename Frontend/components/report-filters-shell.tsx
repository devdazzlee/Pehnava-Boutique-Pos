"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function CompactReportFilters({
  summary,
  primary,
  advanced,
  actions,
  defaultOpen = false,
}: {
  summary?: string;
  primary: ReactNode;
  advanced?: ReactNode;
  actions?: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setOpen((value) => !value)}
          >
            <Filter className="mr-1.5 h-3.5 w-3.5" />
            Filters
            <ChevronDown className={cn("ml-1.5 h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          </Button>
          {summary ? <p className="min-w-0 flex-1 truncate text-xs text-gray-500">{summary}</p> : null}
          <div className="ml-auto flex flex-wrap gap-2">{actions}</div>
        </div>

        {open ? (
          <div className="space-y-2 border-t border-gray-100 pt-2">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4 [&_label]:text-xs [&_button]:h-9">
              {primary}
            </div>
            {advanced ? (
              <div className="grid gap-2 border-t border-dashed border-gray-100 pt-2 sm:grid-cols-2 xl:grid-cols-4 [&_label]:text-xs [&_button]:h-9">
                {advanced}
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

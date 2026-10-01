"use client";

import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ymd } from "@/lib/business-timezone";

interface DatePickerProps {
  date?: Date;
  onDateChange?: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/** Optional Shadcn calendar (kept for rare Date-object callers). Prefer DateField / YmdDatePicker. */
export function DatePicker({
  date,
  onDateChange,
  placeholder = "Pick a date",
  disabled,
  className,
}: DatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-10 w-full justify-start text-left font-normal",
            !date && "text-muted-foreground",
            className,
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {date ? format(date, "dd MMM yyyy") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={date} onSelect={onDateChange} initialFocus />
      </PopoverContent>
    </Popover>
  );
}

/** Native HTML date input bound to a `YYYY-MM-DD` string. */
export function YmdDatePicker({
  value,
  onChange,
  disabled,
  className,
  id,
  min,
  max,
}: {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  min?: string;
  max?: string;
}) {
  return (
    <Input
      id={id}
      type="date"
      value={value || ""}
      min={min}
      max={max}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={cn("h-10", className)}
    />
  );
}

/** Labeled native HTML date field (`YYYY-MM-DD`). */
export function DateField({
  label,
  value,
  onChange,
  disabled,
  className,
  triggerClassName,
  min,
  max,
}: {
  label?: string;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  min?: string;
  max?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {label ? <Label className="leading-none">{label}</Label> : null}
      <YmdDatePicker
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={triggerClassName}
        min={min}
        max={max}
      />
    </div>
  );
}

/** Helper if a caller still has a `Date` and needs YYYY-MM-DD. */
export function dateToYmd(date?: Date | null) {
  return date ? ymd(date) : "";
}

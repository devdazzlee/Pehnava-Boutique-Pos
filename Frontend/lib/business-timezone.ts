/**
 * Business calendar helpers for the frontend.
 * Must stay aligned with Backend `src/utils/timezone.ts` (default Asia/Karachi).
 */
export const BUSINESS_TIMEZONE =
  process.env.NEXT_PUBLIC_BUSINESS_TIMEZONE || "Asia/Karachi";

export function toBusinessYmd(date: Date = new Date(), timeZone = BUSINESS_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function businessTodayYmd(timeZone = BUSINESS_TIMEZONE): string {
  return toBusinessYmd(new Date(), timeZone);
}

export function shiftBusinessYmd(ymd: string, days: number, timeZone = BUSINESS_TIMEZONE): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return toBusinessYmd(shifted, timeZone);
}

/** Monday-start week in the business timezone (YYYY-MM-DD of that Monday). */
export function startOfBusinessWeekYmd(ymd = businessTodayYmd(), timeZone = BUSINESS_TIMEZONE): string {
  const [year, month, day] = ymd.split("-").map(Number);
  // Noon UTC avoids DST edge cases when reading weekday in the business zone.
  const noon = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const weekdayName = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(noon);
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const offset = map[weekdayName] ?? 0;
  return shiftBusinessYmd(ymd, -offset, timeZone);
}

export function startOfBusinessMonthYmd(ymd = businessTodayYmd()): string {
  const [year, month] = ymd.split("-").map(Number);
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function startOfBusinessYearYmd(ymd = businessTodayYmd()): string {
  const [year] = ymd.split("-").map(Number);
  return `${year}-01-01`;
}

export type DatePreset =
  | "all"
  | "today"
  | "yesterday"
  | "thisWeek"
  | "lastWeek"
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "last7"
  | "last30"
  | "last90"
  | "custom";

/** Far-back start used when the user picks “All dates” (keeps APIs that require from/to happy). */
export const ALL_DATES_FROM = "2000-01-01";

export function rangeForPreset(preset: Exclude<DatePreset, "custom">): { from: string; to: string } {
  const today = businessTodayYmd();

  if (preset === "all") return { from: ALL_DATES_FROM, to: today };
  if (preset === "today") return { from: today, to: today };
  if (preset === "yesterday") {
    const day = shiftBusinessYmd(today, -1);
    return { from: day, to: day };
  }
  if (preset === "thisWeek") return { from: startOfBusinessWeekYmd(today), to: today };
  if (preset === "lastWeek") {
    const thisMonday = startOfBusinessWeekYmd(today);
    const end = shiftBusinessYmd(thisMonday, -1);
    const start = shiftBusinessYmd(end, -6);
    return { from: start, to: end };
  }
  if (preset === "thisMonth") return { from: startOfBusinessMonthYmd(today), to: today };
  if (preset === "lastMonth") {
    const thisMonthStart = startOfBusinessMonthYmd(today);
    const end = shiftBusinessYmd(thisMonthStart, -1);
    const endParts = end.split("-").map(Number);
    const start = `${endParts[0]}-${String(endParts[1]).padStart(2, "0")}-01`;
    return { from: start, to: end };
  }
  if (preset === "thisYear") return { from: startOfBusinessYearYmd(today), to: today };
  if (preset === "last7") return { from: shiftBusinessYmd(today, -6), to: today };
  if (preset === "last90") return { from: shiftBusinessYmd(today, -89), to: today };
  return { from: shiftBusinessYmd(today, -29), to: today };
}

/** Alias kept for existing report components that used a local `ymd()`. */
export const ymd = toBusinessYmd;

function businessDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  let hour = get("hour");
  if (hour === "24") hour = "00";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour,
    minute: get("minute"),
    second: get("second"),
  };
}

/** Display sale timestamps in shop timezone (matches old POS calendar day). */
export function formatBusinessDateTime(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "—";
  const p = businessDateParts(date);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mon = monthNames[Math.max(0, Math.min(11, Number(p.month) - 1))];
  const h = Number(p.hour);
  const h12 = h % 12 || 12;
  const ampm = h < 12 ? "AM" : "PM";
  return `${mon} ${p.day}, ${p.year} · ${String(h12).padStart(2, "0")}:${p.minute} ${ampm}`;
}

export function formatBusinessDate(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "—";
  const p = businessDateParts(date);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mon = monthNames[Math.max(0, Math.min(11, Number(p.month) - 1))];
  return `${mon} ${p.day}, ${p.year}`;
}

export function formatBusinessYmdHms(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "";
  const p = businessDateParts(date);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

export function formatBusinessYmdHm(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "";
  const p = businessDateParts(date);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

export function formatBusinessDateTimeLong(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/** dd/mm/yyyy hh:mm:ss in shop timezone (legacy old POS expense list style). */
export function formatLegacyPosDateTime(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "—";
  const p = businessDateParts(date);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

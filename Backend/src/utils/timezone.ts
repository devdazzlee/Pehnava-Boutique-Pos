import { AppError } from './apiError';

/**
 * Single source of truth for calendar-day boundaries in this POS.
 *
 * Production servers often run in UTC / US timezones. Business days must still
 * follow Pakistan wall-clock (or BUSINESS_TIMEZONE) so "today" reports match
 * shop hours.
 */
export const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || 'Asia/Karachi';

export const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function isYmd(value: string | null | undefined): boolean {
  return !!value && YMD_REGEX.test(value);
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  let hour = get('hour');
  if (hour === 24) hour = 0;

  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return asUtc - date.getTime();
}

/** Wall-clock local time in `timeZone` → UTC Date. */
export function zonedLocalToUtc(
  ymd: string,
  hour: number,
  minute = 0,
  second = 0,
  ms = 0,
  timeZone: string = BUSINESS_TIMEZONE,
): Date {
  if (!isYmd(ymd)) {
    throw new AppError(400, 'Use dates in YYYY-MM-DD format');
  }
  const [year, month, day] = ymd.split('-').map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms));
  const offsetMs = getTimeZoneOffsetMs(utcGuess, timeZone);
  let adjusted = new Date(utcGuess.getTime() - offsetMs);
  const offset2 = getTimeZoneOffsetMs(adjusted, timeZone);
  if (offset2 !== offsetMs) {
    adjusted = new Date(utcGuess.getTime() - offset2);
  }
  return adjusted;
}

/** Today's YYYY-MM-DD in the business timezone. */
export function businessTodayYmd(timeZone: string = BUSINESS_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Format any instant as YYYY-MM-DD in the business timezone. */
export function toBusinessYmd(date: Date, timeZone: string = BUSINESS_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Shift a YYYY-MM-DD by N calendar days (business calendar). */
export function shiftBusinessYmd(ymd: string, days: number, timeZone: string = BUSINESS_TIMEZONE): string {
  if (!isYmd(ymd)) throw new AppError(400, 'Use dates in YYYY-MM-DD format');
  const [year, month, day] = ymd.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return toBusinessYmd(shifted, timeZone);
}

/** Inclusive calendar-day range in the business timezone. */
export function businessDayRange(
  from: string,
  to: string,
  timeZone: string = BUSINESS_TIMEZONE,
): { start: Date; end: Date } {
  const start = zonedLocalToUtc(from, 0, 0, 0, 0, timeZone);
  const end = zonedLocalToUtc(to, 23, 59, 59, 999, timeZone);
  if (end < start) {
    throw new AppError(400, 'To Date cannot be earlier than From Date');
  }
  return { start, end };
}

/** Canonical helper used by reports — validates YYYY-MM-DD then returns UTC bounds. */
export function localRange(from: string, to: string): { start: Date; end: Date } {
  if (!isYmd(from) || !isYmd(to)) {
    throw new AppError(400, 'Use dates in YYYY-MM-DD format');
  }
  return businessDayRange(from, to);
}

/** Today's inclusive business-day window. */
export function businessTodayRange(timeZone: string = BUSINESS_TIMEZONE): { start: Date; end: Date } {
  const today = businessTodayYmd(timeZone);
  return businessDayRange(today, today, timeZone);
}

/** Start of the current business calendar month (1st 00:00 business TZ). */
export function startOfBusinessMonth(now: Date = new Date(), timeZone: string = BUSINESS_TIMEZONE): Date {
  const ymd = toBusinessYmd(now, timeZone);
  const [year, month] = ymd.split('-').map(Number);
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  return zonedLocalToUtc(first, 0, 0, 0, 0, timeZone);
}

/**
 * Parse optional from/to query params into business-day UTC bounds.
 * Accepts YYYY-MM-DD (preferred) or any Date-parseable string.
 */
export function parseOptionalDateRange(
  from?: string | null,
  to?: string | null,
): { start?: Date; end?: Date } {
  const result: { start?: Date; end?: Date } = {};

  if (from?.trim()) {
    const raw = from.trim();
    if (isYmd(raw)) {
      result.start = zonedLocalToUtc(raw, 0, 0, 0, 0);
    } else {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) result.start = parsed;
    }
  }

  if (to?.trim()) {
    const raw = to.trim();
    if (isYmd(raw)) {
      result.end = zonedLocalToUtc(raw, 23, 59, 59, 999);
    } else {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        // If caller passed a date-only-ish value without time, stretch to end of that UTC day.
        if (raw.length <= 10) {
          parsed.setUTCHours(23, 59, 59, 999);
        }
        result.end = parsed;
      }
    }
  }

  if (result.start && result.end && result.end < result.start) {
    throw new AppError(400, 'To Date cannot be earlier than From Date');
  }

  return result;
}

/**
 * Parse legacy POS / CSV timestamps as wall-clock in BUSINESS_TIMEZONE → UTC.
 * Old import used `new Date("YYYY-MM-DD HH:mm:ss")` on UTC servers, which stored
 * Pakistan shop times as UTC and shifted calendar days in Sales History.
 */
export function parseBusinessDateTime(raw: string | null | undefined): Date {
  const s = String(raw ?? '').trim();
  if (!s) return new Date();

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    const ymd = `${iso[1]}-${iso[2]}-${iso[3]}`;
    return zonedLocalToUtc(
      ymd,
      Number(iso[4] ?? 0),
      Number(iso[5] ?? 0),
      Number(iso[6] ?? 0),
    );
  }

  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (dmy) {
    const ymd = `${dmy[3]}-${String(Number(dmy[2])).padStart(2, '0')}-${String(Number(dmy[1])).padStart(2, '0')}`;
    return zonedLocalToUtc(
      ymd,
      Number(dmy[4] ?? 0),
      Number(dmy[5] ?? 0),
      Number(dmy[6] ?? 0),
    );
  }

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/** Parse a single YYYY-MM-DD (or ISO) into start-of-day / end-of-day business bounds. */
export function parseYmdBound(
  value: string | undefined | null,
  bound: 'start' | 'end',
): Date | undefined {
  if (!value?.trim()) return undefined;
  const raw = value.trim();
  if (isYmd(raw)) {
    return bound === 'start'
      ? zonedLocalToUtc(raw, 0, 0, 0, 0)
      : zonedLocalToUtc(raw, 23, 59, 59, 999);
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

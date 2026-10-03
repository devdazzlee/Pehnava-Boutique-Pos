import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { businessTodayYmd, toBusinessYmd, YMD_REGEX } from '../utils/timezone';

/**
 * Closing the books: once a period is locked, nothing dated on or before the
 * lock date can be created, edited or deleted (sales, returns, expenses,
 * payments, payroll, vouchers, stock). A manager with "period.manage" can
 * reopen it; every lock and reopen is kept as history.
 */

let cache: { until: string | null; at: number } | null = null;
const TTL = 15_000;

export async function lockedThrough(): Promise<string | null> {
  if (cache && Date.now() - cache.at < TTL) return cache.until;
  const lock = await prisma.periodLock.findFirst({ where: { is_active: true }, orderBy: { lock_until: 'desc' }, select: { lock_until: true } });
  cache = { until: lock?.lock_until ?? null, at: Date.now() };
  return cache.until;
}

const ymdOf = (date: Date | string) => (typeof date === 'string' && YMD_REGEX.test(date) ? date : toBusinessYmd(new Date(date)));

/** Throws 423 when `date` falls inside a closed period. */
export async function assertPeriodOpen(date: Date | string | null | undefined, what = 'this record') {
  if (!date) return;
  const until = await lockedThrough();
  if (!until) return;
  const ymd = ymdOf(date);
  if (ymd <= until) {
    throw new AppError(423, `Books are closed up to ${until}. ${what[0].toUpperCase()}${what.slice(1)} dated ${ymd} can't be changed — ask a manager to reopen the period.`, [
      { code: 'PERIOD_LOCKED', lockedThrough: until, date: ymd },
    ]);
  }
}

export class PeriodLockService {
  async status() {
    const [active, history] = await Promise.all([
      lockedThrough(),
      prisma.periodLock.findMany({ orderBy: { created_at: 'desc' }, take: 50 }),
    ]);
    const ids = [...new Set(history.flatMap((h) => [h.locked_by, h.reopened_by]).filter((v): v is string => !!v))];
    const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } }) : [];
    const email = new Map(users.map((u) => [u.id, u.email]));
    return {
      lockedThrough: active,
      today: businessTodayYmd(),
      history: history.map((h) => ({
        id: h.id,
        lockUntil: h.lock_until,
        note: h.note,
        isActive: h.is_active,
        lockedBy: email.get(h.locked_by || '') ?? null,
        lockedAt: h.created_at,
        reopenedBy: email.get(h.reopened_by || '') ?? null,
        reopenedAt: h.reopened_at,
        reopenReason: h.reopen_reason,
      })),
    };
  }

  async lock(until: string, note: string | null | undefined, userId?: string) {
    if (!YMD_REGEX.test(until)) throw new AppError(400, 'Choose a valid date');
    if (until >= businessTodayYmd()) throw new AppError(400, 'You can only close periods that have already ended (before today)');
    const current = await lockedThrough();
    if (current && until <= current) throw new AppError(400, `Books are already closed up to ${current}`);
    const openRegisters = await prisma.cashFlow.count({ where: { status: 'OPEN', opened_at: { lte: new Date(`${until}T23:59:59.999Z`) } } });
    if (openRegisters) throw new AppError(400, 'Close every cash register from that period before closing the books');
    await prisma.periodLock.create({ data: { lock_until: until, note: note?.trim() || null, locked_by: userId ?? null } });
    cache = null;
    return this.status();
  }

  /** Reopens the latest lock; the previous lock (if any) applies again. */
  async reopen(id: string, reason: string, userId?: string) {
    if (!reason?.trim()) throw new AppError(400, 'Enter a reason for reopening');
    const lock = await prisma.periodLock.findUnique({ where: { id } });
    if (!lock || !lock.is_active) throw new AppError(404, 'This lock is not active');
    await prisma.periodLock.update({
      where: { id },
      data: { is_active: false, reopened_by: userId ?? null, reopened_at: new Date(), reopen_reason: reason.trim() },
    });
    cache = null;
    return this.status();
  }
}

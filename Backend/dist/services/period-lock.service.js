"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PeriodLockService = void 0;
exports.lockedThrough = lockedThrough;
exports.assertPeriodOpen = assertPeriodOpen;
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const timezone_1 = require("../utils/timezone");
/**
 * Closing the books: once a period is locked, nothing dated on or before the
 * lock date can be created, edited or deleted (sales, returns, expenses,
 * payments, payroll, vouchers, stock). A manager with "period.manage" can
 * reopen it; every lock and reopen is kept as history.
 */
let cache = null;
const TTL = 15_000;
async function lockedThrough() {
    if (cache && Date.now() - cache.at < TTL)
        return cache.until;
    const lock = await client_1.prisma.periodLock.findFirst({ where: { is_active: true }, orderBy: { lock_until: 'desc' }, select: { lock_until: true } });
    cache = { until: lock?.lock_until ?? null, at: Date.now() };
    return cache.until;
}
const ymdOf = (date) => (typeof date === 'string' && timezone_1.YMD_REGEX.test(date) ? date : (0, timezone_1.toBusinessYmd)(new Date(date)));
/** Throws 423 when `date` falls inside a closed period. */
async function assertPeriodOpen(date, what = 'this record') {
    if (!date)
        return;
    const until = await lockedThrough();
    if (!until)
        return;
    const ymd = ymdOf(date);
    if (ymd <= until) {
        throw new apiError_1.AppError(423, `Books are closed up to ${until}. ${what[0].toUpperCase()}${what.slice(1)} dated ${ymd} can't be changed — ask a manager to reopen the period.`, [
            { code: 'PERIOD_LOCKED', lockedThrough: until, date: ymd },
        ]);
    }
}
class PeriodLockService {
    async status() {
        const [active, history] = await Promise.all([
            lockedThrough(),
            client_1.prisma.periodLock.findMany({ orderBy: { created_at: 'desc' }, take: 50 }),
        ]);
        const ids = [...new Set(history.flatMap((h) => [h.locked_by, h.reopened_by]).filter((v) => !!v))];
        const users = ids.length ? await client_1.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } }) : [];
        const email = new Map(users.map((u) => [u.id, u.email]));
        return {
            lockedThrough: active,
            today: (0, timezone_1.businessTodayYmd)(),
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
    async lock(until, note, userId) {
        if (!timezone_1.YMD_REGEX.test(until))
            throw new apiError_1.AppError(400, 'Choose a valid date');
        if (until >= (0, timezone_1.businessTodayYmd)())
            throw new apiError_1.AppError(400, 'You can only close periods that have already ended (before today)');
        const current = await lockedThrough();
        if (current && until <= current)
            throw new apiError_1.AppError(400, `Books are already closed up to ${current}`);
        const openRegisters = await client_1.prisma.cashFlow.count({ where: { status: 'OPEN', opened_at: { lte: new Date(`${until}T23:59:59.999Z`) } } });
        if (openRegisters)
            throw new apiError_1.AppError(400, 'Close every cash register from that period before closing the books');
        await client_1.prisma.periodLock.create({ data: { lock_until: until, note: note?.trim() || null, locked_by: userId ?? null } });
        cache = null;
        return this.status();
    }
    /** Reopens the latest lock; the previous lock (if any) applies again. */
    async reopen(id, reason, userId) {
        if (!reason?.trim())
            throw new apiError_1.AppError(400, 'Enter a reason for reopening');
        const lock = await client_1.prisma.periodLock.findUnique({ where: { id } });
        if (!lock || !lock.is_active)
            throw new apiError_1.AppError(404, 'This lock is not active');
        await client_1.prisma.periodLock.update({
            where: { id },
            data: { is_active: false, reopened_by: userId ?? null, reopened_at: new Date(), reopen_reason: reason.trim() },
        });
        cache = null;
        return this.status();
    }
}
exports.PeriodLockService = PeriodLockService;
//# sourceMappingURL=period-lock.service.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromotionService = exports.PROMO_SCOPES = exports.PROMO_TYPES = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const timezone_1 = require("../utils/timezone");
/* ============================================================
 * Promotions: automatic offers and coupon codes, applied by the
 * server at checkout so the cashier can't mistype a discount.
 *   ITEM_PERCENT  – % off qualifying items
 *   ITEM_FIXED    – Rs off each qualifying unit
 *   BUY_X_GET_Y   – buy X, get Y of the cheapest qualifying items at `value`% off (100 = free)
 *   BILL_PERCENT  – % off the whole bill (min bill optional)
 *   BILL_FIXED    – Rs off the whole bill (min bill optional)
 * Non-stackable offers: the best one wins. Stackable offers add on top.
 * ============================================================ */
exports.PROMO_TYPES = ['ITEM_PERCENT', 'ITEM_FIXED', 'BUY_X_GET_Y', 'BILL_PERCENT', 'BILL_FIXED'];
exports.PROMO_SCOPES = ['ALL', 'CATEGORY', 'BRAND', 'PRODUCT', 'COLLECTION'];
const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const num = (v) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
};
const arr = (v) => (Array.isArray(v) ? v.map(String) : []);
const businessWeekday = (d = new Date()) => {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: timezone_1.BUSINESS_TIMEZONE, weekday: 'short' }).format(d);
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
};
function qualifies(p, m) {
    if (!m)
        return false;
    const ids = arr(p.scope_ids);
    switch (p.scope) {
        case 'CATEGORY':
            return ids.includes(m.category_id);
        case 'BRAND':
            return !!m.brand_id && ids.includes(m.brand_id);
        case 'PRODUCT':
            return ids.includes(m.id);
        case 'COLLECTION':
            return !!m.collection && ids.map((x) => x.toLowerCase()).includes(m.collection.trim().toLowerCase());
        default:
            return true;
    }
}
function discountFor(p, lines, meta, subtotal) {
    const value = num(p.value);
    if (p.min_bill != null && subtotal < num(p.min_bill))
        return 0;
    const eligible = lines.filter((l) => qualifies(p, meta.get(l.productId)) && l.quantity > 0 && l.price > 0);
    let amount = 0;
    switch (p.type) {
        case 'ITEM_PERCENT':
            amount = eligible.reduce((t, l) => t + (l.price * l.quantity * Math.min(100, value)) / 100, 0);
            break;
        case 'ITEM_FIXED':
            amount = eligible.reduce((t, l) => t + Math.min(l.price, value) * l.quantity, 0);
            break;
        case 'BUY_X_GET_Y': {
            const buy = Math.max(1, p.buy_qty ?? 1);
            const get = Math.max(1, p.get_qty ?? 1);
            const units = eligible.flatMap((l) => Array.from({ length: Math.floor(l.quantity) }, () => l.price)).sort((a, b) => a - b);
            const freeCount = Math.floor(units.length / (buy + get)) * get;
            const pct = value > 0 ? Math.min(100, value) : 100;
            amount = units.slice(0, freeCount).reduce((t, u) => t + (u * pct) / 100, 0);
            break;
        }
        case 'BILL_PERCENT':
            amount = (subtotal * Math.min(100, value)) / 100;
            break;
        case 'BILL_FIXED':
            amount = Math.min(subtotal, value);
            break;
    }
    if (p.max_discount != null && num(p.max_discount) > 0)
        amount = Math.min(amount, num(p.max_discount));
    return r2(Math.max(0, amount));
}
class PromotionService {
    async active(branchId, at = new Date()) {
        const rows = await client_2.prisma.promotion.findMany({
            where: { is_active: true, starts_at: { lte: at }, OR: [{ ends_at: null }, { ends_at: { gte: at } }] },
            orderBy: [{ priority: 'desc' }, { created_at: 'asc' }],
        });
        const day = businessWeekday(at);
        return rows.filter((p) => {
            const days = Array.isArray(p.days_of_week) ? p.days_of_week : [];
            if (days.length && !days.includes(day))
                return false;
            const branches = arr(p.branch_ids);
            if (branches.length && (!branchId || !branches.includes(branchId)))
                return false;
            if (p.usage_limit != null && p.used_count >= p.usage_limit)
                return false;
            return true;
        });
    }
    /** Best discount for a cart. Coupon offers apply only with their code. */
    async evaluate(params) {
        const lines = params.lines.filter((l) => l.quantity > 0);
        const subtotal = r2(lines.reduce((t, l) => t + l.price * l.quantity, 0));
        const code = params.code?.trim().toUpperCase() || null;
        if (!lines.length)
            return { discount: 0, applied: [], subtotal, codeStatus: code ? 'INVALID' : null };
        const promos = await this.active(params.branchId);
        const candidates = promos.filter((p) => !p.code || (code && p.code.toUpperCase() === code));
        let codeStatus = null;
        if (code) {
            const exists = await client_2.prisma.promotion.findFirst({ where: { code: { equals: code, mode: 'insensitive' } }, select: { id: true } });
            codeStatus = !exists ? 'INVALID' : candidates.some((p) => p.code) ? 'NOT_ELIGIBLE' : 'INVALID';
        }
        const productIds = [...new Set(lines.map((l) => l.productId))];
        const products = await client_2.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, category_id: true, brand_id: true, collection: true } });
        const meta = new Map(products.map((p) => [p.id, p]));
        const scored = candidates.map((p) => ({ p, amount: discountFor(p, lines, meta, subtotal) })).filter((x) => x.amount > 0);
        const exclusive = scored.filter((x) => !x.p.stackable).sort((a, b) => b.amount - a.amount)[0];
        const stack = scored.filter((x) => x.p.stackable);
        const chosen = [...(exclusive ? [exclusive] : []), ...stack];
        let remaining = subtotal;
        const applied = [];
        for (const c of chosen) {
            const amount = r2(Math.min(c.amount, remaining));
            if (amount <= 0)
                continue;
            remaining = r2(remaining - amount);
            applied.push({ id: c.p.id, name: c.p.name, code: c.p.code, type: c.p.type, amount });
            if (c.p.code && codeStatus)
                codeStatus = 'APPLIED';
        }
        return { discount: r2(subtotal - remaining), applied, subtotal, codeStatus };
    }
    async markUsed(applied) {
        for (const a of applied)
            await client_2.prisma.promotion.update({ where: { id: a.id }, data: { used_count: { increment: 1 } } }).catch(() => undefined);
    }
    /* ------------------------------ admin ------------------------------ */
    async list() {
        const rows = await client_2.prisma.promotion.findMany({ orderBy: [{ is_active: 'desc' }, { created_at: 'desc' }] });
        const now = new Date();
        // Sales impact: discount given through each promotion (from the bills' applied list).
        const sales = await client_2.prisma.sale.findMany({
            where: { promotion_discount: { gt: 0 }, status: { notIn: ['CANCELLED', 'PENDING'] } },
            select: { applied_promotions: true, total_amount: true },
        });
        const impact = new Map();
        for (const s of sales) {
            for (const a of (Array.isArray(s.applied_promotions) ? s.applied_promotions : [])) {
                const row = impact.get(a.id) ?? { bills: 0, discount: 0, revenue: 0 };
                row.bills += 1;
                row.discount += num(a.amount);
                row.revenue += num(s.total_amount);
                impact.set(a.id, row);
            }
        }
        return rows.map((p) => {
            const status = !p.is_active ? 'PAUSED' : p.starts_at > now ? 'SCHEDULED' : p.ends_at && p.ends_at < now ? 'ENDED' : p.usage_limit != null && p.used_count >= p.usage_limit ? 'LIMIT_REACHED' : 'LIVE';
            const i = impact.get(p.id);
            return {
                id: p.id,
                name: p.name,
                description: p.description,
                type: p.type,
                value: num(p.value),
                buyQty: p.buy_qty,
                getQty: p.get_qty,
                scope: p.scope,
                scopeIds: arr(p.scope_ids),
                minBill: p.min_bill == null ? null : num(p.min_bill),
                maxDiscount: p.max_discount == null ? null : num(p.max_discount),
                code: p.code,
                startsAt: p.starts_at,
                endsAt: p.ends_at,
                daysOfWeek: Array.isArray(p.days_of_week) ? p.days_of_week : [],
                branchIds: arr(p.branch_ids),
                usageLimit: p.usage_limit,
                usedCount: p.used_count,
                priority: p.priority,
                stackable: p.stackable,
                isActive: p.is_active,
                status,
                bills: i?.bills ?? 0,
                discountGiven: r2(i?.discount ?? 0),
                revenue: r2(i?.revenue ?? 0),
            };
        });
    }
    data(body, userId) {
        if (!body.name?.trim())
            throw new apiError_1.AppError(400, 'Give the promotion a name');
        if (!exports.PROMO_TYPES.includes(body.type))
            throw new apiError_1.AppError(400, 'Choose a promotion type');
        if (!exports.PROMO_SCOPES.includes((body.scope || 'ALL')))
            throw new apiError_1.AppError(400, 'Choose what the offer applies to');
        const value = num(body.value);
        if (body.type !== 'BUY_X_GET_Y' && value <= 0)
            throw new apiError_1.AppError(400, 'Enter the discount value');
        if ((body.type === 'ITEM_PERCENT' || body.type === 'BILL_PERCENT') && value > 100)
            throw new apiError_1.AppError(400, 'Percentage cannot be more than 100');
        if (body.type === 'BUY_X_GET_Y' && (!(Number(body.buyQty) >= 1) || !(Number(body.getQty) >= 1)))
            throw new apiError_1.AppError(400, 'Enter how many to buy and how many they get');
        if (body.scope && body.scope !== 'ALL' && !(body.scopeIds?.length))
            throw new apiError_1.AppError(400, 'Pick at least one item for this offer');
        if (body.endsAt && body.startsAt && body.endsAt < body.startsAt)
            throw new apiError_1.AppError(400, 'End date is before the start date');
        const code = body.code?.trim().toUpperCase() || null;
        if (code && !/^[A-Z0-9_-]{3,24}$/.test(code))
            throw new apiError_1.AppError(400, 'Coupon code: 3–24 letters, numbers, - or _');
        return {
            name: body.name.trim(),
            description: body.description?.trim() || null,
            type: body.type,
            value: new client_1.Prisma.Decimal(body.type === 'BUY_X_GET_Y' && value <= 0 ? 100 : value),
            buy_qty: body.type === 'BUY_X_GET_Y' ? Number(body.buyQty) : null,
            get_qty: body.type === 'BUY_X_GET_Y' ? Number(body.getQty) : null,
            scope: body.type.startsWith('BILL_') ? 'ALL' : body.scope || 'ALL',
            scope_ids: body.type.startsWith('BILL_') || !body.scopeIds?.length ? client_1.Prisma.JsonNull : body.scopeIds,
            min_bill: body.minBill ? new client_1.Prisma.Decimal(body.minBill) : null,
            max_discount: body.maxDiscount ? new client_1.Prisma.Decimal(body.maxDiscount) : null,
            code,
            starts_at: body.startsAt ? (0, timezone_1.localRange)(body.startsAt.slice(0, 10), body.startsAt.slice(0, 10)).start : new Date(),
            ends_at: body.endsAt ? (0, timezone_1.localRange)(body.endsAt.slice(0, 10), body.endsAt.slice(0, 10)).end : null,
            days_of_week: body.daysOfWeek?.length ? body.daysOfWeek : client_1.Prisma.JsonNull,
            branch_ids: body.branchIds?.length ? body.branchIds : client_1.Prisma.JsonNull,
            usage_limit: body.usageLimit ? Number(body.usageLimit) : null,
            priority: Number(body.priority) || 0,
            stackable: !!body.stackable,
            is_active: body.isActive !== false,
            created_by: userId ?? null,
        };
    }
    async assertCodeFree(code, exceptId) {
        if (!code)
            return;
        const clash = await client_2.prisma.promotion.findFirst({ where: { code: { equals: code, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { name: true } });
        if (clash)
            throw new apiError_1.AppError(400, `Code ${code.toUpperCase()} is already used by "${clash.name}"`);
    }
    async create(body, userId) {
        const data = this.data(body, userId);
        await this.assertCodeFree(data.code);
        const p = await client_2.prisma.promotion.create({ data });
        return { id: p.id };
    }
    async update(id, body) {
        const existing = await client_2.prisma.promotion.findUnique({ where: { id } });
        if (!existing)
            throw new apiError_1.AppError(404, 'Promotion not found');
        const { created_by: _ignored, ...data } = this.data(body);
        void _ignored;
        await this.assertCodeFree(data.code, id);
        await client_2.prisma.promotion.update({ where: { id }, data });
        return { id };
    }
    async setActive(id, isActive) {
        await client_2.prisma.promotion.update({ where: { id }, data: { is_active: isActive } });
        return { id, isActive };
    }
    async remove(id) {
        await client_2.prisma.promotion.delete({ where: { id } });
        return { id };
    }
}
exports.PromotionService = PromotionService;
//# sourceMappingURL=promotion.service.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoyaltyService = exports.DEFAULT_LOYALTY = void 0;
exports.loyaltySettings = loyaltySettings;
exports.tierFor = tierFor;
exports.pointsBalance = pointsBalance;
exports.pointsToEarn = pointsToEarn;
exports.redemptionValue = redemptionValue;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const timezone_1 = require("../utils/timezone");
exports.DEFAULT_LOYALTY = {
    enabled: false,
    pointsPer100: 1,
    pointValue: 1,
    minRedeem: 100,
    maxRedeemPct: 50,
    expiryMonths: 0,
    tiers: [
        { name: 'Classic', minSpend: 0, multiplier: 1 },
        { name: 'Silver', minSpend: 50000, multiplier: 1.25 },
        { name: 'Gold', minSpend: 150000, multiplier: 1.5 },
        { name: 'Platinum', minSpend: 400000, multiplier: 2 },
    ],
};
const KEY = 'loyalty';
const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const num = (v) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
};
let cache = null;
async function loyaltySettings() {
    if (cache && Date.now() - cache.at < 30_000)
        return cache.value;
    const row = await client_2.prisma.appSetting.findUnique({ where: { key: KEY } });
    const value = { ...exports.DEFAULT_LOYALTY, ...(row?.value || {}) };
    value.tiers = [...(value.tiers?.length ? value.tiers : exports.DEFAULT_LOYALTY.tiers)].sort((a, b) => a.minSpend - b.minSpend);
    cache = { value, at: Date.now() };
    return value;
}
function tierFor(settings, lifetimeSpend) {
    let tier = settings.tiers[0] ?? { name: 'Member', minSpend: 0, multiplier: 1 };
    for (const t of settings.tiers)
        if (lifetimeSpend >= t.minSpend)
            tier = t;
    const next = settings.tiers.find((t) => t.minSpend > lifetimeSpend) ?? null;
    return { tier, next, toNext: next ? r2(next.minSpend - lifetimeSpend) : 0 };
}
async function pointsBalance(customerId, db = client_2.prisma) {
    const agg = await db.loyaltyTransaction.aggregate({ where: { customer_id: customerId }, _sum: { points: true } });
    return agg._sum.points ?? 0;
}
async function lifetimeSpend(customerId) {
    const agg = await client_2.prisma.sale.aggregate({
        where: { customer_id: customerId, status: { notIn: ['CANCELLED', 'PENDING'] } },
        _sum: { total_amount: true },
    });
    return num(agg._sum.total_amount);
}
/** Points a bill earns (before it is saved). */
async function pointsToEarn(customerId, amountPaid) {
    const s = await loyaltySettings();
    if (!s.enabled || amountPaid <= 0)
        return 0;
    const { tier } = tierFor(s, await lifetimeSpend(customerId));
    return Math.floor((amountPaid / 100) * s.pointsPer100 * (tier.multiplier || 1));
}
/** Validates a redemption and returns its rupee value. */
async function redemptionValue(customerId, points, billAfterDiscounts) {
    const s = await loyaltySettings();
    if (!s.enabled)
        throw new apiError_1.AppError(400, 'The loyalty programme is switched off');
    if (!Number.isInteger(points) || points <= 0)
        throw new apiError_1.AppError(400, 'Enter whole points to redeem');
    if (points < s.minRedeem)
        throw new apiError_1.AppError(400, `At least ${s.minRedeem} points must be redeemed at a time`);
    const balance = await pointsBalance(customerId);
    if (points > balance)
        throw new apiError_1.AppError(400, `Customer only has ${balance} points`);
    const value = r2(points * s.pointValue);
    const cap = r2((billAfterDiscounts * s.maxRedeemPct) / 100);
    if (value > cap + 0.005)
        throw new apiError_1.AppError(400, `Points can pay at most ${s.maxRedeemPct}% of this bill (Rs ${cap.toLocaleString('en-PK')})`);
    return value;
}
class LoyaltyService {
    async getSettings() {
        return loyaltySettings();
    }
    async saveSettings(input, userId) {
        const current = await loyaltySettings();
        const next = { ...current, ...input };
        if (next.pointsPer100 < 0 || next.pointValue < 0)
            throw new apiError_1.AppError(400, 'Rates cannot be negative');
        if (next.maxRedeemPct < 0 || next.maxRedeemPct > 100)
            throw new apiError_1.AppError(400, 'Max redeem must be 0–100%');
        next.tiers = (next.tiers || [])
            .filter((t) => t.name?.trim())
            .map((t) => ({ name: t.name.trim(), minSpend: Math.max(0, num(t.minSpend)), multiplier: Math.max(0, num(t.multiplier) || 1) }))
            .sort((a, b) => a.minSpend - b.minSpend);
        if (!next.tiers.length)
            next.tiers = exports.DEFAULT_LOYALTY.tiers;
        await client_2.prisma.appSetting.upsert({
            where: { key: KEY },
            create: { key: KEY, value: next, updated_by: userId ?? null },
            update: { value: next, updated_by: userId ?? null },
        });
        cache = null;
        return next;
    }
    /** Programme dashboard: members, points outstanding, liability, recent activity. */
    async overview(q) {
        const s = await loyaltySettings();
        const [balances, spends, customers] = await Promise.all([
            client_2.prisma.loyaltyTransaction.groupBy({ by: ['customer_id'], _sum: { points: true }, _max: { created_at: true } }),
            client_2.prisma.sale.groupBy({
                by: ['customer_id'],
                where: { customer_id: { not: null }, status: { notIn: ['CANCELLED', 'PENDING'] } },
                _sum: { total_amount: true },
                _count: { id: true },
                _max: { sale_date: true },
            }),
            client_2.prisma.customer.findMany({
                where: q.search
                    ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { phone_number: { contains: q.search } }, { mobile_number: { contains: q.search } }] }
                    : {},
                select: { id: true, name: true, phone_number: true, mobile_number: true, email: true, created_at: true },
            }),
        ]);
        const balMap = new Map(balances.map((b) => [b.customer_id, { points: b._sum.points ?? 0, last: b._max.created_at }]));
        const spendMap = new Map(spends.map((x) => [x.customer_id, { spend: num(x._sum.total_amount), bills: x._count.id, last: x._max.sale_date }]));
        const members = customers
            .map((c) => {
            const bal = balMap.get(c.id);
            const sp = spendMap.get(c.id);
            const spend = sp?.spend ?? 0;
            const t = tierFor(s, spend);
            return {
                id: c.id,
                name: c.name || 'Unnamed customer',
                phone: c.mobile_number || c.phone_number || null,
                email: c.email,
                points: bal?.points ?? 0,
                value: r2((bal?.points ?? 0) * s.pointValue),
                lifetimeSpend: r2(spend),
                bills: sp?.bills ?? 0,
                lastVisit: sp?.last ?? null,
                tier: t.tier.name,
                nextTier: t.next?.name ?? null,
                toNextTier: t.toNext,
            };
        })
            .filter((m) => m.bills > 0 || m.points !== 0)
            .filter((m) => !q.tier || q.tier === 'all' || m.tier === q.tier)
            .sort((a, b) => b.points - a.points || b.lifetimeSpend - a.lifetimeSpend);
        const range = q.from && q.to ? (0, timezone_1.localRange)(q.from, q.to) : null;
        const periodAgg = await client_2.prisma.loyaltyTransaction.groupBy({
            by: ['type'],
            where: range ? { created_at: { gte: range.start, lte: range.end } } : {},
            _sum: { points: true, value: true },
            _count: { id: true },
        });
        const byType = Object.fromEntries(periodAgg.map((g) => [g.type, { points: g._sum.points ?? 0, value: num(g._sum.value), count: g._count.id }]));
        const outstanding = members.reduce((t, m) => t + Math.max(0, m.points), 0);
        const tierCounts = s.tiers.map((t) => ({ name: t.name, minSpend: t.minSpend, multiplier: t.multiplier, members: members.filter((m) => m.tier === t.name).length }));
        return {
            settings: s,
            summary: {
                members: members.length,
                withPoints: members.filter((m) => m.points > 0).length,
                pointsOutstanding: outstanding,
                liability: r2(outstanding * s.pointValue),
                earned: byType.EARN?.points ?? 0,
                redeemed: Math.abs(byType.REDEEM?.points ?? 0),
                redeemedValue: Math.abs(byType.REDEEM?.value ?? 0),
            },
            tiers: tierCounts,
            members,
        };
    }
    async customer(customerId) {
        const s = await loyaltySettings();
        const [balance, spend, txns] = await Promise.all([
            pointsBalance(customerId),
            lifetimeSpend(customerId),
            client_2.prisma.loyaltyTransaction.findMany({
                where: { customer_id: customerId },
                orderBy: { created_at: 'desc' },
                take: 100,
                include: { sale: { select: { id: true, sale_number: true, invoice_number: true } } },
            }),
        ]);
        const t = tierFor(s, spend);
        const maxRedeemable = s.enabled && balance >= s.minRedeem ? balance : 0;
        return {
            enabled: s.enabled,
            balance,
            value: r2(balance * s.pointValue),
            pointValue: s.pointValue,
            minRedeem: s.minRedeem,
            maxRedeemPct: s.maxRedeemPct,
            maxRedeemable,
            lifetimeSpend: r2(spend),
            tier: t.tier,
            nextTier: t.next,
            toNextTier: t.toNext,
            transactions: txns.map((x) => ({
                id: x.id,
                type: x.type,
                points: x.points,
                value: num(x.value),
                note: x.note,
                at: x.created_at,
                sale: x.sale,
            })),
        };
    }
    async adjust(customerId, body, userId) {
        if (!Number.isInteger(body.points) || body.points === 0)
            throw new apiError_1.AppError(400, 'Enter a whole number of points (use minus to deduct)');
        if (!body.note?.trim())
            throw new apiError_1.AppError(400, 'Enter a reason');
        const exists = await client_2.prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
        if (!exists)
            throw new apiError_1.AppError(404, 'Customer not found');
        if (body.points < 0) {
            const balance = await pointsBalance(customerId);
            if (balance + body.points < 0)
                throw new apiError_1.AppError(400, `Customer only has ${balance} points`);
        }
        const s = await loyaltySettings();
        await client_2.prisma.loyaltyTransaction.create({
            data: { customer_id: customerId, type: 'ADJUST', points: body.points, value: new client_1.Prisma.Decimal(r2(body.points * s.pointValue)), note: body.note.trim(), created_by: userId ?? null },
        });
        return this.customer(customerId);
    }
    /** Undo the points of a voided bill. */
    async reverseForSale(saleId, userId) {
        const txns = await client_2.prisma.loyaltyTransaction.findMany({ where: { sale_id: saleId, type: { in: ['EARN', 'REDEEM'] } } });
        if (!txns.length)
            return;
        await client_2.prisma.loyaltyTransaction.createMany({
            data: txns.map((t) => ({
                customer_id: t.customer_id,
                sale_id: saleId,
                type: 'REVERSE',
                points: -t.points,
                value: new client_1.Prisma.Decimal(-num(t.value)),
                note: `Bill voided (${t.type.toLowerCase()} reversed)`,
                created_by: userId ?? null,
            })),
        });
    }
    /** A return takes back the points earned on the returned value. */
    async clawbackForReturn(originalSaleId, returnSaleId, refundValue, userId) {
        if (refundValue <= 0)
            return;
        const original = await client_2.prisma.sale.findUnique({
            where: { id: originalSaleId },
            select: { customer_id: true, total_amount: true, loyalty_points_earned: true },
        });
        if (!original?.customer_id || !original.loyalty_points_earned)
            return;
        const total = num(original.total_amount);
        if (total <= 0)
            return;
        const points = Math.min(original.loyalty_points_earned, Math.round((original.loyalty_points_earned * refundValue) / total));
        if (points <= 0)
            return;
        await client_2.prisma.loyaltyTransaction.create({
            data: { customer_id: original.customer_id, sale_id: returnSaleId, type: 'ADJUST', points: -points, note: 'Points taken back for returned items', created_by: userId ?? null },
        });
    }
}
exports.LoyaltyService = LoyaltyService;
//# sourceMappingURL=loyalty.service.js.map
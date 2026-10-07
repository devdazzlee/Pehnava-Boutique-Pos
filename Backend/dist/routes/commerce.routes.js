"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taxToolsRouter = exports.promotionRouter = exports.giftCardRouter = exports.loyaltyRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_middleware_1 = require("../middleware/auth.middleware");
const permission_middleware_1 = require("../middleware/permission.middleware");
const apiResponse_1 = require("../utils/apiResponse");
const apiError_1 = require("../utils/apiError");
const client_1 = require("../prisma/client");
const loyalty_service_1 = require("../services/loyalty.service");
const gift_card_service_1 = require("../services/gift-card.service");
const promotion_service_1 = require("../services/promotion.service");
/* Loyalty, gift cards, promotions and tax set-up. */
const loyalty = new loyalty_service_1.LoyaltyService();
const giftCards = new gift_card_service_1.GiftCardService();
const promotions = new promotion_service_1.PromotionService();
const wrap = (fn, message, status = 200) => (req, res, next) => fn(req)
    .then((data) => new apiResponse_1.ApiResponse(data, message, status).send(res))
    .catch(next);
const parse = (schema, data) => {
    const r = schema.safeParse(data);
    if (!r.success)
        throw new apiError_1.AppError(400, r.error.issues[0]?.message || 'Invalid input');
    return r.data;
};
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const actor = (req) => ({ userId: req.user?.id, branchId: req.user?.branch_id ?? null });
const STAFF = ['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'CASHIER'];
const MANAGERS = ['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER'];
const ADMINS = ['SUPER_ADMIN', 'ADMIN'];
exports.loyaltyRouter = (0, express_1.Router)();
exports.giftCardRouter = (0, express_1.Router)();
exports.promotionRouter = (0, express_1.Router)();
exports.taxToolsRouter = (0, express_1.Router)();
/* ---------------- loyalty ---------------- */
exports.loyaltyRouter.use(auth_middleware_1.authenticate);
exports.loyaltyRouter.get('/settings', (0, auth_middleware_1.authorize)(STAFF), wrap(() => loyalty.getSettings(), 'Loyalty settings'));
exports.loyaltyRouter.put('/settings', (0, auth_middleware_1.authorize)(ADMINS), wrap(async (req) => {
    const b = parse(zod_1.z.object({
        enabled: zod_1.z.boolean().optional(),
        pointsPer100: zod_1.z.coerce.number().min(0).max(100).optional(),
        pointValue: zod_1.z.coerce.number().min(0).max(1000).optional(),
        minRedeem: zod_1.z.coerce.number().int().min(0).optional(),
        maxRedeemPct: zod_1.z.coerce.number().min(0).max(100).optional(),
        expiryMonths: zod_1.z.coerce.number().int().min(0).max(120).optional(),
        tiers: zod_1.z.array(zod_1.z.object({ name: zod_1.z.string().min(1).max(40), minSpend: zod_1.z.coerce.number().min(0), multiplier: zod_1.z.coerce.number().min(0).max(10) })).max(8).optional(),
    }), req.body);
    return loyalty.saveSettings(b, req.user?.id);
}, 'Loyalty settings saved'));
exports.loyaltyRouter.get('/overview', (0, auth_middleware_1.authorize)(MANAGERS), wrap((req) => loyalty.overview({ from: str(req.query.from), to: str(req.query.to), search: str(req.query.search), tier: str(req.query.tier) }), 'Loyalty overview'));
exports.loyaltyRouter.get('/customers/:id', (0, auth_middleware_1.authorize)(STAFF), wrap((req) => loyalty.customer(req.params.id), 'Customer points'));
exports.loyaltyRouter.post('/customers/:id/adjust', (0, auth_middleware_1.authorize)(MANAGERS), (0, permission_middleware_1.requirePermission)('customers.adjust'), wrap(async (req) => {
    const b = parse(zod_1.z.object({ points: zod_1.z.coerce.number().int(), note: zod_1.z.string().trim().min(3, 'Enter a reason') }), req.body);
    return loyalty.adjust(req.params.id, b, req.user?.id);
}, 'Points adjusted'));
/* ---------------- gift cards ---------------- */
const loadMethod = zod_1.z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'MOBILE_MONEY', 'COMPLIMENTARY']);
exports.giftCardRouter.use(auth_middleware_1.authenticate);
exports.giftCardRouter.get('/', (0, auth_middleware_1.authorize)(MANAGERS), wrap((req) => giftCards.list({ search: str(req.query.search), status: str(req.query.status) }), 'Gift cards'));
exports.giftCardRouter.get('/check/:code', (0, auth_middleware_1.authorize)(STAFF), wrap((req) => giftCards.check(req.params.code), 'Gift card balance'));
exports.giftCardRouter.get('/:id', (0, auth_middleware_1.authorize)(MANAGERS), wrap((req) => giftCards.get(req.params.id), 'Gift card'));
exports.giftCardRouter.post('/', (0, auth_middleware_1.authorize)(STAFF), 
// Complimentary cards are free money: they need the discount permission (or approval).
(0, permission_middleware_1.requirePermission)((req) => (req.body?.paymentMethod === 'COMPLIMENTARY' ? 'sales.discount' : null)), wrap(async (req) => {
    const b = parse(zod_1.z.object({
        amount: zod_1.z.coerce.number().positive('Enter the card value').max(1_000_000),
        paymentMethod: loadMethod,
        code: zod_1.z.string().trim().max(30).nullable().optional(),
        customerId: zod_1.z.string().uuid().nullable().optional(),
        holderName: zod_1.z.string().trim().max(80).nullable().optional(),
        holderPhone: zod_1.z.string().trim().max(30).nullable().optional(),
        expiresAt: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}/).nullable().optional(),
        notes: zod_1.z.string().trim().max(300).nullable().optional(),
    }), req.body);
    return giftCards.issue(actor(req), b);
}, 'Gift card issued', 201));
exports.giftCardRouter.post('/:id/reload', (0, auth_middleware_1.authorize)(STAFF), (0, permission_middleware_1.requirePermission)((req) => (req.body?.paymentMethod === 'COMPLIMENTARY' ? 'sales.discount' : null)), wrap(async (req) => {
    const b = parse(zod_1.z.object({ amount: zod_1.z.coerce.number().positive().max(1_000_000), paymentMethod: loadMethod, note: zod_1.z.string().trim().max(200).nullable().optional() }), req.body);
    return giftCards.reload(actor(req), req.params.id, b);
}, 'Gift card reloaded'));
exports.giftCardRouter.patch('/:id', (0, auth_middleware_1.authorize)(MANAGERS), wrap(async (req) => {
    const b = parse(zod_1.z.object({
        holderName: zod_1.z.string().trim().max(80).nullable().optional(),
        holderPhone: zod_1.z.string().trim().max(30).nullable().optional(),
        expiresAt: zod_1.z.string().nullable().optional(),
        notes: zod_1.z.string().trim().max(300).nullable().optional(),
        customerId: zod_1.z.string().uuid().nullable().optional(),
    }), req.body);
    return giftCards.update(req.params.id, b);
}, 'Gift card updated'));
exports.giftCardRouter.post('/:id/void', (0, auth_middleware_1.authorize)(MANAGERS), (0, permission_middleware_1.requirePermission)('sales.void'), wrap(async (req) => giftCards.void(actor(req), req.params.id, parse(zod_1.z.object({ reason: zod_1.z.string().trim().min(3, 'Enter a reason') }), req.body).reason), 'Gift card voided'));
/* ---------------- promotions ---------------- */
const promoSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1, 'Give the promotion a name').max(80),
    description: zod_1.z.string().trim().max(300).nullable().optional(),
    type: zod_1.z.enum(promotion_service_1.PROMO_TYPES),
    value: zod_1.z.coerce.number().min(0).optional(),
    buyQty: zod_1.z.coerce.number().int().min(1).nullable().optional(),
    getQty: zod_1.z.coerce.number().int().min(1).nullable().optional(),
    scope: zod_1.z.enum(promotion_service_1.PROMO_SCOPES).optional(),
    scopeIds: zod_1.z.array(zod_1.z.string().min(1)).max(500).optional(),
    minBill: zod_1.z.coerce.number().min(0).nullable().optional(),
    maxDiscount: zod_1.z.coerce.number().min(0).nullable().optional(),
    code: zod_1.z.string().trim().max(24).nullable().optional(),
    startsAt: zod_1.z.string().nullable().optional(),
    endsAt: zod_1.z.string().nullable().optional(),
    daysOfWeek: zod_1.z.array(zod_1.z.number().int().min(0).max(6)).max(7).optional(),
    branchIds: zod_1.z.array(zod_1.z.string().uuid()).optional(),
    usageLimit: zod_1.z.coerce.number().int().min(1).nullable().optional(),
    priority: zod_1.z.coerce.number().int().optional(),
    stackable: zod_1.z.boolean().optional(),
    isActive: zod_1.z.boolean().optional(),
});
exports.promotionRouter.use(auth_middleware_1.authenticate);
exports.promotionRouter.get('/', (0, auth_middleware_1.authorize)(MANAGERS), wrap(() => promotions.list(), 'Promotions'));
exports.promotionRouter.get('/active', (0, auth_middleware_1.authorize)(STAFF), wrap(async (req) => {
    const rows = await promotions.active(str(req.query.branchId) || req.user?.branch_id);
    return rows.filter((p) => !p.code).map((p) => ({ id: p.id, name: p.name, type: p.type, value: Number(p.value), description: p.description, endsAt: p.ends_at }));
}, 'Active promotions'));
exports.promotionRouter.post('/preview', (0, auth_middleware_1.authorize)(STAFF), wrap(async (req) => {
    const b = parse(zod_1.z.object({
        items: zod_1.z.array(zod_1.z.object({ productId: zod_1.z.string().min(1), quantity: zod_1.z.coerce.number(), price: zod_1.z.coerce.number() })).max(500),
        code: zod_1.z.string().trim().max(24).nullable().optional(),
        branchId: zod_1.z.string().uuid().nullable().optional(),
    }), req.body);
    return promotions.evaluate({ lines: b.items, branchId: b.branchId || req.user?.branch_id, code: b.code });
}, 'Promotion preview'));
exports.promotionRouter.post('/', (0, auth_middleware_1.authorize)(MANAGERS), wrap((req) => promotions.create(parse(promoSchema, req.body), req.user?.id), 'Promotion created', 201));
exports.promotionRouter.patch('/:id', (0, auth_middleware_1.authorize)(MANAGERS), wrap((req) => promotions.update(req.params.id, parse(promoSchema, req.body)), 'Promotion updated'));
exports.promotionRouter.post('/:id/active', (0, auth_middleware_1.authorize)(MANAGERS), wrap((req) => promotions.setActive(req.params.id, parse(zod_1.z.object({ isActive: zod_1.z.boolean() }), req.body).isActive), 'Promotion updated'));
exports.promotionRouter.delete('/:id', (0, auth_middleware_1.authorize)(MANAGERS), wrap((req) => promotions.remove(req.params.id), 'Promotion deleted'));
/* ---------------- tax set-up helpers ---------------- */
exports.taxToolsRouter.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(ADMINS));
exports.taxToolsRouter.get('/summary', wrap(async () => {
    const [taxes, counts, untaxed, categories] = await Promise.all([
        client_1.prisma.tax.findMany({ orderBy: { percentage: 'asc' } }),
        client_1.prisma.product.groupBy({ by: ['tax_id'], where: { is_active: true }, _count: { id: true } }),
        client_1.prisma.product.count({ where: { is_active: true, tax_id: null } }),
        client_1.prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    const countBy = new Map(counts.map((c) => [c.tax_id, c._count.id]));
    return {
        taxes: taxes.map((t) => ({ id: t.id, code: t.code, name: t.name, percentage: t.percentage, isActive: t.is_active, displayOnPos: t.display_on_pos, products: countBy.get(t.id) ?? 0 })),
        untaxedProducts: untaxed,
        categories,
    };
}, 'Tax summary'));
exports.taxToolsRouter.post('/assign', wrap(async (req) => {
    const b = parse(zod_1.z.object({ taxId: zod_1.z.string().uuid().nullable(), categoryId: zod_1.z.string().uuid().optional(), onlyUntaxed: zod_1.z.boolean().optional() }), req.body);
    if (b.taxId && !(await client_1.prisma.tax.findUnique({ where: { id: b.taxId }, select: { id: true } })))
        throw new apiError_1.AppError(400, 'Tax not found');
    const r = await client_1.prisma.product.updateMany({
        where: { ...(b.categoryId ? { category_id: b.categoryId } : {}), ...(b.onlyUntaxed ? { tax_id: null } : {}) },
        data: { tax_id: b.taxId },
    });
    return { updated: r.count };
}, 'Tax applied to products'));
//# sourceMappingURL=commerce.routes.js.map
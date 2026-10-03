import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/permission.middleware';
import { ApiResponse } from '../utils/apiResponse';
import { AppError } from '../utils/apiError';
import { prisma } from '../prisma/client';
import { LoyaltyService } from '../services/loyalty.service';
import { GiftCardService } from '../services/gift-card.service';
import { PromotionService, PROMO_SCOPES, PROMO_TYPES } from '../services/promotion.service';

/* Loyalty, gift cards, promotions and tax set-up. */

const loyalty = new LoyaltyService();
const giftCards = new GiftCardService();
const promotions = new PromotionService();

const wrap = (fn: (req: Request) => Promise<unknown>, message: string, status = 200) => (req: Request, res: Response, next: NextFunction) =>
  fn(req)
    .then((data) => new ApiResponse(data, message, status).send(res))
    .catch(next);

const parse = <T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> => {
  const r = schema.safeParse(data);
  if (!r.success) throw new AppError(400, r.error.issues[0]?.message || 'Invalid input');
  return r.data;
};
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const actor = (req: Request) => ({ userId: req.user?.id, branchId: req.user?.branch_id ?? null });

const STAFF = ['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'CASHIER'];
const MANAGERS = ['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER'];
const ADMINS = ['SUPER_ADMIN', 'ADMIN'];

export const loyaltyRouter = Router();
export const giftCardRouter = Router();
export const promotionRouter = Router();
export const taxToolsRouter = Router();

/* ---------------- loyalty ---------------- */
loyaltyRouter.use(authenticate);
loyaltyRouter.get('/settings', authorize(STAFF), wrap(() => loyalty.getSettings(), 'Loyalty settings'));
loyaltyRouter.put(
  '/settings',
  authorize(ADMINS),
  wrap(async (req) => {
    const b = parse(
      z.object({
        enabled: z.boolean().optional(),
        pointsPer100: z.coerce.number().min(0).max(100).optional(),
        pointValue: z.coerce.number().min(0).max(1000).optional(),
        minRedeem: z.coerce.number().int().min(0).optional(),
        maxRedeemPct: z.coerce.number().min(0).max(100).optional(),
        expiryMonths: z.coerce.number().int().min(0).max(120).optional(),
        tiers: z.array(z.object({ name: z.string().min(1).max(40), minSpend: z.coerce.number().min(0), multiplier: z.coerce.number().min(0).max(10) })).max(8).optional(),
      }),
      req.body,
    );
    return loyalty.saveSettings(b, req.user?.id);
  }, 'Loyalty settings saved'),
);
loyaltyRouter.get(
  '/overview',
  authorize(MANAGERS),
  wrap((req) => loyalty.overview({ from: str(req.query.from), to: str(req.query.to), search: str(req.query.search), tier: str(req.query.tier) }), 'Loyalty overview'),
);
loyaltyRouter.get('/customers/:id', authorize(STAFF), wrap((req) => loyalty.customer(req.params.id), 'Customer points'));
loyaltyRouter.post(
  '/customers/:id/adjust',
  authorize(MANAGERS),
  requirePermission('customers.adjust'),
  wrap(async (req) => {
    const b = parse(z.object({ points: z.coerce.number().int(), note: z.string().trim().min(3, 'Enter a reason') }), req.body);
    return loyalty.adjust(req.params.id, b, req.user?.id);
  }, 'Points adjusted'),
);

/* ---------------- gift cards ---------------- */
const loadMethod = z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'MOBILE_MONEY', 'COMPLIMENTARY']);
giftCardRouter.use(authenticate);
giftCardRouter.get('/', authorize(MANAGERS), wrap((req) => giftCards.list({ search: str(req.query.search), status: str(req.query.status) }), 'Gift cards'));
giftCardRouter.get('/check/:code', authorize(STAFF), wrap((req) => giftCards.check(req.params.code), 'Gift card balance'));
giftCardRouter.get('/:id', authorize(MANAGERS), wrap((req) => giftCards.get(req.params.id), 'Gift card'));
giftCardRouter.post(
  '/',
  authorize(STAFF),
  // Complimentary cards are free money: they need the discount permission (or approval).
  requirePermission((req) => (req.body?.paymentMethod === 'COMPLIMENTARY' ? 'sales.discount' : null)),
  wrap(async (req) => {
    const b = parse(
      z.object({
        amount: z.coerce.number().positive('Enter the card value').max(1_000_000),
        paymentMethod: loadMethod,
        code: z.string().trim().max(30).nullable().optional(),
        customerId: z.string().uuid().nullable().optional(),
        holderName: z.string().trim().max(80).nullable().optional(),
        holderPhone: z.string().trim().max(30).nullable().optional(),
        expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}/).nullable().optional(),
        notes: z.string().trim().max(300).nullable().optional(),
      }),
      req.body,
    );
    return giftCards.issue(actor(req), b);
  }, 'Gift card issued', 201),
);
giftCardRouter.post(
  '/:id/reload',
  authorize(STAFF),
  requirePermission((req) => (req.body?.paymentMethod === 'COMPLIMENTARY' ? 'sales.discount' : null)),
  wrap(async (req) => {
    const b = parse(z.object({ amount: z.coerce.number().positive().max(1_000_000), paymentMethod: loadMethod, note: z.string().trim().max(200).nullable().optional() }), req.body);
    return giftCards.reload(actor(req), req.params.id, b);
  }, 'Gift card reloaded'),
);
giftCardRouter.patch(
  '/:id',
  authorize(MANAGERS),
  wrap(async (req) => {
    const b = parse(
      z.object({
        holderName: z.string().trim().max(80).nullable().optional(),
        holderPhone: z.string().trim().max(30).nullable().optional(),
        expiresAt: z.string().nullable().optional(),
        notes: z.string().trim().max(300).nullable().optional(),
        customerId: z.string().uuid().nullable().optional(),
      }),
      req.body,
    );
    return giftCards.update(req.params.id, b);
  }, 'Gift card updated'),
);
giftCardRouter.post(
  '/:id/void',
  authorize(MANAGERS),
  requirePermission('sales.void'),
  wrap(async (req) => giftCards.void(actor(req), req.params.id, parse(z.object({ reason: z.string().trim().min(3, 'Enter a reason') }), req.body).reason), 'Gift card voided'),
);

/* ---------------- promotions ---------------- */
const promoSchema = z.object({
  name: z.string().trim().min(1, 'Give the promotion a name').max(80),
  description: z.string().trim().max(300).nullable().optional(),
  type: z.enum(PROMO_TYPES),
  value: z.coerce.number().min(0).optional(),
  buyQty: z.coerce.number().int().min(1).nullable().optional(),
  getQty: z.coerce.number().int().min(1).nullable().optional(),
  scope: z.enum(PROMO_SCOPES).optional(),
  scopeIds: z.array(z.string().min(1)).max(500).optional(),
  minBill: z.coerce.number().min(0).nullable().optional(),
  maxDiscount: z.coerce.number().min(0).nullable().optional(),
  code: z.string().trim().max(24).nullable().optional(),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  branchIds: z.array(z.string().uuid()).optional(),
  usageLimit: z.coerce.number().int().min(1).nullable().optional(),
  priority: z.coerce.number().int().optional(),
  stackable: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
promotionRouter.use(authenticate);
promotionRouter.get('/', authorize(MANAGERS), wrap(() => promotions.list(), 'Promotions'));
promotionRouter.get(
  '/active',
  authorize(STAFF),
  wrap(async (req) => {
    const rows = await promotions.active(str(req.query.branchId) || req.user?.branch_id);
    return rows.filter((p) => !p.code).map((p) => ({ id: p.id, name: p.name, type: p.type, value: Number(p.value), description: p.description, endsAt: p.ends_at }));
  }, 'Active promotions'),
);
promotionRouter.post(
  '/preview',
  authorize(STAFF),
  wrap(async (req) => {
    const b = parse(
      z.object({
        items: z.array(z.object({ productId: z.string().min(1), quantity: z.coerce.number(), price: z.coerce.number() })).max(500),
        code: z.string().trim().max(24).nullable().optional(),
        branchId: z.string().uuid().nullable().optional(),
      }),
      req.body,
    );
    return promotions.evaluate({ lines: b.items, branchId: b.branchId || req.user?.branch_id, code: b.code });
  }, 'Promotion preview'),
);
promotionRouter.post('/', authorize(MANAGERS), wrap((req) => promotions.create(parse(promoSchema, req.body), req.user?.id), 'Promotion created', 201));
promotionRouter.patch('/:id', authorize(MANAGERS), wrap((req) => promotions.update(req.params.id, parse(promoSchema, req.body)), 'Promotion updated'));
promotionRouter.post(
  '/:id/active',
  authorize(MANAGERS),
  wrap((req) => promotions.setActive(req.params.id, parse(z.object({ isActive: z.boolean() }), req.body).isActive), 'Promotion updated'),
);
promotionRouter.delete('/:id', authorize(MANAGERS), wrap((req) => promotions.remove(req.params.id), 'Promotion deleted'));

/* ---------------- tax set-up helpers ---------------- */
taxToolsRouter.use(authenticate, authorize(ADMINS));
taxToolsRouter.get(
  '/summary',
  wrap(async () => {
    const [taxes, counts, untaxed, categories] = await Promise.all([
      prisma.tax.findMany({ orderBy: { percentage: 'asc' } }),
      prisma.product.groupBy({ by: ['tax_id'], where: { is_active: true }, _count: { id: true } }),
      prisma.product.count({ where: { is_active: true, tax_id: null } }),
      prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    const countBy = new Map(counts.map((c) => [c.tax_id, c._count.id]));
    return {
      taxes: taxes.map((t) => ({ id: t.id, code: t.code, name: t.name, percentage: t.percentage, isActive: t.is_active, displayOnPos: t.display_on_pos, products: countBy.get(t.id) ?? 0 })),
      untaxedProducts: untaxed,
      categories,
    };
  }, 'Tax summary'),
);
taxToolsRouter.post(
  '/assign',
  wrap(async (req) => {
    const b = parse(
      z.object({ taxId: z.string().uuid().nullable(), categoryId: z.string().uuid().optional(), onlyUntaxed: z.boolean().optional() }),
      req.body,
    );
    if (b.taxId && !(await prisma.tax.findUnique({ where: { id: b.taxId }, select: { id: true } }))) throw new AppError(400, 'Tax not found');
    const r = await prisma.product.updateMany({
      where: { ...(b.categoryId ? { category_id: b.categoryId } : {}), ...(b.onlyUntaxed ? { tax_id: null } : {}) },
      data: { tax_id: b.taxId },
    });
    return { updated: r.count };
  }, 'Tax applied to products'),
);

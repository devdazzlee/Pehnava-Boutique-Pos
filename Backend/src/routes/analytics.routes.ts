import { NextFunction, Request, Response, Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/permission.middleware';
import { ApiResponse } from '../utils/apiResponse';
import { AppError } from '../utils/apiError';
import { AnalyticsService, assertRange, SalesDimension } from '../services/analytics.service';

const service = new AnalyticsService();
const router = Router();

const wrap = (fn: (req: Request) => Promise<unknown>, message: string) => (req: Request, res: Response, next: NextFunction) =>
  fn(req)
    .then((data) => new ApiResponse(data, message).send(res))
    .catch(next);

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const ADMIN = new Set(['SUPER_ADMIN', 'ADMIN']);

/** Branch staff only see their own branch; admins can pick one or see all. */
const range = (req: Request) => {
  const { from, to } = assertRange(str(req.query.from), str(req.query.to));
  const branchId = ADMIN.has(req.user?.role || '') ? str(req.query.branchId) : req.user?.branch_id || undefined;
  return { from, to, branchId };
};

const DIMENSIONS: SalesDimension[] = ['category', 'subcategory', 'brand', 'color', 'size', 'collection', 'supplier', 'product'];
const financial = requirePermission('reports.financial', { approvable: false });

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']));

router.get(
  '/sales-by',
  wrap(async (req) => {
    const dim = (str(req.query.dimension) || 'category') as SalesDimension;
    if (!DIMENSIONS.includes(dim)) throw new AppError(400, `dimension must be one of ${DIMENSIONS.join(', ')}`);
    return service.salesBy(dim, range(req));
  }, 'Sales by attribute'),
);

router.get(
  '/slow-movers',
  wrap(async (req) => {
    const r = range(req);
    return service.slowMovers({ days: Number(req.query.days) || 60, branchId: r.branchId, maxSold: req.query.maxSold != null ? Number(req.query.maxSold) : undefined });
  }, 'Slow moving stock'),
);

router.get(
  '/customers',
  wrap(async (req) => service.customerSegments({ ...range(req), inactiveDays: Number(req.query.inactiveDays) || undefined }), 'Customer segments'),
);

router.get('/suppliers', financial, wrap(async (req) => service.supplierPerformance(range(req)), 'Supplier performance'));

router.get(
  '/purchase-prices',
  wrap(
    async (req) => service.purchasePriceHistory({ ...range(req), productId: str(req.query.productId), supplierId: str(req.query.supplierId), search: str(req.query.search) }),
    'Purchase price history',
  ),
);

router.get('/payables-aging', financial, wrap(async (req) => service.payablesAging({ asOf: str(req.query.asOf), supplierId: str(req.query.supplierId) }), 'Payables aging'));

router.get('/cash-flow', financial, wrap(async (req) => service.cashFlow(range(req)), 'Cash flow summary'));

router.get(
  '/book/:book',
  financial,
  wrap(async (req) => {
    const book = req.params.book;
    if (book !== 'cash' && book !== 'bank') throw new AppError(400, 'Book must be cash or bank');
    return service.book(book, { ...range(req), method: str(req.query.method) });
  }, 'Book'),
);

router.get('/tax', financial, wrap(async (req) => service.tax(range(req)), 'Tax report'));

export default router;

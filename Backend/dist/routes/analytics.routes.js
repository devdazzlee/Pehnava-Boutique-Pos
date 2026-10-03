"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const permission_middleware_1 = require("../middleware/permission.middleware");
const apiResponse_1 = require("../utils/apiResponse");
const apiError_1 = require("../utils/apiError");
const analytics_service_1 = require("../services/analytics.service");
const service = new analytics_service_1.AnalyticsService();
const router = (0, express_1.Router)();
const wrap = (fn, message) => (req, res, next) => fn(req)
    .then((data) => new apiResponse_1.ApiResponse(data, message).send(res))
    .catch(next);
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const ADMIN = new Set(['SUPER_ADMIN', 'ADMIN']);
/** Branch staff only see their own branch; admins can pick one or see all. */
const range = (req) => {
    const { from, to } = (0, analytics_service_1.assertRange)(str(req.query.from), str(req.query.to));
    const branchId = ADMIN.has(req.user?.role || '') ? str(req.query.branchId) : req.user?.branch_id || undefined;
    return { from, to, branchId };
};
const DIMENSIONS = ['category', 'subcategory', 'brand', 'color', 'size', 'collection', 'supplier', 'product'];
const financial = (0, permission_middleware_1.requirePermission)('reports.financial', { approvable: false });
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']));
router.get('/sales-by', wrap(async (req) => {
    const dim = (str(req.query.dimension) || 'category');
    if (!DIMENSIONS.includes(dim))
        throw new apiError_1.AppError(400, `dimension must be one of ${DIMENSIONS.join(', ')}`);
    return service.salesBy(dim, range(req));
}, 'Sales by attribute'));
router.get('/slow-movers', wrap(async (req) => {
    const r = range(req);
    return service.slowMovers({ days: Number(req.query.days) || 60, branchId: r.branchId, maxSold: req.query.maxSold != null ? Number(req.query.maxSold) : undefined });
}, 'Slow moving stock'));
router.get('/customers', wrap(async (req) => service.customerSegments({ ...range(req), inactiveDays: Number(req.query.inactiveDays) || undefined }), 'Customer segments'));
router.get('/suppliers', financial, wrap(async (req) => service.supplierPerformance(range(req)), 'Supplier performance'));
router.get('/purchase-prices', wrap(async (req) => service.purchasePriceHistory({ ...range(req), productId: str(req.query.productId), supplierId: str(req.query.supplierId), search: str(req.query.search) }), 'Purchase price history'));
router.get('/payables-aging', financial, wrap(async (req) => service.payablesAging({ asOf: str(req.query.asOf), supplierId: str(req.query.supplierId) }), 'Payables aging'));
router.get('/cash-flow', financial, wrap(async (req) => service.cashFlow(range(req)), 'Cash flow summary'));
router.get('/book/:book', financial, wrap(async (req) => {
    const book = req.params.book;
    if (book !== 'cash' && book !== 'bank')
        throw new apiError_1.AppError(400, 'Book must be cash or bank');
    return service.book(book, { ...range(req), method: str(req.query.method) });
}, 'Book'));
router.get('/tax', financial, wrap(async (req) => service.tax(range(req)), 'Tax report'));
exports.default = router;
//# sourceMappingURL=analytics.routes.js.map
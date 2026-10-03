"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getItemwisePurchaseReport = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const purchase_report_service_1 = require("../services/purchase-report.service");
const service = new purchase_report_service_1.PurchaseReportService();
exports.getItemwisePurchaseReport = (0, asyncHandler_1.default)(async (req, res) => {
    const report = await service.itemwise({
        from: String(req.query.from),
        to: String(req.query.to),
        mode: req.query.mode === 'item' ? 'item' : 'vendor',
        supplierId: req.query.supplierId ? String(req.query.supplierId) : undefined,
        productId: req.query.productId ? String(req.query.productId) : undefined,
        search: req.query.search ? String(req.query.search) : undefined,
        branchId: req.query.branchId ? String(req.query.branchId) : undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        all: req.query.all === 'true',
        type: req.query.type === 'PP' || req.query.type === 'PR' ? req.query.type : undefined,
        q: req.query.q ? String(req.query.q) : undefined,
        sort: ['date_desc', 'date_asc', 'amount_desc', 'qty_desc'].includes(String(req.query.sort))
            ? String(req.query.sort)
            : undefined,
        userRole: req.user?.role,
        userBranchId: req.user?.branch_id,
    });
    new apiResponse_1.ApiResponse(report, 'Item-wise purchase report generated').send(res);
});
//# sourceMappingURL=purchase-report.controller.js.map
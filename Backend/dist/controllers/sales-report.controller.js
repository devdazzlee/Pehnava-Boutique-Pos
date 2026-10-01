"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getItemwiseSalesReport = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const sales_report_service_1 = require("../services/sales-report.service");
const service = new sales_report_service_1.SalesReportService();
exports.getItemwiseSalesReport = (0, asyncHandler_1.default)(async (req, res) => {
    const report = await service.itemwise({
        from: String(req.query.from),
        to: String(req.query.to),
        mode: req.query.mode === 'item' ? 'item' : 'customer',
        customerId: req.query.customerId ? String(req.query.customerId) : undefined,
        productId: req.query.productId ? String(req.query.productId) : undefined,
        search: req.query.search ? String(req.query.search) : undefined,
        userRole: req.user?.role,
        userBranchId: req.user?.branch_id,
    });
    new apiResponse_1.ApiResponse(report, 'Item-wise sales report generated').send(res);
});
//# sourceMappingURL=sales-report.controller.js.map
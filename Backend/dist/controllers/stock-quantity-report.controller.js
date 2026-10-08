"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStockQuantityReport = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const stock_quantity_report_service_1 = require("../services/stock-quantity-report.service");
const service = new stock_quantity_report_service_1.StockQuantityReportService();
exports.getStockQuantityReport = (0, asyncHandler_1.default)(async (req, res) => {
    const type = req.query.type === 'finished' || req.query.type === 'loose' ? req.query.type : 'all';
    const report = await service.report({
        from: String(req.query.from),
        to: String(req.query.to),
        categoryId: req.query.categoryId ? String(req.query.categoryId) : undefined,
        branchId: req.query.branchId ? String(req.query.branchId) : undefined,
        type,
        activity: req.query.activity === 'moved' ? 'moved' : 'all',
        search: req.query.search ? String(req.query.search) : undefined,
        status: ['in', 'low', 'out'].includes(String(req.query.status)) ? String(req.query.status) : 'all',
        sort: ['name_asc', 'sold_desc', 'bought_desc', 'available_asc', 'available_desc', 'value_desc'].includes(String(req.query.sort))
            ? String(req.query.sort)
            : undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        all: req.query.all === 'true',
        userRole: req.user?.role,
        userBranchId: req.user?.branch_id,
    });
    new apiResponse_1.ApiResponse(report, 'Stock quantity report generated').send(res);
});
//# sourceMappingURL=stock-quantity-report.controller.js.map
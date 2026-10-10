"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logReturn = exports.listStockOut = exports.logBulkStockOut = exports.logStockOut = exports.getMonthlyStats = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const stock_out_service_1 = require("../services/stock-out.service");
const stockOutService = new stock_out_service_1.StockOutService();
exports.getMonthlyStats = (0, asyncHandler_1.default)(async (req, res) => {
    const stats = await stockOutService.getMonthlyStats(req.query.branchId);
    new apiResponse_1.ApiResponse(stats, 'Monthly stock-out stats retrieved').send(res);
});
exports.logStockOut = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await stockOutService.logStockOut({
        ...req.body,
        createdBy: req.user.id,
    });
    new apiResponse_1.ApiResponse(result, 'Stock out logged successfully').send(res);
});
exports.logBulkStockOut = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await stockOutService.logBulkStockOut({
        ...req.body,
        createdBy: req.user.id,
    });
    new apiResponse_1.ApiResponse(result, 'Bulk stock-out dispatched successfully').send(res);
});
exports.listStockOut = (0, asyncHandler_1.default)(async (req, res) => {
    const q = req.query;
    const result = await stockOutService.listStockOutMovements({
        page: q.page ? Number(q.page) : undefined,
        limit: q.limit ? Number(q.limit) : undefined,
        reason: q.reason,
        branchId: q.branchId,
        productId: q.productId,
        startDate: q.startDate ? new Date(q.startDate) : undefined,
        endDate: q.endDate ? new Date(q.endDate) : undefined,
    });
    new apiResponse_1.ApiResponse(result.data, 'Stock-out history fetched', 200, true, result.meta).send(res);
});
exports.logReturn = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await stockOutService.logReturn({
        ...req.body,
        createdBy: req.user.id,
    });
    new apiResponse_1.ApiResponse(result, 'Return logged successfully').send(res);
});
//# sourceMappingURL=stock-out.controller.js.map
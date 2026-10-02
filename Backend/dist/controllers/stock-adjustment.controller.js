"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAdjustments = exports.createAdjustmentBatch = exports.createAdjustment = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const stock_adjustment_service_1 = require("../services/stock-adjustment.service");
const adjustmentService = new stock_adjustment_service_1.StockAdjustmentService();
exports.createAdjustment = (0, asyncHandler_1.default)(async (req, res) => {
    const adjustment = await adjustmentService.createAdjustment({
        ...req.body,
        adjustedBy: req.user.id,
    });
    new apiResponse_1.ApiResponse(adjustment, 'Stock adjustment created successfully', 201).send(res);
});
exports.createAdjustmentBatch = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await adjustmentService.createBatch({
        ...req.body,
        adjustedBy: req.user.id,
    });
    new apiResponse_1.ApiResponse(result, 'Stock adjustment saved', 201).send(res);
});
exports.listAdjustments = (0, asyncHandler_1.default)(async (req, res) => {
    const query = req.query;
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;
    const result = await adjustmentService.listAdjustments({
        page: Number(query.page) || 1,
        limit: Number(query.limit) || 20,
        productId: query.productId,
        branchId: query.branchId,
        adjustmentType: query.adjustmentType,
        adjustmentCategory: query.adjustmentCategory,
        startDate,
        endDate,
        search: query.search ? String(query.search) : undefined,
    });
    new apiResponse_1.ApiResponse(result.data, 'Adjustments retrieved', 200, true, result.meta).send(res);
});
//# sourceMappingURL=stock-adjustment.controller.js.map
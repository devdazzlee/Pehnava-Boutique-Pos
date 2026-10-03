"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMonthlyStats = exports.getPurchaseById = exports.listPurchases = exports.createBulkPurchase = exports.createPurchase = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const purchase_service_1 = require("../services/purchase.service");
const purchaseService = new purchase_service_1.PurchaseService();
exports.createPurchase = (0, asyncHandler_1.default)(async (req, res) => {
    const body = req.body;
    const purchaseDate = body.purchaseDate
        ? new Date(body.purchaseDate)
        : undefined;
    const purchase = await purchaseService.createPurchase({
        ...body,
        purchaseDate,
        createdBy: req.user.id,
    });
    new apiResponse_1.ApiResponse(purchase, 'Purchase logged successfully', 201).send(res);
});
exports.createBulkPurchase = (0, asyncHandler_1.default)(async (req, res) => {
    const body = req.body;
    const purchaseDate = body.purchaseDate ? new Date(body.purchaseDate) : undefined;
    const expiryDate = body.expiryDate ? new Date(body.expiryDate) : undefined;
    const result = await purchaseService.createBulkPurchase({
        ...body,
        purchaseDate,
        expiryDate,
        createdBy: req.user.id,
    });
    new apiResponse_1.ApiResponse(result, 'Supplier bill saved successfully', 201).send(res);
});
exports.listPurchases = (0, asyncHandler_1.default)(async (req, res) => {
    const query = req.query;
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;
    const result = await purchaseService.listPurchases({
        page: Number(query.page) || 1,
        limit: Number(query.limit) || 20,
        productId: query.productId,
        supplierId: query.supplierId,
        branchId: query.branchId,
        startDate,
        endDate,
        search: query.search ? String(query.search) : undefined,
        groupBy: query.groupBy === 'bill' ? 'bill' : 'line',
    });
    new apiResponse_1.ApiResponse(result.data, 'Purchases retrieved', 200, true, result.meta).send(res);
});
exports.getPurchaseById = (0, asyncHandler_1.default)(async (req, res) => {
    const purchase = await purchaseService.getPurchaseById(req.params.id);
    new apiResponse_1.ApiResponse(purchase, 'Purchase retrieved').send(res);
});
exports.getMonthlyStats = (0, asyncHandler_1.default)(async (req, res) => {
    const stats = await purchaseService.getMonthlyStats(req.query.warehouseBranchId);
    new apiResponse_1.ApiResponse(stats, 'Monthly stats retrieved').send(res);
});
//# sourceMappingURL=purchase.controller.js.map
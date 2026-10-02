"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReports = exports.getStockByLocation = exports.getStockMovements = exports.getLowStockProducts = exports.getDashboardStats = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const inventory_service_1 = require("../services/inventory.service");
const inventoryService = new inventory_service_1.InventoryService();
exports.getDashboardStats = (0, asyncHandler_1.default)(async (req, res) => {
    // Branch managers are locked to their own branch; previously they could omit
    // branchId and read every branch's stock.
    const role = req.user?.role;
    const branchId = role === 'BRANCH_MANAGER'
        ? req.user?.branch_id || req.query.branchId
        : req.query.branchId;
    const stats = await inventoryService.getDashboardStats(role, branchId);
    new apiResponse_1.ApiResponse(stats, 'Dashboard stats retrieved').send(res);
});
exports.getLowStockProducts = (0, asyncHandler_1.default)(async (req, res) => {
    const products = await inventoryService.getLowStockProducts(req.query.branchId);
    new apiResponse_1.ApiResponse(products, 'Low stock products retrieved').send(res);
});
exports.getStockMovements = (0, asyncHandler_1.default)(async (req, res) => {
    const query = req.query;
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;
    const result = await inventoryService.getStockMovements({
        branchId: query.branchId,
        productId: query.productId,
        movementType: query.movementType,
        direction: query.direction,
        startDate,
        endDate,
        page: Number(query.page) || 1,
        limit: Number(query.limit) || 50,
        userRole: req.user?.role,
    });
    new apiResponse_1.ApiResponse(result.data, 'Stock movements retrieved', 200, true, { ...result.meta, summary: result.summary }).send(res);
});
exports.getStockByLocation = (0, asyncHandler_1.default)(async (req, res) => {
    const stocks = await inventoryService.getStockByLocation(req.query.branchId, req.user?.role);
    new apiResponse_1.ApiResponse(stocks, 'Stock by location retrieved').send(res);
});
exports.getReports = (0, asyncHandler_1.default)(async (req, res) => {
    const query = req.query;
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;
    const report = await inventoryService.getReports({
        type: query.type,
        branchId: query.branchId,
        startDate,
        endDate,
        supplierId: query.supplierId,
        productId: query.productId,
    });
    new apiResponse_1.ApiResponse(report, 'Report generated').send(res);
});
//# sourceMappingURL=inventory.controller.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTodayStockMovementsController = exports.getStockMovementsController = exports.getStockByProductBranchController = exports.getStocksController = exports.removeStockController = exports.transferStockController = exports.adjustStockController = exports.createStockController = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const stock_service_1 = require("../services/stock.service");
const stockService = new stock_service_1.StockService();
const createStockController = (0, asyncHandler_1.default)(async (req, res) => {
    console.log("User ID:", req.user?.id, req.user?.role);
    const stock = await stockService.createStock({ ...req.body, createdBy: req.user.id });
    new apiResponse_1.ApiResponse(stock, "Stock added successfully", 201).send(res);
});
exports.createStockController = createStockController;
const adjustStockController = (0, asyncHandler_1.default)(async (req, res) => {
    const stock = await stockService.adjustStock({ ...req.body, createdBy: req.user.id });
    new apiResponse_1.ApiResponse(stock, "Stock adjusted successfully").send(res);
});
exports.adjustStockController = adjustStockController;
const transferStockController = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await stockService.transferStock({ ...req.body, createdBy: req.user.id });
    new apiResponse_1.ApiResponse(result, "Stock transferred successfully").send(res);
});
exports.transferStockController = transferStockController;
const getStocksController = (0, asyncHandler_1.default)(async (req, res) => {
    const branchId = req.query.branchId;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const search = req.query.search;
    const categoryId = req.query.categoryId;
    const brandId = req.query.brandId;
    const supplierId = req.query.supplierId;
    const stockStatus = req.query.stockStatus;
    const userRole = req.user?.role;
    const result = await stockService.getStockByBranch(branchId || "", page, limit, search, userRole, categoryId, brandId, supplierId, stockStatus);
    new apiResponse_1.ApiResponse(result.data, "Stocks retrieved successfully", 200, true, result.meta).send(res);
});
exports.getStocksController = getStocksController;
// Returns the on-hand quantity of a single product at a single branch. Used
// by Stock Out / Transfer dialogs to show "Available: N" inline. Returns
// current_quantity = 0 (rather than 404) when there's no Stock row yet, so
// the client always gets a number.
const getStockByProductBranchController = (0, asyncHandler_1.default)(async (req, res) => {
    const { productId, branchId } = req.params;
    const stock = await stockService.getStockByProductBranch(productId, branchId);
    new apiResponse_1.ApiResponse(stock, "Stock retrieved").send(res);
});
exports.getStockByProductBranchController = getStockByProductBranchController;
const movementQuery = (req) => ({
    branchId: req.query.branchId || undefined,
    userRole: req.user?.role,
    page: req.query.page ? Number(req.query.page) : undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    search: req.query.search || undefined,
    categoryId: req.query.categoryId || undefined,
    movementType: req.query.movementType || undefined,
});
const getStockMovementsController = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await stockService.getStockMovements(movementQuery(req));
    new apiResponse_1.ApiResponse(result.data, "Stock movement history retrieved", 200, true, result.meta).send(res);
});
exports.getStockMovementsController = getStockMovementsController;
const getTodayStockMovementsController = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await stockService.getTodayStockMovements(movementQuery(req));
    new apiResponse_1.ApiResponse(result.data, "Today's stock movements retrieved", 200, true, result.meta).send(res);
});
exports.getTodayStockMovementsController = getTodayStockMovementsController;
const removeStockController = (0, asyncHandler_1.default)(async (req, res) => {
    const stock = await stockService.removeStock({ ...req.body, createdBy: req.user.id });
    new apiResponse_1.ApiResponse(stock, "Stock removed successfully").send(res);
});
exports.removeStockController = removeStockController;
//# sourceMappingURL=stock.controller.js.map
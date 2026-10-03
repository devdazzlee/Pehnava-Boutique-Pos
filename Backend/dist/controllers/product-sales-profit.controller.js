"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProductSalesProfit = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const product_sales_profit_service_1 = require("../services/product-sales-profit.service");
const service = new product_sales_profit_service_1.ProductSalesProfitService();
exports.getProductSalesProfit = (0, asyncHandler_1.default)(async (req, res) => {
    const report = await service.report({
        from: String(req.query.from),
        to: String(req.query.to),
        branchId: req.query.branchId ? String(req.query.branchId) : undefined,
        categoryId: req.query.categoryId ? String(req.query.categoryId) : undefined,
        productId: req.query.productId ? String(req.query.productId) : undefined,
        search: req.query.search ? String(req.query.search) : undefined,
        userRole: req.user?.role,
        userBranchId: req.user?.branch_id,
    });
    new apiResponse_1.ApiResponse(report, 'Product sales & profit report generated').send(res);
});
//# sourceMappingURL=product-sales-profit.controller.js.map
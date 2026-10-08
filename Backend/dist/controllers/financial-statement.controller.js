"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFinancialStatement = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const financial_statement_service_1 = require("../services/financial-statement.service");
const service = new financial_statement_service_1.FinancialStatementService();
const asBool = (value, fallback = true) => {
    if (value === undefined || value === null || value === '')
        return fallback;
    if (typeof value === 'boolean')
        return value;
    const text = String(value).toLowerCase();
    if (text === 'false' || text === '0')
        return false;
    if (text === 'true' || text === '1')
        return true;
    return fallback;
};
exports.getFinancialStatement = (0, asyncHandler_1.default)(async (req, res) => {
    const report = await service.statement({
        from: String(req.query.from),
        to: String(req.query.to),
        branchId: req.query.branchId ? String(req.query.branchId) : undefined,
        paymentMethod: req.query.paymentMethod ? String(req.query.paymentMethod) : undefined,
        cashierId: req.query.cashierId ? String(req.query.cashierId) : undefined,
        categoryId: req.query.categoryId ? String(req.query.categoryId) : undefined,
        saleType: req.query.saleType ? String(req.query.saleType) : undefined,
        includeSalaries: asBool(req.query.includeSalaries, true),
        includePurchases: asBool(req.query.includePurchases, true),
        comparePrevious: asBool(req.query.comparePrevious, false),
        userRole: req.user?.role,
        userBranchId: req.user?.branch_id,
    });
    new apiResponse_1.ApiResponse(report, 'Financial statement generated').send(res);
});
//# sourceMappingURL=financial-statement.controller.js.map
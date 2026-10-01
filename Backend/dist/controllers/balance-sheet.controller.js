"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBalanceSheet = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const balance_sheet_service_1 = require("../services/balance-sheet.service");
const service = new balance_sheet_service_1.BalanceSheetService();
exports.getBalanceSheet = (0, asyncHandler_1.default)(async (req, res) => {
    const report = await service.sheet({
        from: String(req.query.from),
        to: String(req.query.to),
        branchId: req.query.branchId ? String(req.query.branchId) : undefined,
        userRole: req.user?.role,
        userBranchId: req.user?.branch_id,
    });
    new apiResponse_1.ApiResponse(report, 'Balance sheet generated').send(res);
});
//# sourceMappingURL=balance-sheet.controller.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTrialBalance = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const trial_balance_service_1 = require("../services/trial-balance.service");
const service = new trial_balance_service_1.TrialBalanceService();
exports.getTrialBalance = (0, asyncHandler_1.default)(async (req, res) => {
    const report = await service.trial({
        from: String(req.query.from),
        to: String(req.query.to),
        branchId: req.query.branchId ? String(req.query.branchId) : undefined,
        userRole: req.user?.role,
        userBranchId: req.user?.branch_id,
    });
    new apiResponse_1.ApiResponse(report, 'Trial balance generated').send(res);
});
//# sourceMappingURL=trial-balance.controller.js.map
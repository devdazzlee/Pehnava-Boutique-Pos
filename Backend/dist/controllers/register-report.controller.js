"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reopenRegisterSession = exports.closeRegisterSession = exports.getRegisterReport = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const register_report_service_1 = require("../services/register-report.service");
const service = new register_report_service_1.RegisterReportService();
exports.getRegisterReport = (0, asyncHandler_1.default)(async (req, res) => {
    const report = await service.getReport({
        from: String(req.query.from),
        to: String(req.query.to),
        branchId: req.query.branchId ? String(req.query.branchId) : undefined,
        cashierId: req.query.cashierId ? String(req.query.cashierId) : undefined,
        paymentMethod: req.query.paymentMethod ? String(req.query.paymentMethod) : undefined,
        transactionType: req.query.transactionType ? String(req.query.transactionType) : undefined,
        status: req.query.status ? String(req.query.status) : undefined,
        userRole: req.user?.role,
        userBranchId: req.user?.branch_id,
    });
    new apiResponse_1.ApiResponse(report, 'Register report generated').send(res);
});
exports.closeRegisterSession = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await service.closeSession(req.body.cashflow_id, Number(req.body.closing), req.user?.id, req.user?.role);
    new apiResponse_1.ApiResponse(result, 'Register closed').send(res);
});
exports.reopenRegisterSession = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await service.reopenSession(String(req.params.id), req.user?.role);
    new apiResponse_1.ApiResponse(result, 'Register session reopened').send(res);
});
//# sourceMappingURL=register-report.controller.js.map
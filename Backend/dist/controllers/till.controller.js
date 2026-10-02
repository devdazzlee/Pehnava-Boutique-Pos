"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reopenTill = exports.closeTill = exports.voidPaidOutTill = exports.paidOutTill = exports.openTill = exports.getTillDay = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const till_service_1 = require("../services/till.service");
const service = new till_service_1.TillService();
exports.getTillDay = (0, asyncHandler_1.default)(async (req, res) => {
    const report = await service.day({
        date: req.query.date ? String(req.query.date) : undefined,
        from: req.query.from ? String(req.query.from) : undefined,
        to: req.query.to ? String(req.query.to) : undefined,
        branchId: req.query.branchId ? String(req.query.branchId) : undefined,
        userRole: req.user?.role,
        userBranchId: req.user?.branch_id,
    });
    new apiResponse_1.ApiResponse(report, 'Till day loaded').send(res);
});
exports.openTill = (0, asyncHandler_1.default)(async (req, res) => {
    const session = await service.open({
        opening: Number(req.body.opening),
        branchId: req.body.branchId,
        userRole: req.user?.role,
        userBranchId: req.user?.branch_id,
        userId: req.user?.id,
    });
    new apiResponse_1.ApiResponse(session, 'Till opened', 201).send(res);
});
exports.paidOutTill = (0, asyncHandler_1.default)(async (req, res) => {
    const expense = await service.paidOut({
        particular: String(req.body.particular),
        amount: Number(req.body.amount),
        branchId: req.body.branchId,
        userRole: req.user?.role,
        userBranchId: req.user?.branch_id,
        userId: req.user?.id,
    });
    new apiResponse_1.ApiResponse(expense, 'Paid-out recorded', 201).send(res);
});
exports.voidPaidOutTill = (0, asyncHandler_1.default)(async (req, res) => {
    const expense = await service.voidPaidOut({
        expenseId: String(req.params.id),
        reason: req.body?.reason ? String(req.body.reason) : undefined,
        userId: req.user?.id,
    });
    new apiResponse_1.ApiResponse(expense, 'Paid-out voided').send(res);
});
exports.closeTill = (0, asyncHandler_1.default)(async (req, res) => {
    const session = await service.close({
        cashflowId: String(req.body.cashflow_id),
        closing: Number(req.body.closing),
        userId: req.user?.id,
        userRole: req.user?.role,
    });
    new apiResponse_1.ApiResponse(session, 'Till closed').send(res);
});
exports.reopenTill = (0, asyncHandler_1.default)(async (req, res) => {
    const session = await service.reopen({
        cashflowId: String(req.params.id),
        userRole: req.user?.role,
    });
    new apiResponse_1.ApiResponse(session, 'Till reopened').send(res);
});
//# sourceMappingURL=till.controller.js.map
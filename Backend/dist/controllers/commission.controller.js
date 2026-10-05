"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bulkPayCommissions = exports.earnedCommissions = exports.getCommissionSales = exports.deleteCommission = exports.markCommissionUnpaid = exports.payCommission = exports.markCommissionPaid = exports.updateCommission = exports.getCommissionById = exports.generateCommissions = exports.employeePerformance = exports.listSalespeople = exports.previewCommissions = exports.listCommissions = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const commission_service_1 = require("../services/commission.service");
const service = new commission_service_1.CommissionService();
exports.listCommissions = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await service.list({
        branch_id: req.user?.branch_id || undefined,
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 20,
        employee_id: req.query.employee_id ? String(req.query.employee_id) : undefined,
        month: req.query.month ? Number(req.query.month) : undefined,
        year: req.query.year ? Number(req.query.year) : undefined,
        is_paid: req.query.is_paid === 'true' ? true : req.query.is_paid === 'false' ? false : undefined,
        search: req.query.search ? String(req.query.search) : undefined,
        fetch_all: String(req.query.fetch_all) === 'true',
    });
    new apiResponse_1.ApiResponse(result.data, 'Commissions fetched successfully', 200, true, result.meta).send(res);
});
exports.previewCommissions = (0, asyncHandler_1.default)(async (req, res) => {
    const report = await service.preview({
        from: String(req.query.from),
        to: String(req.query.to),
        employee_id: req.query.employee_id ? String(req.query.employee_id) : undefined,
        branch_id: req.query.branch_id ? String(req.query.branch_id) : undefined,
        userBranchId: req.user?.branch_id,
        userRole: req.user?.role,
    });
    new apiResponse_1.ApiResponse(report, 'Commission preview generated').send(res);
});
exports.listSalespeople = (0, asyncHandler_1.default)(async (req, res) => {
    const rows = await service.salespeople({ userRole: req.user?.role, userBranchId: req.user?.branch_id });
    new apiResponse_1.ApiResponse(rows, 'Salespeople fetched').send(res);
});
exports.employeePerformance = (0, asyncHandler_1.default)(async (req, res) => {
    const report = await service.performance({
        employeeId: req.params.employeeId,
        from: String(req.query.from),
        to: String(req.query.to),
        userRole: req.user?.role,
        userBranchId: req.user?.branch_id,
    });
    new apiResponse_1.ApiResponse(report, 'Employee sales performance').send(res);
});
exports.generateCommissions = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await service.generate(req.body, {
        branch_id: req.user?.branch_id || undefined,
    });
    new apiResponse_1.ApiResponse(result, 'Commission records generated', 201).send(res);
});
exports.getCommissionById = (0, asyncHandler_1.default)(async (req, res) => {
    const row = await service.getById(req.params.id);
    new apiResponse_1.ApiResponse(row, 'Commission fetched successfully').send(res);
});
exports.updateCommission = (0, asyncHandler_1.default)(async (req, res) => {
    const row = await service.update(req.params.id, req.body);
    new apiResponse_1.ApiResponse(row, 'Commission updated successfully').send(res);
});
exports.markCommissionPaid = (0, asyncHandler_1.default)(async (req, res) => {
    const row = await service.markPaid(req.params.id, {
        paid_date: req.body?.paid_date,
        payment_method: req.body?.payment_method,
        payment_reference: req.body?.payment_reference,
        userId: req.user?.id,
    });
    new apiResponse_1.ApiResponse(row, 'Commission marked as paid').send(res);
});
exports.payCommission = (0, asyncHandler_1.default)(async (req, res) => {
    const row = await service.pay(req.params.id, {
        amount: Number(req.body.amount),
        paid_date: req.body?.paid_date,
        payment_method: req.body?.payment_method,
        payment_reference: req.body?.payment_reference,
        userId: req.user?.id,
    });
    const msg = row.status === 'PAID'
        ? 'Commission paid in full'
        : `Partial payment recorded — Rs ${Number(row.outstanding).toLocaleString()} outstanding`;
    new apiResponse_1.ApiResponse(row, msg).send(res);
});
exports.markCommissionUnpaid = (0, asyncHandler_1.default)(async (req, res) => {
    const row = await service.markUnpaid(req.params.id);
    new apiResponse_1.ApiResponse(row, 'Commission marked as unpaid').send(res);
});
exports.deleteCommission = (0, asyncHandler_1.default)(async (req, res) => {
    await service.delete(req.params.id);
    new apiResponse_1.ApiResponse(null, 'Commission deleted successfully').send(res);
});
exports.getCommissionSales = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await service.salesForCommission(req.params.id);
    new apiResponse_1.ApiResponse(result, 'Commission sales fetched').send(res);
});
exports.earnedCommissions = (0, asyncHandler_1.default)(async (req, res) => {
    const report = await service.earned({
        from: String(req.query.from),
        to: String(req.query.to),
        employee_id: req.query.employee_id ? String(req.query.employee_id) : undefined,
        branch_id: req.query.branch_id ? String(req.query.branch_id) : undefined,
        userBranchId: req.user?.branch_id,
        userRole: req.user?.role,
    });
    new apiResponse_1.ApiResponse(report, 'Commission earned').send(res);
});
exports.bulkPayCommissions = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await service.bulkPay(req.body.ids, {
        paid_date: req.body.paid_date,
        payment_method: req.body.payment_method,
        payment_reference: req.body.payment_reference,
        userId: req.user?.id,
    });
    new apiResponse_1.ApiResponse(result, 'Commissions paid').send(res);
});
//# sourceMappingURL=commission.controller.js.map
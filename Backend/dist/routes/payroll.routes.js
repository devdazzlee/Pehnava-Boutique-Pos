"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const validation_middleware_1 = require("../middleware/validation.middleware");
const apiResponse_1 = require("../utils/apiResponse");
const employee_payroll_service_1 = require("../services/employee-payroll.service");
const service = new employee_payroll_service_1.EmployeePayrollService();
const router = (0, express_1.Router)();
const money = zod_1.z.coerce.number().min(0, 'Amount cannot be negative').max(1e10);
const month = zod_1.z.coerce.number().int().min(1).max(12);
const year = zod_1.z.coerce.number().int().min(2020).max(2100);
const ymd = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Use YYYY-MM-DD');
const id = zod_1.z.object({ id: zod_1.z.string().uuid() });
const overviewSchema = zod_1.z.object({ query: zod_1.z.object({ month, year, branchId: zod_1.z.string().uuid().optional() }) });
const generateSchema = zod_1.z.object({
    body: zod_1.z.object({ month, year, employee_ids: zod_1.z.array(zod_1.z.string().uuid()).optional() }),
});
const payslipBody = zod_1.z.object({
    employee_id: zod_1.z.string().uuid(),
    month,
    year,
    amount: money.optional(),
    bonus: money.optional(),
    allowances: money.optional(),
    deductions: money.optional(),
    advance_deduction: money.optional(),
    notes: zod_1.z.string().max(500).nullable().optional(),
});
const createPayslipSchema = zod_1.z.object({ body: payslipBody });
const updatePayslipSchema = zod_1.z.object({
    params: id,
    body: payslipBody.omit({ employee_id: true, month: true, year: true }).partial(),
});
const paySchema = zod_1.z.object({
    params: id,
    body: zod_1.z.object({
        amount: money.optional(),
        method: zod_1.z.string().max(40).optional(),
        date: ymd.optional(),
        reference: zod_1.z.string().max(120).nullable().optional(),
    }),
});
const advanceSchema = zod_1.z.object({
    body: zod_1.z.object({
        employee_id: zod_1.z.string().uuid(),
        type: zod_1.z.enum(['ADVANCE', 'RECOVERY']),
        amount: zod_1.z.coerce.number().positive('Amount must be greater than 0'),
        date: ymd.optional(),
        method: zod_1.z.string().max(40).optional(),
        reference: zod_1.z.string().max(120).nullable().optional(),
        notes: zod_1.z.string().max(500).nullable().optional(),
    }),
});
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN']));
router.get('/overview', (0, validation_middleware_1.validate)(overviewSchema), (0, asyncHandler_1.default)(async (req, res) => {
    const q = overviewSchema.shape.query.parse(req.query);
    const data = await service.overview({ ...q, userRole: req.user?.role, userBranchId: req.user?.branch_id });
    new apiResponse_1.ApiResponse(data, 'Payroll overview').send(res);
}));
router.get('/employees/:id', (0, validation_middleware_1.validate)(zod_1.z.object({ params: id })), (0, asyncHandler_1.default)(async (req, res) => {
    new apiResponse_1.ApiResponse(await service.finance(req.params.id), 'Employee finance').send(res);
}));
router.post('/generate', (0, validation_middleware_1.validate)(generateSchema), (0, asyncHandler_1.default)(async (req, res) => {
    const body = generateSchema.shape.body.parse(req.body);
    const data = await service.generate({ month: body.month, year: body.year, employeeIds: body.employee_ids });
    new apiResponse_1.ApiResponse(data, `Payroll generated: ${data.created} payslip(s)`, 201).send(res);
}));
router.post('/salaries', (0, validation_middleware_1.validate)(createPayslipSchema), (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.createPayslip(createPayslipSchema.shape.body.parse(req.body), req.user?.id);
    new apiResponse_1.ApiResponse(data, 'Payslip created', 201).send(res);
}));
router.put('/salaries/:id', (0, validation_middleware_1.validate)(updatePayslipSchema), (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.updatePayslip(req.params.id, updatePayslipSchema.shape.body.parse(req.body), req.user?.id);
    new apiResponse_1.ApiResponse(data, 'Payslip updated').send(res);
}));
router.post('/salaries/:id/pay', (0, validation_middleware_1.validate)(paySchema), (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.pay(req.params.id, paySchema.shape.body.parse(req.body));
    new apiResponse_1.ApiResponse(data, data.status === 'PAID' ? 'Salary paid in full' : 'Partial salary payment recorded').send(res);
}));
router.post('/salaries/:id/undo-payment', (0, validation_middleware_1.validate)(zod_1.z.object({ params: id })), (0, asyncHandler_1.default)(async (req, res) => {
    new apiResponse_1.ApiResponse(await service.undoPayment(req.params.id), 'Payment reversed').send(res);
}));
router.delete('/salaries/:id', (0, validation_middleware_1.validate)(zod_1.z.object({ params: id })), (0, asyncHandler_1.default)(async (req, res) => {
    new apiResponse_1.ApiResponse(await service.deletePayslip(req.params.id), 'Payslip deleted').send(res);
}));
router.post('/advances', (0, validation_middleware_1.validate)(advanceSchema), (0, asyncHandler_1.default)(async (req, res) => {
    const body = advanceSchema.shape.body.parse(req.body);
    const data = await service.addAdvance(body, req.user?.id);
    new apiResponse_1.ApiResponse(data, body.type === 'ADVANCE' ? 'Advance recorded' : 'Recovery recorded', 201).send(res);
}));
router.delete('/advances/:id', (0, validation_middleware_1.validate)(zod_1.z.object({ params: id })), (0, asyncHandler_1.default)(async (req, res) => {
    new apiResponse_1.ApiResponse(await service.deleteAdvance(req.params.id), 'Entry deleted').send(res);
}));
exports.default = router;
//# sourceMappingURL=payroll.routes.js.map
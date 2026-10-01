"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSalary = exports.markSalaryUnpaid = exports.markSalaryPaid = exports.updateSalary = exports.getSalaryById = exports.listSalaries = exports.createSalary = void 0;
const salary_service_1 = require("../services/salary.service");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const salaryService = new salary_service_1.SalaryService();
exports.createSalary = (0, asyncHandler_1.default)(async (req, res) => {
    const salary = await salaryService.createSalary(req.body);
    new apiResponse_1.ApiResponse(salary, 'Salary record created successfully', 201).send(res);
});
exports.listSalaries = (0, asyncHandler_1.default)(async (req, res) => {
    const { page = 1, limit = 20, employee_id, month, year, is_paid, search, fetch_all, paid_from, paid_to, } = req.query;
    const result = await salaryService.listSalaries({
        branch_id: req.user?.branch_id || undefined,
        page: Number(page),
        limit: Number(limit),
        employee_id: employee_id,
        month: month ? Number(month) : undefined,
        year: year ? Number(year) : undefined,
        is_paid: is_paid === 'true' ? true : is_paid === 'false' ? false : undefined,
        search: search,
        fetch_all: String(fetch_all) === 'true',
        paid_from: paid_from ? String(paid_from) : undefined,
        paid_to: paid_to ? String(paid_to) : undefined,
    });
    new apiResponse_1.ApiResponse(result.data, 'Salaries fetched successfully', 200, true, result.meta).send(res);
});
exports.getSalaryById = (0, asyncHandler_1.default)(async (req, res) => {
    const salary = await salaryService.getSalaryById(req.params.id);
    new apiResponse_1.ApiResponse(salary, 'Salary record fetched successfully').send(res);
});
exports.updateSalary = (0, asyncHandler_1.default)(async (req, res) => {
    const salary = await salaryService.updateSalary(req.params.id, req.body);
    new apiResponse_1.ApiResponse(salary, 'Salary record updated successfully').send(res);
});
exports.markSalaryPaid = (0, asyncHandler_1.default)(async (req, res) => {
    const salary = await salaryService.markPaid(req.params.id, req.body?.paid_date);
    new apiResponse_1.ApiResponse(salary, 'Salary marked as paid').send(res);
});
exports.markSalaryUnpaid = (0, asyncHandler_1.default)(async (req, res) => {
    const salary = await salaryService.markUnpaid(req.params.id);
    new apiResponse_1.ApiResponse(salary, 'Salary marked as unpaid').send(res);
});
exports.deleteSalary = (0, asyncHandler_1.default)(async (req, res) => {
    await salaryService.deleteSalary(req.params.id);
    new apiResponse_1.ApiResponse(null, 'Salary record deleted successfully').send(res);
});
//# sourceMappingURL=salary.controller.js.map
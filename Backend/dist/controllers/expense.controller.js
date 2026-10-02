"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runRecurringExpenses = exports.deleteRecurringExpense = exports.toggleRecurringExpense = exports.updateRecurringExpense = exports.createRecurringExpense = exports.listRecurringExpenses = exports.expenseReport = exports.rejectExpense = exports.approveExpense = exports.deleteExpense = exports.updateExpense = exports.createExpense = exports.getExpense = exports.listExpenses = exports.deleteExpenseCategory = exports.toggleExpenseCategory = exports.updateExpenseCategory = exports.createExpenseCategory = exports.listExpenseCategories = void 0;
const expense_service_1 = require("../services/expense.service");
const apiResponse_1 = require("../utils/apiResponse");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const resolveBranchId_1 = require("../utils/resolveBranchId");
const expenseService = new expense_service_1.ExpenseService();
const categoryService = new expense_service_1.ExpenseCategoryService();
const recurringService = new expense_service_1.RecurringExpenseService();
const bool = (v) => v === 'true' ? true : v === 'false' ? false : undefined;
/* ------------------------------ categories ------------------------------ */
exports.listExpenseCategories = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await categoryService.list({
        search: req.query.search,
        is_active: bool(req.query.is_active),
    });
    new apiResponse_1.ApiResponse(data, 'Expense categories retrieved').send(res);
});
exports.createExpenseCategory = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await categoryService.create(req.body);
    new apiResponse_1.ApiResponse(data, 'Expense category created', 201).send(res);
});
exports.updateExpenseCategory = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await categoryService.update(req.params.id, req.body);
    new apiResponse_1.ApiResponse(data, 'Expense category updated').send(res);
});
exports.toggleExpenseCategory = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await categoryService.toggle(req.params.id);
    new apiResponse_1.ApiResponse(data, 'Expense category status updated').send(res);
});
exports.deleteExpenseCategory = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await categoryService.remove(req.params.id);
    new apiResponse_1.ApiResponse(data, 'Expense category deleted').send(res);
});
/* ------------------------------- expenses ------------------------------- */
exports.listExpenses = (0, asyncHandler_1.default)(async (req, res) => {
    const scopedBranch = (0, resolveBranchId_1.resolveBranchId)(req);
    const result = await expenseService.list({
        ...req.query,
        branch_id: req.query.branch_id || scopedBranch,
    });
    new apiResponse_1.ApiResponse(result.data, 'Expenses retrieved', 200, true, result.meta).send(res);
});
exports.getExpense = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await expenseService.getById(req.params.id);
    new apiResponse_1.ApiResponse(data, 'Expense retrieved').send(res);
});
exports.createExpense = (0, asyncHandler_1.default)(async (req, res) => {
    const body = {
        ...req.body,
        branch_id: req.body.branch_id ?? (0, resolveBranchId_1.resolveBranchId)(req) ?? null,
    };
    const data = await expenseService.create(body, req.user?.id);
    new apiResponse_1.ApiResponse(data, 'Expense created', 201).send(res);
});
exports.updateExpense = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await expenseService.update(req.params.id, req.body);
    new apiResponse_1.ApiResponse(data, 'Expense updated').send(res);
});
exports.deleteExpense = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await expenseService.remove(req.params.id);
    new apiResponse_1.ApiResponse(data, 'Expense deleted').send(res);
});
exports.approveExpense = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await expenseService.approve(req.params.id, req.user.id);
    new apiResponse_1.ApiResponse(data, 'Expense approved').send(res);
});
exports.rejectExpense = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await expenseService.reject(req.params.id, req.user.id, req.body?.reason);
    new apiResponse_1.ApiResponse(data, 'Expense rejected').send(res);
});
exports.expenseReport = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await expenseService.report({
        from: req.query.from,
        to: req.query.to,
        branch_id: req.query.branch_id || (0, resolveBranchId_1.resolveBranchId)(req),
    });
    new apiResponse_1.ApiResponse(data, 'Expense report generated').send(res);
});
/* -------------------------- recurring expenses -------------------------- */
exports.listRecurringExpenses = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await recurringService.list({ is_active: bool(req.query.is_active) });
    new apiResponse_1.ApiResponse(data, 'Recurring expenses retrieved').send(res);
});
exports.createRecurringExpense = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await recurringService.create(req.body, req.user?.id);
    new apiResponse_1.ApiResponse(data, 'Recurring expense created', 201).send(res);
});
exports.updateRecurringExpense = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await recurringService.update(req.params.id, req.body);
    new apiResponse_1.ApiResponse(data, 'Recurring expense updated').send(res);
});
exports.toggleRecurringExpense = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await recurringService.toggle(req.params.id);
    new apiResponse_1.ApiResponse(data, 'Recurring expense status updated').send(res);
});
exports.deleteRecurringExpense = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await recurringService.remove(req.params.id);
    new apiResponse_1.ApiResponse(data, 'Recurring expense deleted').send(res);
});
exports.runRecurringExpenses = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await recurringService.runDue(req.user?.id);
    new apiResponse_1.ApiResponse(data, `Generated ${data.generated} expense(s) from ${data.templates} template(s)`).send(res);
});
//# sourceMappingURL=expense.controller.js.map
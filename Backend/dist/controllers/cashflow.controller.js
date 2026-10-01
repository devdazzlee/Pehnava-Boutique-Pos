"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.debugCashFlows = exports.getExpensesByDate = exports.listCashFlows = exports.addClosing = exports.addExpense = exports.createOpening = exports.getCashFlowByDate = void 0;
const cashflow_service_1 = require("../services/cashflow.service");
const apiResponse_1 = require("../utils/apiResponse");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const client_1 = require("../prisma/client");
const timezone_1 = require("../utils/timezone");
const cashFlowService = new cashflow_service_1.CashFlowService();
exports.getCashFlowByDate = (0, asyncHandler_1.default)(async (req, res) => {
    const { date } = req.query;
    const branchId = req.user?.branch_id;
    if (!branchId) {
        return res.status(400).json({ message: 'Branch not found in request.' });
    }
    console.log('getCashFlowByDate controller - received:', { date, branchId }); // Debug log
    // Let's also check what's in the database directly
    const allCashFlows = await client_1.prisma.cashFlow.findMany({
        where: { branch_id: branchId },
        orderBy: { opened_at: 'desc' },
        take: 5,
    });
    console.log('All cashflows for this branch:', allCashFlows); // Debug log
    // Check if there are any cashflows at all for this branch
    const totalCashFlows = await client_1.prisma.cashFlow.count({
        where: { branch_id: branchId },
    });
    console.log('Total cashflows for this branch:', totalCashFlows); // Debug log
    const result = await cashFlowService.getCashFlowByDate(branchId, date);
    console.log('getCashFlowByDate result:', result); // Debug log
    // Always return consistent structure
    new apiResponse_1.ApiResponse(result, 'Cashflow retrieved successfully', 200).send(res);
});
exports.createOpening = (0, asyncHandler_1.default)(async (req, res) => {
    const branchId = req.user?.branch_id;
    if (!branchId) {
        return res.status(400).json({ message: 'Branch not found in request.' });
    }
    // Check if ANY drawer was opened today (including closed ones)
    const anyDrawerToday = await cashFlowService.findAnyDrawerToday(branchId);
    if (anyDrawerToday) {
        return res.status(400).json({
            message: 'A drawer has already been opened today for this branch. Only one drawer per day is allowed. Please wait until tomorrow to open a new drawer.'
        });
    }
    const cashFlow = await cashFlowService.createOpeningCashFlow({
        opening: req.body.opening,
        sales: req.body.sales,
        branch_id: branchId,
        user_id: req.user?.id,
    });
    new apiResponse_1.ApiResponse(cashFlow, 'Opening added', 201).send(res);
});
exports.addExpense = (0, asyncHandler_1.default)(async (req, res) => {
    const branchId = req.user?.branch_id;
    if (!branchId) {
        return res.status(400).json({ message: 'Branch not found in request.' });
    }
    // Find open drawer for this branch
    const openDrawer = await cashFlowService.findOpenDrawer(branchId);
    if (!openDrawer) {
        return res.status(400).json({ message: 'No open drawer for this branch. Cannot add expense.' });
    }
    const expense = await cashFlowService.addExpense({
        cashflow_id: openDrawer.id,
        particular: req.body.particular,
        amount: req.body.amount,
    });
    new apiResponse_1.ApiResponse(expense, 'Expense added', 201).send(res);
});
exports.addClosing = (0, asyncHandler_1.default)(async (req, res) => {
    const { cashflow_id, closing } = req.body;
    const result = await cashFlowService.addClosing(cashflow_id, closing, req.user?.id, req.user?.role);
    new apiResponse_1.ApiResponse(result, 'Closing added', 200).send(res);
});
exports.listCashFlows = (0, asyncHandler_1.default)(async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const branchId = req.user?.branch_id;
    const result = await cashFlowService.listCashFlows({
        page: Number(page),
        limit: Number(limit),
        branch_id: branchId,
    });
    new apiResponse_1.ApiResponse(result.data, 'Cash flows retrieved successfully', 200).send(res);
});
exports.getExpensesByDate = (0, asyncHandler_1.default)(async (req, res) => {
    const branchId = req.user?.branch_id;
    if (!branchId) {
        return res.status(400).json({ message: 'Branch not found in request.' });
    }
    console.log('getExpensesByDate controller - received:', { branchId, date: req.query.date }); // Debug log
    // Let's also check all expenses in the database
    const allExpenses = await client_1.prisma.expense.findMany({
        include: {
            cashflow: {
                select: {
                    id: true,
                    branch_id: true,
                    status: true,
                    opened_at: true,
                }
            }
        },
        orderBy: { created_at: 'desc' },
        take: 10,
    });
    console.log('All expenses in database:', allExpenses); // Debug log
    const date = req.query.date;
    const expenses = await cashFlowService.getExpensesByDate(branchId, date);
    console.log('getExpensesByDate - returning expenses:', expenses.length); // Debug log
    new apiResponse_1.ApiResponse(expenses, 'Expenses retrieved successfully', 200).send(res);
});
// Debug endpoint to check database state
exports.debugCashFlows = (0, asyncHandler_1.default)(async (req, res) => {
    const branchId = req.user?.branch_id;
    if (!branchId) {
        return res.status(400).json({ message: 'Branch not found in request.' });
    }
    const { date } = req.query;
    const { start: startOfDay, end: endOfDay } = (0, timezone_1.businessTodayRange)();
    const allCashFlows = await client_1.prisma.cashFlow.findMany({
        where: { branch_id: branchId },
        orderBy: { opened_at: 'desc' },
        take: 10,
    });
    const openDrawers = await client_1.prisma.cashFlow.findMany({
        where: {
            branch_id: branchId,
            status: 'OPEN'
        },
        include: { expenses: true },
    });
    const anyDrawerToday = await cashFlowService.findAnyDrawerToday(branchId);
    // Test the specific date if provided
    let testDateResult = null;
    if (date) {
        testDateResult = await cashFlowService.getCashFlowByDate(branchId, date);
    }
    const allExpenses = await client_1.prisma.expense.findMany({
        include: {
            cashflow: {
                select: {
                    id: true,
                    branch_id: true,
                    status: true,
                }
            }
        },
        orderBy: { created_at: 'desc' },
        take: 20,
    });
    new apiResponse_1.ApiResponse({
        allCashFlows,
        openDrawers,
        anyDrawerToday,
        canOpenDrawerToday: !anyDrawerToday,
        testDateResult,
        dateRange: {
            startOfDay: startOfDay.toISOString(),
            endOfDay: endOfDay.toISOString(),
            requestedDate: date
        },
        allExpenses,
        branchId,
        currentDate: new Date().toISOString(),
    }, 'Debug info retrieved', 200).send(res);
});
//# sourceMappingURL=cashflow.controller.js.map
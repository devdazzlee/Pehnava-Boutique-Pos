import { Request, Response } from 'express';
import {
    ExpenseService,
    ExpenseCategoryService,
    RecurringExpenseService,
} from '../services/expense.service';
import { ApiResponse } from '../utils/apiResponse';
import asyncHandler from '../middleware/asyncHandler';
import { resolveBranchId } from '../utils/resolveBranchId';

const expenseService = new ExpenseService();
const categoryService = new ExpenseCategoryService();
const recurringService = new RecurringExpenseService();

const bool = (v: unknown) =>
    v === 'true' ? true : v === 'false' ? false : undefined;

/* ------------------------------ categories ------------------------------ */

export const listExpenseCategories = asyncHandler(async (req: Request, res: Response) => {
    const data = await categoryService.list({
        search: req.query.search as string | undefined,
        is_active: bool(req.query.is_active),
    });
    new ApiResponse(data, 'Expense categories retrieved').send(res);
});

export const createExpenseCategory = asyncHandler(async (req: Request, res: Response) => {
    const data = await categoryService.create(req.body);
    new ApiResponse(data, 'Expense category created', 201).send(res);
});

export const updateExpenseCategory = asyncHandler(async (req: Request, res: Response) => {
    const data = await categoryService.update(req.params.id, req.body);
    new ApiResponse(data, 'Expense category updated').send(res);
});

export const toggleExpenseCategory = asyncHandler(async (req: Request, res: Response) => {
    const data = await categoryService.toggle(req.params.id);
    new ApiResponse(data, 'Expense category status updated').send(res);
});

export const deleteExpenseCategory = asyncHandler(async (req: Request, res: Response) => {
    const data = await categoryService.remove(req.params.id);
    new ApiResponse(data, 'Expense category deleted').send(res);
});

/* ------------------------------- expenses ------------------------------- */

export const listExpenses = asyncHandler(async (req: Request, res: Response) => {
    const scopedBranch = resolveBranchId(req);
    const result = await expenseService.list({
        ...req.query,
        branch_id: (req.query.branch_id as string | undefined) || scopedBranch,
    } as any);
    new ApiResponse(result.data, 'Expenses retrieved', 200, true, result.meta).send(res);
});

export const getExpense = asyncHandler(async (req: Request, res: Response) => {
    const data = await expenseService.getById(req.params.id);
    new ApiResponse(data, 'Expense retrieved').send(res);
});

export const createExpense = asyncHandler(async (req: Request, res: Response) => {
    const body = {
        ...req.body,
        branch_id: req.body.branch_id ?? resolveBranchId(req) ?? null,
    };
    const data = await expenseService.create(body, req.user?.id, { userBranchId: req.user?.branch_id ?? null });
    new ApiResponse(data, 'Expense created', 201).send(res);
});

export const updateExpense = asyncHandler(async (req: Request, res: Response) => {
    const data = await expenseService.update(req.params.id, req.body);
    new ApiResponse(data, 'Expense updated').send(res);
});

export const deleteExpense = asyncHandler(async (req: Request, res: Response) => {
    const data = await expenseService.remove(req.params.id);
    new ApiResponse(data, 'Expense deleted').send(res);
});

export const approveExpense = asyncHandler(async (req: Request, res: Response) => {
    const data = await expenseService.approve(req.params.id, req.user!.id);
    new ApiResponse(data, 'Expense approved').send(res);
});

export const rejectExpense = asyncHandler(async (req: Request, res: Response) => {
    const data = await expenseService.reject(req.params.id, req.user!.id, req.body?.reason);
    new ApiResponse(data, 'Expense rejected').send(res);
});

export const expenseReport = asyncHandler(async (req: Request, res: Response) => {
    const data = await expenseService.report({
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        branch_id: (req.query.branch_id as string | undefined) || resolveBranchId(req),
    });
    new ApiResponse(data, 'Expense report generated').send(res);
});

/* -------------------------- recurring expenses -------------------------- */

export const listRecurringExpenses = asyncHandler(async (req: Request, res: Response) => {
    const data = await recurringService.list({ is_active: bool(req.query.is_active) });
    new ApiResponse(data, 'Recurring expenses retrieved').send(res);
});

export const createRecurringExpense = asyncHandler(async (req: Request, res: Response) => {
    const data = await recurringService.create(req.body, req.user?.id);
    new ApiResponse(data, 'Recurring expense created', 201).send(res);
});

export const updateRecurringExpense = asyncHandler(async (req: Request, res: Response) => {
    const data = await recurringService.update(req.params.id, req.body);
    new ApiResponse(data, 'Recurring expense updated').send(res);
});

export const toggleRecurringExpense = asyncHandler(async (req: Request, res: Response) => {
    const data = await recurringService.toggle(req.params.id);
    new ApiResponse(data, 'Recurring expense status updated').send(res);
});

export const deleteRecurringExpense = asyncHandler(async (req: Request, res: Response) => {
    const data = await recurringService.remove(req.params.id);
    new ApiResponse(data, 'Recurring expense deleted').send(res);
});

export const runRecurringExpenses = asyncHandler(async (req: Request, res: Response) => {
    const data = await recurringService.runDue(req.user?.id);
    new ApiResponse(data, `Generated ${data.generated} expense(s) from ${data.templates} template(s)`).send(res);
});

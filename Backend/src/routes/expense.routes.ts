import express from 'express';
import {
    listExpenseCategories,
    createExpenseCategory,
    updateExpenseCategory,
    toggleExpenseCategory,
    deleteExpenseCategory,
    listExpenses,
    getExpense,
    createExpense,
    updateExpense,
    deleteExpense,
    approveExpense,
    rejectExpense,
    expenseReport,
    listRecurringExpenses,
    createRecurringExpense,
    updateRecurringExpense,
    toggleRecurringExpense,
    deleteRecurringExpense,
    runRecurringExpenses,
} from '../controllers/expense.controller';
import {
    createExpenseSchema,
    updateExpenseSchema,
    listExpensesSchema,
    idParamSchema,
    rejectExpenseSchema,
    expenseReportSchema,
    createExpenseCategorySchema,
    updateExpenseCategorySchema,
    createRecurringExpenseSchema,
    updateRecurringExpenseSchema,
} from '../validations/expense.validation';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

router.use(authenticate);

// Anyone signed in can raise / view expenses; approval and configuration are
// restricted below.
const canApprove = authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']);
const canConfigure = authorize(['SUPER_ADMIN', 'ADMIN']);

/* categories */
router.get('/categories', listExpenseCategories);
router.post('/categories', validate(createExpenseCategorySchema), createExpenseCategory);
router.patch('/categories/:id', canConfigure, validate(updateExpenseCategorySchema), updateExpenseCategory);
router.patch('/categories/:id/toggle', canConfigure, validate(idParamSchema), toggleExpenseCategory);
router.delete('/categories/:id', canConfigure, validate(idParamSchema), deleteExpenseCategory);

/* reports */
router.get('/report', validate(expenseReportSchema), expenseReport);

/* recurring */
router.get('/recurring', listRecurringExpenses);
router.post('/recurring', canConfigure, validate(createRecurringExpenseSchema), createRecurringExpense);
router.post('/recurring/run', canConfigure, runRecurringExpenses);
router.patch('/recurring/:id', canConfigure, validate(updateRecurringExpenseSchema), updateRecurringExpense);
router.patch('/recurring/:id/toggle', canConfigure, validate(idParamSchema), toggleRecurringExpense);
router.delete('/recurring/:id', canConfigure, validate(idParamSchema), deleteRecurringExpense);

/* expenses */
router.get('/', validate(listExpensesSchema), listExpenses);
router.post('/', validate(createExpenseSchema), createExpense);
router.get('/:id', validate(idParamSchema), getExpense);
router.patch('/:id', validate(updateExpenseSchema), updateExpense);
router.delete('/:id', validate(idParamSchema), deleteExpense);
router.patch('/:id/approve', canApprove, validate(idParamSchema), approveExpense);
router.patch('/:id/reject', canApprove, validate(rejectExpenseSchema), rejectExpense);

export default router;

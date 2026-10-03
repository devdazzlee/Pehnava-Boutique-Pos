"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const permission_middleware_1 = require("../middleware/permission.middleware");
const express_1 = __importDefault(require("express"));
const expense_controller_1 = require("../controllers/expense.controller");
const expense_validation_1 = require("../validations/expense.validation");
const validation_middleware_1 = require("../middleware/validation.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate);
// Anyone signed in can raise / view expenses; approval and configuration are
// restricted below.
const canApprove = (0, permission_middleware_1.requirePermission)('expenses.approve');
const canConfigure = (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN']);
/* categories */
router.get('/categories', expense_controller_1.listExpenseCategories);
router.post('/categories', (0, validation_middleware_1.validate)(expense_validation_1.createExpenseCategorySchema), expense_controller_1.createExpenseCategory);
router.patch('/categories/:id', canConfigure, (0, validation_middleware_1.validate)(expense_validation_1.updateExpenseCategorySchema), expense_controller_1.updateExpenseCategory);
router.patch('/categories/:id/toggle', canConfigure, (0, validation_middleware_1.validate)(expense_validation_1.idParamSchema), expense_controller_1.toggleExpenseCategory);
router.delete('/categories/:id', canConfigure, (0, validation_middleware_1.validate)(expense_validation_1.idParamSchema), expense_controller_1.deleteExpenseCategory);
/* reports */
router.get('/report', (0, validation_middleware_1.validate)(expense_validation_1.expenseReportSchema), expense_controller_1.expenseReport);
/* recurring */
router.get('/recurring', expense_controller_1.listRecurringExpenses);
router.post('/recurring', canConfigure, (0, validation_middleware_1.validate)(expense_validation_1.createRecurringExpenseSchema), expense_controller_1.createRecurringExpense);
router.post('/recurring/run', canConfigure, expense_controller_1.runRecurringExpenses);
router.patch('/recurring/:id', canConfigure, (0, validation_middleware_1.validate)(expense_validation_1.updateRecurringExpenseSchema), expense_controller_1.updateRecurringExpense);
router.patch('/recurring/:id/toggle', canConfigure, (0, validation_middleware_1.validate)(expense_validation_1.idParamSchema), expense_controller_1.toggleRecurringExpense);
router.delete('/recurring/:id', canConfigure, (0, validation_middleware_1.validate)(expense_validation_1.idParamSchema), expense_controller_1.deleteRecurringExpense);
/* expenses */
router.get('/', (0, validation_middleware_1.validate)(expense_validation_1.listExpensesSchema), expense_controller_1.listExpenses);
router.post('/', (0, validation_middleware_1.validate)(expense_validation_1.createExpenseSchema), expense_controller_1.createExpense);
router.get('/:id', (0, validation_middleware_1.validate)(expense_validation_1.idParamSchema), expense_controller_1.getExpense);
router.patch('/:id', (0, validation_middleware_1.validate)(expense_validation_1.updateExpenseSchema), expense_controller_1.updateExpense);
router.delete('/:id', (0, validation_middleware_1.validate)(expense_validation_1.idParamSchema), expense_controller_1.deleteExpense);
router.patch('/:id/approve', canApprove, (0, validation_middleware_1.validate)(expense_validation_1.idParamSchema), expense_controller_1.approveExpense);
router.patch('/:id/reject', canApprove, (0, validation_middleware_1.validate)(expense_validation_1.rejectExpenseSchema), expense_controller_1.rejectExpense);
exports.default = router;
//# sourceMappingURL=expense.routes.js.map
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import {
  createAccount,
  createControl,
  createSubType,
  createVoucher,
  deleteAccount,
  deleteControl,
  deleteSubType,
  deleteVoucher,
  getAccount,
  getExpenseAccountOptions,
  getExpenseBreakdown,
  getLedger,
  getNextCodes,
  getTree,
  getTrialBalance,
  getVoucher,
  listAccounts,
  listVouchers,
  syncAccounts,
  updateAccount,
  updateControl,
  updateSubType,
  updateVoucher,
} from '../controllers/chart-of-accounts.controller';
import {
  createAccountSchema,
  createControlSchema,
  createSubTypeSchema,
  createVoucherSchema,
  idParamSchema,
  ledgerSchema,
  listAccountsSchema,
  listVouchersSchema,
  nextCodeSchema,
  reportQuerySchema,
  updateAccountSchema,
  updateControlSchema,
  updateSubTypeSchema,
  updateVoucherSchema,
} from '../validations/chart-of-accounts.validation';

const router = Router();

router.use(authenticate);

const canView = authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']);
const canManage = authorize(['SUPER_ADMIN', 'ADMIN']);

// Anyone signed in can pick an expense head when raising an expense.
router.get('/expense-accounts', getExpenseAccountOptions);

router.get('/', canView, validate(reportQuerySchema), getTree);
router.get('/expense-breakdown', canView, validate(reportQuerySchema), getExpenseBreakdown);
router.get('/trial-balance', canView, validate(reportQuerySchema), getTrialBalance);
router.get('/next-code', canView, validate(nextCodeSchema), getNextCodes);
router.post('/sync', canManage, syncAccounts);

router.post('/sub-types', canManage, validate(createSubTypeSchema), createSubType);
router.patch('/sub-types/:id', canManage, validate(updateSubTypeSchema), updateSubType);
router.delete('/sub-types/:id', canManage, validate(idParamSchema), deleteSubType);

router.post('/controls', canManage, validate(createControlSchema), createControl);
router.patch('/controls/:id', canManage, validate(updateControlSchema), updateControl);
router.delete('/controls/:id', canManage, validate(idParamSchema), deleteControl);

router.get('/accounts', canView, validate(listAccountsSchema), listAccounts);
router.post('/accounts', canManage, validate(createAccountSchema), createAccount);
router.get('/accounts/:id', canView, validate(idParamSchema), getAccount);
router.get('/accounts/:id/ledger', canView, validate(ledgerSchema), getLedger);
router.patch('/accounts/:id', canManage, validate(updateAccountSchema), updateAccount);
router.delete('/accounts/:id', canManage, validate(idParamSchema), deleteAccount);

router.get('/vouchers', canView, validate(listVouchersSchema), listVouchers);
router.post('/vouchers', canManage, validate(createVoucherSchema), createVoucher);
router.get('/vouchers/:id', canView, validate(idParamSchema), getVoucher);
router.patch('/vouchers/:id', canManage, validate(updateVoucherSchema), updateVoucher);
router.delete('/vouchers/:id', canManage, validate(idParamSchema), deleteVoucher);

export default router;

import { Request, Response } from 'express';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import { ChartOfAccountsService } from '../services/chart-of-accounts.service';
import {
  createAccountSchema,
  createControlSchema,
  createSubTypeSchema,
  createVoucherSchema,
  listAccountsSchema,
  listVouchersSchema,
  nextCodeSchema,
  updateAccountSchema,
  updateControlSchema,
  updateSubTypeSchema,
  updateVoucherSchema,
} from '../validations/chart-of-accounts.validation';

const service = new ChartOfAccountsService();

// `validate` only checks the request; parse again here to get coerced values.
const body = <T extends { shape: { body: { parse: (v: unknown) => any } } }>(schema: T, req: Request) =>
  schema.shape.body.parse(req.body) as ReturnType<T['shape']['body']['parse']>;

const reportParams = (req: Request) => ({
  from: req.query.from ? String(req.query.from) : undefined,
  to: req.query.to ? String(req.query.to) : undefined,
  branchId: req.query.branchId ? String(req.query.branchId) : undefined,
  userRole: req.user?.role,
  userBranchId: req.user?.branch_id,
});

/* ---------------------------- reports ---------------------------- */

export const getTree = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.tree({ ...reportParams(req), includeInactive: req.query.includeInactive === 'true' });
  new ApiResponse(data, 'Chart of accounts retrieved').send(res);
});

export const getLedger = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.ledger(req.params.id, reportParams(req));
  new ApiResponse(data, 'Account ledger retrieved').send(res);
});

export const getExpenseBreakdown = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.expenseBreakdown(reportParams(req));
  new ApiResponse(data, 'Expense breakdown retrieved').send(res);
});

export const getTrialBalance = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.trialBalance(reportParams(req));
  new ApiResponse(data, 'Trial balance retrieved').send(res);
});

export const syncAccounts = asyncHandler(async (_req: Request, res: Response) => {
  const data = await service.syncLinkedAccounts();
  new ApiResponse(data, 'Linked accounts synchronised').send(res);
});

export const getNextCodes = asyncHandler(async (req: Request, res: Response) => {
  const q = nextCodeSchema.shape.query.parse(req.query);
  const data = await service.nextCodes(q);
  new ApiResponse(data, 'Next codes').send(res);
});

export const getExpenseAccountOptions = asyncHandler(async (_req: Request, res: Response) => {
  const data = await service.expenseAccountOptions();
  new ApiResponse(data, 'Expense accounts retrieved').send(res);
});

/* ---------------------------- sub types ---------------------------- */

export const createSubType = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.createSubType(body(createSubTypeSchema, req));
  new ApiResponse(data, 'Sub type created', 201).send(res);
});

export const updateSubType = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.updateSubType(req.params.id, body(updateSubTypeSchema, req));
  new ApiResponse(data, 'Sub type updated').send(res);
});

export const deleteSubType = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.deleteSubType(req.params.id);
  new ApiResponse(data, 'Sub type deleted').send(res);
});

/* ---------------------------- controls ---------------------------- */

export const createControl = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.createControl(body(createControlSchema, req));
  new ApiResponse(data, 'Control account created', 201).send(res);
});

export const updateControl = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.updateControl(req.params.id, body(updateControlSchema, req));
  new ApiResponse(data, 'Control account updated').send(res);
});

export const deleteControl = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.deleteControl(req.params.id);
  new ApiResponse(data, 'Control account deleted').send(res);
});

/* ------------------------- transactional ------------------------- */

export const listAccounts = asyncHandler(async (req: Request, res: Response) => {
  const q = listAccountsSchema.shape.query.parse(req.query);
  const data = await service.listAccounts({
    search: q.search,
    type_code: q.type_code,
    control_id: q.control_id,
    active: q.active === undefined ? undefined : q.active === 'true',
  });
  new ApiResponse(data, 'Accounts retrieved').send(res);
});

export const getAccount = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.getAccount(req.params.id);
  new ApiResponse(data, 'Account retrieved').send(res);
});

export const createAccount = asyncHandler(async (req: Request, res: Response) => {
  const input = body(createAccountSchema, req);
  const data = await service.createAccount({ ...input, email: input.email || null });
  new ApiResponse(data, 'Account created', 201).send(res);
});

export const updateAccount = asyncHandler(async (req: Request, res: Response) => {
  const input = body(updateAccountSchema, req);
  const data = await service.updateAccount(req.params.id, {
    ...input,
    ...(input.email !== undefined ? { email: input.email || null } : {}),
  });
  new ApiResponse(data, 'Account updated').send(res);
});

export const deleteAccount = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.deleteAccount(req.params.id);
  new ApiResponse(data, 'Account deleted').send(res);
});

/* ------------------------- journal vouchers ------------------------- */

export const listVouchers = asyncHandler(async (req: Request, res: Response) => {
  const q = listVouchersSchema.shape.query.parse(req.query);
  const result = await service.listVouchers(q);
  new ApiResponse(result.data, 'Journal vouchers retrieved', 200, true, result.meta).send(res);
});

export const getVoucher = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.getVoucher(req.params.id);
  new ApiResponse(data, 'Journal voucher retrieved').send(res);
});

export const createVoucher = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.createVoucher(body(createVoucherSchema, req), req.user?.id);
  new ApiResponse(data, 'Journal voucher posted', 201).send(res);
});

export const updateVoucher = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.updateVoucher(req.params.id, body(updateVoucherSchema, req));
  new ApiResponse(data, 'Journal voucher updated').send(res);
});

export const deleteVoucher = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.deleteVoucher(req.params.id);
  new ApiResponse(data, 'Journal voucher deleted').send(res);
});

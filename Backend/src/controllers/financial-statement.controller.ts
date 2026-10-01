import { Request, Response } from 'express';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import { FinancialStatementService } from '../services/financial-statement.service';

const service = new FinancialStatementService();

const asBool = (value: unknown, fallback = true) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const text = String(value).toLowerCase();
  if (text === 'false' || text === '0') return false;
  if (text === 'true' || text === '1') return true;
  return fallback;
};

export const getFinancialStatement = asyncHandler(async (req: Request, res: Response) => {
  const report = await service.statement({
    from: String(req.query.from),
    to: String(req.query.to),
    branchId: req.query.branchId ? String(req.query.branchId) : undefined,
    paymentMethod: req.query.paymentMethod ? String(req.query.paymentMethod) : undefined,
    cashierId: req.query.cashierId ? String(req.query.cashierId) : undefined,
    categoryId: req.query.categoryId ? String(req.query.categoryId) : undefined,
    saleType: req.query.saleType ? String(req.query.saleType) : undefined,
    includeSalaries: asBool(req.query.includeSalaries, true),
    includePurchases: asBool(req.query.includePurchases, true),
    comparePrevious: asBool(req.query.comparePrevious, false),
    userRole: req.user?.role,
    userBranchId: req.user?.branch_id,
  });
  new ApiResponse(report, 'Financial statement generated').send(res);
});

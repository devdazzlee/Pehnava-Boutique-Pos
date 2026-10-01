import { Request, Response } from 'express';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import { BalanceSheetService } from '../services/balance-sheet.service';

const service = new BalanceSheetService();

export const getBalanceSheet = asyncHandler(async (req: Request, res: Response) => {
  const report = await service.sheet({
    from: String(req.query.from),
    to: String(req.query.to),
    branchId: req.query.branchId ? String(req.query.branchId) : undefined,
    userRole: req.user?.role,
    userBranchId: req.user?.branch_id,
  });
  new ApiResponse(report, 'Balance sheet generated').send(res);
});

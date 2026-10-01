import { Request, Response } from 'express';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import { TrialBalanceService } from '../services/trial-balance.service';

const service = new TrialBalanceService();

export const getTrialBalance = asyncHandler(async (req: Request, res: Response) => {
  const report = await service.trial({
    from: String(req.query.from),
    to: String(req.query.to),
    branchId: req.query.branchId ? String(req.query.branchId) : undefined,
    userRole: req.user?.role,
    userBranchId: req.user?.branch_id,
  });
  new ApiResponse(report, 'Trial balance generated').send(res);
});

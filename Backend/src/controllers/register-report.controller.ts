import { Request, Response } from 'express';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import { RegisterReportService } from '../services/register-report.service';

const service = new RegisterReportService();

export const getRegisterReport = asyncHandler(async (req: Request, res: Response) => {
  const report = await service.getReport({
    from: String(req.query.from),
    to: String(req.query.to),
    branchId: req.query.branchId ? String(req.query.branchId) : undefined,
    cashierId: req.query.cashierId ? String(req.query.cashierId) : undefined,
    paymentMethod: req.query.paymentMethod ? String(req.query.paymentMethod) : undefined,
    transactionType: req.query.transactionType ? String(req.query.transactionType) : undefined,
    status: req.query.status ? String(req.query.status) : undefined,
    userRole: req.user?.role,
    userBranchId: req.user?.branch_id,
  });
  new ApiResponse(report, 'Register report generated').send(res);
});

export const closeRegisterSession = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.closeSession(
    req.body.cashflow_id,
    Number(req.body.closing),
    req.user?.id,
    req.user?.role,
  );
  new ApiResponse(result, 'Register closed').send(res);
});

export const getRegisterSessionExpected = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.expectedForSession(String(req.params.id));
  new ApiResponse(result, 'Expected cash calculated').send(res);
});

export const reopenRegisterSession =asyncHandler(async (req: Request, res: Response) => {
  const result = await service.reopenSession(String(req.params.id), req.user?.role);
  new ApiResponse(result, 'Register session reopened').send(res);
});

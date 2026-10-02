import { Request, Response } from 'express';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import { TillService } from '../services/till.service';

const service = new TillService();

export const getTillDay = asyncHandler(async (req: Request, res: Response) => {
  const report = await service.day({
    date: req.query.date ? String(req.query.date) : undefined,
    from: req.query.from ? String(req.query.from) : undefined,
    to: req.query.to ? String(req.query.to) : undefined,
    branchId: req.query.branchId ? String(req.query.branchId) : undefined,
    userRole: req.user?.role,
    userBranchId: req.user?.branch_id,
  });
  new ApiResponse(report, 'Till day loaded').send(res);
});

export const openTill = asyncHandler(async (req: Request, res: Response) => {
  const session = await service.open({
    opening: Number(req.body.opening),
    branchId: req.body.branchId,
    userRole: req.user?.role,
    userBranchId: req.user?.branch_id,
    userId: req.user?.id,
  });
  new ApiResponse(session, 'Till opened', 201).send(res);
});

export const paidOutTill = asyncHandler(async (req: Request, res: Response) => {
  const expense = await service.paidOut({
    particular: String(req.body.particular),
    amount: Number(req.body.amount),
    branchId: req.body.branchId,
    userRole: req.user?.role,
    userBranchId: req.user?.branch_id,
    userId: req.user?.id,
  });
  new ApiResponse(expense, 'Paid-out recorded', 201).send(res);
});

export const voidPaidOutTill = asyncHandler(async (req: Request, res: Response) => {
  const expense = await service.voidPaidOut({
    expenseId: String(req.params.id),
    reason: req.body?.reason ? String(req.body.reason) : undefined,
    userId: req.user?.id,
  });
  new ApiResponse(expense, 'Paid-out voided').send(res);
});

export const closeTill = asyncHandler(async (req: Request, res: Response) => {
  const session = await service.close({
    cashflowId: String(req.body.cashflow_id),
    closing: Number(req.body.closing),
    userId: req.user?.id,
    userRole: req.user?.role,
  });
  new ApiResponse(session, 'Till closed').send(res);
});

export const reopenTill = asyncHandler(async (req: Request, res: Response) => {
  const session = await service.reopen({
    cashflowId: String(req.params.id),
    userRole: req.user?.role,
  });
  new ApiResponse(session, 'Till reopened').send(res);
});

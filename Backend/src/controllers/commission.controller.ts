import { Request, Response } from 'express';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import { CommissionService } from '../services/commission.service';

const service = new CommissionService();

export const listCommissions = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.list({
    branch_id: req.user?.branch_id || undefined,
    page: req.query.page ? Number(req.query.page) : 1,
    limit: req.query.limit ? Number(req.query.limit) : 20,
    employee_id: req.query.employee_id ? String(req.query.employee_id) : undefined,
    month: req.query.month ? Number(req.query.month) : undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
    is_paid:
      req.query.is_paid === 'true' ? true : req.query.is_paid === 'false' ? false : undefined,
    search: req.query.search ? String(req.query.search) : undefined,
    fetch_all: String(req.query.fetch_all) === 'true',
  });
  new ApiResponse(result.data, 'Commissions fetched successfully', 200, true, result.meta).send(res);
});

export const previewCommissions = asyncHandler(async (req: Request, res: Response) => {
  const report = await service.preview({
    from: String(req.query.from),
    to: String(req.query.to),
    employee_id: req.query.employee_id ? String(req.query.employee_id) : undefined,
    branch_id: req.query.branch_id ? String(req.query.branch_id) : undefined,
    userBranchId: req.user?.branch_id,
    userRole: req.user?.role,
  });
  new ApiResponse(report, 'Commission preview generated').send(res);
});

export const listSalespeople = asyncHandler(async (req: Request, res: Response) => {
  const rows = await service.salespeople({ userRole: req.user?.role, userBranchId: req.user?.branch_id });
  new ApiResponse(rows, 'Salespeople fetched').send(res);
});

export const employeePerformance = asyncHandler(async (req: Request, res: Response) => {
  const report = await service.performance({
    employeeId: req.params.employeeId,
    from: String(req.query.from),
    to: String(req.query.to),
    userRole: req.user?.role,
    userBranchId: req.user?.branch_id,
  });
  new ApiResponse(report, 'Employee sales performance').send(res);
});

export const generateCommissions = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.generate(req.body, {
    branch_id: req.user?.branch_id || undefined,
  });
  new ApiResponse(result, 'Commission records generated', 201).send(res);
});

export const getCommissionById = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.getById(req.params.id);
  new ApiResponse(row, 'Commission fetched successfully').send(res);
});

export const updateCommission = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.update(req.params.id, req.body);
  new ApiResponse(row, 'Commission updated successfully').send(res);
});

export const markCommissionPaid = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.markPaid(req.params.id, {
    paid_date: req.body?.paid_date,
    payment_method: req.body?.payment_method,
    payment_reference: req.body?.payment_reference,
    userId: req.user?.id,
  });
  new ApiResponse(row, 'Commission marked as paid').send(res);
});

export const payCommission = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.pay(req.params.id, {
    amount: Number(req.body.amount),
    paid_date: req.body?.paid_date,
    payment_method: req.body?.payment_method,
    payment_reference: req.body?.payment_reference,
    userId: req.user?.id,
  });
  const msg =
    row.status === 'PAID'
      ? 'Commission paid in full'
      : `Partial payment recorded — Rs ${Number(row.outstanding).toLocaleString()} outstanding`;
  new ApiResponse(row, msg).send(res);
});

export const markCommissionUnpaid = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.markUnpaid(req.params.id);
  new ApiResponse(row, 'Commission marked as unpaid').send(res);
});

export const deleteCommission = asyncHandler(async (req: Request, res: Response) => {
  await service.delete(req.params.id);
  new ApiResponse(null, 'Commission deleted successfully').send(res);
});

export const getCommissionSales = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.salesForCommission(req.params.id);
  new ApiResponse(result, 'Commission sales fetched').send(res);
});

export const earnedCommissions = asyncHandler(async (req: Request, res: Response) => {
  const report = await service.earned({
    from: String(req.query.from),
    to: String(req.query.to),
    employee_id: req.query.employee_id ? String(req.query.employee_id) : undefined,
    branch_id: req.query.branch_id ? String(req.query.branch_id) : undefined,
    userBranchId: req.user?.branch_id,
    userRole: req.user?.role,
  });
  new ApiResponse(report, 'Commission earned').send(res);
});

export const bulkPayCommissions = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.bulkPay(req.body.ids, {
    paid_date: req.body.paid_date,
    payment_method: req.body.payment_method,
    payment_reference: req.body.payment_reference,
    userId: req.user?.id,
  });
  new ApiResponse(result, 'Commissions paid').send(res);
});

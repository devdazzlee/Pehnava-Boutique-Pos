import { Request, Response } from 'express';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import { SalesReportService } from '../services/sales-report.service';

const service = new SalesReportService();

export const getItemwiseSalesReport = asyncHandler(async (req: Request, res: Response) => {
  const report = await service.itemwise({
    from: String(req.query.from),
    to: String(req.query.to),
    mode: req.query.mode === 'item' ? 'item' : 'customer',
    customerId: req.query.customerId ? String(req.query.customerId) : undefined,
    productId: req.query.productId ? String(req.query.productId) : undefined,
    search: req.query.search ? String(req.query.search) : undefined,
    userRole: req.user?.role,
    userBranchId: req.user?.branch_id,
  });
  new ApiResponse(report, 'Item-wise sales report generated').send(res);
});

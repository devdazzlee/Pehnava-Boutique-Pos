import { Request, Response } from 'express';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import { PurchaseReportService } from '../services/purchase-report.service';

const service = new PurchaseReportService();

export const getItemwisePurchaseReport = asyncHandler(async (req: Request, res: Response) => {
  const report = await service.itemwise({
    from: String(req.query.from),
    to: String(req.query.to),
    mode: req.query.mode === 'item' ? 'item' : 'vendor',
    supplierId: req.query.supplierId ? String(req.query.supplierId) : undefined,
    productId: req.query.productId ? String(req.query.productId) : undefined,
    search: req.query.search ? String(req.query.search) : undefined,
    userRole: req.user?.role,
    userBranchId: req.user?.branch_id,
  });
  new ApiResponse(report, 'Item-wise purchase report generated').send(res);
});

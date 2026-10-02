import { Request, Response } from 'express';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import { StockQuantityReportService } from '../services/stock-quantity-report.service';

const service = new StockQuantityReportService();

export const getStockQuantityReport = asyncHandler(async (req: Request, res: Response) => {
  const type = req.query.type === 'finished' || req.query.type === 'loose' ? req.query.type : 'all';
  const report = await service.report({
    from: String(req.query.from),
    to: String(req.query.to),
    categoryId: req.query.categoryId ? String(req.query.categoryId) : undefined,
    branchId: req.query.branchId ? String(req.query.branchId) : undefined,
    type,
    activity: req.query.activity === 'moved' ? 'moved' : 'all',
    search: req.query.search ? String(req.query.search) : undefined,
    status: ['in', 'low', 'out'].includes(String(req.query.status)) ? (String(req.query.status) as 'in' | 'low' | 'out') : 'all',
    sort: ['name_asc', 'sold_desc', 'bought_desc', 'available_asc', 'available_desc', 'value_desc'].includes(String(req.query.sort))
      ? (String(req.query.sort) as 'name_asc')
      : undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    all: req.query.all === 'true',
    userRole: req.user?.role,
    userBranchId: req.user?.branch_id,
  });
  new ApiResponse(report, 'Stock quantity report generated').send(res);
});

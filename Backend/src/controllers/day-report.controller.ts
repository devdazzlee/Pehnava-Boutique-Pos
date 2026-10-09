import { Request, Response } from 'express';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import { DayReportService } from '../services/day-report.service';

const service = new DayReportService();

export const getDayReport = asyncHandler(async (req: Request, res: Response) => {
  const report = await service.report({
    from: String(req.query.from),
    to: String(req.query.to),
    view: String(req.query.view || 'revenue'),
    search: req.query.search ? String(req.query.search) : undefined,
    page: req.query.page ? Number(req.query.page) : 1,
    limit: req.query.limit ? Number(req.query.limit) : 20,
    fetchAll: req.query.fetch_all === 'true',
    branchId: req.query.branchId ? String(req.query.branchId) : undefined,
    userRole: req.user?.role,
    userBranchId: req.user?.branch_id,
  });
  new ApiResponse(report, 'Day report generated').send(res);
});

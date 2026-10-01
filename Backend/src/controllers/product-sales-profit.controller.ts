import { Request, Response } from 'express';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import { ProductSalesProfitService } from '../services/product-sales-profit.service';

const service = new ProductSalesProfitService();

export const getProductSalesProfit = asyncHandler(async (req: Request, res: Response) => {
  const report = await service.report({
    from: String(req.query.from),
    to: String(req.query.to),
    branchId: req.query.branchId ? String(req.query.branchId) : undefined,
    categoryId: req.query.categoryId ? String(req.query.categoryId) : undefined,
    productId: req.query.productId ? String(req.query.productId) : undefined,
    search: req.query.search ? String(req.query.search) : undefined,
    userRole: req.user?.role,
    userBranchId: req.user?.branch_id,
  });
  new ApiResponse(report, 'Product sales & profit report generated').send(res);
});

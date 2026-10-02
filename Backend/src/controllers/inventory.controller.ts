import { Request, Response } from 'express';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import { InventoryService } from '../services/inventory.service';
import { InventoryReportService, InventoryReportType } from '../services/inventory-report.service';

const inventoryService = new InventoryService();
const inventoryReportService = new InventoryReportService();

export const getDashboardStats = asyncHandler(async (req: Request, res: Response) => {
  // Branch managers are locked to their own branch; previously they could omit
  // branchId and read every branch's stock.
  const role = req.user?.role as string;
  const branchId =
    role === 'BRANCH_MANAGER'
      ? (req.user?.branch_id as string | undefined) || (req.query.branchId as string)
      : (req.query.branchId as string);
  const stats = await inventoryService.getDashboardStats(role, branchId);
  new ApiResponse(stats, 'Dashboard stats retrieved').send(res);
});

export const getLowStockProducts = asyncHandler(async (req: Request, res: Response) => {
  const products = await inventoryService.getLowStockProducts(req.query.branchId as string);
  new ApiResponse(products, 'Low stock products retrieved').send(res);
});

export const getStockMovements = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as any;
  const startDate = query.startDate ? new Date(query.startDate) : undefined;
  const endDate = query.endDate ? new Date(query.endDate) : undefined;
  const result = await inventoryService.getStockMovements({
    branchId: query.branchId,
    productId: query.productId,
    movementType: query.movementType,
    direction: query.direction,
    startDate,
    endDate,
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 50,
    userRole: req.user?.role as string,
  });
  new ApiResponse(result.data, 'Stock movements retrieved', 200, true, { ...result.meta, summary: result.summary }).send(res);
});

export const getStockByLocation = asyncHandler(async (req: Request, res: Response) => {
  const stocks = await inventoryService.getStockByLocation(
    req.query.branchId as string,
    req.user?.role as string
  );
  new ApiResponse(stocks, 'Stock by location retrieved').send(res);
});

export const getReports = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as any;
  const startDate = query.startDate ? new Date(query.startDate) : undefined;
  const endDate = query.endDate ? new Date(query.endDate) : undefined;
  if (query.type !== 'financial_audit') {
    const report = await inventoryReportService.getReport({
      type: query.type as InventoryReportType,
      branchId: query.branchId,
      categoryId: query.categoryId,
      supplierId: query.supplierId,
      productId: query.productId,
      startDate,
      endDate,
      q: query.q,
      sort: query.sort,
      status: query.status,
      movementType: query.movementType,
      stockStatus: query.stockStatus,
      ageBucket: query.ageBucket,
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 25,
      all: query.all === 'true',
    });
    new ApiResponse(report, 'Report generated').send(res);
    return;
  }
  const report = await inventoryService.getReports({
    type: query.type,
    branchId: query.branchId,
    startDate,
    endDate,
    supplierId: query.supplierId,
    productId: query.productId,
    // Was never passed through, so the category filter had no effect.
    categoryId: query.categoryId,
  });
  new ApiResponse(report, 'Report generated').send(res);
});

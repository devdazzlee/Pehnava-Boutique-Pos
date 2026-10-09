import { Request, Response } from 'express';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import { PurchaseService } from '../services/purchase.service';

const purchaseService = new PurchaseService();

export const createPurchase = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body;
  const purchaseDate = body.purchaseDate
    ? new Date(body.purchaseDate)
    : undefined;
  const purchase = await purchaseService.createPurchase({
    ...body,
    purchaseDate,
    createdBy: req.user!.id,
  });
  new ApiResponse(purchase, 'Purchase logged successfully', 201).send(res);
});

export const createBulkPurchase = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body;
  const purchaseDate = body.purchaseDate ? new Date(body.purchaseDate) : undefined;
  const expiryDate = body.expiryDate ? new Date(body.expiryDate) : undefined;
  const result = await purchaseService.createBulkPurchase({
    ...body,
    purchaseDate,
    expiryDate,
    createdBy: req.user!.id,
  });
  new ApiResponse(result, 'Supplier bill saved successfully', 201).send(res);
});

export const listPurchases = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as any;
  const startDate = query.startDate ? new Date(query.startDate) : undefined;
  const endDate = query.endDate ? new Date(query.endDate) : undefined;
  const result = await purchaseService.listPurchases({
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 20,
    productId: query.productId,
    supplierId: query.supplierId,
    branchId: query.branchId,
    startDate,
    endDate,
    search: query.search ? String(query.search) : undefined,
    groupBy: query.groupBy === 'bill' ? 'bill' : 'line',
  });
  new ApiResponse(result.data, 'Purchases retrieved', 200, true, result.meta).send(res);
});

export const getPurchaseById = asyncHandler(async (req: Request, res: Response) => {
  const purchase = await purchaseService.getPurchaseById(req.params.id);
  new ApiResponse(purchase, 'Purchase retrieved').send(res);
});

export const updatePurchase = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body;
  const purchaseDate = body.purchaseDate ? new Date(body.purchaseDate) : undefined;
  const purchase = await purchaseService.updatePurchase(req.params.id, {
    quantity: body.quantity,
    costPrice: body.costPrice,
    salePrice: body.salePrice,
    purchaseDate,
    invoiceRef: body.invoiceRef,
    notes: body.notes,
    deliveryStatus: body.deliveryStatus,
    updatedBy: req.user!.id,
  });
  new ApiResponse(purchase, 'Purchase updated successfully').send(res);
});

export const getMonthlyStats = asyncHandler(async (req: Request, res: Response) => {
  const stats = await purchaseService.getMonthlyStats(req.query.warehouseBranchId as string);
  new ApiResponse(stats, 'Monthly stats retrieved').send(res);
});

export const deletePurchase = asyncHandler(async (req: Request, res: Response) => {
  const result = await purchaseService.deletePurchaseLine(req.params.id, req.user!.id);
  new ApiResponse(result, 'Purchase line removed').send(res);
});

export const deleteBill = asyncHandler(async (req: Request, res: Response) => {
  const result = await purchaseService.deleteBill(req.params.anchorId, req.user!.id);
  new ApiResponse(result, 'Supplier bill removed').send(res);
});

export const appendBillLine = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body;
  const purchase = await purchaseService.appendBillLine(req.params.anchorId, {
    productId: body.productId,
    quantity: body.quantity,
    costPrice: body.costPrice,
    salePrice: body.salePrice,
    createdBy: req.user!.id,
  });
  new ApiResponse(purchase, 'Product added to bill', 201).send(res);
});

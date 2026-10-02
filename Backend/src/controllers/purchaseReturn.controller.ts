import { Request, Response } from 'express';
import { PurchaseReturnService } from '../services/purchaseReturn.service';
import { ApiResponse } from '../utils/apiResponse';
import asyncHandler from '../middleware/asyncHandler';
import { resolveBranchId } from '../utils/resolveBranchId';

const service = new PurchaseReturnService();

export const listPurchaseReturns = asyncHandler(async (req: Request, res: Response) => {
    const result = await service.list({
        ...req.query,
        branch_id: (req.query.branch_id as string | undefined) || resolveBranchId(req),
    });
    new ApiResponse(result.data, 'Purchase returns retrieved', 200, true, result.meta).send(res);
});

export const listReturnableBills = asyncHandler(async (req: Request, res: Response) => {
    const supplierId = String(req.query.supplier_id || '');
    const branchId = String(req.query.branch_id || '') || resolveBranchId(req) || '';
    const data = await service.listReturnableBills(supplierId, branchId);
    new ApiResponse(data, 'Returnable supplier bills retrieved').send(res);
});

export const getPurchaseReturn = asyncHandler(async (req: Request, res: Response) => {
    const data = await service.getById(req.params.id);
    new ApiResponse(data, 'Purchase return retrieved').send(res);
});

export const createPurchaseReturn = asyncHandler(async (req: Request, res: Response) => {
    const branch_id = req.body.branch_id || resolveBranchId(req);
    const data = await service.create({ ...req.body, branch_id }, req.user!.id);
    new ApiResponse(data, 'Purchase return recorded', 201).send(res);
});

export const cancelPurchaseReturn = asyncHandler(async (req: Request, res: Response) => {
    const data = await service.cancel(req.params.id, req.user!.id);
    new ApiResponse(data, 'Purchase return cancelled').send(res);
});

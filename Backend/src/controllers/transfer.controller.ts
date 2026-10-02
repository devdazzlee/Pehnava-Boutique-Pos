import { Request, Response } from 'express';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import { TransferService } from '../services/transfer.service';

const transferService = new TransferService();

export const createTransfer = asyncHandler(async (req: Request, res: Response) => {
  const transfer = await transferService.createTransfer({
    ...req.body,
    createdBy: req.user!.id,
  });
  new ApiResponse(transfer, 'Transfer created successfully', 201).send(res);
});

export const updateTransferStatus = asyncHandler(async (req: Request, res: Response) => {
  const transfer = await transferService.updateTransferStatus(
    req.params.id,
    req.body.status,
    req.user?.id
  );
  new ApiResponse(transfer, 'Transfer status updated').send(res);
});

export const listTransfers = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as any;
  const startDate = query.startDate ? new Date(query.startDate) : undefined;
  const endDate = query.endDate ? new Date(query.endDate) : undefined;
  const result = await transferService.listTransfers({
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 20,
    fromBranchId: query.fromBranchId,
    toBranchId: query.toBranchId,
    productId: query.productId,
    status: query.status,
    branchId: query.branchId,
    startDate,
    endDate,
    search: query.search ? String(query.search) : undefined,
  });
  new ApiResponse(result.data, 'Transfers retrieved', 200, true, result.meta).send(res);
});

export const getTransferById = asyncHandler(async (req: Request, res: Response) => {
  const transfer = await transferService.getTransferById(req.params.id);
  new ApiResponse(transfer, 'Transfer retrieved').send(res);
});

export const getPendingTransfers = asyncHandler(async (req: Request, res: Response) => {
  const transfers = await transferService.getPendingTransfers(req.query.branchId as string);
  new ApiResponse(transfers, 'Pending transfers retrieved').send(res);
});

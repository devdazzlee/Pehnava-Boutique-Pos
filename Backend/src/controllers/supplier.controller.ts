import { Request, Response } from 'express';
import { SupplierService } from '../services/supplier.service';
import { ApiResponse } from '../utils/apiResponse';
import asyncHandler from '../middleware/asyncHandler';

const supplierService = new SupplierService();

export const createSupplier = asyncHandler(async (req: Request, res: Response) => {
    const supplier = await supplierService.createSupplier(req.body);
    new ApiResponse(supplier, 'Supplier created successfully', 201).send(res);
});

export const getSupplier = asyncHandler(async (req: Request, res: Response) => {
    const supplier = await supplierService.getSupplierById(req.params.id);
    new ApiResponse(supplier, 'Supplier retrieved successfully').send(res);
});

export const updateSupplier = asyncHandler(async (req: Request, res: Response) => {
    const supplier = await supplierService.updateSupplier(req.params.id, req.body);
    new ApiResponse(supplier, 'Supplier updated successfully').send(res);
});

export const toggleSupplierStatus = asyncHandler(async (req: Request, res: Response) => {
    await supplierService.toggleSupplierStatus(req.params.id);
    new ApiResponse(null, 'Supplier status changed successfully').send(res);
});

export const deleteSupplier = asyncHandler(async (req: Request, res: Response) => {
    await supplierService.deleteSupplier(req.params.id);
    new ApiResponse(null, 'Supplier deleted successfully').send(res);
});

const parseOptionalBoolean = (value: unknown): boolean | undefined => {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }
    if (value === 'true' || value === true) {
        return true;
    }
    if (value === 'false' || value === false) {
        return false;
    }
    return undefined;
};

export const listSuppliers = asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 10, search, fetch_all, balance, sort } = req.query;

    const result = await supplierService.listSuppliers({
        page: Number(page),
        limit: Number(limit),
        search: search as string | undefined,
        is_active: parseOptionalBoolean(req.query.is_active),
        display_on_pos: parseOptionalBoolean(req.query.display_on_pos),
        fetch_all: String(fetch_all) === 'true',
        balance: balance as 'all' | 'due' | 'advance' | 'clear' | undefined,
        sort: sort as 'recent' | 'name' | 'balance_desc' | 'purchases_desc' | undefined,
    });

    new ApiResponse(
        result.data,
        'Suppliers retrieved successfully',
        200,
        true,
        result.meta,
    ).send(res);
});

export const getPayablesSummary = asyncHandler(async (_req: Request, res: Response) => {
    const data = await supplierService.payablesSummary();
    new ApiResponse(data, 'Payables summary retrieved').send(res);
});

export const getSupplierPurchases = asyncHandler(
    async (req: Request, res: Response) => {
        const data = await supplierService.getSupplierPurchases(req.params.id);
        new ApiResponse(data, 'Supplier purchases retrieved').send(res);
    },
);

export const getSupplierLedger = asyncHandler(
    async (req: Request, res: Response) => {
        const data = await supplierService.getSupplierLedger(req.params.id);
        new ApiResponse(data, 'Supplier ledger retrieved').send(res);
    },
);

export const getSupplierStatement = asyncHandler(
    async (req: Request, res: Response) => {
        const data = await supplierService.getSupplierStatement(req.params.id, {
            from: req.query.from as string | undefined,
            to: req.query.to as string | undefined,
        });
        new ApiResponse(data, 'Supplier statement retrieved').send(res);
    },
);

export const getSupplierProducts = asyncHandler(
    async (req: Request, res: Response) => {
        const data = await supplierService.getSupplierProducts(req.params.id);
        new ApiResponse(data, 'Supplier products retrieved').send(res);
    },
);

export const createSupplierPayment = asyncHandler(
    async (req: Request, res: Response) => {
        const payment = await supplierService.createSupplierPayment(
            req.params.id,
            req.body,
            req.user!.id,
        );
        new ApiResponse(payment, 'Payment recorded successfully', 201).send(res);
    },
);

export const deleteSupplierPayment = asyncHandler(
    async (req: Request, res: Response) => {
        await supplierService.deleteSupplierPayment(
            req.params.id,
            req.params.paymentId,
        );
        new ApiResponse(null, 'Payment deleted successfully').send(res);
    },
);

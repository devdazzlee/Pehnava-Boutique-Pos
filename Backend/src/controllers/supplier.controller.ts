import { Request, Response } from 'express';
import { SupplierService } from '../services/supplier.service';
import { ApiResponse } from '../utils/apiResponse';
import asyncHandler from '../middleware/asyncHandler';
import { AppError } from '../utils/apiError';
import {
    createSupplierPaymentSchema,
    supplierBodySchema,
    supplierUpdateBodySchema,
    updateSupplierPaymentSchema,
} from '../validations/supplier.validation';
import { ZodTypeAny, z } from 'zod';

const parse = <T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> => {
    const r = schema.safeParse(data);
    if (!r.success) throw new AppError(400, r.error.issues[0]?.message || 'Invalid input');
    return r.data;
};

const supplierService = new SupplierService();

export const createSupplier = asyncHandler(async (req: Request, res: Response) => {
    const supplier = await supplierService.createSupplier(parse(supplierBodySchema, req.body));
    new ApiResponse(supplier, 'Supplier created successfully', 201).send(res);
});

export const getSupplier = asyncHandler(async (req: Request, res: Response) => {
    const supplier = await supplierService.getSupplierById(req.params.id);
    new ApiResponse(supplier, 'Supplier retrieved successfully').send(res);
});

export const updateSupplier = asyncHandler(async (req: Request, res: Response) => {
    // Only fields actually sent are updated (partial() keeps defaults from filling in).
    const body = parse(supplierUpdateBodySchema, req.body);
    for (const k of Object.keys(body) as (keyof typeof body)[]) if (!(k in (req.body || {}))) delete body[k];
    const supplier = await supplierService.updateSupplier(req.params.id, body);
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
    const { page = 1, limit = 10, search, fetch_all, balance, sort, city, category } = req.query;

    const result = await supplierService.listSuppliers({
        page: Number(page),
        limit: Number(limit),
        search: search as string | undefined,
        is_active: parseOptionalBoolean(req.query.is_active),
        display_on_pos: parseOptionalBoolean(req.query.display_on_pos),
        fetch_all: String(fetch_all) === 'true',
        balance: balance as 'all' | 'due' | 'advance' | 'clear' | 'overdue' | 'over_limit' | undefined,
        sort: sort as 'recent' | 'name' | 'balance_desc' | 'purchases_desc' | 'overdue_desc' | 'last_purchase' | 'oldest' | undefined,
        city: (city as string) || undefined,
        category: (category as string) || undefined,
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
            parse(createSupplierPaymentSchema.shape.body, req.body),
            req.user!.id,
        );
        new ApiResponse(payment, 'Transaction recorded', 201).send(res);
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

export const updateSupplierPayment = asyncHandler(async (req: Request, res: Response) => {
    const body = parse(updateSupplierPaymentSchema.shape.body, req.body);
    const payment = await supplierService.updateSupplierPayment(req.params.id, req.params.paymentId, body);
    new ApiResponse(payment, 'Transaction updated').send(res);
});

export const getSupplierAccount = asyncHandler(async (req: Request, res: Response) => {
    new ApiResponse(await supplierService.getSupplierAccount(req.params.id), 'Supplier account').send(res);
});

export const getSupplierDocuments = asyncHandler(async (req: Request, res: Response) => {
    new ApiResponse(await supplierService.getSupplierDocuments(req.params.id), 'Supplier documents').send(res);
});

export const getSupplierFacets = asyncHandler(async (_req: Request, res: Response) => {
    new ApiResponse(await supplierService.facets(), 'Supplier filters').send(res);
});

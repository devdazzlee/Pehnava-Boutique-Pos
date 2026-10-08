import { Request, Response } from "express";
import asyncHandler from "../middleware/asyncHandler";
import { SaleService } from "../services/sales.service";
import { ApiResponse } from "../utils/apiResponse";
import { parseYmdBound } from "../utils/timezone";

const saleService = new SaleService();

const resolveBranchId = (req: Request): string | undefined => {
    const jwtBranchId = req.user?.branch_id as string | undefined;
    const userRole = req.user?.role;
    
    // Admins can override branch ID
    if (userRole === "SUPER_ADMIN" || userRole === "ADMIN") {
        const queryBranchId = req.query.branchId as string | undefined;
        const bodyBranchId = req.body?.branchId as string | undefined;

        if (queryBranchId && queryBranchId.trim() && queryBranchId !== "Not Found") {
            return queryBranchId.trim();
        }

        if (bodyBranchId && bodyBranchId.trim() && bodyBranchId !== "Not Found") {
            return bodyBranchId.trim();
        }
    }

    // Force non-admins to use their JWT branch ID
    if (jwtBranchId && jwtBranchId.trim() && jwtBranchId !== "Not Found") {
        return jwtBranchId.trim();
    }

    return undefined;
};

const getSalesController = asyncHandler(async (req: Request, res: Response) => {
    // Priority: query parameter (branchId from localStorage) > JWT token branch_id
    // If branchId is provided in query, use it to filter (even for admins)
    // If no branchId in query and user is admin, return all sales
    // If no branchId in query and user is not admin, use JWT token branch_id
    
    const isAdmin = req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'ADMIN';
    const queryBranchId = req.query.branchId as string;
    const jwtBranchId = req.user?.branch_id as string;
    
    let branchId: string | undefined;
    
    // If branchId is provided in query parameter (from localStorage), use it to filter
    if (queryBranchId && queryBranchId.trim() && queryBranchId.trim() !== "Not Found") {
        branchId = queryBranchId.trim();
        console.log("Filtering by branchId from query parameter (localStorage):", branchId);
    } else if (!isAdmin) {
        // Non-admin users: use JWT token branch_id if no query param
        branchId = jwtBranchId?.trim();
        console.log("Non-admin user - filtering by JWT branch_id:", branchId);
        
        // If still no branchId, return empty array
        if (!branchId || branchId === "Not Found") {
            console.warn("No valid branchId found for non-admin user");
            return new ApiResponse([], "No branch ID found for user").send(res);
        }
    } else {
        // Admin user with no branchId in query - return all sales
        branchId = undefined;
        console.log("Admin user - no branchId in query, returning all sales");
    }
    
    const page = Number(req.query.page);
    const limit = Number(req.query.limit);
    const search = (req.query.search as string | undefined)?.trim();
    const startDateRaw = req.query.startDate as string | undefined;
    const endDateRaw = req.query.endDate as string | undefined;
    const paymentMethod = (req.query.paymentMethod as string | undefined)?.trim();
    const paymentStatus = (req.query.paymentStatus as string | undefined)?.trim();
    const status = (req.query.status as string | undefined)?.trim();
    const cashierId = (req.query.cashierId as string | undefined)?.trim();
    const customerId = (req.query.customerId as string | undefined)?.trim();
    const salespersonId = (req.query.salespersonId as string | undefined)?.trim();
    const sortBy = (req.query.sortBy as string | undefined)?.trim() || "sale_date";
    const sortOrderRaw = (req.query.sortOrder as string | undefined)?.trim()?.toLowerCase();
    const sortOrder = sortOrderRaw === "asc" ? "asc" : "desc";
    const includeReturns =
      String(req.query.includeReturns ?? "").trim().toLowerCase() === "true";

    const parsedStartDate = parseYmdBound(startDateRaw, "start");
    const parsedEndDate = parseYmdBound(endDateRaw, "end");

    const result = await saleService.getSales({
        branchId,
        page: Number.isFinite(page) && page > 0 ? page : 1,
        limit: Number.isFinite(limit) && limit > 0 ? limit : 20,
        search,
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        paymentMethod,
        paymentStatus,
        status,
        cashierId,
        customerId,
        salespersonId,
        sortBy,
        sortOrder,
        includeReturns,
    });

    console.log(
      `Returning ${result.data.length} sales for branchId: ${branchId || 'ALL'} (page: ${result.meta?.page}, total: ${result.meta?.total})`
    );
    new ApiResponse(result.data, "Sales fetched successfully", 200, true, result.meta).send(res);
});

const getSalesForReturnsController = asyncHandler(async (req: Request, res: Response) => {
    const search = (req.query.search as string | undefined)?.replace(/\s+/g, ' ').trim();
    const sales = await saleService.getSalesForReturns({ 
        branchId: req.user?.branch_id as string,
        search
    });
    new ApiResponse(sales, "Sales eligible for returns fetched successfully").send(res);
});

const getSaleByIdController = asyncHandler(async (req: Request, res: Response) => {
    const sale = await saleService.getSaleById(req.params.saleId);
    new ApiResponse(sale, "Sale details fetched").send(res);
});

const createSaleController = asyncHandler(async (req: Request, res: Response) => {
    const branchId = resolveBranchId(req);
    if (!branchId) {
        return new ApiResponse(null, "No branch ID found for sale", 400, false).send(res);
    }

    const sale = await saleService.createSale({
        ...req.body,
        branchId,
        createdBy: req.user!.id
    });
    new ApiResponse(sale, "Sale created successfully", 201).send(res);
});

const refundSaleController = asyncHandler(async (req: Request, res: Response) => {
    const {
        customerId,
        returnedItems = [],
        exchangedItems = [],
        notes,
        branchId: bodyBranchId,
        transactionType,
        returnScope,
        returnReason,
        refundMethod,
        exchangeBalanceAction,
        exchangeDiscountAmount,
        returnCreditOverride,
    } = req.body;
    const originalSaleId = req.params.saleId;
    const createdBy = req.user!.id;
    const branchId: string | undefined =
        (typeof bodyBranchId === 'string' && bodyBranchId) ||
        req.user?.branch_id ||
        undefined;

    const sale = await saleService.createExchangeOrReturnSale({
        originalSaleId,
        branchId,
        customerId,
        returnedItems,
        exchangedItems,
        notes,
        createdBy,
        transactionType,
        returnScope,
        returnReason,
        refundMethod,
        exchangeBalanceAction,
        exchangeDiscountAmount,
        returnCreditOverride,
    });

    new ApiResponse(sale, "Sale refunded/exchanged successfully").send(res);
});

const getReturnTransactionsController = asyncHandler(async (req: Request, res: Response) => {
    const branchId = resolveBranchId(req);
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const transactions = await saleService.getReturnTransactions({ branchId, search });
    new ApiResponse(transactions, 'Return and exchange transactions fetched').send(res);
});

const getTodaySalesController = asyncHandler(async (req: Request, res: Response) => {
    const sales = await saleService.getTodaySales({ branchId: req.user?.branch_id as string as string });
    new ApiResponse(sales, "Today's sales fetched successfully").send(res);
});

const getRecentSaleItemProductNameAndPrice = asyncHandler(async (req: Request, res: Response) => {
    const branchId = resolveBranchId(req);
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const recentSales = await saleService.getRecentSales(branchId, limit);
    new ApiResponse(recentSales, "Recent sales fetched successfully").send(res);
});

const getHoldSalesController = asyncHandler(async (req: Request, res: Response) => {
    const branchId = resolveBranchId(req);
    if (!branchId) {
        return new ApiResponse([], "No branch ID found for hold sales").send(res);
    }

    const holdSales = await saleService.getHoldSales({ branchId });
    new ApiResponse(holdSales, "Held sales fetched successfully").send(res);
});

const createHoldSaleController = asyncHandler(async (req: Request, res: Response) => {
    const branchId = resolveBranchId(req);
    if (!branchId) {
        return new ApiResponse(null, "No branch ID found for hold sale", 400, false).send(res);
    }

    const holdSale = await saleService.createHoldSale({
        branchId,
        customerId: req.body?.customerId,
        createdBy: req.user?.id,
        items: req.body?.items || [],
    });

    new ApiResponse(holdSale, "Sale held successfully", 201).send(res);
});

const retrieveHoldSaleController = asyncHandler(async (req: Request, res: Response) => {
    const branchId = resolveBranchId(req);
    if (!branchId) {
        return new ApiResponse(null, "No branch ID found for hold sale retrieval", 400, false).send(res);
    }

    const holdSale = await saleService.retrieveHoldSale({
        holdSaleId: req.params.holdSaleId,
        branchId,
    });

    new ApiResponse(holdSale, "Held sale retrieved successfully").send(res);
});

const deleteHoldSaleController = asyncHandler(async (req: Request, res: Response) => {
    const branchId = resolveBranchId(req);
    if (!branchId) {
        return new ApiResponse(null, "No branch ID found for hold sale deletion", 400, false).send(res);
    }

    await saleService.deleteHoldSale({
        holdSaleId: req.params.holdSaleId,
        branchId,
    });

    new ApiResponse(null, "Held sale deleted successfully").send(res);
});

const cancelSaleController = asyncHandler(async (req: Request, res: Response) => {
    const sale = await saleService.cancelSale(req.params.saleId, {
        reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
        userId: req.user?.id,
    });
    new ApiResponse(sale, "Sale cancelled successfully").send(res);
});

const updateSaleController = asyncHandler(async (req: Request, res: Response) => {
    const sale = await saleService.updateSale(req.params.saleId, {
        paymentMethod: req.body?.paymentMethod,
        paymentStatus: req.body?.paymentStatus,
        status: req.body?.status,
        notes: req.body?.notes,
        discountAmount:
            req.body?.discountAmount !== undefined && req.body?.discountAmount !== null
                ? Number(req.body.discountAmount)
                : undefined,
        customerId: req.body?.customerId !== undefined ? req.body.customerId : undefined,
        salespersonId: req.body?.salespersonId !== undefined ? req.body.salespersonId : undefined,
        paymentReceived:
            req.body?.paymentReceived !== undefined && req.body?.paymentReceived !== null
                ? Number(req.body.paymentReceived)
                : undefined,
        items: Array.isArray(req.body?.items) ? req.body.items : undefined,
        updatedBy: req.user?.id,
    });
    new ApiResponse(sale, "Sale updated successfully").send(res);
});

const deleteSaleController = asyncHandler(async (req: Request, res: Response) => {
    const result = await saleService.deleteSale(req.params.saleId, { userId: req.user?.id });
    new ApiResponse(result, "Sale deleted successfully").send(res);
});

export {
    getSalesController,
    getSalesForReturnsController,
    getReturnTransactionsController,
    getSaleByIdController,
    createSaleController,
    refundSaleController,
    getTodaySalesController,
    getRecentSaleItemProductNameAndPrice,
    getHoldSalesController,
    createHoldSaleController,
    retrieveHoldSaleController,
    deleteHoldSaleController,
    cancelSaleController,
    updateSaleController,
    deleteSaleController,
};

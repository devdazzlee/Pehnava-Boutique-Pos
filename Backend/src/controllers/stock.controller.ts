import { Request, Response } from "express";
import asyncHandler from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { StockService } from "../services/stock.service";
import { AppError } from "../utils/apiError";

const stockService = new StockService();

const createStockController = asyncHandler(async (req: Request, res: Response) => {
    console.log("User ID:", req.user?.id, req.user?.role);
    
    const stock = await stockService.createStock({ ...req.body, createdBy: req.user!.id });
    new ApiResponse(stock, "Stock added successfully", 201).send(res);
});

const adjustStockController = asyncHandler(async (req: Request, res: Response) => {
    const stock = await stockService.adjustStock({ ...req.body, createdBy: req.user!.id });
    new ApiResponse(stock, "Stock adjusted successfully").send(res);
});

const transferStockController = asyncHandler(async (req: Request, res: Response) => {
    const result = await stockService.transferStock({ ...req.body, createdBy: req.user!.id });
    new ApiResponse(result, "Stock transferred successfully").send(res);
});

const getStocksController = asyncHandler(async (req: Request, res: Response) => {
    const branchId = req.query.branchId as string;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const search = req.query.search as string | undefined;
    const categoryId = req.query.categoryId as string | undefined;
    const brandId = req.query.brandId as string | undefined;
    const supplierId = req.query.supplierId as string | undefined;
    const stockStatus = req.query.stockStatus as string | undefined;
    const userRole = req.user?.role as string | undefined;

    const result = await stockService.getStockByBranch(
        branchId || "",
        page,
        limit,
        search,
        userRole,
        categoryId,
        brandId,
        supplierId,
        stockStatus,
    );
    new ApiResponse(result.data, "Stocks retrieved successfully", 200, true, result.meta).send(res);
});

// Returns the on-hand quantity of a single product at a single branch. Used
// by Stock Out / Transfer dialogs to show "Available: N" inline. Returns
// current_quantity = 0 (rather than 404) when there's no Stock row yet, so
// the client always gets a number.
const getStockByProductBranchController = asyncHandler(
    async (req: Request, res: Response) => {
        const { productId, branchId } = req.params;
        const stock = await stockService.getStockByProductBranch(productId, branchId);
        new ApiResponse(stock, "Stock retrieved").send(res);
    },
);

const movementQuery = (req: Request) => ({
    branchId: (req.query.branchId as string) || undefined,
    userRole: req.user?.role as string | undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    search: (req.query.search as string) || undefined,
    categoryId: (req.query.categoryId as string) || undefined,
    movementType: (req.query.movementType as string) || undefined,
});

const getStockMovementsController = asyncHandler(async (req: Request, res: Response) => {
    const result = await stockService.getStockMovements(movementQuery(req));
    new ApiResponse(result.data, "Stock movement history retrieved", 200, true, result.meta).send(res);
});

const getTodayStockMovementsController = asyncHandler(async (req: Request, res: Response) => {
    const result = await stockService.getTodayStockMovements(movementQuery(req));
    new ApiResponse(result.data, "Today's stock movements retrieved", 200, true, result.meta).send(res);
});

const removeStockController = asyncHandler(async (req: Request, res: Response) => {
    const stock = await stockService.removeStock({ ...req.body, createdBy: req.user!.id });
    new ApiResponse(stock, "Stock removed successfully").send(res);
});

export {
    createStockController,
    adjustStockController,
    transferStockController,
    removeStockController,
    getStocksController,
    getStockByProductBranchController,
    getStockMovementsController,
    getTodayStockMovementsController,
};
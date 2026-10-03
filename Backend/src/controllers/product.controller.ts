import { Request, Response } from 'express';
import { ProductService } from '../services/product.service';
import { ReportsService } from '../services/reports.service';
import { ApiResponse } from '../utils/apiResponse';
import asyncHandler from '../middleware/asyncHandler';
import { resolveBranchId } from '../utils/resolveBranchId';
import { invalidateWebCatalogCache } from '../utils/webCache';
import { parse as csvParse } from 'csv-parse/sync';
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const productService = new ProductService();
const reportsService = new ReportsService();

/**
 * Upload a single image to Cloudinary and return the URL.
 * This is called BEFORE create/update so the PATCH/POST body stays tiny.
 */
export const uploadProductImage = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
        return new ApiResponse(null, 'No image file provided', 400, false).send(res);
    }
    const { imageService } = await import('../services/common/cloudinaryService');
    const url = await imageService.uploadImage(req.file);
    new ApiResponse({ url }, 'Image uploaded successfully').send(res);
});

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
    const { image_urls, ...productData } = req.body;
    const product = await productService.createProduct(productData);

    // Handle pre-uploaded image URLs (new flow)
    if (Array.isArray(image_urls) && image_urls.length > 0) {
        await productService.addProductImageUrls(product.id, image_urls);
    }

    // Legacy: Handle multer files (FormData uploads)
    if (req.files?.length) {
        await productService.processProductImages(
            product.id,
            req.files as Express.Multer.File[]
        );
    }

    await invalidateWebCatalogCache();
    new ApiResponse(product, 'Product created successfully', 201).send(res);
});

export const getProduct = asyncHandler(async (req: Request, res: Response) => {
    const product = await productService.getProductById(req.params.id);
    new ApiResponse(product, 'Product retrieved successfully').send(res);
});

export const getProductPriceHistory = asyncHandler(async (req: Request, res: Response) => {
    const data = await productService.getProductPriceHistory(req.params.id);
    new ApiResponse(data, 'Product price history retrieved').send(res);
});

export const getProductCostHistory = asyncHandler(async (req: Request, res: Response) => {
    const data = await productService.getProductCostHistory(req.params.id);
    new ApiResponse(data, 'Product cost history retrieved').send(res);
});

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
    // Separate image fields from product data
    const { new_images, existing_images, images, ...updateData } = req.body;

    const product = await productService.updateProduct(req.params.id, updateData, req.user?.id);

    new ApiResponse(product, 'Product updated successfully').send(res);
    void invalidateWebCatalogCache();

    // Process images in the background AFTER response is sent
    let base64Images: string[] = [];
    if (Array.isArray(new_images) && new_images.length > 0) {
        base64Images = new_images;
    } else if (Array.isArray(images) && images.length > 0) {
        base64Images = images.filter((img: string) =>
            typeof img === 'string' && img.startsWith('data:')
        );
    }

    let keepImages: string[] = [];
    if (Array.isArray(existing_images)) {
        keepImages = existing_images;
    } else if (Array.isArray(images) && images.length > 0) {
        keepImages = images.filter((img: string) =>
            typeof img === 'string' && !img.startsWith('data:')
        );
    }

    const hasNewImages = base64Images.length > 0;
    const hasExistingImagesField = existing_images !== undefined || Array.isArray(images);

    if (hasNewImages || hasExistingImagesField) {
        productService.updateProductImagesFromBase64(product.id, base64Images, keepImages)
            .then(() => {
                console.log(`✅ Images updated for product ${product.id}`);
                return invalidateWebCatalogCache();
            })
            .catch((err) => console.error(`❌ Image update failed for product ${product.id}:`, err));
    }
});

export const toggleProductStatus = asyncHandler(async (req: Request, res: Response) => {
    await productService.toggleProductStatus(req.params.id);
    await invalidateWebCatalogCache();
    new ApiResponse(null, 'Product status changed successfully').send(res);
});

export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
    const product = await productService.deleteProduct(req.params.id);
    await invalidateWebCatalogCache();
    new ApiResponse(product, 'Product deleted successfully').send(res);
});

export const listProducts = asyncHandler(async (req: Request, res: Response) => {
    const {
        page = 1,
        limit = 20,
        search,
        category_id,
        subcategory_id,
        is_active,
        display_on_pos,
        display_on_website,
        is_featured,
        stock_status,
        branch_id,
        fetch_all,
    } = req.query;

    const stockStatus =
        stock_status === 'out' || stock_status === 'low' ? stock_status : undefined;

    const result = await productService.listProducts({
        page: Number(page),
        limit: Number(limit),
        search: search as string | undefined,
        category_id: category_id as string | undefined,
        subcategory_id: subcategory_id as string | undefined,
        is_active: is_active ? is_active === 'true' : undefined,
        display_on_pos: display_on_pos ? display_on_pos === 'true' : undefined,
        display_on_website: display_on_website ? display_on_website === 'true' : undefined,
        is_featured: is_featured ? is_featured === 'true' : undefined,
        stock_status: stockStatus,
        branch_id: branch_id as string | undefined,
        fetchAll: fetch_all ? fetch_all === 'true' : false,
    });

    new ApiResponse(result.data, 'Products retrieved successfully', 200, true, result.meta).send(res);
});

export const getPosCatalog = asyncHandler(async (req: Request, res: Response) => {
    const branchId = resolveBranchId(req) || (req.query.branch_id as string | undefined);
    const result = await productService.getPosCatalog({ branch_id: branchId });
    new ApiResponse(result.data, 'POS catalog retrieved successfully', 200, true, result.meta).send(res);
});

export const exportProductsToExcel = asyncHandler(async (req: Request, res: Response) => {
    const {
        search,
        category_id,
        subcategory_id,
        supplier_id,
        brand_id,
        is_active,
        display_on_pos,
        display_on_website,
    } = req.query;

    const products = await productService.getProductsForExcelExport({
        search: search as string | undefined,
        category_id: category_id as string | undefined,
        subcategory_id: subcategory_id as string | undefined,
        supplier_id: supplier_id as string | undefined,
        brand_id: brand_id as string | undefined,
        is_active: is_active ? is_active === 'true' : undefined,
        display_on_pos: display_on_pos ? display_on_pos === 'true' : undefined,
        display_on_website: display_on_website ? display_on_website === 'true' : undefined,
    });

    const requestedColumnsRaw = typeof req.query.columns === 'string' ? req.query.columns : '';
    const requestedColumns = requestedColumnsRaw
        .split(',')
        .map((key) => key.trim())
        .filter(Boolean);

    const columnLabelMap: Record<string, string> = {
        product_id: 'Product ID',
        product_code: 'Product Code',
        product_name: 'Product Name',
        sku: 'SKU',
        barcode: 'Barcode',
        description: 'Description',
        hs_code: 'PCT / HS Code',
        purchase_rate: 'Purchase Rate',
        sales_rate_exc: 'Sales Rate (Exc Tax/Discount)',
        sales_rate_inc: 'Sales Rate (Inc Tax/Discount)',
        discount_amount: 'Discount Amount',
        category_id: 'Category ID',
        category_name: 'Category',
        category_code: 'Category Code',
        subcategory_id: 'Subcategory ID',
        subcategory_name: 'Subcategory',
        subcategory_code: 'Subcategory Code',
        unit_id: 'Unit ID',
        unit_name: 'Unit',
        unit_code: 'Unit Code',
        tax_id: 'Tax ID',
        tax_name: 'Tax',
        tax_code: 'Tax Code',
        tax_percentage: 'Tax Percentage',
        supplier_id: 'Supplier ID',
        supplier_name: 'Supplier',
        supplier_code: 'Supplier Code',
        brand_id: 'Brand ID',
        brand_name: 'Brand',
        brand_code: 'Brand Code',
        color_id: 'Color ID',
        color_name: 'Color',
        color_code: 'Color Code',
        size_id: 'Size ID',
        size_name: 'Size',
        size_code: 'Size Code',
        min_qty: 'Min Quantity',
        max_qty: 'Max Quantity',
        current_stock: 'Current Stock',
        reserved_stock: 'Reserved Stock',
        available_stock: 'Available Stock',
        minimum_stock: 'Minimum Stock',
        maximum_stock: 'Maximum Stock',
        is_active: 'Active?',
        display_on_pos: 'Display On POS?',
        display_on_website: 'Display On Website?',
        is_batch: 'Batch Item?',
        auto_fill_on_demand_sheet: 'Auto Fill On Demand Sheet?',
        non_inventory_item: 'Non Inventory Item?',
        is_deal: 'Deal Item?',
        is_featured: 'Featured?',
        has_images: 'Has Images?',
        first_image_url: 'First Image URL',
        created_at: 'Created At',
        updated_at: 'Updated At',
    };

    const allColumnKeys = Object.keys(columnLabelMap);
    const selectedColumns = requestedColumns.length
        ? requestedColumns.filter((key) => allColumnKeys.includes(key))
        : allColumnKeys;

    const rows = products.map((product) => {
        const totalCurrentStock = product.stock.reduce(
            (sum, item) => sum + Number(item.current_quantity ?? 0),
            0
        );
        const totalReservedStock = product.stock.reduce(
            (sum, item) => sum + Number(item.reserved_quantity ?? 0),
            0
        );
        const totalMinimumStock = product.stock.reduce(
            (sum, item) => sum + Number(item.minimum_quantity ?? 0),
            0
        );
        const totalMaximumStock = product.stock.reduce(
            (sum, item) => sum + Number(item.maximum_quantity ?? 0),
            0
        );

        const valuesByKey: Record<string, string | number | boolean> = {
            product_id: product.id,
            product_code: product.code,
            product_name: product.name,
            sku: product.sku || '',
            barcode: product.sku || '',
            description: product.description || '',
            hs_code: product.pct_or_hs_code || '',
            purchase_rate: Number(product.purchase_rate ?? 0),
            sales_rate_exc: Number(product.sales_rate_exc_dis_and_tax ?? 0),
            sales_rate_inc: Number(product.sales_rate_inc_dis_and_tax ?? 0),
            discount_amount: Number(product.discount_amount ?? 0),
            category_id: product.category_id,
            category_name: product.category?.name || '',
            category_code: product.category?.code || '',
            subcategory_id: product.subcategory_id || '',
            subcategory_name: product.subcategory?.name || '',
            subcategory_code: product.subcategory?.code || '',
            unit_id: product.unit_id,
            unit_name: product.unit?.name || '',
            unit_code: product.unit?.code || '',
            tax_id: product.tax_id || '',
            tax_name: product.tax?.name || '',
            tax_code: product.tax?.code || '',
            tax_percentage: Number(product.tax?.percentage ?? 0),
            supplier_id: product.supplier_id || '',
            supplier_name: product.supplier?.name || '',
            supplier_code: product.supplier?.code || '',
            brand_id: product.brand_id || '',
            brand_name: product.brand?.name || '',
            brand_code: product.brand?.code || '',
            color_id: product.color_id || '',
            color_name: product.color?.name || '',
            color_code: product.color?.code || '',
            size_id: product.size_id || '',
            size_name: product.size?.name || '',
            size_code: product.size?.code || '',
            min_qty: product.min_qty ?? 0,
            max_qty: product.max_qty ?? 0,
            current_stock: totalCurrentStock,
            reserved_stock: totalReservedStock,
            available_stock: totalCurrentStock - totalReservedStock,
            minimum_stock: totalMinimumStock,
            maximum_stock: totalMaximumStock,
            is_active: product.is_active,
            display_on_pos: product.display_on_pos,
            display_on_website: product.display_on_website,
            is_batch: product.is_batch,
            auto_fill_on_demand_sheet: product.auto_fill_on_demand_sheet,
            non_inventory_item: product.non_inventory_item,
            is_deal: product.is_deal,
            is_featured: product.is_featured,
            has_images: product.has_images,
            first_image_url: product.ProductImage[0]?.image || '',
            created_at: product.created_at.toISOString(),
            updated_at: product.updated_at.toISOString(),
        };

        const exportRow: Record<string, string | number | boolean> = {};
        selectedColumns.forEach((key) => {
            exportRow[columnLabelMap[key]] = valuesByKey[key] ?? '';
        });

        return exportRow;
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const fileName = `products-export-${new Date().toISOString().split('T')[0]}.xlsx`;

    res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
});

export const getFeaturedProducts = asyncHandler(async (req: Request, res: Response) => {
    console.log('Fetching featured products');
    
    const featuredProducts = await productService.getFeaturedProducts();
    new ApiResponse(featuredProducts, 'Featured products retrieved successfully', 200).send(res);
});

export const getBestSellingProducts = asyncHandler(async (req: Request, res: Response) => {
    const branchId = resolveBranchId(req);
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const bestSellingProducts = await reportsService.getBestSellingProducts({
        branchId,
        userRole: req.user?.role,
        limit,
    });
    new ApiResponse(bestSellingProducts, 'Best selling products retrieved successfully', 200).send(res);
});

/** Read first non-empty cell from a spreadsheet row (supports Stock In template headers). */
function pickCell(row: Record<string, unknown>, ...keys: string[]): unknown {
    for (const key of keys) {
        const v = row[key];
        if (v !== undefined && v !== null && String(v).trim() !== '') {
            return v;
        }
    }
    return undefined;
}

function parseExcelBoolean(value: unknown, fallback: boolean): boolean {
    if (value === undefined || value === null || String(value).trim() === '') return fallback;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (['true', 'yes', '1', 'y'].includes(normalized)) return true;
    if (['false', 'no', '0', 'n'].includes(normalized)) return false;
    return fallback;
}

function mapBulkUploadRow(prod: Record<string, unknown>) {
    const nameRaw = pickCell(
        prod,
        'Product Name',
        'product name',
        'Name',
        'name',
        'PRODUCT NAME',
    );
    const purchaseRaw = pickCell(
        prod,
        'Purchase Rate',
        'purchase_rate',
        'Buy Price (Rs)',
        'buy_price',
        'Cost',
    );
    const salesRaw = pickCell(
        prod,
        'Sales Rate',
        'sales_rate_inc_dis_and_tax',
        'sales_rate_exc_dis_and_tax',
        'Selling Price',
        'selling_price',
        'Sell Price (Rs)',
    );
    const minRaw = pickCell(prod, 'Min Stock', 'min_qty', 'min stock', 'Minimum Stock');
    const stockRaw = pickCell(
        prod,
        'Stock',
        'stock',
        'Initial Stock Qty',
        'Opening Stock',
        'Quantity',
        'quantity',
    );

    const purchase_rate = Number(purchaseRaw) || 0;
    let sales_rate_exc_dis_and_tax =
        Number(pickCell(prod, 'sales_rate_exc_dis_and_tax')) || 0;
    let sales_rate_inc_dis_and_tax =
        Number(pickCell(prod, 'sales_rate_inc_dis_and_tax')) || Number(salesRaw) || 0;

    if (!sales_rate_exc_dis_and_tax && !sales_rate_inc_dis_and_tax) {
        sales_rate_exc_dis_and_tax = purchase_rate;
        sales_rate_inc_dis_and_tax = purchase_rate;
    } else if (!sales_rate_exc_dis_and_tax) {
        sales_rate_exc_dis_and_tax = sales_rate_inc_dis_and_tax;
    } else if (!sales_rate_inc_dis_and_tax) {
        sales_rate_inc_dis_and_tax = sales_rate_exc_dis_and_tax;
    }

    let min_qty = 10;
    if (minRaw !== undefined) {
        const n = Number(minRaw);
        if (Number.isFinite(n)) min_qty = n;
    }

    let opening_stock = 0;
    if (stockRaw !== undefined) {
        const n = Number(stockRaw);
        if (Number.isFinite(n) && n > 0) opening_stock = n;
    }

    const maxRaw = pickCell(prod, 'max_qty', 'Max Stock', 'max stock');
    let max_qty = 10;
    if (maxRaw !== undefined) {
        const n = Number(maxRaw);
        if (Number.isFinite(n)) max_qty = n;
    }

    return {
        name: nameRaw ? String(nameRaw).trim() : '',
        purchase_rate,
        sales_rate_exc_dis_and_tax,
        sales_rate_inc_dis_and_tax,
        min_qty,
        max_qty,
        opening_stock,
        is_active: prod.is_active !== undefined ? Boolean(prod.is_active) : true,
        display_on_pos: prod.display_on_pos !== undefined ? Boolean(prod.display_on_pos) : true,
        display_on_website: parseExcelBoolean(
            pickCell(
                prod,
                'display_on_website',
                'Display On Website?',
                'Display On Website',
                'Show on website',
            ),
            true,
        ),
        is_batch: prod.is_batch !== undefined ? Boolean(prod.is_batch) : false,
        auto_fill_on_demand_sheet:
            prod.auto_fill_on_demand_sheet !== undefined
                ? Boolean(prod.auto_fill_on_demand_sheet)
                : false,
        non_inventory_item:
            prod.non_inventory_item !== undefined ? Boolean(prod.non_inventory_item) : false,
        is_deal: prod.is_deal !== undefined ? Boolean(prod.is_deal) : false,
        is_featured: prod.is_featured !== undefined ? Boolean(prod.is_featured) : false,
        description: prod.description as string | undefined,
        pct_or_hs_code: prod.pct_or_hs_code as string | undefined,
        sku: (pickCell(prod, 'sku', 'SKU') as string | undefined) || undefined,
        discount_amount: prod.discount_amount ? Number(prod.discount_amount) : 0,
        unit_name: pickCell(prod, 'unit_name', 'unit', 'Unit') as string | undefined,
        category_name: pickCell(prod, 'category_name', 'category', 'Category') as
            | string
            | undefined,
        subcategory_name: pickCell(
            prod,
            'subcategory_name',
            'subcategory',
            'Subcategory',
        ) as string | undefined,
        tax_name: pickCell(prod, 'tax_name', 'tax', 'Tax') as string | undefined,
        supplier_name: pickCell(prod, 'supplier_name', 'supplier', 'Supplier') as
            | string
            | undefined,
        brand_name: pickCell(prod, 'brand_name', 'brand', 'Brand') as string | undefined,
        color_name: pickCell(prod, 'color_name', 'color', 'Color') as string | undefined,
        size_name: pickCell(prod, 'size_name', 'size', 'Size') as string | undefined,
    };
}

// Per-row import — used by the live-progress upload dialog. Accepts one
// product row as JSON (using the same header aliases as the bulk endpoint)
// and runs it through the exact same mapping + service. Returns the result
// of just that row so the client can show progress per call.
export const importProductRow = asyncHandler(async (req: Request, res: Response) => {
    const row = (req.body?.row || req.body || {}) as Record<string, unknown>;
    const enhancedProd = mapBulkUploadRow(row);

    if (!enhancedProd.name) {
        return new ApiResponse(null, 'Missing required field: Product Name', 400, false).send(res);
    }
    if (
        !enhancedProd.sales_rate_exc_dis_and_tax &&
        !enhancedProd.sales_rate_inc_dis_and_tax &&
        !enhancedProd.purchase_rate
    ) {
        return new ApiResponse(null, 'Missing required field: purchase or sales rate', 400, false).send(res);
    }

    const createdBy = (req as Request & { user?: { id: string } }).user?.id;

    try {
        const created = await productService.createProductFromBulkUpload(enhancedProd, createdBy);
        await invalidateWebCatalogCache();
        new ApiResponse(
            {
                id: created.id,
                name: created.name,
                unit: created.unit?.name || 'Unknown',
                category: created.category?.name || 'Unknown',
                stockAdded: enhancedProd.opening_stock,
            },
            'Product imported',
            201,
        ).send(res);
    } catch (err) {
        new ApiResponse(null, (err as Error).message || 'Import failed', 400, false).send(res);
    }
});

export const bulkUploadProducts = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
        return new ApiResponse(null, 'No file uploaded', 400, false).send(res);
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    let products: any[] = [];

    if (ext === '.csv') {
        const csvString = req.file.buffer.toString('utf-8');
        products = csvParse(csvString, {
            columns: true,
            skip_empty_lines: true,
        });
    } else if (ext === '.xlsx' || ext === '.xls') {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        products = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    } else {
        return new ApiResponse(null, 'Unsupported file type', 400, false).send(res);
    }

    const createdBy = (req as Request & { user?: { id: string } }).user?.id;

    const results: {
        success: boolean;
        id?: string;
        name?: string;
        unit?: string;
        category?: string;
        stockAdded?: number;
        error?: string;
        data?: unknown;
    }[] = [];

    for (const prod of products) {
        try {
            const enhancedProd = mapBulkUploadRow(prod as Record<string, unknown>);

            if (!enhancedProd.name) {
                continue;
            }
            if (/^sample product/i.test(enhancedProd.name)) {
                continue;
            }

            if (
                !enhancedProd.sales_rate_exc_dis_and_tax &&
                !enhancedProd.sales_rate_inc_dis_and_tax &&
                !enhancedProd.purchase_rate
            ) {
                throw new Error('Missing required field: purchase or sales rate');
            }

            const created = await productService.createProductFromBulkUpload(
                enhancedProd,
                createdBy,
            );
            results.push({
                success: true,
                id: created.id,
                name: created.name,
                unit: created.unit?.name || 'Unknown',
                category: created.category?.name || 'Unknown',
                stockAdded: enhancedProd.opening_stock,
            });
        } catch (err) {
            results.push({
                success: false,
                error: (err as Error).message,
                data: prod,
            });
        }
    }

    if (products.length > 0 && results.length === 0) {
        return new ApiResponse(
            results,
            'No data rows found. Use the downloaded template headers (Product Name, Purchase Rate, Sales Rate, Stock, etc.).',
            400,
            false,
        ).send(res);
    }

    await invalidateWebCatalogCache();
    new ApiResponse(results, 'Bulk upload completed').send(res);
});

export const deleteAllProducts = asyncHandler(async (req: Request, res: Response) => {
    const result = await productService.deleteAllProducts();
    await invalidateWebCatalogCache();
    new ApiResponse(
        result, 
        `Successfully deleted ${result.deletedCount} products, ${result.deletedImages} product images, ${result.deletedStocks} stock records, ${result.deletedStockMovements} stock movements, ${result.deletedSaleItems} sale items, ${result.deletedPurchaseOrderItems} purchase order items, and ${result.deletedOrderItems} order items`,
        200
    ).send(res);
});
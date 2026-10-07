import { z } from 'zod';

const productBaseSchema = z.object({
    name: z.string().min(1, 'Name is required').max(200),
    unit_id: z.string().optional(),
    category_id: z.string().optional(),
    purchase_rate: z.number().min(0, 'Purchase rate must be positive'),
    sales_rate_exc_dis_and_tax: z.number().min(0, 'Sales rate must be positive'),
    sales_rate_inc_dis_and_tax: z.number().min(0, 'Sales rate must be positive'),
    description: z.string().optional(),
    pct_or_hs_code: z.string().optional(),
    sku: z
        .string()
        .optional()
        .refine(
            (val) =>
                val === undefined ||
                val === null ||
                String(val).trim() === '' ||
                /^\d{9}$/.test(String(val).trim()),
            { message: 'SKU must be exactly 9 digits (numbers only), or omit to auto-generate' }
        ),
    custom_code: z
        .string()
        .trim()
        .max(64)
        .regex(/^[\x20-\x7E]+$/, 'Custom code must be printable ASCII')
        .nullable()
        .optional(),
    label_barcode: z
        .string()
        .trim()
        .max(64)
        .regex(/^[\x20-\x7E]+$/, 'Label barcode must be printable ASCII')
        .nullable()
        .optional(),
    discount_amount: z.number().min(0).optional(),
    tax_id: z.string().optional(),
    subcategory_id: z.string().optional(),
    min_qty: z.number().int().min(0).optional().default(10),
    max_qty: z.number().int().min(0).optional().default(10),
    supplier_id: z.string().optional(),
    brand_id: z.string().optional(),
    collection: z.string().trim().max(80).nullable().optional(),
    color_id: z.string().optional(),
    size_id: z.string().optional(),
    is_active: z.boolean().optional().default(true),
    display_on_pos: z.boolean().optional().default(true),
    display_on_website: z.boolean().optional().default(true),
    is_batch: z.boolean().optional().default(false),
    auto_fill_on_demand_sheet: z.boolean().optional().default(false),
    non_inventory_item: z.boolean().optional().default(false),
    is_deal: z.boolean().optional().default(false),
    is_featured: z.boolean().optional().default(false),
});

export const createProductSchema = z.object({
    body: productBaseSchema.extend({
        image_urls: z.array(z.string()).optional(),
    }),
});

export const updateProductSchema = z.object({
    body: productBaseSchema.partial().extend({
        new_images: z.array(z.string()).optional(),
        existing_images: z.array(z.string()).optional(),
    }),
    params: z.object({
        id: z.string().min(1, 'Product ID is required'),
    }),
});

export const getProductSchema = z.object({
    params: z.object({
        id: z.string().min(1, 'Product ID is required'),
    }),
});

export const listProductsSchema = z.object({
    query: z.object({
        page: z.string().optional().default('1'),
        limit: z.string().optional().default('20'),
        search: z.string().optional(),
        category_id: z.string().optional(),
        subcategory_id: z.string().optional(),
        is_active: z.string().optional(),
        display_on_pos: z.string().optional(),
        display_on_website: z.string().optional(),
        is_featured: z.string().optional(),
        stock_status: z.enum(['out', 'low']).optional(),
        branch_id: z.string().optional(),
        fetch_all: z.string().optional(),
    }),
});

export type CreateProductInput = z.infer<typeof createProductSchema>['body'];
export type UpdateProductInput = z.infer<typeof updateProductSchema>['body'];
import { z } from "zod";

const saleItemSchema = z.object({
    productId: z.string(),
    quantity: z.number().positive("Quantity must be positive"),
    price: z.number().nonnegative(),
});

const createSaleSchema = z.object({
    body: z.object({
        customerId: z.string().optional(),
        salespersonId: z.string().uuid().nullable().optional(),
        paymentMethod: z.enum(["CASH", "CARD", "MOBILE_MONEY", "BANK_TRANSFER", "CREDIT"]),
        items: z.array(saleItemSchema).min(1),
        discountAmount: z.number().nonnegative("Discount amount must be non-negative").optional().default(0),
    }),
});

const returnReasonSchema = z.enum([
    "DAMAGED",
    "DEFECTIVE",
    "WRONG_ITEM",
    "CUSTOMER_CHANGED_MIND",
    "MISSING_PARTS",
    "OTHER",
]);

const refundMethodSchema = z.enum([
    "original_payment",
    "cash",
    "card",
    "bank_transfer",
    "store_credit",
    "no_refund",
]);

const dispositionSchema = z.enum(["RESTOCK", "DAMAGED", "UNSELLABLE"]);

const refundSaleSchema = z.object({
    body: z.object({
        customerId: z.string().optional(),
        branchId: z.string().optional(),
        transactionType: z.enum(["RETURN", "EXCHANGE"]).optional(),
        returnScope: z.enum(["FULL", "PARTIAL"]).optional(),
        returnReason: returnReasonSchema.optional(),
        refundMethod: refundMethodSchema.optional(),
        exchangeBalanceAction: z.enum(["collect", "refund", "store_credit"]).optional(),
        returnedItems: z
            .array(
                z.object({
                    productId: z.string().min(1, "Product ID is required"),
                    quantity: z.number().positive("Quantity must be positive"),
                    disposition: dispositionSchema.optional().default("RESTOCK"),
                })
            )
            .optional()
            .default([]),
        exchangedItems: z
            .array(
                z.object({
                    productId: z.string().min(1, "Product ID is required"),
                    quantity: z.number().positive("Quantity must be positive"),
                    price: z.number().nonnegative("Price must be non-negative"),
                })
            )
            .optional()
            .default([]),
        notes: z.string().optional(),
    }).refine((data) => {
        return data.returnedItems.length > 0 || data.exchangedItems.length > 0;
    }, {
        message: "At least one item must be returned or exchanged",
        path: ["returnedItems"],
    }).refine((data) => {
        const isExchange = data.exchangedItems.length > 0;
        if (!isExchange && !data.refundMethod) {
            return false;
        }
        return true;
    }, {
        message: "Refund method is required for returns",
        path: ["refundMethod"],
    }),
});

export { createSaleSchema, refundSaleSchema };

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refundSaleSchema = exports.createSaleSchema = void 0;
const zod_1 = require("zod");
const saleItemSchema = zod_1.z.object({
    productId: zod_1.z.string(),
    quantity: zod_1.z.number().positive("Quantity must be positive"),
    price: zod_1.z.number().nonnegative(),
});
const createSaleSchema = zod_1.z.object({
    body: zod_1.z.object({
        customerId: zod_1.z.string().optional(),
        salespersonId: zod_1.z.string().uuid().nullable().optional(),
        paymentMethod: zod_1.z.enum(["CASH", "CARD", "MOBILE_MONEY", "BANK_TRANSFER", "CREDIT"]),
        /** Split tenders. When omitted the whole bill is paid with `paymentMethod`. */
        payments: zod_1.z
            .array(zod_1.z.object({
            method: zod_1.z.enum(["CASH", "CARD", "MOBILE_MONEY", "BANK_TRANSFER"]),
            amount: zod_1.z.number().positive("Payment amount must be greater than 0"),
            reference: zod_1.z.string().max(120).nullable().optional(),
        }))
            .max(10)
            .optional(),
        items: zod_1.z.array(saleItemSchema).min(1),
        discountAmount: zod_1.z.number().nonnegative("Discount amount must be non-negative").optional().default(0),
        promotionCode: zod_1.z.string().trim().max(24).nullable().optional(),
        applyPromotions: zod_1.z.boolean().optional(),
        loyaltyPoints: zod_1.z.number().int().nonnegative().optional(),
        giftCards: zod_1.z
            .array(zod_1.z.object({ code: zod_1.z.string().trim().min(3).max(30), amount: zod_1.z.number().positive() }))
            .max(5)
            .optional(),
    }),
});
exports.createSaleSchema = createSaleSchema;
const returnReasonSchema = zod_1.z.enum([
    "DAMAGED",
    "DEFECTIVE",
    "WRONG_ITEM",
    "CUSTOMER_CHANGED_MIND",
    "MISSING_PARTS",
    "OTHER",
]);
const refundMethodSchema = zod_1.z.enum([
    "original_payment",
    "cash",
    "card",
    "bank_transfer",
    "store_credit",
    "no_refund",
]);
const dispositionSchema = zod_1.z.enum(["RESTOCK", "DAMAGED", "UNSELLABLE"]);
const refundSaleSchema = zod_1.z.object({
    body: zod_1.z.object({
        customerId: zod_1.z.string().optional(),
        branchId: zod_1.z.string().optional(),
        transactionType: zod_1.z.enum(["RETURN", "EXCHANGE"]).optional(),
        returnScope: zod_1.z.enum(["FULL", "PARTIAL"]).optional(),
        returnReason: returnReasonSchema.optional(),
        refundMethod: refundMethodSchema.optional(),
        exchangeBalanceAction: zod_1.z.enum(["collect", "refund", "store_credit"]).optional(),
        returnedItems: zod_1.z
            .array(zod_1.z.object({
            productId: zod_1.z.string().min(1, "Product ID is required"),
            quantity: zod_1.z.number().positive("Quantity must be positive"),
            disposition: dispositionSchema.optional().default("RESTOCK"),
        }))
            .optional()
            .default([]),
        exchangedItems: zod_1.z
            .array(zod_1.z.object({
            productId: zod_1.z.string().min(1, "Product ID is required"),
            quantity: zod_1.z.number().positive("Quantity must be positive"),
            price: zod_1.z.number().nonnegative("Price must be non-negative"),
        }))
            .optional()
            .default([]),
        notes: zod_1.z.string().optional(),
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
exports.refundSaleSchema = refundSaleSchema;
//# sourceMappingURL=sale.validation.js.map
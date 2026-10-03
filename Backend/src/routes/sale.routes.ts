import { Request, Router } from "express";
import { requirePermission } from "../middleware/permission.middleware";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";
import {
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
} from "../controllers/sale.controller";
import { createSaleSchema, refundSaleSchema } from "../validations/sale.validation";

const router = Router();
const holdSaleRoles = [
    "SUPER_ADMIN",
    "ADMIN",
    "BRANCH_MANAGER",
    "CASHIER",
    "WAREHOUSE_MANAGER",
    "PURCHASE_MANAGER",
];
const saleManagementRoles = ["SUPER_ADMIN", "ADMIN", "BRANCH_MANAGER", "CASHIER"];
const metadataRoles = ["SUPER_ADMIN", "ADMIN", "BRANCH_MANAGER", "WAREHOUSE_MANAGER", "PURCHASE_MANAGER"];
const adminRoles = ["SUPER_ADMIN", "ADMIN"];

/** Discount and credit (pay-later) at checkout need their own permission or a manager's approval. */
const saleCheckoutPermissions = (req: Request) => {
    const body = req.body || {};
    const keys: string[] = [];
    if (Number(body.discountAmount) > 0) keys.push("sales.discount");
    const items: { price: number; quantity: number }[] = Array.isArray(body.items) ? body.items : [];
    const total = items.reduce((s, it) => s + Number(it.price) * Number(it.quantity), 0) - (Number(body.discountAmount) || 0);
    const paid = Array.isArray(body.payments) ? body.payments.reduce((s: number, p: { amount: number }) => s + Number(p.amount || 0), 0) : null;
    if (body.paymentMethod === "CREDIT" || (paid !== null && paid < total - 0.005)) keys.push("sales.credit");
    return keys;
};

router.use(authenticate);
router.use("/hold", authorize(holdSaleRoles));

// Hold-sale operations should be available to any authenticated staff role.
router.get("/hold", getHoldSalesController);
router.post("/hold", createHoldSaleController);
router.post("/hold/:holdSaleId/retrieve", retrieveHoldSaleController);
router.delete("/hold/:holdSaleId", deleteHoldSaleController);

router.use(authorize(saleManagementRoles));

router.get("/recent", authorize(metadataRoles), getRecentSaleItemProductNameAndPrice);
router.get("/today", getTodaySalesController);
router.get("/for-returns", getSalesForReturnsController);
router.get("/return-transactions", getReturnTransactionsController);
router.get("/", getSalesController);
router.get("/:saleId", getSaleByIdController);
router.post("/", validate(createSaleSchema), requirePermission(saleCheckoutPermissions), createSaleController);
router.patch("/:saleId/refund", validate(refundSaleSchema), requirePermission("sales.refund"), refundSaleController);
router.patch("/:saleId/cancel", requirePermission("sales.void"), cancelSaleController);
router.patch("/:saleId", requirePermission("sales.edit"), updateSaleController);
router.delete("/:saleId", requirePermission("sales.delete", { approvable: false }), deleteSaleController);

export default router;

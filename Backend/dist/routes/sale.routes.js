"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const permission_middleware_1 = require("../middleware/permission.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validation_middleware_1 = require("../middleware/validation.middleware");
const sale_controller_1 = require("../controllers/sale.controller");
const sale_validation_1 = require("../validations/sale.validation");
const router = (0, express_1.Router)();
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
const saleCheckoutPermissions = (req) => {
    const body = req.body || {};
    const keys = [];
    if (Number(body.discountAmount) > 0)
        keys.push("sales.discount");
    const items = Array.isArray(body.items) ? body.items : [];
    const total = items.reduce((s, it) => s + Number(it.price) * Number(it.quantity), 0) - (Number(body.discountAmount) || 0);
    const paid = Array.isArray(body.payments) ? body.payments.reduce((s, p) => s + Number(p.amount || 0), 0) : null;
    if (body.paymentMethod === "CREDIT" || (paid !== null && paid < total - 0.005))
        keys.push("sales.credit");
    return keys;
};
router.use(auth_middleware_1.authenticate);
router.use("/hold", (0, auth_middleware_1.authorize)(holdSaleRoles));
// Hold-sale operations should be available to any authenticated staff role.
router.get("/hold", sale_controller_1.getHoldSalesController);
router.post("/hold", sale_controller_1.createHoldSaleController);
router.post("/hold/:holdSaleId/retrieve", sale_controller_1.retrieveHoldSaleController);
router.delete("/hold/:holdSaleId", sale_controller_1.deleteHoldSaleController);
router.use((0, auth_middleware_1.authorize)(saleManagementRoles));
router.get("/recent", (0, auth_middleware_1.authorize)(metadataRoles), sale_controller_1.getRecentSaleItemProductNameAndPrice);
router.get("/today", sale_controller_1.getTodaySalesController);
router.get("/for-returns", sale_controller_1.getSalesForReturnsController);
router.get("/return-transactions", sale_controller_1.getReturnTransactionsController);
router.get("/", sale_controller_1.getSalesController);
router.get("/:saleId", sale_controller_1.getSaleByIdController);
router.post("/", (0, validation_middleware_1.validate)(sale_validation_1.createSaleSchema), (0, permission_middleware_1.requirePermission)(saleCheckoutPermissions), sale_controller_1.createSaleController);
router.patch("/:saleId/refund", (0, validation_middleware_1.validate)(sale_validation_1.refundSaleSchema), (0, permission_middleware_1.requirePermission)("sales.refund"), sale_controller_1.refundSaleController);
router.patch("/:saleId/cancel", (0, permission_middleware_1.requirePermission)("sales.void"), sale_controller_1.cancelSaleController);
router.patch("/:saleId", (0, permission_middleware_1.requirePermission)("sales.edit"), sale_controller_1.updateSaleController);
router.delete("/:saleId", (0, permission_middleware_1.requirePermission)("sales.delete", { approvable: false }), sale_controller_1.deleteSaleController);
exports.default = router;
//# sourceMappingURL=sale.routes.js.map
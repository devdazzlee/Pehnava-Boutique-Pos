"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const validation_middleware_1 = require("../middleware/validation.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const purchase_controller_1 = require("../controllers/purchase.controller");
const purchase_validation_1 = require("../validations/purchase.validation");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'PURCHASE_MANAGER', 'WAREHOUSE_MANAGER', 'BRANCH_MANAGER']));
router.post('/', (0, validation_middleware_1.validate)(purchase_validation_1.createPurchaseSchema), purchase_controller_1.createPurchase);
router.post('/bulk', (0, validation_middleware_1.validate)(purchase_validation_1.createBulkPurchaseSchema), purchase_controller_1.createBulkPurchase);
router.get('/', (0, validation_middleware_1.validate)(purchase_validation_1.listPurchasesSchema), purchase_controller_1.listPurchases);
router.get('/stats', purchase_controller_1.getMonthlyStats);
router.get('/:id', purchase_controller_1.getPurchaseById);
exports.default = router;
//# sourceMappingURL=purchase.routes.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const permission_middleware_1 = require("../middleware/permission.middleware");
const express_1 = require("express");
const validation_middleware_1 = require("../middleware/validation.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const stock_adjustment_controller_1 = require("../controllers/stock-adjustment.controller");
const stock_adjustment_validation_1 = require("../validations/stock-adjustment.validation");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'WAREHOUSE_MANAGER', 'BRANCH_MANAGER']));
router.post('/', (0, validation_middleware_1.validate)(stock_adjustment_validation_1.createAdjustmentSchema), (0, permission_middleware_1.requirePermission)('inventory.adjust'), stock_adjustment_controller_1.createAdjustment);
router.post('/batch', (0, validation_middleware_1.validate)(stock_adjustment_validation_1.createAdjustmentBatchSchema), (0, permission_middleware_1.requirePermission)('inventory.adjust'), stock_adjustment_controller_1.createAdjustmentBatch);
router.get('/', (0, validation_middleware_1.validate)(stock_adjustment_validation_1.listAdjustmentsSchema), stock_adjustment_controller_1.listAdjustments);
exports.default = router;
//# sourceMappingURL=stock-adjustment.routes.js.map
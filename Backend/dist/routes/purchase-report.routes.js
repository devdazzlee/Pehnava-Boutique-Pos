"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validation_middleware_1 = require("../middleware/validation.middleware");
const purchase_report_controller_1 = require("../controllers/purchase-report.controller");
const purchase_report_validation_1 = require("../validations/purchase-report.validation");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'PURCHASE_MANAGER', 'WAREHOUSE_MANAGER', 'BRANCH_MANAGER']));
router.get('/itemwise', (0, validation_middleware_1.validate)(purchase_report_validation_1.itemwisePurchaseReportSchema), purchase_report_controller_1.getItemwisePurchaseReport);
exports.default = router;
//# sourceMappingURL=purchase-report.routes.js.map
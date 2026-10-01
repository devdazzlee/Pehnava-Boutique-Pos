"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validation_middleware_1 = require("../middleware/validation.middleware");
const stock_quantity_report_controller_1 = require("../controllers/stock-quantity-report.controller");
const stock_quantity_report_validation_1 = require("../validations/stock-quantity-report.validation");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'PURCHASE_MANAGER', 'WAREHOUSE_MANAGER', 'BRANCH_MANAGER']));
router.get('/', (0, validation_middleware_1.validate)(stock_quantity_report_validation_1.stockQuantityReportSchema), stock_quantity_report_controller_1.getStockQuantityReport);
exports.default = router;
//# sourceMappingURL=stock-quantity-report.routes.js.map
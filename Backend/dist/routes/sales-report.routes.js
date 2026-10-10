"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validation_middleware_1 = require("../middleware/validation.middleware");
const sales_report_controller_1 = require("../controllers/sales-report.controller");
const sales_report_validation_1 = require("../validations/sales-report.validation");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']));
router.get('/itemwise', (0, validation_middleware_1.validate)(sales_report_validation_1.itemwiseSalesReportSchema), sales_report_controller_1.getItemwiseSalesReport);
exports.default = router;
//# sourceMappingURL=sales-report.routes.js.map
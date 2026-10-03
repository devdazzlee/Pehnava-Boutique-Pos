"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const validation_middleware_1 = require("../middleware/validation.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const stock_out_controller_1 = require("../controllers/stock-out.controller");
const stock_out_validation_1 = require("../validations/stock-out.validation");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']));
router.get('/stats', stock_out_controller_1.getMonthlyStats);
router.get('/', (0, validation_middleware_1.validate)(stock_out_validation_1.listStockOutSchema), stock_out_controller_1.listStockOut);
router.post('/out', (0, validation_middleware_1.validate)(stock_out_validation_1.logStockOutSchema), stock_out_controller_1.logStockOut);
router.post('/bulk', (0, validation_middleware_1.validate)(stock_out_validation_1.logBulkStockOutSchema), stock_out_controller_1.logBulkStockOut);
router.post('/return', (0, validation_middleware_1.validate)(stock_out_validation_1.logReturnSchema), stock_out_controller_1.logReturn);
exports.default = router;
//# sourceMappingURL=stock-out.routes.js.map
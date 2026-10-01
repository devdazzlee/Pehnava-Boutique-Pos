"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validation_middleware_1 = require("../middleware/validation.middleware");
const product_sales_profit_controller_1 = require("../controllers/product-sales-profit.controller");
const product_sales_profit_validation_1 = require("../validations/product-sales-profit.validation");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']));
router.get('/', (0, validation_middleware_1.validate)(product_sales_profit_validation_1.productSalesProfitSchema), product_sales_profit_controller_1.getProductSalesProfit);
exports.default = router;
//# sourceMappingURL=product-sales-profit.routes.js.map
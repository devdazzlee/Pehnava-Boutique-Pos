"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const validation_middleware_1 = require("../middleware/validation.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const stock_controller_1 = require("../controllers/stock.controller");
const stock_validation_1 = require("../validations/stock.validation");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(["SUPER_ADMIN", "ADMIN", "PURCHASE_MANAGER", "WAREHOUSE_MANAGER", "BRANCH_MANAGER"]));
router.post("/", (0, validation_middleware_1.validate)(stock_validation_1.createStockSchema), stock_controller_1.createStockController);
router.patch("/adjust", (0, validation_middleware_1.validate)(stock_validation_1.adjustStockSchema), stock_controller_1.adjustStockController);
router.post("/transfer", (0, validation_middleware_1.validate)(stock_validation_1.transferStockSchema), stock_controller_1.transferStockController);
router.delete("/remove", (0, validation_middleware_1.validate)(stock_validation_1.removeStockSchema), stock_controller_1.removeStockController);
router.get("/", stock_controller_1.getStocksController);
router.get("/history", stock_controller_1.getStockMovementsController);
router.get("/today", stock_controller_1.getTodayStockMovementsController);
router.get("/product/:productId/branch/:branchId", stock_controller_1.getStockByProductBranchController);
exports.default = router;
//# sourceMappingURL=stock.routes.js.map
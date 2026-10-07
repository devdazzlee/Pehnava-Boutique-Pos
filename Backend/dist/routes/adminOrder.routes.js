"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const order_controller_1 = require("../controllers/order.controller");
const validation_middleware_1 = require("../middleware/validation.middleware");
const order_validation_1 = require("../validations/order.validation");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// 🛡 ADMIN ROUTES
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'PURCHASE_MANAGER', 'WAREHOUSE_MANAGER', 'BRANCH_MANAGER']));
router.get('/', order_controller_1.getOrders);
router.get('/:orderId', order_controller_1.getOrder);
router.patch('/:orderId/status', (0, validation_middleware_1.validate)(order_validation_1.updateOrderStatusSchema), order_controller_1.updateOrderStatus);
router.patch('/:orderId/reopen', order_controller_1.reopenOrder);
router.delete('/:orderId', order_controller_1.deleteOrder);
exports.default = router;
//# sourceMappingURL=adminOrder.routes.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const order_controller_1 = require("../controllers/order.controller");
const validation_middleware_1 = require("../middleware/validation.middleware");
const order_validation_1 = require("../validations/order.validation");
const customerAuth_middleware_1 = require("../middleware/customerAuth.middleware");
const router = (0, express_1.Router)();
// 👤 CUSTOMER ROUTES
router.use(customerAuth_middleware_1.authenticateCustomer);
router.post('/', (0, validation_middleware_1.validate)(order_validation_1.createOrderSchema), order_controller_1.createOrder);
router.get('/', order_controller_1.getMyOrders);
router.get('/:id', order_controller_1.getMyOrderById);
router.delete('/:orderId', order_controller_1.cancelOrderByCustomer); // if customers are allowed to cancel
exports.default = router;
//# sourceMappingURL=customerOrder.routes.js.map
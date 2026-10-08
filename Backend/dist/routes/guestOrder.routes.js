"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const guestOrder_controller_1 = require("../controllers/guestOrder.controller");
const validation_middleware_1 = require("../middleware/validation.middleware");
const guestOrder_validation_1 = require("../validations/guestOrder.validation");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// Public — guest checkout
router.post('/', (0, validation_middleware_1.validate)(guestOrder_validation_1.createGuestOrderSchema), guestOrder_controller_1.createGuestOrder);
// Public — customer order status (order number + email or phone)
router.post('/track', (0, validation_middleware_1.validate)(guestOrder_validation_1.trackGuestOrderSchema), guestOrder_controller_1.trackGuestOrder);
// Staff — list / detail
router.get('/', auth_middleware_1.authenticate, guestOrder_controller_1.getGuestOrders);
router.get('/:id', auth_middleware_1.authenticate, guestOrder_controller_1.getGuestOrderById);
exports.default = router;
//# sourceMappingURL=guestOrder.routes.js.map
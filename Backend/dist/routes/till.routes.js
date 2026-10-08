"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const permission_middleware_1 = require("../middleware/permission.middleware");
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validation_middleware_1 = require("../middleware/validation.middleware");
const till_controller_1 = require("../controllers/till.controller");
const till_validation_1 = require("../validations/till.validation");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'CASHIER']));
router.get('/day', (0, validation_middleware_1.validate)(till_validation_1.tillDaySchema), till_controller_1.getTillDay);
router.post('/open', (0, validation_middleware_1.validate)(till_validation_1.tillOpenSchema), (0, permission_middleware_1.requirePermission)('register.operate'), till_controller_1.openTill);
router.post('/paid-out', (0, validation_middleware_1.validate)(till_validation_1.tillPaidOutSchema), (0, permission_middleware_1.requirePermission)('register.paid_out'), till_controller_1.paidOutTill);
router.post('/paid-out/:id/void', (0, validation_middleware_1.validate)(till_validation_1.tillVoidPaidOutSchema), (0, permission_middleware_1.requirePermission)('register.paid_out'), till_controller_1.voidPaidOutTill);
router.post('/close', (0, validation_middleware_1.validate)(till_validation_1.tillCloseSchema), (0, permission_middleware_1.requirePermission)('register.operate'), till_controller_1.closeTill);
router.post('/sessions/:id/reopen', (0, validation_middleware_1.validate)(till_validation_1.tillReopenSchema), (0, permission_middleware_1.requirePermission)('register.reopen'), till_controller_1.reopenTill);
exports.default = router;
//# sourceMappingURL=till.routes.js.map
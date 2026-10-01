"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validation_middleware_1 = require("../middleware/validation.middleware");
const till_controller_1 = require("../controllers/till.controller");
const till_validation_1 = require("../validations/till.validation");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']));
router.get('/day', (0, validation_middleware_1.validate)(till_validation_1.tillDaySchema), till_controller_1.getTillDay);
router.post('/open', (0, validation_middleware_1.validate)(till_validation_1.tillOpenSchema), till_controller_1.openTill);
router.post('/paid-out', (0, validation_middleware_1.validate)(till_validation_1.tillPaidOutSchema), till_controller_1.paidOutTill);
router.post('/close', (0, validation_middleware_1.validate)(till_validation_1.tillCloseSchema), till_controller_1.closeTill);
router.post('/sessions/:id/reopen', (0, validation_middleware_1.validate)(till_validation_1.tillReopenSchema), till_controller_1.reopenTill);
exports.default = router;
//# sourceMappingURL=till.routes.js.map
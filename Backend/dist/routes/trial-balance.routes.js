"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validation_middleware_1 = require("../middleware/validation.middleware");
const trial_balance_controller_1 = require("../controllers/trial-balance.controller");
const trial_balance_validation_1 = require("../validations/trial-balance.validation");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']));
router.get('/', (0, validation_middleware_1.validate)(trial_balance_validation_1.trialBalanceSchema), trial_balance_controller_1.getTrialBalance);
exports.default = router;
//# sourceMappingURL=trial-balance.routes.js.map
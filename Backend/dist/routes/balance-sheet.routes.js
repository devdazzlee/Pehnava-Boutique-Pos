"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validation_middleware_1 = require("../middleware/validation.middleware");
const balance_sheet_controller_1 = require("../controllers/balance-sheet.controller");
const balance_sheet_validation_1 = require("../validations/balance-sheet.validation");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']));
router.get('/', (0, validation_middleware_1.validate)(balance_sheet_validation_1.balanceSheetSchema), balance_sheet_controller_1.getBalanceSheet);
exports.default = router;
//# sourceMappingURL=balance-sheet.routes.js.map
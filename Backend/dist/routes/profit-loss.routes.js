"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validation_middleware_1 = require("../middleware/validation.middleware");
const financial_statement_controller_1 = require("../controllers/financial-statement.controller");
const financial_statement_validation_1 = require("../validations/financial-statement.validation");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']));
router.get('/', (0, validation_middleware_1.validate)(financial_statement_validation_1.financialStatementSchema), financial_statement_controller_1.getFinancialStatement);
exports.default = router;
//# sourceMappingURL=profit-loss.routes.js.map
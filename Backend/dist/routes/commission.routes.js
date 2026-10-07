"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validation_middleware_1 = require("../middleware/validation.middleware");
const commission_controller_1 = require("../controllers/commission.controller");
const commission_validation_1 = require("../validations/commission.validation");
const router = (0, express_1.Router)();
// Any signed-in POS user can pick a salesperson at checkout.
router.get('/salespeople', auth_middleware_1.authenticate, commission_controller_1.listSalespeople);
router.get('/performance/:employeeId', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']), (0, validation_middleware_1.validate)(commission_validation_1.performanceSchema), commission_controller_1.employeePerformance);
// Live earned commission for any date range (managers see their branch).
router.get('/earned', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']), (0, validation_middleware_1.validate)(commission_validation_1.earnedCommissionsSchema), commission_controller_1.earnedCommissions);
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN']));
router.post('/bulk-pay', (0, validation_middleware_1.validate)(commission_validation_1.bulkPaySchema), commission_controller_1.bulkPayCommissions);
router.get('/', (0, validation_middleware_1.validate)(commission_validation_1.listCommissionsSchema), commission_controller_1.listCommissions);
router.get('/preview', (0, validation_middleware_1.validate)(commission_validation_1.previewCommissionsSchema), commission_controller_1.previewCommissions);
router.post('/generate', (0, validation_middleware_1.validate)(commission_validation_1.generateCommissionsSchema), commission_controller_1.generateCommissions);
router.get('/:id/sales', (0, validation_middleware_1.validate)(commission_validation_1.commissionSalesSchema), commission_controller_1.getCommissionSales);
router.get('/:id', (0, validation_middleware_1.validate)(commission_validation_1.commissionIdParamSchema), commission_controller_1.getCommissionById);
router.put('/:id', (0, validation_middleware_1.validate)(commission_validation_1.updateCommissionSchema), commission_controller_1.updateCommission);
router.post('/:id/pay', (0, validation_middleware_1.validate)(commission_validation_1.payCommissionSchema), commission_controller_1.payCommission);
router.patch('/:id/mark-paid', (0, validation_middleware_1.validate)(commission_validation_1.markCommissionPaidSchema), commission_controller_1.markCommissionPaid);
router.patch('/:id/mark-unpaid', (0, validation_middleware_1.validate)(commission_validation_1.commissionIdParamSchema), commission_controller_1.markCommissionUnpaid);
router.delete('/:id', (0, validation_middleware_1.validate)(commission_validation_1.commissionIdParamSchema), commission_controller_1.deleteCommission);
exports.default = router;
//# sourceMappingURL=commission.routes.js.map
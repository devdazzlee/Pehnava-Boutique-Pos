import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import {
  listCommissions,
  previewCommissions,
  generateCommissions,
  getCommissionById,
  updateCommission,
  markCommissionPaid,
  markCommissionUnpaid,
  payCommission,
  deleteCommission,
  getCommissionSales,
  listSalespeople,
  employeePerformance,
  earnedCommissions,
  bulkPayCommissions,
} from '../controllers/commission.controller';
import {
  listCommissionsSchema,
  previewCommissionsSchema,
  generateCommissionsSchema,
  updateCommissionSchema,
  commissionIdParamSchema,
  markCommissionPaidSchema,
  payCommissionSchema,
  commissionSalesSchema,
  performanceSchema,
  earnedCommissionsSchema,
  bulkPaySchema,
} from '../validations/commission.validation';

const router = Router();

// Any signed-in POS user can pick a salesperson at checkout.
router.get('/salespeople', authenticate, listSalespeople);
router.get(
  '/performance/:employeeId',
  authenticate,
  authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']),
  validate(performanceSchema),
  employeePerformance,
);

// Live earned commission for any date range (managers see their branch).
router.get('/earned', authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']), validate(earnedCommissionsSchema), earnedCommissions);

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN']));

router.post('/bulk-pay', validate(bulkPaySchema), bulkPayCommissions);

router.get('/', validate(listCommissionsSchema), listCommissions);
router.get('/preview', validate(previewCommissionsSchema), previewCommissions);
router.post('/generate', validate(generateCommissionsSchema), generateCommissions);
router.get('/:id/sales', validate(commissionSalesSchema), getCommissionSales);
router.get('/:id', validate(commissionIdParamSchema), getCommissionById);
router.put('/:id', validate(updateCommissionSchema), updateCommission);
router.post('/:id/pay', validate(payCommissionSchema), payCommission);
router.patch('/:id/mark-paid', validate(markCommissionPaidSchema), markCommissionPaid);
router.patch('/:id/mark-unpaid', validate(commissionIdParamSchema), markCommissionUnpaid);
router.delete('/:id', validate(commissionIdParamSchema), deleteCommission);

export default router;

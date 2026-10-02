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
  deleteCommission,
  getCommissionSales,
  listSalespeople,
  employeePerformance,
} from '../controllers/commission.controller';
import {
  listCommissionsSchema,
  previewCommissionsSchema,
  generateCommissionsSchema,
  updateCommissionSchema,
  commissionIdParamSchema,
  markCommissionPaidSchema,
  commissionSalesSchema,
  performanceSchema,
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

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN']));

router.get('/', validate(listCommissionsSchema), listCommissions);
router.get('/preview', validate(previewCommissionsSchema), previewCommissions);
router.post('/generate', validate(generateCommissionsSchema), generateCommissions);
router.get('/:id/sales', validate(commissionSalesSchema), getCommissionSales);
router.get('/:id', validate(commissionIdParamSchema), getCommissionById);
router.put('/:id', validate(updateCommissionSchema), updateCommission);
router.patch('/:id/mark-paid', validate(markCommissionPaidSchema), markCommissionPaid);
router.patch('/:id/mark-unpaid', validate(commissionIdParamSchema), markCommissionUnpaid);
router.delete('/:id', validate(commissionIdParamSchema), deleteCommission);

export default router;

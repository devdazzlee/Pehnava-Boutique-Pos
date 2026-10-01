import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { getItemwisePurchaseReport } from '../controllers/purchase-report.controller';
import { itemwisePurchaseReportSchema } from '../validations/purchase-report.validation';

const router = Router();

router.use(
  authenticate,
  authorize(['SUPER_ADMIN', 'ADMIN', 'PURCHASE_MANAGER', 'WAREHOUSE_MANAGER', 'BRANCH_MANAGER']),
);

router.get('/itemwise', validate(itemwisePurchaseReportSchema), getItemwisePurchaseReport);

export default router;

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { getStockQuantityReport } from '../controllers/stock-quantity-report.controller';
import { stockQuantityReportSchema } from '../validations/stock-quantity-report.validation';

const router = Router();

router.use(
  authenticate,
  authorize(['SUPER_ADMIN', 'ADMIN', 'PURCHASE_MANAGER', 'WAREHOUSE_MANAGER', 'BRANCH_MANAGER']),
);

router.get('/', validate(stockQuantityReportSchema), getStockQuantityReport);

export default router;

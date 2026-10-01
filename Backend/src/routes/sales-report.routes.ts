import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { getItemwiseSalesReport } from '../controllers/sales-report.controller';
import { itemwiseSalesReportSchema } from '../validations/sales-report.validation';

const router = Router();

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']));

router.get('/itemwise', validate(itemwiseSalesReportSchema), getItemwiseSalesReport);

export default router;

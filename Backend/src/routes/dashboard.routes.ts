import express from 'express';

import { dashboardStats } from '../controllers/stats.controller';
import { getDayReport } from '../controllers/day-report.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { dayReportSchema } from '../validations/day-report.validation';

const router = express.Router();

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER', 'PURCHASE_MANAGER']));

router.get('/stats', dashboardStats);
router.get('/day-report', validate(dayReportSchema), getDayReport);

export default router;
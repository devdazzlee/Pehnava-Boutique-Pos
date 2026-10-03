import { requirePermission } from '../middleware/permission.middleware';
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import {
  closeTill,
  getTillDay,
  openTill,
  paidOutTill,
  reopenTill,
  voidPaidOutTill,
} from '../controllers/till.controller';
import {
  tillCloseSchema,
  tillDaySchema,
  tillOpenSchema,
  tillPaidOutSchema,
  tillReopenSchema,
  tillVoidPaidOutSchema,
} from '../validations/till.validation';

const router = Router();

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'CASHIER']));

router.get('/day', validate(tillDaySchema), getTillDay);
router.post('/open', validate(tillOpenSchema), requirePermission('register.operate'), openTill);
router.post('/paid-out', validate(tillPaidOutSchema), requirePermission('register.paid_out'), paidOutTill);
router.post('/paid-out/:id/void', validate(tillVoidPaidOutSchema), requirePermission('register.paid_out'), voidPaidOutTill);
router.post('/close', validate(tillCloseSchema), requirePermission('register.operate'), closeTill);
router.post('/sessions/:id/reopen', validate(tillReopenSchema), requirePermission('register.reopen'), reopenTill);

export default router;

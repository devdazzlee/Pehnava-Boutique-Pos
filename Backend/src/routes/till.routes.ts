import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import {
  closeTill,
  getTillDay,
  openTill,
  paidOutTill,
  reopenTill,
} from '../controllers/till.controller';
import {
  tillCloseSchema,
  tillDaySchema,
  tillOpenSchema,
  tillPaidOutSchema,
  tillReopenSchema,
} from '../validations/till.validation';

const router = Router();

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']));

router.get('/day', validate(tillDaySchema), getTillDay);
router.post('/open', validate(tillOpenSchema), openTill);
router.post('/paid-out', validate(tillPaidOutSchema), paidOutTill);
router.post('/close', validate(tillCloseSchema), closeTill);
router.post('/sessions/:id/reopen', validate(tillReopenSchema), reopenTill);

export default router;

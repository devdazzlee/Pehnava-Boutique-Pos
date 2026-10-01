import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { getTrialBalance } from '../controllers/trial-balance.controller';
import { trialBalanceSchema } from '../validations/trial-balance.validation';

const router = Router();

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']));

router.get('/', validate(trialBalanceSchema), getTrialBalance);

export default router;

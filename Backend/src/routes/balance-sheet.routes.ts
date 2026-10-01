import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { getBalanceSheet } from '../controllers/balance-sheet.controller';
import { balanceSheetSchema } from '../validations/balance-sheet.validation';

const router = Router();

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']));

router.get('/', validate(balanceSheetSchema), getBalanceSheet);

export default router;

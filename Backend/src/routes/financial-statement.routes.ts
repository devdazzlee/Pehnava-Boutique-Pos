import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { getFinancialStatement } from '../controllers/financial-statement.controller';
import { financialStatementSchema } from '../validations/financial-statement.validation';

const router = Router();

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']));

router.get('/', validate(financialStatementSchema), getFinancialStatement);

export default router;

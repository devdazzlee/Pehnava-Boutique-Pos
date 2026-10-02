import { Router } from 'express';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  createAdjustment,
  createAdjustmentBatch,
  listAdjustments,
} from '../controllers/stock-adjustment.controller';
import {
  createAdjustmentSchema,
  createAdjustmentBatchSchema,
  listAdjustmentsSchema,
} from '../validations/stock-adjustment.validation';

const router = Router();

router.use(
  authenticate,
  authorize(['SUPER_ADMIN', 'ADMIN', 'WAREHOUSE_MANAGER', 'BRANCH_MANAGER'])
);

router.post('/', validate(createAdjustmentSchema), createAdjustment);
router.post('/batch', validate(createAdjustmentBatchSchema), createAdjustmentBatch);
router.get('/', validate(listAdjustmentsSchema), listAdjustments);

export default router;

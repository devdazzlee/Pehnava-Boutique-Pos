import { Router } from 'express';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  createPurchase,
  createBulkPurchase,
  listPurchases,
  getPurchaseById,
  updatePurchase,
  getMonthlyStats,
  deletePurchase,
  deleteBill,
  appendBillLine,
} from '../controllers/purchase.controller';
import {
  createPurchaseSchema,
  createBulkPurchaseSchema,
  listPurchasesSchema,
  updatePurchaseSchema,
  appendBillLineSchema,
  billAnchorParamSchema,
  deletePurchaseParamSchema,
} from '../validations/purchase.validation';

const router = Router();

router.use(
  authenticate,
  authorize(['SUPER_ADMIN', 'ADMIN', 'PURCHASE_MANAGER', 'WAREHOUSE_MANAGER', 'BRANCH_MANAGER'])
);

router.post('/', validate(createPurchaseSchema), createPurchase);
router.post('/bulk', validate(createBulkPurchaseSchema), createBulkPurchase);
router.get('/', validate(listPurchasesSchema), listPurchases);
router.get('/stats', getMonthlyStats);
router.post('/bills/:anchorId/lines', validate(appendBillLineSchema), appendBillLine);
router.delete('/bills/:anchorId', validate(billAnchorParamSchema), deleteBill);
router.get('/:id', getPurchaseById);
router.patch('/:id', validate(updatePurchaseSchema), updatePurchase);
router.delete('/:id', validate(deletePurchaseParamSchema), deletePurchase);

export default router;

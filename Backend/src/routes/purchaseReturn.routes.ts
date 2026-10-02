import express from 'express';
import {
    listPurchaseReturns,
    listReturnableBills,
    getPurchaseReturn,
    createPurchaseReturn,
    cancelPurchaseReturn,
} from '../controllers/purchaseReturn.controller';
import {
    createPurchaseReturnSchema,
    listPurchaseReturnsSchema,
    returnableBillsSchema,
    idParamSchema,
} from '../validations/purchaseReturn.validation';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

router.use(
    authenticate,
    authorize(['SUPER_ADMIN', 'ADMIN', 'PURCHASE_MANAGER', 'WAREHOUSE_MANAGER', 'BRANCH_MANAGER']),
);

router.get('/', validate(listPurchaseReturnsSchema), listPurchaseReturns);
router.get('/returnable-bills', validate(returnableBillsSchema), listReturnableBills);
router.post('/', validate(createPurchaseReturnSchema), createPurchaseReturn);
router.get('/:id', validate(idParamSchema), getPurchaseReturn);
router.post('/:id/cancel', validate(idParamSchema), cancelPurchaseReturn);

export default router;

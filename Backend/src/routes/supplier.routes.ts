import express from 'express';
import {
    createSupplier,
    getSupplier,
    updateSupplier,
    toggleSupplierStatus,
    listSuppliers,
    deleteSupplier,
    getSupplierPurchases,
    getSupplierLedger,
    getSupplierStatement,
    getSupplierProducts,
    createSupplierPayment,
    deleteSupplierPayment,
    getPayablesSummary,
} from '../controllers/supplier.controller';
import {
    createSupplierSchema,
    updateSupplierSchema,
    getSupplierSchema,
    listSuppliersSchema,
    createSupplierPaymentSchema,
    deleteSupplierPaymentSchema,
} from '../validations/supplier.validation';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER', 'PURCHASE_MANAGER']));

router.post('/', validate(createSupplierSchema), createSupplier);
router.get('/', validate(listSuppliersSchema), listSuppliers);
router.get('/payables/summary', getPayablesSummary);

router.get('/:id/purchases', validate(getSupplierSchema), getSupplierPurchases);
router.get('/:id/ledger', validate(getSupplierSchema), getSupplierLedger);
router.get('/:id/statement', validate(getSupplierSchema), getSupplierStatement);
router.get('/:id/products', validate(getSupplierSchema), getSupplierProducts);
router.post(
    '/:id/payments',
    validate(createSupplierPaymentSchema),
    createSupplierPayment,
);
router.delete(
    '/:id/payments/:paymentId',
    validate(deleteSupplierPaymentSchema),
    deleteSupplierPayment,
);

router.get('/:id', validate(getSupplierSchema), getSupplier);
router.put('/:id', validate(updateSupplierSchema), updateSupplier);
router.patch('/:id/toggle-status', validate(getSupplierSchema), toggleSupplierStatus);
router.delete('/:id', validate(getSupplierSchema), deleteSupplier);

export default router;

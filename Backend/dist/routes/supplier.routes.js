"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const supplier_controller_1 = require("../controllers/supplier.controller");
const permission_middleware_1 = require("../middleware/permission.middleware");
const supplier_validation_1 = require("../validations/supplier.validation");
const validation_middleware_1 = require("../middleware/validation.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER', 'PURCHASE_MANAGER']));
router.post('/', (0, validation_middleware_1.validate)(supplier_validation_1.createSupplierSchema), supplier_controller_1.createSupplier);
router.get('/', (0, validation_middleware_1.validate)(supplier_validation_1.listSuppliersSchema), supplier_controller_1.listSuppliers);
router.get('/payables/summary', supplier_controller_1.getPayablesSummary);
router.get('/facets', supplier_controller_1.getSupplierFacets);
router.get('/:id/purchases', (0, validation_middleware_1.validate)(supplier_validation_1.getSupplierSchema), supplier_controller_1.getSupplierPurchases);
router.get('/:id/ledger', (0, validation_middleware_1.validate)(supplier_validation_1.getSupplierSchema), supplier_controller_1.getSupplierLedger);
router.get('/:id/statement', (0, validation_middleware_1.validate)(supplier_validation_1.getSupplierSchema), supplier_controller_1.getSupplierStatement);
router.get('/:id/products', (0, validation_middleware_1.validate)(supplier_validation_1.getSupplierSchema), supplier_controller_1.getSupplierProducts);
router.get('/:id/account', (0, validation_middleware_1.validate)(supplier_validation_1.getSupplierSchema), supplier_controller_1.getSupplierAccount);
router.get('/:id/documents', (0, validation_middleware_1.validate)(supplier_validation_1.getSupplierSchema), supplier_controller_1.getSupplierDocuments);
router.post('/:id/payments', (0, validation_middleware_1.validate)(supplier_validation_1.createSupplierPaymentSchema), supplier_controller_1.createSupplierPayment);
router.patch('/:id/payments/:paymentId', (0, validation_middleware_1.validate)(supplier_validation_1.updateSupplierPaymentSchema), 
// Editing money history needs the same right as customer adjustments (or a manager's approval).
(0, permission_middleware_1.requirePermission)('customers.adjust'), supplier_controller_1.updateSupplierPayment);
router.delete('/:id/payments/:paymentId', (0, validation_middleware_1.validate)(supplier_validation_1.deleteSupplierPaymentSchema), (0, permission_middleware_1.requirePermission)('customers.adjust'), supplier_controller_1.deleteSupplierPayment);
router.get('/:id', (0, validation_middleware_1.validate)(supplier_validation_1.getSupplierSchema), supplier_controller_1.getSupplier);
router.put('/:id', (0, validation_middleware_1.validate)(supplier_validation_1.updateSupplierSchema), supplier_controller_1.updateSupplier);
router.patch('/:id/toggle-status', (0, validation_middleware_1.validate)(supplier_validation_1.getSupplierSchema), supplier_controller_1.toggleSupplierStatus);
router.delete('/:id', (0, validation_middleware_1.validate)(supplier_validation_1.getSupplierSchema), supplier_controller_1.deleteSupplier);
exports.default = router;
//# sourceMappingURL=supplier.routes.js.map
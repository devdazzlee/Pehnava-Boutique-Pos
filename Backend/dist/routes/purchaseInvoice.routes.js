"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const purchaseInvoice_controller_1 = require("../controllers/purchaseInvoice.controller");
const purchaseInvoice_validation_1 = require("../validations/purchaseInvoice.validation");
const validation_middleware_1 = require("../middleware/validation.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'PURCHASE_MANAGER', 'WAREHOUSE_MANAGER', 'BRANCH_MANAGER']));
router.get('/', (0, validation_middleware_1.validate)(purchaseInvoice_validation_1.listPurchaseInvoicesSchema), purchaseInvoice_controller_1.listPurchaseInvoices);
router.post('/', (0, validation_middleware_1.validate)(purchaseInvoice_validation_1.createPurchaseInvoiceSchema), purchaseInvoice_controller_1.createPurchaseInvoice);
router.get('/uninvoiced/:supplierId', (0, validation_middleware_1.validate)(purchaseInvoice_validation_1.supplierParamSchema), purchaseInvoice_controller_1.getUninvoicedPurchases);
router.get('/:id', (0, validation_middleware_1.validate)(purchaseInvoice_validation_1.idParamSchema), purchaseInvoice_controller_1.getPurchaseInvoice);
router.patch('/:id', (0, validation_middleware_1.validate)(purchaseInvoice_validation_1.updatePurchaseInvoiceSchema), purchaseInvoice_controller_1.updatePurchaseInvoice);
router.delete('/:id', (0, validation_middleware_1.validate)(purchaseInvoice_validation_1.idParamSchema), purchaseInvoice_controller_1.deletePurchaseInvoice);
exports.default = router;
//# sourceMappingURL=purchaseInvoice.routes.js.map
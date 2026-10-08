"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const purchaseOrder_controller_1 = require("../controllers/purchaseOrder.controller");
const purchaseOrder_validation_1 = require("../validations/purchaseOrder.validation");
const validation_middleware_1 = require("../middleware/validation.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'PURCHASE_MANAGER', 'WAREHOUSE_MANAGER', 'BRANCH_MANAGER']));
router.get('/', (0, validation_middleware_1.validate)(purchaseOrder_validation_1.listPurchaseOrdersSchema), purchaseOrder_controller_1.listPurchaseOrders);
router.post('/', (0, validation_middleware_1.validate)(purchaseOrder_validation_1.createPurchaseOrderSchema), purchaseOrder_controller_1.createPurchaseOrder);
router.get('/:id', (0, validation_middleware_1.validate)(purchaseOrder_validation_1.idParamSchema), purchaseOrder_controller_1.getPurchaseOrder);
router.patch('/:id', (0, validation_middleware_1.validate)(purchaseOrder_validation_1.updatePurchaseOrderSchema), purchaseOrder_controller_1.updatePurchaseOrder);
router.patch('/:id/status', (0, validation_middleware_1.validate)(purchaseOrder_validation_1.purchaseOrderStatusSchema), purchaseOrder_controller_1.setPurchaseOrderStatus);
router.post('/:id/receive', (0, validation_middleware_1.validate)(purchaseOrder_validation_1.receivePurchaseOrderSchema), purchaseOrder_controller_1.receivePurchaseOrder);
router.post('/:id/cancel', (0, validation_middleware_1.validate)(purchaseOrder_validation_1.idParamSchema), purchaseOrder_controller_1.cancelPurchaseOrder);
router.delete('/:id', (0, validation_middleware_1.validate)(purchaseOrder_validation_1.idParamSchema), purchaseOrder_controller_1.deletePurchaseOrder);
exports.default = router;
//# sourceMappingURL=purchaseOrder.routes.js.map
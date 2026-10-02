"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const purchaseReturn_controller_1 = require("../controllers/purchaseReturn.controller");
const purchaseReturn_validation_1 = require("../validations/purchaseReturn.validation");
const validation_middleware_1 = require("../middleware/validation.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'PURCHASE_MANAGER', 'WAREHOUSE_MANAGER', 'BRANCH_MANAGER']));
router.get('/', (0, validation_middleware_1.validate)(purchaseReturn_validation_1.listPurchaseReturnsSchema), purchaseReturn_controller_1.listPurchaseReturns);
router.get('/returnable-bills', (0, validation_middleware_1.validate)(purchaseReturn_validation_1.returnableBillsSchema), purchaseReturn_controller_1.listReturnableBills);
router.post('/', (0, validation_middleware_1.validate)(purchaseReturn_validation_1.createPurchaseReturnSchema), purchaseReturn_controller_1.createPurchaseReturn);
router.get('/:id', (0, validation_middleware_1.validate)(purchaseReturn_validation_1.idParamSchema), purchaseReturn_controller_1.getPurchaseReturn);
router.post('/:id/cancel', (0, validation_middleware_1.validate)(purchaseReturn_validation_1.idParamSchema), purchaseReturn_controller_1.cancelPurchaseReturn);
exports.default = router;
//# sourceMappingURL=purchaseReturn.routes.js.map
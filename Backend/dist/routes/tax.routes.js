"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const tax_controller_1 = require("../controllers/tax.controller");
const tax_validation_1 = require("../validations/tax.validation");
const validation_middleware_1 = require("../middleware/validation.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN']));
router.post('/', (0, validation_middleware_1.validate)(tax_validation_1.createtaxeschema), tax_controller_1.createTax);
router.get('/', (0, validation_middleware_1.validate)(tax_validation_1.listTaxesSchema), tax_controller_1.listTaxes);
router.get('/:id', (0, validation_middleware_1.validate)(tax_validation_1.gettaxeschema), tax_controller_1.getTax);
router.patch('/:id', (0, validation_middleware_1.validate)(tax_validation_1.updatetaxeschema), tax_controller_1.updateTax);
router.patch('/:id/toggle-status', (0, validation_middleware_1.validate)(tax_validation_1.gettaxeschema), tax_controller_1.toggletaxestatus);
exports.default = router;
//# sourceMappingURL=tax.routes.js.map
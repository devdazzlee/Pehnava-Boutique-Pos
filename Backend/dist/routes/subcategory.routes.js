"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const subcategory_controller_1 = require("../controllers/subcategory.controller");
const subcategory_validation_1 = require("../validations/subcategory.validation");
const validation_middleware_1 = require("../middleware/validation.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN']));
router.post('/', (0, validation_middleware_1.validate)(subcategory_validation_1.createSubcategorySchema), subcategory_controller_1.createSubcategory);
router.get('/', (0, validation_middleware_1.validate)(subcategory_validation_1.listSubcategoriesSchema), subcategory_controller_1.listSubcategories);
router.get('/:id', (0, validation_middleware_1.validate)(subcategory_validation_1.getSubcategorySchema), subcategory_controller_1.getSubcategory);
router.patch('/:id', (0, validation_middleware_1.validate)(subcategory_validation_1.updateSubcategorySchema), subcategory_controller_1.updateSubcategory);
router.patch('/:id/toggle-status', (0, validation_middleware_1.validate)(subcategory_validation_1.getSubcategorySchema), subcategory_controller_1.toggleSubcategoryStatus);
router.delete('/:id', (0, validation_middleware_1.validate)(subcategory_validation_1.getSubcategorySchema), subcategory_controller_1.deleteSubcategory);
exports.default = router;
//# sourceMappingURL=subcategory.routes.js.map
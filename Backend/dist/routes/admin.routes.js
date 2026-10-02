"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const validation_middleware_1 = require("../middleware/validation.middleware");
const category_validation_1 = require("../validations/category.validation");
const category_controller_1 = require("../controllers/category.controller");
const product_controller_1 = require("../controllers/product.controller");
const product_validation_1 = require("../validations/product.validation");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN']));
router.post('/categories', (0, validation_middleware_1.validate)(category_validation_1.createCategorySchema), category_controller_1.createCategory);
router.get('/categories/:id', category_controller_1.getCategory);
router.put('/categories/:id', (0, validation_middleware_1.validate)(category_validation_1.updateCategorySchema), category_controller_1.updateCategory);
router.patch('/categories/:id/status', category_controller_1.toggleCategoryStatus);
router.post('/products', (0, validation_middleware_1.validate)(product_validation_1.createProductSchema), product_controller_1.createProduct);
router.get('/products/:id', product_controller_1.getProduct);
router.put('/products/:id', (0, validation_middleware_1.validate)(product_validation_1.updateProductSchema), product_controller_1.updateProduct);
router.patch('/products/:id/status', product_controller_1.toggleProductStatus);
exports.default = router;
//# sourceMappingURL=admin.routes.js.map
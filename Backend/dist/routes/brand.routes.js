"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const brand_controller_1 = require("../controllers/brand.controller");
const brand_validation_1 = require("../validations/brand.validation");
const validation_middleware_1 = require("../middleware/validation.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
router.post('/', auth_middleware_1.authenticate, (0, validation_middleware_1.validate)(brand_validation_1.createBrandSchema), brand_controller_1.createBrand);
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN']));
router.get('/', (0, validation_middleware_1.validate)(brand_validation_1.listBrandsSchema), brand_controller_1.listBrands);
router.get('/:id', (0, validation_middleware_1.validate)(brand_validation_1.getBrandSchema), brand_controller_1.getBrand);
router.patch('/:id', (0, validation_middleware_1.validate)(brand_validation_1.updateBrandSchema), brand_controller_1.updateBrand);
router.delete('/:id', (0, validation_middleware_1.validate)(brand_validation_1.getBrandSchema), brand_controller_1.deleteBrand);
router.patch('/:id/toggle-display', (0, validation_middleware_1.validate)(brand_validation_1.getBrandSchema), brand_controller_1.toggleBrandDisplay);
exports.default = router;
//# sourceMappingURL=brand.routes.js.map
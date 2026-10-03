"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("../prisma/client");
const permission_middleware_1 = require("../middleware/permission.middleware");
const express_1 = __importDefault(require("express"));
const product_controller_1 = require("../controllers/product.controller");
const product_validation_1 = require("../validations/product.validation");
const validation_middleware_1 = require("../middleware/validation.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const multer_1 = __importDefault(require("../utils/multer"));
const parse_formdata_middleware_1 = require("../middleware/parse-formdata.middleware");
const uploadBulk_1 = __importDefault(require("../utils/uploadBulk"));
const router = express_1.default.Router();
// router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN']));
const productWriters = (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER', 'PURCHASE_MANAGER']);
/** Only edits that actually change cost / sale price / discount need the price permission. */
const priceChangeCheck = async (req) => {
    const fields = ['purchase_rate', 'sales_rate_exc_dis_and_tax', 'sales_rate_inc_dis_and_tax', 'discount_amount'];
    if (!fields.some((f) => req.body?.[f] !== undefined))
        return null;
    const current = await client_1.prisma.product.findUnique({ where: { id: req.params.id }, select: { purchase_rate: true, sales_rate_exc_dis_and_tax: true, sales_rate_inc_dis_and_tax: true, discount_amount: true } });
    if (!current)
        return null;
    const changed = fields.some((f) => req.body?.[f] !== undefined && Math.abs(Number(req.body[f]) - Number(current[f] ?? 0)) > 0.0001);
    return changed ? 'products.price_change' : null;
};
router.post('/', auth_middleware_1.authenticate, productWriters, multer_1.default.array('images', 10), parse_formdata_middleware_1.parseFormData, (0, validation_middleware_1.validate)(product_validation_1.createProductSchema), product_controller_1.createProduct);
router.post('/upload-image', auth_middleware_1.authenticate, productWriters, multer_1.default.single('image'), product_controller_1.uploadProductImage);
router.post('/bulk-upload', auth_middleware_1.authenticate, productWriters, uploadBulk_1.default.single('file'), product_controller_1.bulkUploadProducts);
router.post('/import-row', auth_middleware_1.authenticate, productWriters, product_controller_1.importProductRow);
router.delete('/all', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN']), product_controller_1.deleteAllProducts);
router.get('/', (0, validation_middleware_1.validate)(product_validation_1.listProductsSchema), product_controller_1.listProducts);
router.get('/pos-catalog', auth_middleware_1.authenticate, product_controller_1.getPosCatalog);
router.get('/export/excel', product_controller_1.exportProductsToExcel);
router.get('/featured', product_controller_1.getFeaturedProducts);
router.get('/best-selling', auth_middleware_1.authenticate, product_controller_1.getBestSellingProducts);
router.get('/:id/cost-history', (0, validation_middleware_1.validate)(product_validation_1.getProductSchema), product_controller_1.getProductCostHistory);
router.get('/:id/price-history', (0, validation_middleware_1.validate)(product_validation_1.getProductSchema), product_controller_1.getProductPriceHistory);
router.get('/:id', (0, validation_middleware_1.validate)(product_validation_1.getProductSchema), product_controller_1.getProduct);
router.patch('/:id', auth_middleware_1.authenticate, productWriters, (0, validation_middleware_1.validate)(product_validation_1.updateProductSchema), (0, permission_middleware_1.requirePermission)(priceChangeCheck), product_controller_1.updateProduct);
router.patch('/:id/toggle-status', auth_middleware_1.authenticate, productWriters, (0, validation_middleware_1.validate)(product_validation_1.getProductSchema), product_controller_1.toggleProductStatus);
router.delete('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN']), (0, validation_middleware_1.validate)(product_validation_1.getProductSchema), product_controller_1.deleteProduct);
exports.default = router;
//# sourceMappingURL=product.routes.js.map
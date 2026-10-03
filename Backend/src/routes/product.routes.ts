import { prisma } from '../prisma/client';
import { requirePermission } from '../middleware/permission.middleware';
import express, { Request } from 'express';
import {
  createProduct,
  getProduct,
  updateProduct,
  toggleProductStatus,
  listProducts,
  exportProductsToExcel,
  getFeaturedProducts,
  getBestSellingProducts,
  bulkUploadProducts,
  importProductRow,
  deleteAllProducts,
  deleteProduct,
  uploadProductImage,
  getPosCatalog,
  getProductCostHistory,
  getProductPriceHistory,
} from '../controllers/product.controller';
import {
  createProductSchema,
  updateProductSchema,
  getProductSchema,
  listProductsSchema,
} from '../validations/product.validation';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';
import upload from '../utils/multer';
import { parseFormData } from '../middleware/parse-formdata.middleware';
import uploadBulk from '../utils/uploadBulk';

const router = express.Router();

// router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN']));

const productWriters = authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER', 'PURCHASE_MANAGER']);

/** Only edits that actually change cost / sale price / discount need the price permission. */
const priceChangeCheck = async (req: Request) => {
  const fields = ['purchase_rate', 'sales_rate_exc_dis_and_tax', 'sales_rate_inc_dis_and_tax', 'discount_amount'] as const;
  if (!fields.some((f) => req.body?.[f] !== undefined)) return null;
  const current = await prisma.product.findUnique({ where: { id: req.params.id }, select: { purchase_rate: true, sales_rate_exc_dis_and_tax: true, sales_rate_inc_dis_and_tax: true, discount_amount: true } });
  if (!current) return null;
  const changed = fields.some((f) => req.body?.[f] !== undefined && Math.abs(Number(req.body[f]) - Number(current[f] ?? 0)) > 0.0001);
  return changed ? 'products.price_change' : null;
};

router.post(
  '/',
  authenticate,
  productWriters,
  upload.array('images', 10),
  parseFormData,
  validate(createProductSchema),
  createProduct,
);
router.post('/upload-image', authenticate, productWriters, upload.single('image'), uploadProductImage);
router.post('/bulk-upload', authenticate, productWriters, uploadBulk.single('file'), bulkUploadProducts);
router.post('/import-row', authenticate, productWriters, importProductRow);
router.delete('/all', authenticate, authorize(['SUPER_ADMIN']), deleteAllProducts);
router.get('/', validate(listProductsSchema), listProducts);
router.get('/pos-catalog', authenticate, getPosCatalog);
router.get('/export/excel', exportProductsToExcel);
router.get('/featured', getFeaturedProducts);
router.get('/best-selling', authenticate, getBestSellingProducts);
router.get('/:id/cost-history', validate(getProductSchema), getProductCostHistory);
router.get('/:id/price-history', validate(getProductSchema), getProductPriceHistory);
router.get('/:id', validate(getProductSchema), getProduct);
router.patch('/:id', authenticate, productWriters, validate(updateProductSchema), requirePermission(priceChangeCheck), updateProduct);
router.patch('/:id/toggle-status', authenticate, productWriters, validate(getProductSchema), toggleProductStatus);
router.delete('/:id', authenticate, authorize(['SUPER_ADMIN', 'ADMIN']), validate(getProductSchema), deleteProduct);

export default router;

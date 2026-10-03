import express from 'express';
import {
  createCategory,
  getCategory,
  updateCategory,
  toggleCategoryStatus,
  listCategories,
  deleteCategory,
  deleteAllCategories,
  uploadCategoryImage,
} from '../controllers/category.controller';
import {
  createCategorySchema,
  updateCategorySchema,
  getCategorySchema,
  listCategoriesSchema,
} from '../validations/category.validation';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';
import upload from '../utils/multer';

const router = express.Router();

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER', 'PURCHASE_MANAGER', 'CASHIER']));

router.post('/upload-image', upload.single('image'), uploadCategoryImage);
router.post('/', validate(createCategorySchema), createCategory);
router.delete('/all', deleteAllCategories);
router.get('/', validate(listCategoriesSchema), listCategories);
router.get('/:id', validate(getCategorySchema), getCategory);
router.patch('/:id', validate(updateCategorySchema), updateCategory);
router.patch('/:id/toggle-status', validate(getCategorySchema), toggleCategoryStatus);
router.delete('/:id', validate(getCategorySchema), deleteCategory);

export default router;

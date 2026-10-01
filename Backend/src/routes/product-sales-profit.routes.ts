import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { getProductSalesProfit } from '../controllers/product-sales-profit.controller';
import { productSalesProfitSchema } from '../validations/product-sales-profit.validation';

const router = Router();

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER']));

router.get('/', validate(productSalesProfitSchema), getProductSalesProfit);

export default router;

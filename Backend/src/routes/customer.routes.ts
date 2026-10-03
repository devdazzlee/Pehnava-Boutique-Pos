import { requirePermission } from '../middleware/permission.middleware';
import express, { Request, Response } from 'express';
import {
  createCustomer,
  createShopCustomer,
  deleteCustomer,
  getCustomerById,
  getCustomers,
  loginCustomer,
  logoutCustomer,
  updateCustomer,
  updateCustomerByAdmin,
  getCustomerPurchases,
  getCustomerLedger,
  getCustomerStatement,
  getCustomerActivity,
  createCustomerPayment,
  updateCustomerPayment,
  deleteCustomerPayment,
  getReceivablesSummary,
} from '../controllers/customer.controller';
import { validate } from '../middleware/validation.middleware';
import {
  cusRegisterationSchema,
  customerLoginSchema,
  customerCreateByAdminSchema,
  customerUpdateSchema,
  getCustomerParamsSchema,
  createCustomerPaymentSchema,
  updateCustomerPaymentSchema,
  deleteCustomerPaymentSchema,
} from '../validations/customer.validation';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { authenticateCustomer } from '../middleware/customerAuth.middleware';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import CustomerService from '../services/customer.service';

const customerService = new CustomerService();
const router = express.Router();

// Public routes (no auth required)
router.post('/register', validate(customerLoginSchema), createCustomer);
router.post('/login', validate(customerLoginSchema), loginCustomer);

// Customer authenticated routes (must be before admin routes)
// IMPORTANT: These routes must be defined BEFORE the admin middleware below
router.put('/', authenticateCustomer, validate(customerUpdateSchema), updateCustomer);
router.post('/logout', authenticateCustomer, logoutCustomer);

// Explicit /me route - must be before /:customerId to avoid route conflict
router.get('/me', authenticateCustomer, asyncHandler(async (req: Request, res: Response) => {
  if (!req.customer || !req.customer.id) {
    return res.status(401).json({
      success: false,
      message: 'Customer authentication required',
    });
  }
  const customer = await customerService.getCustomerById(req.customer.id);
  new ApiResponse(customer, 'Customer fetched').send(res);
}));

// Admin routes (protected by admin auth - MUST come after customer routes)
router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER', 'PURCHASE_MANAGER', 'CASHIER']));
// Admin-side create — full form (email + optional name/phone/address/billing).
// Old route used cusRegisterationSchema which only validated email, letting
// every other field through unchecked.
router.post('/', validate(customerCreateByAdminSchema), createShopCustomer);
router.get('/', getCustomers);
router.get('/receivables/summary', getReceivablesSummary);
router.put('/:customerId', validate(customerUpdateSchema), updateCustomerByAdmin);
router.delete('/:customerId', deleteCustomer);
router.get('/:customerId/purchases', validate(getCustomerParamsSchema), getCustomerPurchases);
router.get('/:customerId/ledger', validate(getCustomerParamsSchema), getCustomerLedger);
router.get('/:customerId/statement', validate(getCustomerParamsSchema), getCustomerStatement);
router.get('/:customerId/activity', validate(getCustomerParamsSchema), getCustomerActivity);
router.post('/:customerId/payments', validate(createCustomerPaymentSchema), requirePermission((req) => (['REFUND', 'CREDIT_NOTE', 'DEBIT_NOTE', 'WRITE_OFF'].includes(req.body?.type) ? 'customers.adjust' : null)), createCustomerPayment);
router.patch('/:customerId/payments/:paymentId', validate(updateCustomerPaymentSchema), updateCustomerPayment);
router.delete('/:customerId/payments/:paymentId', validate(deleteCustomerPaymentSchema), deleteCustomerPayment);
router.get('/:customerId', getCustomerById);

export default router;

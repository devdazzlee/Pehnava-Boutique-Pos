"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const permission_middleware_1 = require("../middleware/permission.middleware");
const express_1 = __importDefault(require("express"));
const customer_controller_1 = require("../controllers/customer.controller");
const validation_middleware_1 = require("../middleware/validation.middleware");
const customer_validation_1 = require("../validations/customer.validation");
const auth_middleware_1 = require("../middleware/auth.middleware");
const customerAuth_middleware_1 = require("../middleware/customerAuth.middleware");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const customer_service_1 = __importDefault(require("../services/customer.service"));
const customerService = new customer_service_1.default();
const router = express_1.default.Router();
// Public routes (no auth required)
router.post('/register', (0, validation_middleware_1.validate)(customer_validation_1.customerLoginSchema), customer_controller_1.createCustomer);
router.post('/login', (0, validation_middleware_1.validate)(customer_validation_1.customerLoginSchema), customer_controller_1.loginCustomer);
// Customer authenticated routes (must be before admin routes)
// IMPORTANT: These routes must be defined BEFORE the admin middleware below
router.put('/', customerAuth_middleware_1.authenticateCustomer, (0, validation_middleware_1.validate)(customer_validation_1.customerUpdateSchema), customer_controller_1.updateCustomer);
router.post('/logout', customerAuth_middleware_1.authenticateCustomer, customer_controller_1.logoutCustomer);
// Explicit /me route - must be before /:customerId to avoid route conflict
router.get('/me', customerAuth_middleware_1.authenticateCustomer, (0, asyncHandler_1.default)(async (req, res) => {
    if (!req.customer || !req.customer.id) {
        return res.status(401).json({
            success: false,
            message: 'Customer authentication required',
        });
    }
    const customer = await customerService.getCustomerById(req.customer.id);
    new apiResponse_1.ApiResponse(customer, 'Customer fetched').send(res);
}));
// Admin routes (protected by admin auth - MUST come after customer routes)
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER', 'PURCHASE_MANAGER', 'CASHIER']));
// Admin-side create — full form (email + optional name/phone/address/billing).
// Old route used cusRegisterationSchema which only validated email, letting
// every other field through unchecked.
router.post('/', (0, validation_middleware_1.validate)(customer_validation_1.customerCreateByAdminSchema), customer_controller_1.createShopCustomer);
router.get('/', customer_controller_1.getCustomers);
router.get('/receivables/summary', customer_controller_1.getReceivablesSummary);
router.put('/:customerId', (0, validation_middleware_1.validate)(customer_validation_1.customerUpdateSchema), customer_controller_1.updateCustomerByAdmin);
router.delete('/:customerId', customer_controller_1.deleteCustomer);
router.get('/:customerId/purchases', (0, validation_middleware_1.validate)(customer_validation_1.getCustomerParamsSchema), customer_controller_1.getCustomerPurchases);
router.get('/:customerId/ledger', (0, validation_middleware_1.validate)(customer_validation_1.getCustomerParamsSchema), customer_controller_1.getCustomerLedger);
router.get('/:customerId/statement', (0, validation_middleware_1.validate)(customer_validation_1.getCustomerParamsSchema), customer_controller_1.getCustomerStatement);
router.get('/:customerId/activity', (0, validation_middleware_1.validate)(customer_validation_1.getCustomerParamsSchema), customer_controller_1.getCustomerActivity);
router.post('/:customerId/payments', (0, validation_middleware_1.validate)(customer_validation_1.createCustomerPaymentSchema), (0, permission_middleware_1.requirePermission)((req) => (['REFUND', 'CREDIT_NOTE', 'DEBIT_NOTE', 'WRITE_OFF'].includes(req.body?.type) ? 'customers.adjust' : null)), customer_controller_1.createCustomerPayment);
router.patch('/:customerId/payments/:paymentId', (0, validation_middleware_1.validate)(customer_validation_1.updateCustomerPaymentSchema), customer_controller_1.updateCustomerPayment);
router.delete('/:customerId/payments/:paymentId', (0, validation_middleware_1.validate)(customer_validation_1.deleteCustomerPaymentSchema), customer_controller_1.deleteCustomerPayment);
router.get('/:customerId', customer_controller_1.getCustomerById);
exports.default = router;
//# sourceMappingURL=customer.routes.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCustomerPayment = exports.getReceivablesSummary = exports.updateCustomerPayment = exports.createCustomerPayment = exports.getCustomerActivity = exports.getCustomerStatement = exports.getCustomerLedger = exports.getCustomerPurchases = exports.logoutCustomer = exports.deleteCustomer = exports.updateCustomer = exports.updateCustomerByAdmin = exports.getCustomers = exports.getCustomerById = exports.loginCustomer = exports.createShopCustomer = exports.createCustomer = void 0;
const customer_validation_1 = require("../validations/customer.validation");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const customer_service_1 = __importDefault(require("../services/customer.service"));
const customerService = new customer_service_1.default();
exports.createCustomer = (0, asyncHandler_1.default)(async (req, res) => {
    const customer = await customerService.createCustomer(req.body);
    new apiResponse_1.ApiResponse(customer, 'Customer successfully created', 200).send(res);
});
exports.createShopCustomer = (0, asyncHandler_1.default)(async (req, res) => {
    const customer = await customerService.createShopCustomer(req.body);
    new apiResponse_1.ApiResponse(customer, 'Customer successfully created', 200).send(res);
});
exports.loginCustomer = (0, asyncHandler_1.default)(async (req, res) => {
    const { email, password } = req.body;
    const customer = await customerService.loginCustomer(email, password);
    new apiResponse_1.ApiResponse(customer, 'Customer successfully created', 200).send(res);
});
exports.getCustomerById = (0, asyncHandler_1.default)(async (req, res) => {
    const customer = await customerService.getCustomerById(req.params.customerId);
    new apiResponse_1.ApiResponse(customer, 'Customer fetched').send(res);
});
exports.getCustomers = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await customerService.getCustomers({
        search: req.query.search,
        page: Number(req.query.page),
        limit: Number(req.query.limit),
        is_active: req.query.is_active === 'true'
            ? true
            : req.query.is_active === 'false'
                ? false
                : undefined,
        created_after: req.query.created_after,
        balance: req.query.balance,
        sort: req.query.sort,
    });
    new apiResponse_1.ApiResponse(result.data, 'Customers fetched', 200, true, result.meta).send(res);
});
exports.updateCustomerByAdmin = (0, asyncHandler_1.default)(async (req, res) => {
    const customers = await customerService.updateCustomer(req.params?.customerId, req.body);
    new apiResponse_1.ApiResponse(customers, 'Customers fetched').send(res);
});
exports.updateCustomer = (0, asyncHandler_1.default)(async (req, res) => {
    const customers = await customerService.updateCustomer(req.customer?.id, req.body);
    new apiResponse_1.ApiResponse(customers, 'Customers fetched').send(res);
});
exports.deleteCustomer = (0, asyncHandler_1.default)(async (req, res) => {
    await customerService.deleteCustomer(req.params.customerId);
    new apiResponse_1.ApiResponse(null, 'Customer deleted').send(res);
});
exports.logoutCustomer = (0, asyncHandler_1.default)(async (req, res) => {
    const customers = await customerService.logoutCustomer(req.customer?.id);
    new apiResponse_1.ApiResponse(customers, 'Customers logout').send(res);
});
exports.getCustomerPurchases = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await customerService.getCustomerPurchases(req.params.customerId);
    new apiResponse_1.ApiResponse(data, 'Customer purchases retrieved').send(res);
});
exports.getCustomerLedger = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await customerService.getCustomerLedger(req.params.customerId);
    new apiResponse_1.ApiResponse(data, 'Customer ledger retrieved').send(res);
});
exports.getCustomerStatement = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await customerService.getCustomerStatement(req.params.customerId, {
        from: req.query.from,
        to: req.query.to,
    });
    new apiResponse_1.ApiResponse(data, 'Customer statement retrieved').send(res);
});
exports.getCustomerActivity = (0, asyncHandler_1.default)(async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const data = await customerService.getCustomerActivity(req.params.customerId, limit);
    new apiResponse_1.ApiResponse(data, 'Customer activity retrieved').send(res);
});
exports.createCustomerPayment = (0, asyncHandler_1.default)(async (req, res) => {
    const payment = await customerService.createCustomerPayment(req.params.customerId, req.body, req.user.id);
    new apiResponse_1.ApiResponse(payment, 'Payment recorded successfully', 201).send(res);
});
exports.updateCustomerPayment = (0, asyncHandler_1.default)(async (req, res) => {
    const body = customer_validation_1.updateCustomerPaymentSchema.shape.body.parse(req.body);
    const payment = await customerService.updateCustomerPayment(req.params.customerId, req.params.paymentId, body);
    new apiResponse_1.ApiResponse(payment, 'Transaction updated').send(res);
});
exports.getReceivablesSummary = (0, asyncHandler_1.default)(async (_req, res) => {
    const summary = await customerService.getReceivablesSummary();
    new apiResponse_1.ApiResponse(summary, 'Receivables summary').send(res);
});
exports.deleteCustomerPayment = (0, asyncHandler_1.default)(async (req, res) => {
    await customerService.deleteCustomerPayment(req.params.customerId, req.params.paymentId);
    new apiResponse_1.ApiResponse(null, 'Payment deleted successfully').send(res);
});
//# sourceMappingURL=customer.controller.js.map
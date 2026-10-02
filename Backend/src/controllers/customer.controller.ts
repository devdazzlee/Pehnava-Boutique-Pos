import { updateCustomerPaymentSchema } from '../validations/customer.validation';
import { Request, Response } from "express";
import asyncHandler from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import CustomerService from "../services/customer.service";

const customerService = new CustomerService();

export const createCustomer = asyncHandler(async (req: Request, res: Response) => {
    const customer = await customerService.createCustomer(req.body);
    new ApiResponse(customer, 'Customer successfully created', 200).send(res);
});

export const createShopCustomer = asyncHandler(async (req: Request, res: Response) => {
    const customer = await customerService.createShopCustomer(req.body);
    new ApiResponse(customer, 'Customer successfully created', 200).send(res);
});

export const loginCustomer = asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;
    const customer = await customerService.loginCustomer(email, password);
    new ApiResponse(customer, 'Customer successfully created', 200).send(res);
});

export const getCustomerById = asyncHandler(async (req: Request, res: Response) => {
    const customer = await customerService.getCustomerById(req.params.customerId);
    new ApiResponse(customer, 'Customer fetched').send(res);
});

export const getCustomers = asyncHandler(async (req: Request, res: Response) => {
    const result = await customerService.getCustomers({
        search: req.query.search as string | undefined,
        page: Number(req.query.page),
        limit: Number(req.query.limit),
        is_active:
            req.query.is_active === 'true'
                ? true
                : req.query.is_active === 'false'
                    ? false
                    : undefined,
        created_after: req.query.created_after as string | undefined,
        balance: req.query.balance as string | undefined,
        sort: req.query.sort as string | undefined,
    });
    new ApiResponse(result.data, 'Customers fetched', 200, true, result.meta).send(res);
});

export const updateCustomerByAdmin = asyncHandler(async (req: Request, res: Response) => {
    const customers = await customerService.updateCustomer(req.params?.customerId, req.body);
    new ApiResponse(customers, 'Customers fetched').send(res);
});

export const updateCustomer = asyncHandler(async (req: Request, res: Response) => {
    const customers = await customerService.updateCustomer(req.customer?.id, req.body);
    new ApiResponse(customers, 'Customers fetched').send(res);
});

export const deleteCustomer = asyncHandler(async (req: Request, res: Response) => {
    await customerService.deleteCustomer(req.params.customerId);
    new ApiResponse(null, 'Customer deleted').send(res);
});

export const logoutCustomer = asyncHandler(async (req: Request, res: Response) => {
    const customers = await customerService.logoutCustomer(req.customer?.id);
    new ApiResponse(customers, 'Customers logout').send(res);
});

export const getCustomerPurchases = asyncHandler(async (req: Request, res: Response) => {
    const data = await customerService.getCustomerPurchases(req.params.customerId);
    new ApiResponse(data, 'Customer purchases retrieved').send(res);
});

export const getCustomerLedger = asyncHandler(async (req: Request, res: Response) => {
    const data = await customerService.getCustomerLedger(req.params.customerId);
    new ApiResponse(data, 'Customer ledger retrieved').send(res);
});

export const getCustomerStatement = asyncHandler(async (req: Request, res: Response) => {
    const data = await customerService.getCustomerStatement(req.params.customerId, {
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
    });
    new ApiResponse(data, 'Customer statement retrieved').send(res);
});

export const getCustomerActivity = asyncHandler(async (req: Request, res: Response) => {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const data = await customerService.getCustomerActivity(req.params.customerId, limit);
    new ApiResponse(data, 'Customer activity retrieved').send(res);
});

export const createCustomerPayment = asyncHandler(async (req: Request, res: Response) => {
    const payment = await customerService.createCustomerPayment(
        req.params.customerId,
        req.body,
        req.user!.id,
    );
    new ApiResponse(payment, 'Payment recorded successfully', 201).send(res);
});

export const updateCustomerPayment = asyncHandler(async (req: Request, res: Response) => {
    const body = updateCustomerPaymentSchema.shape.body.parse(req.body);
    const payment = await customerService.updateCustomerPayment(req.params.customerId, req.params.paymentId, body);
    new ApiResponse(payment, 'Transaction updated').send(res);
});

export const getReceivablesSummary = asyncHandler(async (_req: Request, res: Response) => {
    const summary = await customerService.getReceivablesSummary();
    new ApiResponse(summary, 'Receivables summary').send(res);
});

export const deleteCustomerPayment = asyncHandler(async (req: Request, res: Response) => {
    await customerService.deleteCustomerPayment(
        req.params.customerId,
        req.params.paymentId,
    );
    new ApiResponse(null, 'Payment deleted successfully').send(res);
});

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupplierFacets = exports.getSupplierDocuments = exports.getSupplierAccount = exports.updateSupplierPayment = exports.deleteSupplierPayment = exports.createSupplierPayment = exports.getSupplierProducts = exports.getSupplierStatement = exports.getSupplierLedger = exports.getSupplierPurchases = exports.getPayablesSummary = exports.listSuppliers = exports.deleteSupplier = exports.toggleSupplierStatus = exports.updateSupplier = exports.getSupplier = exports.createSupplier = void 0;
const supplier_service_1 = require("../services/supplier.service");
const apiResponse_1 = require("../utils/apiResponse");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiError_1 = require("../utils/apiError");
const supplier_validation_1 = require("../validations/supplier.validation");
const parse = (schema, data) => {
    const r = schema.safeParse(data);
    if (!r.success)
        throw new apiError_1.AppError(400, r.error.issues[0]?.message || 'Invalid input');
    return r.data;
};
const supplierService = new supplier_service_1.SupplierService();
exports.createSupplier = (0, asyncHandler_1.default)(async (req, res) => {
    const supplier = await supplierService.createSupplier(parse(supplier_validation_1.supplierBodySchema, req.body));
    new apiResponse_1.ApiResponse(supplier, 'Supplier created successfully', 201).send(res);
});
exports.getSupplier = (0, asyncHandler_1.default)(async (req, res) => {
    const supplier = await supplierService.getSupplierById(req.params.id);
    new apiResponse_1.ApiResponse(supplier, 'Supplier retrieved successfully').send(res);
});
exports.updateSupplier = (0, asyncHandler_1.default)(async (req, res) => {
    // Only fields actually sent are updated (partial() keeps defaults from filling in).
    const body = parse(supplier_validation_1.supplierUpdateBodySchema, req.body);
    for (const k of Object.keys(body))
        if (!(k in (req.body || {})))
            delete body[k];
    const supplier = await supplierService.updateSupplier(req.params.id, body);
    new apiResponse_1.ApiResponse(supplier, 'Supplier updated successfully').send(res);
});
exports.toggleSupplierStatus = (0, asyncHandler_1.default)(async (req, res) => {
    await supplierService.toggleSupplierStatus(req.params.id);
    new apiResponse_1.ApiResponse(null, 'Supplier status changed successfully').send(res);
});
exports.deleteSupplier = (0, asyncHandler_1.default)(async (req, res) => {
    await supplierService.deleteSupplier(req.params.id);
    new apiResponse_1.ApiResponse(null, 'Supplier deleted successfully').send(res);
});
const parseOptionalBoolean = (value) => {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }
    if (value === 'true' || value === true) {
        return true;
    }
    if (value === 'false' || value === false) {
        return false;
    }
    return undefined;
};
exports.listSuppliers = (0, asyncHandler_1.default)(async (req, res) => {
    const { page = 1, limit = 10, search, fetch_all, balance, sort, city, category } = req.query;
    const result = await supplierService.listSuppliers({
        page: Number(page),
        limit: Number(limit),
        search: search,
        is_active: parseOptionalBoolean(req.query.is_active),
        display_on_pos: parseOptionalBoolean(req.query.display_on_pos),
        fetch_all: String(fetch_all) === 'true',
        balance: balance,
        sort: sort,
        city: city || undefined,
        category: category || undefined,
    });
    new apiResponse_1.ApiResponse(result.data, 'Suppliers retrieved successfully', 200, true, result.meta).send(res);
});
exports.getPayablesSummary = (0, asyncHandler_1.default)(async (_req, res) => {
    const data = await supplierService.payablesSummary();
    new apiResponse_1.ApiResponse(data, 'Payables summary retrieved').send(res);
});
exports.getSupplierPurchases = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await supplierService.getSupplierPurchases(req.params.id);
    new apiResponse_1.ApiResponse(data, 'Supplier purchases retrieved').send(res);
});
exports.getSupplierLedger = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await supplierService.getSupplierLedger(req.params.id);
    new apiResponse_1.ApiResponse(data, 'Supplier ledger retrieved').send(res);
});
exports.getSupplierStatement = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await supplierService.getSupplierStatement(req.params.id, {
        from: req.query.from,
        to: req.query.to,
    });
    new apiResponse_1.ApiResponse(data, 'Supplier statement retrieved').send(res);
});
exports.getSupplierProducts = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await supplierService.getSupplierProducts(req.params.id);
    new apiResponse_1.ApiResponse(data, 'Supplier products retrieved').send(res);
});
exports.createSupplierPayment = (0, asyncHandler_1.default)(async (req, res) => {
    const payment = await supplierService.createSupplierPayment(req.params.id, parse(supplier_validation_1.createSupplierPaymentSchema.shape.body, req.body), req.user.id);
    new apiResponse_1.ApiResponse(payment, 'Transaction recorded', 201).send(res);
});
exports.deleteSupplierPayment = (0, asyncHandler_1.default)(async (req, res) => {
    await supplierService.deleteSupplierPayment(req.params.id, req.params.paymentId);
    new apiResponse_1.ApiResponse(null, 'Payment deleted successfully').send(res);
});
exports.updateSupplierPayment = (0, asyncHandler_1.default)(async (req, res) => {
    const body = parse(supplier_validation_1.updateSupplierPaymentSchema.shape.body, req.body);
    const payment = await supplierService.updateSupplierPayment(req.params.id, req.params.paymentId, body);
    new apiResponse_1.ApiResponse(payment, 'Transaction updated').send(res);
});
exports.getSupplierAccount = (0, asyncHandler_1.default)(async (req, res) => {
    new apiResponse_1.ApiResponse(await supplierService.getSupplierAccount(req.params.id), 'Supplier account').send(res);
});
exports.getSupplierDocuments = (0, asyncHandler_1.default)(async (req, res) => {
    new apiResponse_1.ApiResponse(await supplierService.getSupplierDocuments(req.params.id), 'Supplier documents').send(res);
});
exports.getSupplierFacets = (0, asyncHandler_1.default)(async (_req, res) => {
    new apiResponse_1.ApiResponse(await supplierService.facets(), 'Supplier filters').send(res);
});
//# sourceMappingURL=supplier.controller.js.map
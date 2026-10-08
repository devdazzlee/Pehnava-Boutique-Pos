"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletePurchaseInvoice = exports.updatePurchaseInvoice = exports.createPurchaseInvoice = exports.getUninvoicedPurchases = exports.getPurchaseInvoice = exports.listPurchaseInvoices = void 0;
const purchaseInvoice_service_1 = require("../services/purchaseInvoice.service");
const apiResponse_1 = require("../utils/apiResponse");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const resolveBranchId_1 = require("../utils/resolveBranchId");
const service = new purchaseInvoice_service_1.PurchaseInvoiceService();
exports.listPurchaseInvoices = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await service.list({
        ...req.query,
        branch_id: req.query.branch_id || (0, resolveBranchId_1.resolveBranchId)(req),
    });
    new apiResponse_1.ApiResponse(result.data, 'Purchase invoices retrieved', 200, true, result.meta).send(res);
});
exports.getPurchaseInvoice = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.getById(req.params.id);
    new apiResponse_1.ApiResponse(data, 'Purchase invoice retrieved').send(res);
});
exports.getUninvoicedPurchases = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.uninvoicedPurchases(req.params.supplierId);
    new apiResponse_1.ApiResponse(data, 'Uninvoiced deliveries retrieved').send(res);
});
exports.createPurchaseInvoice = (0, asyncHandler_1.default)(async (req, res) => {
    const branch_id = req.body.branch_id ?? (0, resolveBranchId_1.resolveBranchId)(req) ?? null;
    const data = await service.create({ ...req.body, branch_id }, req.user.id);
    new apiResponse_1.ApiResponse(data, 'Purchase invoice created', 201).send(res);
});
exports.updatePurchaseInvoice = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.update(req.params.id, req.body);
    new apiResponse_1.ApiResponse(data, 'Purchase invoice updated').send(res);
});
exports.deletePurchaseInvoice = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.remove(req.params.id);
    new apiResponse_1.ApiResponse(data, 'Purchase invoice deleted').send(res);
});
//# sourceMappingURL=purchaseInvoice.controller.js.map
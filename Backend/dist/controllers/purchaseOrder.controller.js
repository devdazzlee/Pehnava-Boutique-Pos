"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletePurchaseOrder = exports.cancelPurchaseOrder = exports.receivePurchaseOrder = exports.setPurchaseOrderStatus = exports.updatePurchaseOrder = exports.createPurchaseOrder = exports.getPurchaseOrder = exports.listPurchaseOrders = void 0;
const purchaseOrder_service_1 = require("../services/purchaseOrder.service");
const apiResponse_1 = require("../utils/apiResponse");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const resolveBranchId_1 = require("../utils/resolveBranchId");
const service = new purchaseOrder_service_1.PurchaseOrderService();
exports.listPurchaseOrders = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await service.list({
        ...req.query,
        branch_id: req.query.branch_id || (0, resolveBranchId_1.resolveBranchId)(req),
    });
    new apiResponse_1.ApiResponse(result.data, 'Purchase orders retrieved', 200, true, result.meta).send(res);
});
exports.getPurchaseOrder = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.getById(req.params.id);
    new apiResponse_1.ApiResponse(data, 'Purchase order retrieved').send(res);
});
exports.createPurchaseOrder = (0, asyncHandler_1.default)(async (req, res) => {
    const branch_id = req.body.branch_id || (0, resolveBranchId_1.resolveBranchId)(req);
    const data = await service.create({ ...req.body, branch_id }, req.user.id);
    new apiResponse_1.ApiResponse(data, 'Purchase order created', 201).send(res);
});
exports.updatePurchaseOrder = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.update(req.params.id, req.body);
    new apiResponse_1.ApiResponse(data, 'Purchase order updated').send(res);
});
exports.setPurchaseOrderStatus = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.setStatus(req.params.id, req.body.status);
    new apiResponse_1.ApiResponse(data, 'Purchase order status updated').send(res);
});
exports.receivePurchaseOrder = (0, asyncHandler_1.default)(async (req, res) => {
    const { lines, invoice_ref, notes } = req.body;
    const data = await service.receive(req.params.id, lines, req.user.id, { invoice_ref, notes });
    new apiResponse_1.ApiResponse(data, 'Purchase order received').send(res);
});
exports.cancelPurchaseOrder = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.setStatus(req.params.id, 'CANCELLED');
    new apiResponse_1.ApiResponse(data, 'Purchase order cancelled').send(res);
});
exports.deletePurchaseOrder = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.remove(req.params.id);
    new apiResponse_1.ApiResponse(data, 'Purchase order deleted').send(res);
});
//# sourceMappingURL=purchaseOrder.controller.js.map
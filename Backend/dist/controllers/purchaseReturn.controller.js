"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelPurchaseReturn = exports.createPurchaseReturn = exports.getPurchaseReturn = exports.listReturnableBills = exports.listPurchaseReturns = void 0;
const purchaseReturn_service_1 = require("../services/purchaseReturn.service");
const apiResponse_1 = require("../utils/apiResponse");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const resolveBranchId_1 = require("../utils/resolveBranchId");
const service = new purchaseReturn_service_1.PurchaseReturnService();
exports.listPurchaseReturns = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await service.list({
        ...req.query,
        branch_id: req.query.branch_id || (0, resolveBranchId_1.resolveBranchId)(req),
    });
    new apiResponse_1.ApiResponse(result.data, 'Purchase returns retrieved', 200, true, result.meta).send(res);
});
exports.listReturnableBills = (0, asyncHandler_1.default)(async (req, res) => {
    const supplierId = String(req.query.supplier_id || '');
    const branchId = String(req.query.branch_id || '') || (0, resolveBranchId_1.resolveBranchId)(req) || '';
    const data = await service.listReturnableBills(supplierId, branchId);
    new apiResponse_1.ApiResponse(data, 'Returnable supplier bills retrieved').send(res);
});
exports.getPurchaseReturn = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.getById(req.params.id);
    new apiResponse_1.ApiResponse(data, 'Purchase return retrieved').send(res);
});
exports.createPurchaseReturn = (0, asyncHandler_1.default)(async (req, res) => {
    const branch_id = req.body.branch_id || (0, resolveBranchId_1.resolveBranchId)(req);
    const data = await service.create({ ...req.body, branch_id }, req.user.id);
    new apiResponse_1.ApiResponse(data, 'Purchase return recorded', 201).send(res);
});
exports.cancelPurchaseReturn = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await service.cancel(req.params.id, req.user.id);
    new apiResponse_1.ApiResponse(data, 'Purchase return cancelled').send(res);
});
//# sourceMappingURL=purchaseReturn.controller.js.map
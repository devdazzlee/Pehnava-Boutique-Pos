"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPendingTransfers = exports.getTransferById = exports.listTransfers = exports.updateTransferStatus = exports.createTransfer = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const transfer_service_1 = require("../services/transfer.service");
const transferService = new transfer_service_1.TransferService();
exports.createTransfer = (0, asyncHandler_1.default)(async (req, res) => {
    const transfer = await transferService.createTransfer({
        ...req.body,
        createdBy: req.user.id,
    });
    new apiResponse_1.ApiResponse(transfer, 'Transfer created successfully', 201).send(res);
});
exports.updateTransferStatus = (0, asyncHandler_1.default)(async (req, res) => {
    const transfer = await transferService.updateTransferStatus(req.params.id, req.body.status, req.user?.id);
    new apiResponse_1.ApiResponse(transfer, 'Transfer status updated').send(res);
});
exports.listTransfers = (0, asyncHandler_1.default)(async (req, res) => {
    const query = req.query;
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;
    const result = await transferService.listTransfers({
        page: Number(query.page) || 1,
        limit: Number(query.limit) || 20,
        fromBranchId: query.fromBranchId,
        toBranchId: query.toBranchId,
        productId: query.productId,
        status: query.status,
        branchId: query.branchId,
        startDate,
        endDate,
        search: query.search ? String(query.search) : undefined,
    });
    new apiResponse_1.ApiResponse(result.data, 'Transfers retrieved', 200, true, result.meta).send(res);
});
exports.getTransferById = (0, asyncHandler_1.default)(async (req, res) => {
    const transfer = await transferService.getTransferById(req.params.id);
    new apiResponse_1.ApiResponse(transfer, 'Transfer retrieved').send(res);
});
exports.getPendingTransfers = (0, asyncHandler_1.default)(async (req, res) => {
    const transfers = await transferService.getPendingTransfers(req.query.branchId);
    new apiResponse_1.ApiResponse(transfers, 'Pending transfers retrieved').send(res);
});
//# sourceMappingURL=transfer.controller.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAlfalahIpn = exports.verifyAlfalahPayment = exports.getAlfalahSsoForm = exports.getAlfalahConfig = void 0;
const alfalah_service_1 = require("../services/alfalah.service");
const apiResponse_1 = require("../utils/apiResponse");
const apiError_1 = require("../utils/apiError");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
exports.getAlfalahConfig = (0, asyncHandler_1.default)(async (_req, res) => {
    new apiResponse_1.ApiResponse(alfalah_service_1.alfalahService.getPublicConfig(), 'Alfalah payment config').send(res);
});
exports.getAlfalahSsoForm = (0, asyncHandler_1.default)(async (req, res) => {
    const orderNumber = String(req.query.ref || req.body?.ref || '').trim();
    const authToken = String(req.query.auth_token || req.query.AuthToken || req.body?.auth_token || '').trim();
    if (!orderNumber)
        throw new apiError_1.AppError(400, 'Order reference is required');
    const payment = await alfalah_service_1.alfalahService.getSsoFormForOrder(orderNumber, authToken);
    new apiResponse_1.ApiResponse(payment, 'Bank Alfalah checkout form').send(res);
});
exports.verifyAlfalahPayment = (0, asyncHandler_1.default)(async (req, res) => {
    const explicit = String(req.body?.orderNumber || req.query.ref || req.query.O || '').trim();
    const orderNumber = explicit ||
        alfalah_service_1.alfalahService.extractOrderNumber({
            query: { ...req.query, ...(req.body || {}) },
            path: String(req.body?.path || req.originalUrl || ''),
        });
    const result = await alfalah_service_1.alfalahService.inquireAndSettle(orderNumber);
    new apiResponse_1.ApiResponse(result, result.paid ? 'Payment confirmed' : 'Payment not completed').send(res);
});
exports.handleAlfalahIpn = (0, asyncHandler_1.default)(async (req, res) => {
    const statusUrl = String(req.query.url || req.body?.url || '').trim();
    const result = await alfalah_service_1.alfalahService.handleIpn(statusUrl);
    new apiResponse_1.ApiResponse(result, 'IPN processed').send(res);
});
//# sourceMappingURL=alfalah.controller.js.map
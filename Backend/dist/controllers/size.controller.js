"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSize = exports.listSizes = exports.updateSize = exports.getSize = exports.createSize = void 0;
const size_service_1 = require("../services/size.service");
const apiResponse_1 = require("../utils/apiResponse");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const sizeService = new size_service_1.SizeService();
exports.createSize = (0, asyncHandler_1.default)(async (req, res) => {
    const size = await sizeService.createSize(req.body);
    new apiResponse_1.ApiResponse(size, 'Size created successfully', 201).send(res);
});
exports.getSize = (0, asyncHandler_1.default)(async (req, res) => {
    const size = await sizeService.getSizeById(req.params.id);
    new apiResponse_1.ApiResponse(size, 'Size retrieved successfully').send(res);
});
exports.updateSize = (0, asyncHandler_1.default)(async (req, res) => {
    const size = await sizeService.updateSize(req.params.id, req.body);
    new apiResponse_1.ApiResponse(size, 'Size updated successfully').send(res);
});
exports.listSizes = (0, asyncHandler_1.default)(async (req, res) => {
    const { page = 1, limit = 10, search } = req.query;
    const result = await sizeService.listSizes({
        page: Number(page),
        limit: Number(limit),
        search: search,
    });
    new apiResponse_1.ApiResponse(result.data, 'Sizes retrieved successfully', 200).send(res);
});
exports.deleteSize = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await sizeService.deleteSize(req.params.id);
    new apiResponse_1.ApiResponse(null, result.message).send(res);
});
//# sourceMappingURL=size.controller.js.map